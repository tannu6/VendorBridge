from django.contrib import admin
from django.utils import timezone
from .models import (
    Vendor,
    VendorDocument,
    VendorCategory,
    ApprovalWorkflow,
    RFQ,
    RFQItem,
    Quotation,
    QuotationItem,
    PurchaseOrder,
    PurchaseOrderItem,
    Invoice,
    InvoiceItem,
    Notification,
    ProcurementAnalytics,
    VendorPerformanceReview,
)


# ── Inlines ──────────────────────────────────────────────────────────────────

class VendorDocumentInline(admin.TabularInline):
    model = VendorDocument
    extra = 0
    readonly_fields = ("uploaded_at",)


class RFQItemInline(admin.TabularInline):
    model = RFQItem
    extra = 1


class QuotationItemInline(admin.TabularInline):
    model = QuotationItem
    extra = 0
    readonly_fields = ("total_price",)


# ── Admin Actions ─────────────────────────────────────────────────────────────

def approve_vendors(modeladmin, request, queryset):
    updated = queryset.update(
        status=Vendor.Status.APPROVED,
        approved_by=request.user,
        approved_at=timezone.now(),
    )
    for vendor in queryset:
        ApprovalWorkflow.objects.create(
            entity_type=ApprovalWorkflow.EntityType.VENDOR,
            entity_id=vendor.id,
            action=ApprovalWorkflow.Action.APPROVED,
            performed_by=request.user,
            comments="Approved via Django admin",
        )
    modeladmin.message_user(
        request,
        f"Successfully approved {updated} vendor(s).",
    )


approve_vendors.short_description = "Approve selected vendors"


def reject_vendors(modeladmin, request, queryset):
    updated = queryset.update(status=Vendor.Status.REJECTED)
    for vendor in queryset:
        ApprovalWorkflow.objects.create(
            entity_type=ApprovalWorkflow.EntityType.VENDOR,
            entity_id=vendor.id,
            action=ApprovalWorkflow.Action.REJECTED,
            performed_by=request.user,
            comments="Rejected via Django admin",
        )
    modeladmin.message_user(
        request,
        f"Successfully rejected {updated} vendor(s).",
    )


reject_vendors.short_description = "Reject selected vendors"


def publish_rfqs(modeladmin, request, queryset):
    updated = queryset.update(status=RFQ.Status.PUBLISHED)
    modeladmin.message_user(request, f"Published {updated} RFQ(s).")


publish_rfqs.short_description = "Publish selected RFQs"


def close_rfqs(modeladmin, request, queryset):
    updated = queryset.update(status=RFQ.Status.CLOSED)
    modeladmin.message_user(request, f"Closed {updated} RFQ(s).")


close_rfqs.short_description = "Close selected RFQs"


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0
    readonly_fields = ("total_price",)


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0
    readonly_fields = ("total_price",)


# ── Model Admins ─────────────────────────────────────────────────────────────

@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = (
        "company_name",
        "company_code",
        "contact_person",
        "status",
        "rating",
        "created_at",
    )
    list_filter = ("status", "company_size", "country", "created_at")
    search_fields = ("company_name", "company_code", "contact_email", "gstin")
    readonly_fields = ("company_code", "created_at", "updated_at")
    inlines = [VendorDocumentInline]
    list_editable = ("status",)
    actions = (approve_vendors, reject_vendors)


@admin.register(VendorCategory)
class VendorCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "parent", "is_active")
    prepopulated_fields = {"slug": ("name",)}
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(ApprovalWorkflow)
class ApprovalWorkflowAdmin(admin.ModelAdmin):
    list_display = ("entity_type", "entity_id", "action", "performed_by", "created_at")
    list_filter = ("entity_type", "action", "created_at")
    readonly_fields = ("created_at",)


@admin.register(RFQ)
class RFQAdmin(admin.ModelAdmin):
    list_display = (
        "rfq_number",
        "title",
        "status",
        "priority",
        "submission_deadline",
        "total_quotations",
        "created_by",
    )
    list_filter = ("status", "priority", "created_at")
    search_fields = ("rfq_number", "title")
    readonly_fields = ("rfq_number", "created_at", "updated_at")
    inlines = [RFQItemInline]
    actions = (publish_rfqs, close_rfqs)


@admin.register(Quotation)
class QuotationAdmin(admin.ModelAdmin):
    list_display = (
        "quotation_number",
        "rfq",
        "vendor",
        "grand_total",
        "status",
        "submitted_at",
    )
    list_filter = ("status", "created_at")
    search_fields = ("quotation_number", "vendor__company_name", "rfq__rfq_number")
    readonly_fields = ("quotation_number", "created_at", "updated_at")
    inlines = [QuotationItemInline]


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = (
        "po_number",
        "vendor",
        "grand_total",
        "status",
        "expected_delivery_date",
        "is_overdue",
    )
    list_filter = ("status", "created_at")
    search_fields = ("po_number", "vendor__company_name")
    readonly_fields = ("po_number", "created_at", "updated_at")
    inlines = [PurchaseOrderItemInline]


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "vendor",
        "total_amount",
        "amount_paid",
        "status",
        "due_date",
        "is_overdue",
    )
    list_filter = ("status", "created_at")
    search_fields = ("invoice_number", "vendor__company_name")
    readonly_fields = ("invoice_number", "created_at", "updated_at")
    inlines = [InvoiceItemInline]


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "recipient",
        "notification_type",
        "priority",
        "is_read",
        "created_at",
    )
    list_filter = ("notification_type", "priority", "is_read", "created_at")
    search_fields = ("title", "message", "recipient__username")
    readonly_fields = ("created_at",)


@admin.register(ProcurementAnalytics)
class ProcurementAnalyticsAdmin(admin.ModelAdmin):
    list_display = (
        "month",
        "total_rfqs_created",
        "total_spend",
        "new_vendors_registered",
        "cost_savings_percentage",
    )
    readonly_fields = ("created_at", "updated_at")


@admin.register(VendorPerformanceReview)
class VendorPerformanceReviewAdmin(admin.ModelAdmin):
    list_display = (
        "vendor",
        "overall_rating",
        "quality_rating",
        "delivery_rating",
        "reviewed_by",
        "created_at",
    )
    list_filter = ("created_at",)
    search_fields = ("vendor__company_name",)
    readonly_fields = ("overall_rating", "created_at")
