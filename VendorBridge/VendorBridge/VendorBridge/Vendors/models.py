import uuid
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import (
    MinValueValidator,
    MaxValueValidator,
    FileExtensionValidator,
)
from django.utils import timezone


# ──────────────────────────────────────────────────────────────────────────────
# 1. VENDOR REGISTRATION & MANAGEMENT
# ──────────────────────────────────────────────────────────────────────────────

class Vendor(models.Model):
    """
    Vendor company profile linked to a Django User account.
    Stores all company details, documents, and approval status.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending Review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        SUSPENDED = "suspended", "Suspended"
        BLACKLISTED = "blacklisted", "Blacklisted"

    class CompanySize(models.TextChoices):
        MICRO = "micro", "Micro (1-10 employees)"
        SMALL = "small", "Small (11-50 employees)"
        MEDIUM = "medium", "Medium (51-250 employees)"
        LARGE = "large", "Large (251-1000 employees)"
        ENTERPRISE = "enterprise", "Enterprise (1000+ employees)"

    # ── Link to Django User ──
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="vendor_profile",
    )

    # ── Company Information ──
    company_name = models.CharField(max_length=255)
    company_code = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        help_text="Auto-generated unique vendor code",
    )
    company_size = models.CharField(
        max_length=20,
        choices=CompanySize.choices,
        default=CompanySize.SMALL,
    )
    industry = models.CharField(max_length=150, blank=True)
    description = models.TextField(blank=True, help_text="Brief company description")
    logo = models.ImageField(upload_to="vendor_logos/", blank=True, null=True)
    website = models.URLField(blank=True)

    # ── Contact Details ──
    contact_person = models.CharField(max_length=150)
    contact_email = models.EmailField()
    contact_phone = models.CharField(max_length=20)
    alternate_phone = models.CharField(max_length=20, blank=True)

    # ── Address ──
    address_line_1 = models.CharField(max_length=255)
    address_line_2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    country = models.CharField(max_length=100, default="India")
    postal_code = models.CharField(max_length=20)

    # ── Tax & Legal ──
    gstin = models.CharField(
        max_length=15,
        blank=True,
        verbose_name="GSTIN",
        help_text="15-digit GST Identification Number",
    )
    pan_number = models.CharField(
        max_length=10,
        blank=True,
        verbose_name="PAN",
        help_text="10-character PAN number",
    )
    registration_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="Company registration / CIN number",
    )

    # ── Banking Details ──
    bank_name = models.CharField(max_length=150, blank=True)
    bank_account_number = models.CharField(max_length=30, blank=True)
    bank_ifsc_code = models.CharField(max_length=11, blank=True, verbose_name="IFSC")
    bank_branch = models.CharField(max_length=150, blank=True)

    # ── Approval & Status ──
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_vendors",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # ── Performance Metrics ──
    rating = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        help_text="Overall vendor rating (0-5)",
    )
    total_orders_completed = models.PositiveIntegerField(default=0)
    on_time_delivery_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.00,
        help_text="Percentage of on-time deliveries",
    )

    # ── Timestamps ──
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Vendor"
        verbose_name_plural = "Vendors"

    def save(self, *args, **kwargs):
        if not self.company_code:
            self.company_code = f"VND-{uuid.uuid4().hex[:8].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.company_name} ({self.company_code})"

    @property
    def is_active(self):
        return self.status == self.Status.APPROVED


class VendorDocument(models.Model):
    """
    Documents uploaded by vendors during registration or later
    (certificates, licenses, tax documents, etc.).
    """

    class DocType(models.TextChoices):
        GST_CERTIFICATE = "gst_certificate", "GST Certificate"
        PAN_CARD = "pan_card", "PAN Card"
        INCORPORATION_CERT = "incorporation_cert", "Certificate of Incorporation"
        MSME_CERTIFICATE = "msme_certificate", "MSME Certificate"
        ISO_CERTIFICATE = "iso_certificate", "ISO Certificate"
        TRADE_LICENSE = "trade_license", "Trade License"
        BANK_STATEMENT = "bank_statement", "Bank Statement"
        CANCELLED_CHEQUE = "cancelled_cheque", "Cancelled Cheque"
        OTHER = "other", "Other"

    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    document_type = models.CharField(max_length=30, choices=DocType.choices)
    document_name = models.CharField(max_length=255)
    file = models.FileField(
        upload_to="vendor_documents/%Y/%m/",
        validators=[
            FileExtensionValidator(
                allowed_extensions=["pdf", "jpg", "jpeg", "png", "doc", "docx"]
            )
        ],
    )
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_documents",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text="Document expiry date (if applicable)",
    )
    notes = models.TextField(blank=True)

    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-uploaded_at"]
        verbose_name = "Vendor Document"
        verbose_name_plural = "Vendor Documents"

    def __str__(self):
        return f"{self.vendor.company_name} – {self.get_document_type_display()}"

    @property
    def is_expired(self):
        if self.expiry_date:
            return self.expiry_date < timezone.now().date()
        return False


class VendorCategory(models.Model):
    """
    Product / service categories a vendor can supply.
    Many-to-many relationship with Vendor.
    """

    name = models.CharField(max_length=150, unique=True)
    slug = models.SlugField(max_length=160, unique=True)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="subcategories",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    vendors = models.ManyToManyField(
        Vendor,
        related_name="categories",
        blank=True,
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Vendor Category"
        verbose_name_plural = "Vendor Categories"

    def __str__(self):
        return self.name


# ──────────────────────────────────────────────────────────────────────────────
# 2. VENDOR APPROVAL WORKFLOW
# ──────────────────────────────────────────────────────────────────────────────

class ApprovalWorkflow(models.Model):
    """
    Tracks every approval / rejection action taken on a vendor,
    quotation, or purchase order — a full audit trail.
    """

    class EntityType(models.TextChoices):
        VENDOR = "vendor", "Vendor Registration"
        QUOTATION = "quotation", "Quotation"
        PURCHASE_ORDER = "purchase_order", "Purchase Order"
        INVOICE = "invoice", "Invoice"

    class Action(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        UNDER_REVIEW = "under_review", "Under Review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        ESCALATED = "escalated", "Escalated"
        REVISION_REQUESTED = "revision_requested", "Revision Requested"

    entity_type = models.CharField(max_length=20, choices=EntityType.choices)
    entity_id = models.PositiveIntegerField(help_text="ID of the related object")
    action = models.CharField(max_length=20, choices=Action.choices)
    performed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="approval_actions",
    )
    comments = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Approval Workflow"
        verbose_name_plural = "Approval Workflows"

    def __str__(self):
        return (
            f"{self.get_entity_type_display()} #{self.entity_id} → "
            f"{self.get_action_display()} by {self.performed_by}"
        )


# ──────────────────────────────────────────────────────────────────────────────
# 3. RFQ (REQUEST FOR QUOTATION) MANAGEMENT
# ──────────────────────────────────────────────────────────────────────────────

class RFQ(models.Model):
    """
    Request for Quotation created by a Procurement Officer.
    Vendors browse and submit quotations against open RFQs.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        UNDER_REVIEW = "under_review", "Under Review"
        AWARDED = "awarded", "Awarded"
        CLOSED = "closed", "Closed"
        CANCELLED = "cancelled", "Cancelled"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    rfq_number = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        help_text="Auto-generated RFQ reference number",
    )
    title = models.CharField(max_length=300)
    description = models.TextField()
    category = models.ForeignKey(
        VendorCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rfqs",
    )

    # ── Budget & Pricing ──
    estimated_budget = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Estimated budget (may be hidden from vendors)",
    )
    currency = models.CharField(max_length=3, default="INR")
    show_budget_to_vendors = models.BooleanField(
        default=False,
        help_text="If checked, vendors can see the estimated budget",
    )

    # ── Dates ──
    published_date = models.DateTimeField(null=True, blank=True)
    submission_deadline = models.DateTimeField(
        help_text="Last date/time for vendors to submit quotations"
    )
    delivery_deadline = models.DateField(
        null=True,
        blank=True,
        help_text="Expected delivery date",
    )

    # ── Status & Priority ──
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )

    # ── Ownership ──
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_rfqs",
    )
    invited_vendors = models.ManyToManyField(
        Vendor,
        blank=True,
        related_name="invited_rfqs",
        help_text="Specific vendors invited (leave blank for open RFQ)",
    )

    # ── Terms ──
    terms_and_conditions = models.TextField(blank=True)
    delivery_location = models.CharField(max_length=300, blank=True)
    payment_terms = models.CharField(max_length=255, blank=True)

    # ── Attachments ──
    attachment = models.FileField(
        upload_to="rfq_attachments/%Y/%m/",
        blank=True,
        null=True,
        help_text="Specification document, drawings, etc.",
    )

    # ── Timestamps ──
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "RFQ"
        verbose_name_plural = "RFQs"

    def save(self, *args, **kwargs):
        if not self.rfq_number:
            year = timezone.now().year
            self.rfq_number = f"RFQ-{year}-{uuid.uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.rfq_number} – {self.title}"

    @property
    def is_open(self):
        return (
            self.status == self.Status.PUBLISHED
            and self.submission_deadline > timezone.now()
        )

    @property
    def total_quotations(self):
        return self.quotations.count()


class RFQItem(models.Model):
    """
    Individual line items within an RFQ.
    Each item represents a product/service being requested.
    """

    rfq = models.ForeignKey(
        RFQ,
        on_delete=models.CASCADE,
        related_name="items",
    )
    item_name = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    unit = models.CharField(
        max_length=30,
        default="units",
        help_text="e.g. units, kg, liters, meters, hours",
    )
    specifications = models.TextField(
        blank=True,
        help_text="Detailed technical specifications",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "RFQ Item"
        verbose_name_plural = "RFQ Items"

    def __str__(self):
        return f"{self.item_name} (×{self.quantity} {self.unit})"


# ──────────────────────────────────────────────────────────────────────────────
# 4. QUOTATION SUBMISSION & COMPARISON
# ──────────────────────────────────────────────────────────────────────────────

class Quotation(models.Model):
    """
    A vendor's response to an RFQ with pricing, delivery terms, and notes.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        UNDER_REVIEW = "under_review", "Under Review"
        SHORTLISTED = "shortlisted", "Shortlisted"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        WITHDRAWN = "withdrawn", "Withdrawn"

    quotation_number = models.CharField(
        max_length=25,
        unique=True,
        editable=False,
    )
    rfq = models.ForeignKey(
        RFQ,
        on_delete=models.CASCADE,
        related_name="quotations",
    )
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.CASCADE,
        related_name="quotations",
    )

    # ── Pricing ──
    total_amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    tax_amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0.00,
    )
    discount_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    grand_total = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        help_text="Total after tax and discount",
    )
    currency = models.CharField(max_length=3, default="INR")

    # ── Delivery ──
    delivery_days = models.PositiveIntegerField(
        help_text="Estimated delivery in business days"
    )
    delivery_terms = models.TextField(blank=True)
    warranty_period = models.CharField(
        max_length=100,
        blank=True,
        help_text="e.g. 12 months, 2 years",
    )

    # ── Payment ──
    payment_terms = models.CharField(
        max_length=255,
        blank=True,
        help_text="e.g. Net 30, 50% advance",
    )
    validity_period = models.PositiveIntegerField(
        default=30,
        help_text="Quotation validity in days",
    )

    # ── Status ──
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_quotations",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)

    # ── Additional ──
    notes = models.TextField(blank=True, help_text="Vendor's additional remarks")
    attachment = models.FileField(
        upload_to="quotation_attachments/%Y/%m/",
        blank=True,
        null=True,
    )

    # ── AI Scoring (Future Enhancement) ──
    ai_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="AI-generated recommendation score (0-100)",
    )

    # ── Timestamps ──
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ["rfq", "vendor"]  # One quotation per vendor per RFQ
        verbose_name = "Quotation"
        verbose_name_plural = "Quotations"

    def save(self, *args, **kwargs):
        if not self.quotation_number:
            self.quotation_number = f"QTN-{uuid.uuid4().hex[:8].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quotation_number} – {self.vendor.company_name} for {self.rfq.rfq_number}"


class QuotationItem(models.Model):
    """
    Line-item pricing within a quotation, mapped to RFQ items.
    """

    quotation = models.ForeignKey(
        Quotation,
        on_delete=models.CASCADE,
        related_name="items",
    )
    rfq_item = models.ForeignKey(
        RFQItem,
        on_delete=models.CASCADE,
        related_name="quoted_prices",
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    total_price = models.DecimalField(max_digits=15, decimal_places=2)
    remarks = models.TextField(blank=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "Quotation Item"
        verbose_name_plural = "Quotation Items"

    def save(self, *args, **kwargs):
        self.total_price = self.unit_price * self.quantity
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.rfq_item.item_name} @ ₹{self.unit_price}"


# ──────────────────────────────────────────────────────────────────────────────
# 5. PURCHASE ORDER MANAGEMENT
# ──────────────────────────────────────────────────────────────────────────────

class PurchaseOrder(models.Model):
    """
    Generated after a quotation is accepted.
    Represents a binding order between the organization and vendor.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ISSUED = "issued", "Issued"
        ACKNOWLEDGED = "acknowledged", "Acknowledged"
        IN_PROGRESS = "in_progress", "In Progress"
        PARTIALLY_DELIVERED = "partially_delivered", "Partially Delivered"
        DELIVERED = "delivered", "Delivered"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    po_number = models.CharField(
        max_length=25,
        unique=True,
        editable=False,
    )
    rfq = models.ForeignKey(
        RFQ,
        on_delete=models.SET_NULL,
        null=True,
        related_name="purchase_orders",
    )
    quotation = models.OneToOneField(
        Quotation,
        on_delete=models.SET_NULL,
        null=True,
        related_name="purchase_order",
    )
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.CASCADE,
        related_name="purchase_orders",
    )

    # ── Financial ──
    total_amount = models.DecimalField(max_digits=15, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    grand_total = models.DecimalField(max_digits=15, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")

    # ── Dates ──
    issue_date = models.DateTimeField(null=True, blank=True)
    expected_delivery_date = models.DateField(null=True, blank=True)
    actual_delivery_date = models.DateField(null=True, blank=True)

    # ── Terms ──
    payment_terms = models.CharField(max_length=255, blank=True)
    delivery_address = models.TextField(blank=True)
    special_instructions = models.TextField(blank=True)

    # ── Status ──
    status = models.CharField(
        max_length=25,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_purchase_orders",
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_purchase_orders",
    )

    # ── Timestamps ──
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Purchase Order"
        verbose_name_plural = "Purchase Orders"

    def save(self, *args, **kwargs):
        if not self.po_number:
            year = timezone.now().year
            self.po_number = f"PO-{year}-{uuid.uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.po_number} – {self.vendor.company_name}"

    @property
    def is_overdue(self):
        if self.expected_delivery_date and not self.actual_delivery_date:
            return self.expected_delivery_date < timezone.now().date()
        return False


class PurchaseOrderItem(models.Model):
    """
    Individual items within a purchase order.
    """

    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="items",
    )
    item_name = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    unit = models.CharField(max_length=30, default="units")
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    total_price = models.DecimalField(max_digits=15, decimal_places=2)

    # ── Delivery Tracking ──
    quantity_delivered = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    quantity_pending = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
    )

    class Meta:
        ordering = ["id"]
        verbose_name = "Purchase Order Item"
        verbose_name_plural = "Purchase Order Items"

    def save(self, *args, **kwargs):
        self.total_price = self.unit_price * self.quantity
        self.quantity_pending = self.quantity - self.quantity_delivered
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item_name} (×{self.quantity})"


# ──────────────────────────────────────────────────────────────────────────────
# 6. INVOICE TRACKING
# ──────────────────────────────────────────────────────────────────────────────

class Invoice(models.Model):
    """
    Invoice raised by the vendor against a Purchase Order.
    Tracked through payment lifecycle.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        UNDER_REVIEW = "under_review", "Under Review"
        APPROVED = "approved", "Approved"
        PAID = "paid", "Paid"
        PARTIALLY_PAID = "partially_paid", "Partially Paid"
        OVERDUE = "overdue", "Overdue"
        DISPUTED = "disputed", "Disputed"
        CANCELLED = "cancelled", "Cancelled"

    invoice_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
    )
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="invoices",
    )
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.CASCADE,
        related_name="invoices",
    )

    # ── Amounts ──
    subtotal = models.DecimalField(max_digits=15, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    discount_amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0.00,
    )
    total_amount = models.DecimalField(max_digits=15, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    currency = models.CharField(max_length=3, default="INR")

    # ── Dates ──
    invoice_date = models.DateField()
    due_date = models.DateField()
    paid_date = models.DateField(null=True, blank=True)

    # ── Status ──
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    # ── Attachments ──
    invoice_file = models.FileField(
        upload_to="invoices/%Y/%m/",
        blank=True,
        null=True,
        help_text="Scanned invoice or PDF",
    )

    # ── Notes ──
    notes = models.TextField(blank=True)
    dispute_reason = models.TextField(blank=True)

    # ── Timestamps ──
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Invoice"
        verbose_name_plural = "Invoices"

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            year = timezone.now().year
            self.invoice_number = f"INV-{year}-{uuid.uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.invoice_number} – ₹{self.total_amount}"

    @property
    def balance_due(self):
        return self.total_amount - self.amount_paid

    @property
    def is_overdue(self):
        return (
            self.due_date < timezone.now().date()
            and self.status not in [self.Status.PAID, self.Status.CANCELLED]
        )


class InvoiceItem(models.Model):
    """
    Individual line items within an invoice.
    """

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="items",
    )
    item_name = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    unit = models.CharField(max_length=30, default="units")
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    total_price = models.DecimalField(max_digits=15, decimal_places=2)

    class Meta:
        ordering = ["id"]
        verbose_name = "Invoice Item"
        verbose_name_plural = "Invoice Items"

    def save(self, *args, **kwargs):
        self.total_price = self.unit_price * self.quantity
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item_name} – ₹{self.total_price}"


# ──────────────────────────────────────────────────────────────────────────────
# 7. NOTIFICATIONS & APPROVAL SYSTEM
# ──────────────────────────────────────────────────────────────────────────────

class Notification(models.Model):
    """
    In-app notifications for vendors and procurement officers.
    """

    class NotifType(models.TextChoices):
        RFQ_PUBLISHED = "rfq_published", "New RFQ Published"
        RFQ_CLOSED = "rfq_closed", "RFQ Closed"
        QUOTATION_RECEIVED = "quotation_received", "Quotation Received"
        QUOTATION_ACCEPTED = "quotation_accepted", "Quotation Accepted"
        QUOTATION_REJECTED = "quotation_rejected", "Quotation Rejected"
        PO_ISSUED = "po_issued", "Purchase Order Issued"
        PO_STATUS_UPDATE = "po_status_update", "PO Status Update"
        INVOICE_APPROVED = "invoice_approved", "Invoice Approved"
        INVOICE_PAID = "invoice_paid", "Invoice Paid"
        INVOICE_DISPUTED = "invoice_disputed", "Invoice Disputed"
        VENDOR_APPROVED = "vendor_approved", "Vendor Registration Approved"
        VENDOR_REJECTED = "vendor_rejected", "Vendor Registration Rejected"
        DOCUMENT_VERIFIED = "document_verified", "Document Verified"
        DEADLINE_REMINDER = "deadline_reminder", "Deadline Reminder"
        GENERAL = "general", "General Notification"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    recipient = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(
        max_length=30,
        choices=NotifType.choices,
        default=NotifType.GENERAL,
    )
    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    link = models.CharField(
        max_length=500,
        blank=True,
        help_text="URL to navigate when notification is clicked",
    )

    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Notification"
        verbose_name_plural = "Notifications"

    def __str__(self):
        status = "Read" if self.is_read else "Unread"
        return f"[{status}] {self.title} → {self.recipient.username}"

    def mark_as_read(self):
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=["is_read", "read_at"])


# ──────────────────────────────────────────────────────────────────────────────
# 8. PROCUREMENT ANALYTICS (Supporting Model)
# ──────────────────────────────────────────────────────────────────────────────

class ProcurementAnalytics(models.Model):
    """
    Monthly aggregated analytics snapshot for the dashboard.
    Populated via a management command or periodic task.
    """

    month = models.DateField(help_text="First day of the month")
    total_rfqs_created = models.PositiveIntegerField(default=0)
    total_rfqs_awarded = models.PositiveIntegerField(default=0)
    total_quotations_received = models.PositiveIntegerField(default=0)
    total_pos_issued = models.PositiveIntegerField(default=0)
    total_spend = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)
    total_invoices_paid = models.PositiveIntegerField(default=0)
    total_invoices_pending = models.PositiveIntegerField(default=0)
    new_vendors_registered = models.PositiveIntegerField(default=0)
    average_quotation_response_days = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.00,
    )
    cost_savings_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.00,
        help_text="% saved vs estimated budgets",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-month"]
        verbose_name = "Procurement Analytics"
        verbose_name_plural = "Procurement Analytics"
        unique_together = ["month"]

    def __str__(self):
        return f"Analytics – {self.month.strftime('%B %Y')}"


# ──────────────────────────────────────────────────────────────────────────────
# 9. VENDOR PERFORMANCE REVIEW
# ──────────────────────────────────────────────────────────────────────────────

class VendorPerformanceReview(models.Model):
    """
    Periodic performance review of a vendor by procurement officers.
    Feeds into the vendor's overall rating.
    """

    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.CASCADE,
        related_name="performance_reviews",
    )
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviews",
    )
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="vendor_reviews",
    )

    # ── Scoring (each 1-5) ──
    quality_rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Product/service quality (1-5)",
    )
    delivery_rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="On-time delivery (1-5)",
    )
    communication_rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Communication & responsiveness (1-5)",
    )
    pricing_rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Value for money (1-5)",
    )
    compliance_rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Compliance with terms (1-5)",
    )

    overall_rating = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        help_text="Calculated average of all ratings",
    )
    comments = models.TextField(blank=True)
    review_period_start = models.DateField()
    review_period_end = models.DateField()

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Vendor Performance Review"
        verbose_name_plural = "Vendor Performance Reviews"

    def save(self, *args, **kwargs):
        # Auto-calculate overall rating as the average of all 5 sub-ratings
        ratings = [
            self.quality_rating,
            self.delivery_rating,
            self.communication_rating,
            self.pricing_rating,
            self.compliance_rating,
        ]
        self.overall_rating = sum(ratings) / len(ratings)
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"Review of {self.vendor.company_name} – "
            f"{self.overall_rating}/5 by {self.reviewed_by}"
        )
