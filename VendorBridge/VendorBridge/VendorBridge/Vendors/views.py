from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.utils import timezone
from django.db.models import Q, Sum, Count
from django.core.paginator import Paginator

from .models import (
    Vendor,
    VendorDocument,
    RFQ,
    RFQItem,
    Quotation,
    QuotationItem,
    PurchaseOrder,
    Invoice,
    Notification,
)
from .forms import (
    VendorRegistrationForm,
    VendorLoginForm,
    QuotationForm,
    QuotationItemForm,
    InvoiceForm,
    VendorProfileForm,
    VendorDocumentForm,
)


# ── Helper ───────────────────────────────────────────────────────────────────

def get_vendor(user):
    """Return the Vendor profile for a logged-in user, or None."""
    try:
        return user.vendor_profile
    except Vendor.DoesNotExist:
        return None


def get_unread_count(user):
    """Return unread notification count for the header badge."""
    return Notification.objects.filter(recipient=user, is_read=False).count()


# ──────────────────────────────────────────────────────────────────────────────
# STEP 1 — AUTHENTICATION
# ──────────────────────────────────────────────────────────────────────────────

def vendor_register(request):
    if request.user.is_authenticated:
        return redirect("vendor_dashboard")

    if request.method == "POST":
        form = VendorRegistrationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(
                request,
                "Registration successful! Your account is pending approval.",
            )
            return redirect("vendor_dashboard")
    else:
        form = VendorRegistrationForm()

    return render(request, "register.html", {"form": form})


def vendor_login(request):
    if request.user.is_authenticated:
        if request.user.is_staff:
            return redirect("procurement_dashboard")
        return redirect("vendor_dashboard")

    if request.method == "POST":
        form = VendorLoginForm(request, data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            messages.success(request, f"Welcome back, {user.first_name}!")
            if user.is_staff:
                return redirect("procurement_dashboard")
            return redirect("vendor_dashboard")
    else:
        form = VendorLoginForm()

    return render(request, "login.html", {"form": form})


def vendor_logout(request):
    logout(request)
    messages.info(request, "You have been logged out.")
    return redirect("vendor_login")


# ──────────────────────────────────────────────────────────────────────────────
# STEP 2 — VENDOR DASHBOARD
# ──────────────────────────────────────────────────────────────────────────────

@login_required(login_url="vendor_login")
def vendor_dashboard(request):
    if request.user.is_staff:
        return redirect("procurement_dashboard")
    vendor = get_vendor(request.user)
    if not vendor:
        messages.error(request, "No vendor profile found. Please register.")
        return redirect("vendor_register")

    # Stats
    open_rfqs_count = RFQ.objects.filter(
        status=RFQ.Status.PUBLISHED,
        submission_deadline__gt=timezone.now(),
    ).count()
    my_quotations_count = Quotation.objects.filter(vendor=vendor).count()
    active_orders_count = PurchaseOrder.objects.filter(
        vendor=vendor,
        status__in=[
            PurchaseOrder.Status.ISSUED,
            PurchaseOrder.Status.ACKNOWLEDGED,
            PurchaseOrder.Status.IN_PROGRESS,
            PurchaseOrder.Status.PARTIALLY_DELIVERED,
        ],
    ).count()
    pending_invoices_count = Invoice.objects.filter(
        vendor=vendor,
        status__in=[
            Invoice.Status.SUBMITTED,
            Invoice.Status.UNDER_REVIEW,
            Invoice.Status.APPROVED,
        ],
    ).count()

    # Recent open RFQs (latest 5)
    recent_rfqs = RFQ.objects.filter(
        status=RFQ.Status.PUBLISHED,
        submission_deadline__gt=timezone.now(),
    ).order_by("-published_date")[:5]

    # Recent quotations
    recent_quotations = Quotation.objects.filter(vendor=vendor).order_by("-created_at")[:5]

    # Recent notifications
    recent_notifications = Notification.objects.filter(
        recipient=request.user,
    ).order_by("-created_at")[:5]

    context = {
        "vendor": vendor,
        "open_rfqs_count": open_rfqs_count,
        "my_quotations_count": my_quotations_count,
        "active_orders_count": active_orders_count,
        "pending_invoices_count": pending_invoices_count,
        "recent_rfqs": recent_rfqs,
        "recent_quotations": recent_quotations,
        "recent_notifications": recent_notifications,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "vendor_home.html", context)


# ──────────────────────────────────────────────────────────────────────────────
# STEP 3 — BROWSE & RESPOND TO RFQs
# ──────────────────────────────────────────────────────────────────────────────

@login_required(login_url="vendor_login")
def rfq_list(request):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    rfqs = RFQ.objects.filter(
        status=RFQ.Status.PUBLISHED,
        submission_deadline__gt=timezone.now(),
    ).order_by("-published_date")

    # Search
    search = request.GET.get("search", "")
    if search:
        rfqs = rfqs.filter(
            Q(rfq_number__icontains=search)
            | Q(title__icontains=search)
            | Q(description__icontains=search)
        )

    # Priority filter
    priority = request.GET.get("priority", "")
    if priority:
        rfqs = rfqs.filter(priority=priority)

    paginator = Paginator(rfqs, 10)
    page = request.GET.get("page")
    rfqs_page = paginator.get_page(page)

    # Track which RFQs the vendor has already quoted on
    quoted_rfq_ids = Quotation.objects.filter(vendor=vendor).values_list(
        "rfq_id", flat=True
    )

    context = {
        "vendor": vendor,
        "rfqs": rfqs_page,
        "search": search,
        "priority": priority,
        "quoted_rfq_ids": list(quoted_rfq_ids),
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "rfq_list.html", context)


@login_required(login_url="vendor_login")
def rfq_detail(request, rfq_id):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    rfq = get_object_or_404(RFQ, id=rfq_id, status=RFQ.Status.PUBLISHED)
    items = rfq.items.all()

    # Check if vendor already submitted a quotation for this RFQ
    existing_quotation = Quotation.objects.filter(rfq=rfq, vendor=vendor).first()

    context = {
        "vendor": vendor,
        "rfq": rfq,
        "items": items,
        "existing_quotation": existing_quotation,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "rfq_detail.html", context)


@login_required(login_url="vendor_login")
def submit_quotation(request, rfq_id):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    if vendor.status != Vendor.Status.APPROVED:
        messages.warning(request, "Your account must be approved to submit quotations.")
        return redirect("vendor_dashboard")

    rfq = get_object_or_404(RFQ, id=rfq_id, status=RFQ.Status.PUBLISHED)

    if not rfq.is_open:
        messages.error(request, "This RFQ is no longer accepting submissions.")
        return redirect("rfq_detail", rfq_id=rfq.id)

    # Check if already submitted
    if Quotation.objects.filter(rfq=rfq, vendor=vendor).exists():
        messages.warning(request, "You have already submitted a quotation for this RFQ.")
        return redirect("rfq_detail", rfq_id=rfq.id)

    rfq_items = rfq.items.all()

    if request.method == "POST":
        form = QuotationForm(request.POST, request.FILES)
        if form.is_valid():
            quotation = form.save(commit=False)
            quotation.rfq = rfq
            quotation.vendor = vendor
            quotation.status = Quotation.Status.SUBMITTED
            quotation.submitted_at = timezone.now()

            # Calculate totals from item prices
            total_amount = 0
            item_data = []
            valid_items = True

            for item in rfq_items:
                price_key = f"unit_price_{item.id}"
                qty_key = f"quantity_{item.id}"
                remarks_key = f"remarks_{item.id}"

                try:
                    unit_price = float(request.POST.get(price_key, 0))
                    quantity = float(request.POST.get(qty_key, item.quantity))
                    remarks = request.POST.get(remarks_key, "")
                except (ValueError, TypeError):
                    valid_items = False
                    break

                if unit_price <= 0:
                    valid_items = False
                    messages.error(request, f"Please enter a valid price for {item.item_name}.")
                    break

                line_total = unit_price * quantity
                total_amount += line_total
                item_data.append({
                    "rfq_item": item,
                    "unit_price": unit_price,
                    "quantity": quantity,
                    "total_price": line_total,
                    "remarks": remarks,
                })

            if valid_items and item_data:
                # Calculate tax (18% GST as default)
                tax_amount = total_amount * 0.18
                discount = total_amount * (float(quotation.discount_percentage) / 100)
                grand_total = total_amount + tax_amount - discount

                quotation.total_amount = total_amount
                quotation.tax_amount = tax_amount
                quotation.grand_total = grand_total
                quotation.currency = rfq.currency
                quotation.save()

                # Create quotation items
                for data in item_data:
                    QuotationItem.objects.create(
                        quotation=quotation,
                        rfq_item=data["rfq_item"],
                        unit_price=data["unit_price"],
                        quantity=data["quantity"],
                        total_price=data["total_price"],
                        remarks=data["remarks"],
                    )

                messages.success(request, "Quotation submitted successfully!")
                return redirect("quotation_detail", quotation_id=quotation.id)
    else:
        form = QuotationForm()

    context = {
        "vendor": vendor,
        "rfq": rfq,
        "rfq_items": rfq_items,
        "form": form,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "quotation_submit.html", context)


# ──────────────────────────────────────────────────────────────────────────────
# STEP 4 — TRACK QUOTATIONS
# ──────────────────────────────────────────────────────────────────────────────

@login_required(login_url="vendor_login")
def quotation_list(request):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    quotations = Quotation.objects.filter(vendor=vendor).order_by("-created_at")

    # Status filter
    status = request.GET.get("status", "")
    if status:
        quotations = quotations.filter(status=status)

    paginator = Paginator(quotations, 10)
    page = request.GET.get("page")
    quotations_page = paginator.get_page(page)

    context = {
        "vendor": vendor,
        "quotations": quotations_page,
        "current_status": status,
        "status_choices": Quotation.Status.choices,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "quotation_list.html", context)


@login_required(login_url="vendor_login")
def quotation_detail(request, quotation_id):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    quotation = get_object_or_404(Quotation, id=quotation_id, vendor=vendor)
    items = quotation.items.all()

    context = {
        "vendor": vendor,
        "quotation": quotation,
        "items": items,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "quotation_detail.html", context)


# ──────────────────────────────────────────────────────────────────────────────
# STEP 5 — PURCHASE ORDERS & INVOICES
# ──────────────────────────────────────────────────────────────────────────────

@login_required(login_url="vendor_login")
def order_list(request):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    orders = PurchaseOrder.objects.filter(vendor=vendor).order_by("-created_at")

    status = request.GET.get("status", "")
    if status:
        orders = orders.filter(status=status)

    paginator = Paginator(orders, 10)
    page = request.GET.get("page")
    orders_page = paginator.get_page(page)

    context = {
        "vendor": vendor,
        "orders": orders_page,
        "current_status": status,
        "status_choices": PurchaseOrder.Status.choices,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "order_list.html", context)


@login_required(login_url="vendor_login")
def order_detail(request, order_id):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    order = get_object_or_404(PurchaseOrder, id=order_id, vendor=vendor)
    items = order.items.all()

    context = {
        "vendor": vendor,
        "order": order,
        "items": items,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "order_detail.html", context)


@login_required(login_url="vendor_login")
def acknowledge_order(request, order_id):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    order = get_object_or_404(PurchaseOrder, id=order_id, vendor=vendor)

    if order.status == PurchaseOrder.Status.ISSUED:
        order.status = PurchaseOrder.Status.ACKNOWLEDGED
        order.save()
        messages.success(request, f"Purchase Order {order.po_number} acknowledged.")
    else:
        messages.warning(request, "This order cannot be acknowledged at this stage.")

    return redirect("order_detail", order_id=order.id)


@login_required(login_url="vendor_login")
def invoice_list(request):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    invoices = Invoice.objects.filter(vendor=vendor).order_by("-created_at")

    status = request.GET.get("status", "")
    if status:
        invoices = invoices.filter(status=status)

    paginator = Paginator(invoices, 10)
    page = request.GET.get("page")
    invoices_page = paginator.get_page(page)

    context = {
        "vendor": vendor,
        "invoices": invoices_page,
        "current_status": status,
        "status_choices": Invoice.Status.choices,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "invoice_list.html", context)


@login_required(login_url="vendor_login")
def invoice_create(request, order_id):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    order = get_object_or_404(PurchaseOrder, id=order_id, vendor=vendor)

    if request.method == "POST":
        form = InvoiceForm(request.POST, request.FILES)
        if form.is_valid():
            invoice = form.save(commit=False)
            invoice.purchase_order = order
            invoice.vendor = vendor
            invoice.status = Invoice.Status.SUBMITTED
            invoice.save()
            messages.success(request, f"Invoice {invoice.invoice_number} created successfully!")
            return redirect("invoice_list")
    else:
        form = InvoiceForm(initial={
            "subtotal": order.total_amount,
            "tax_amount": order.tax_amount,
            "total_amount": order.grand_total,
        })

    context = {
        "vendor": vendor,
        "order": order,
        "form": form,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "invoice_create.html", context)


# ──────────────────────────────────────────────────────────────────────────────
# STEP 6 — PROFILE & DOCUMENTS
# ──────────────────────────────────────────────────────────────────────────────

@login_required(login_url="vendor_login")
def vendor_profile(request):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    if request.method == "POST":
        form = VendorProfileForm(request.POST, request.FILES, instance=vendor)
        if form.is_valid():
            form.save()
            messages.success(request, "Profile updated successfully!")
            return redirect("vendor_profile")
    else:
        form = VendorProfileForm(instance=vendor)

    context = {
        "vendor": vendor,
        "form": form,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "profile.html", context)


@login_required(login_url="vendor_login")
def vendor_documents(request):
    vendor = get_vendor(request.user)
    if not vendor:
        return redirect("vendor_register")

    if request.method == "POST":
        form = VendorDocumentForm(request.POST, request.FILES)
        if form.is_valid():
            doc = form.save(commit=False)
            doc.vendor = vendor
            doc.save()
            messages.success(request, "Document uploaded successfully!")
            return redirect("vendor_documents")
    else:
        form = VendorDocumentForm()

    documents = VendorDocument.objects.filter(vendor=vendor).order_by("-uploaded_at")

    context = {
        "vendor": vendor,
        "form": form,
        "documents": documents,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "documents.html", context)


# ──────────────────────────────────────────────────────────────────────────────
# STEP 7 — NOTIFICATIONS
# ──────────────────────────────────────────────────────────────────────────────

@login_required(login_url="vendor_login")
def notification_list(request):
    vendor = get_vendor(request.user)

    notifications = Notification.objects.filter(
        recipient=request.user,
    ).order_by("-created_at")

    paginator = Paginator(notifications, 20)
    page = request.GET.get("page")
    notifs_page = paginator.get_page(page)

    context = {
        "vendor": vendor,
        "notifications": notifs_page,
        "unread_count": get_unread_count(request.user),
    }
    return render(request, "notifications.html", context)


@login_required(login_url="vendor_login")
def mark_notification_read(request, notif_id):
    notif = get_object_or_404(
        Notification, id=notif_id, recipient=request.user
    )
    notif.mark_as_read()
    next_url = request.GET.get("next", "notification_list")
    if notif.link:
        return redirect(notif.link)
    return redirect(next_url)


@login_required(login_url="vendor_login")
def mark_all_read(request):
    Notification.objects.filter(
        recipient=request.user, is_read=False
    ).update(is_read=True, read_at=timezone.now())
    messages.success(request, "All notifications marked as read.")
    return redirect("notification_list")
