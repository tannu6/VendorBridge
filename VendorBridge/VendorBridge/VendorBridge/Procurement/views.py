from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib import messages
from django.utils import timezone
from django.db.models import Q, Sum, Count, Avg
from django.core.paginator import Paginator

from Vendors.models import (
    RFQ,
    RFQItem,
    Quotation,
    QuotationItem,
    PurchaseOrder,
    PurchaseOrderItem,
    Vendor,
    ApprovalWorkflow,
    Notification,
)
from .emails import (
    send_rfq_published_email,
    send_quotation_approved_email,
    send_quotation_rejected_email,
    send_purchase_order_email,
)
from .forms import RFQForm, RFQItemFormSet


# ── Helper Functions ──────────────────────────────────────────────────────────

def is_procurement_officer(user):
    """Check if user is staff (procurement officer)."""
    return user.is_staff


# ──────────────────────────────────────────────────────────────────────────────
# PROCUREMENT OFFICER DASHBOARD
# ──────────────────────────────────────────────────────────────────────────────

@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def procurement_dashboard(request):
    """Main procurement dashboard with overview statistics."""
    
    # Overall stats
    total_rfqs = RFQ.objects.count()
    published_rfqs = RFQ.objects.filter(status=RFQ.Status.PUBLISHED).count()
    draft_rfqs = RFQ.objects.filter(status=RFQ.Status.DRAFT).count()
    
    total_quotations = Quotation.objects.count()
    pending_quotations = Quotation.objects.filter(
        status=Quotation.Status.SUBMITTED
    ).count()
    
    total_vendors = Vendor.objects.count()
    approved_vendors = Vendor.objects.filter(status=Vendor.Status.APPROVED).count()
    pending_vendors = Vendor.objects.filter(status=Vendor.Status.PENDING).count()
    
    total_pos = PurchaseOrder.objects.count()
    active_pos = PurchaseOrder.objects.filter(
        status__in=[
            PurchaseOrder.Status.ISSUED,
            PurchaseOrder.Status.ACKNOWLEDGED,
            PurchaseOrder.Status.IN_PROGRESS,
        ]
    ).count()
    
    # Recent activities
    recent_rfqs = RFQ.objects.order_by("-created_at")[:5]
    recent_quotations = Quotation.objects.order_by("-submitted_at")[:5]
    pending_approvals = Quotation.objects.filter(
        status=Quotation.Status.SUBMITTED
    ).order_by("-submitted_at")[:5]
    
    context = {
        "total_rfqs": total_rfqs,
        "published_rfqs": published_rfqs,
        "draft_rfqs": draft_rfqs,
        "total_quotations": total_quotations,
        "pending_quotations": pending_quotations,
        "total_vendors": total_vendors,
        "approved_vendors": approved_vendors,
        "pending_vendors": pending_vendors,
        "total_pos": total_pos,
        "active_pos": active_pos,
        "recent_rfqs": recent_rfqs,
        "recent_quotations": recent_quotations,
        "pending_approvals": pending_approvals,
    }
    return render(request, "procurement_dashboard.html", context)


# ──────────────────────────────────────────────────────────────────────────────
# RFQ MANAGEMENT
# ──────────────────────────────────────────────────────────────────────────────

@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def rfq_create(request):
    """Create a new RFQ."""
    if request.method == "POST":
        form = RFQForm(request.POST, request.FILES)
        rfq_items_formset = RFQItemFormSet(request.POST, prefix="items")
        
        if form.is_valid():
            rfq = form.save(commit=False)
            rfq.created_by = request.user
            rfq.status = RFQ.Status.DRAFT
            rfq.save()
            
            rfq_items_formset = RFQItemFormSet(request.POST, instance=rfq, prefix="items")
            if rfq_items_formset.is_valid():
                rfq_items_formset.save()
                messages.success(request, f"RFQ {rfq.rfq_number} created successfully!")
                return redirect("proc_rfq_list")
            else:
                rfq.delete()
        else:
            messages.error(request, "Please correct the errors below.")
    else:
        form = RFQForm()
        rfq_items_formset = RFQItemFormSet(prefix="items")
        
    context = {
        "form": form,
        "rfq_items_formset": rfq_items_formset,
    }
    return render(request, "procurement/rfq_form.html", context)


@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def rfq_edit(request, rfq_id):
    """Edit an existing RFQ."""
    rfq = get_object_or_404(RFQ, id=rfq_id)
    
    if request.method == "POST":
        form = RFQForm(request.POST, request.FILES, instance=rfq)
        rfq_items_formset = RFQItemFormSet(request.POST, request.FILES, instance=rfq, prefix="items")
        
        if form.is_valid() and rfq_items_formset.is_valid():
            form.save()
            rfq_items_formset.save()
            messages.success(request, "RFQ updated successfully!")
            return redirect("proc_rfq_list")
        else:
            messages.error(request, "Please correct the errors below.")
    else:
        form = RFQForm(instance=rfq)
        rfq_items_formset = RFQItemFormSet(instance=rfq, prefix="items")
        
    context = {
        "form": form,
        "rfq_items_formset": rfq_items_formset,
        "rfq": rfq,
    }
    return render(request, "procurement/rfq_form.html", context)


@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def rfq_list(request):
    """List all RFQs."""
    rfqs = RFQ.objects.order_by("-created_at")
    
    status = request.GET.get("status", "")
    if status:
        rfqs = rfqs.filter(status=status)
    
    search = request.GET.get("search", "")
    if search:
        rfqs = rfqs.filter(
            Q(rfq_number__icontains=search) | Q(title__icontains=search)
        )
    
    paginator = Paginator(rfqs, 10)
    page = request.GET.get("page")
    rfqs_page = paginator.get_page(page)
    
    context = {
        "rfqs": rfqs_page,
        "status": status,
        "search": search,
        "status_choices": RFQ.Status.choices,
    }
    return render(request, "procurement/rfq_list.html", context)


@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def rfq_publish(request, rfq_id):
    """Publish an RFQ to vendors."""
    rfq = get_object_or_404(RFQ, id=rfq_id)
    
    if not rfq.items.exists():
        messages.error(request, "RFQ must have at least one item before publishing.")
        return redirect("rfq_edit", rfq_id=rfq.id)
    
    rfq.status = RFQ.Status.PUBLISHED
    rfq.published_date = timezone.now()
    rfq.save()
    
    ApprovalWorkflow.objects.create(
        entity_type=ApprovalWorkflow.EntityType.RFQ,
        entity_id=rfq.id,
        action=ApprovalWorkflow.Action.APPROVED,
        performed_by=request.user,
        comments="RFQ published to vendors",
    )
    
    # Send emails to all approved vendors
    try:
        approved_vendors = Vendor.objects.filter(status=Vendor.Status.APPROVED)
        send_rfq_published_email(rfq, approved_vendors)
    except Exception as e:
        print(f"Email notification error: {e}")
    
    messages.success(request, f"RFQ {rfq.rfq_number} published successfully!")
    return redirect("rfq_list")


@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def rfq_close(request, rfq_id):
    """Close an RFQ from further submissions."""
    rfq = get_object_or_404(RFQ, id=rfq_id)
    rfq.status = RFQ.Status.CLOSED
    rfq.save()
    
    messages.success(request, f"RFQ {rfq.rfq_number} closed.")
    return redirect("rfq_list")


# ──────────────────────────────────────────────────────────────────────────────
# QUOTATION MANAGEMENT
# ──────────────────────────────────────────────────────────────────────────────

@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def quotation_list(request):
    """View all quotations received."""
    quotations = Quotation.objects.order_by("-submitted_at")
    
    status = request.GET.get("status", "")
    if status:
        quotations = quotations.filter(status=status)
    
    rfq_id = request.GET.get("rfq_id", "")
    if rfq_id:
        quotations = quotations.filter(rfq_id=rfq_id)
    
    search = request.GET.get("search", "")
    if search:
        quotations = quotations.filter(
            Q(quotation_number__icontains=search) |
            Q(vendor__company_name__icontains=search) |
            Q(rfq__rfq_number__icontains=search)
        )
    
    paginator = Paginator(quotations, 10)
    page = request.GET.get("page")
    quotations_page = paginator.get_page(page)
    
    context = {
        "quotations": quotations_page,
        "status": status,
        "rfq_id": rfq_id,
        "search": search,
        "status_choices": Quotation.Status.choices,
    }
    return render(request, "procurement/quotation_list.html", context)


@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def quotation_detail(request, quotation_id):
    """View quotation details and comparison."""
    quotation = get_object_or_404(Quotation, id=quotation_id)
    items = quotation.items.all()
    
    # Get other quotations for same RFQ for comparison
    other_quotations = Quotation.objects.filter(
        rfq=quotation.rfq
    ).exclude(id=quotation.id).order_by("-submitted_at")
    
    context = {
        "quotation": quotation,
        "items": items,
        "other_quotations": other_quotations,
    }
    return render(request, "procurement/quotation_detail.html", context)


@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def quotation_approve(request, quotation_id):
    """Approve a quotation and create PO."""
    quotation = get_object_or_404(Quotation, id=quotation_id)
    
    if request.method == "POST":
        quotation.status = Quotation.Status.APPROVED
        quotation.approved_at = timezone.now()
        quotation.approved_by = request.user
        quotation.save()
        
        # Create purchase order from quotation
        po = PurchaseOrder.objects.create(
            vendor=quotation.vendor,
            quotation=quotation,
            status=PurchaseOrder.Status.ISSUED,
            created_by=request.user,
            total_amount=quotation.total_amount,
            tax_amount=quotation.tax_amount,
            grand_total=quotation.grand_total,
            issue_date=timezone.now(),
        )
        
        # Create PO items from quotation items
        for q_item in quotation.items.all():
            PurchaseOrderItem.objects.create(
                purchase_order=po,
                item_name=q_item.rfq_item.item_name,
                description=q_item.rfq_item.description,
                quantity=q_item.quantity,
                unit_price=q_item.unit_price,
                total_price=q_item.total_price,
            )
        
        # Send approval and PO emails
        try:
            send_quotation_approved_email(quotation, po)
            send_purchase_order_email(po)
        except Exception as e:
            print(f"Email notification error: {e}")
        
        messages.success(request, f"Quotation approved! PO {po.po_number} created.")
        return redirect("po_detail", po_id=po.id)
    
    context = {"quotation": quotation}
    return render(request, "procurement/quotation_approve.html", context)


@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def quotation_reject(request, quotation_id):
    """Reject a quotation."""
    quotation = get_object_or_404(Quotation, id=quotation_id)
    
    if request.method == "POST":
        rejection_reason = request.POST.get('rejection_reason', '')
        quotation.status = Quotation.Status.REJECTED
        quotation.save()
        
        # Send rejection email
        try:
            send_quotation_rejected_email(quotation, rejection_reason)
        except Exception as e:
            print(f"Email notification error: {e}")
        
        messages.success(request, f"Quotation {quotation.quotation_number} rejected.")
        return redirect("quotation_list")
    
    context = {"quotation": quotation, "action": "reject"}
    return render(request, "procurement/quotation_confirm.html", context)


# ──────────────────────────────────────────────────────────────────────────────
# PURCHASE ORDER MANAGEMENT
# ──────────────────────────────────────────────────────────────────────────────

@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def po_list(request):
    """View all purchase orders."""
    pos = PurchaseOrder.objects.order_by("-created_at")
    
    status = request.GET.get("status", "")
    if status:
        pos = pos.filter(status=status)
    
    search = request.GET.get("search", "")
    if search:
        pos = pos.filter(
            Q(po_number__icontains=search) |
            Q(vendor__company_name__icontains=search)
        )
    
    paginator = Paginator(pos, 10)
    page = request.GET.get("page")
    pos_page = paginator.get_page(page)
    
    context = {
        "pos": pos_page,
        "status": status,
        "search": search,
        "status_choices": PurchaseOrder.Status.choices,
    }
    return render(request, "procurement/po_list.html", context)


@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def po_detail(request, po_id):
    """View purchase order details."""
    po = get_object_or_404(PurchaseOrder, id=po_id)
    items = po.items.all()
    
    context = {
        "po": po,
        "items": items,
    }
    return render(request, "procurement/po_detail.html", context)


# ──────────────────────────────────────────────────────────────────────────────
# VENDOR MANAGEMENT
# ──────────────────────────────────────────────────────────────────────────────

@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def vendor_list(request):
    """View all vendors with performance metrics."""
    vendors = Vendor.objects.order_by("-rating")
    
    status = request.GET.get("status", "")
    if status:
        vendors = vendors.filter(status=status)
    
    search = request.GET.get("search", "")
    if search:
        vendors = vendors.filter(
            Q(company_name__icontains=search) |
            Q(company_code__icontains=search) |
            Q(contact_email__icontains=search)
        )
    
    paginator = Paginator(vendors, 10)
    page = request.GET.get("page")
    vendors_page = paginator.get_page(page)
    
    context = {
        "vendors": vendors_page,
        "status": status,
        "search": search,
        "status_choices": Vendor.Status.choices,
    }
    return render(request, "procurement/vendor_list.html", context)


@login_required(login_url="vendor_login")
@user_passes_test(is_procurement_officer)
def vendor_detail(request, vendor_id):
    """View vendor details and performance metrics."""
    vendor = get_object_or_404(Vendor, id=vendor_id)
    
    # Performance metrics
    total_pos = PurchaseOrder.objects.filter(vendor=vendor).count()
    completed_pos = PurchaseOrder.objects.filter(
        vendor=vendor,
        status=PurchaseOrder.Status.COMPLETED
    ).count()
    
    context = {
        "vendor": vendor,
        "total_pos": total_pos,
        "completed_pos": completed_pos,
    }
    return render(request, "procurement/vendor_detail.html", context)
