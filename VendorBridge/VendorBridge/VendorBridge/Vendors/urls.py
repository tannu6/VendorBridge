from django.urls import path
from . import views

urlpatterns = [
    # ── Step 1: Authentication ──
    path("register/", views.vendor_register, name="vendor_register"),
    path("login/", views.vendor_login, name="vendor_login"),
    path("logout/", views.vendor_logout, name="vendor_logout"),

    # ── Step 2: Dashboard ──
    path("dashboard/", views.vendor_dashboard, name="vendor_dashboard"),

    # ── Step 3: RFQs & Submit Quotation ──
    path("rfqs/", views.rfq_list, name="rfq_list"),
    path("rfqs/<int:rfq_id>/", views.rfq_detail, name="rfq_detail"),
    path("rfqs/<int:rfq_id>/submit-quotation/", views.submit_quotation, name="submit_quotation"),

    # ── Step 4: My Quotations ──
    path("quotations/", views.quotation_list, name="quotation_list"),
    path("quotations/<int:quotation_id>/", views.quotation_detail, name="quotation_detail"),

    # ── Step 5: Orders & Invoices ──
    path("orders/", views.order_list, name="order_list"),
    path("orders/<int:order_id>/", views.order_detail, name="order_detail"),
    path("orders/<int:order_id>/acknowledge/", views.acknowledge_order, name="acknowledge_order"),
    path("invoices/", views.invoice_list, name="invoice_list"),
    path("orders/<int:order_id>/create-invoice/", views.invoice_create, name="invoice_create"),

    # ── Step 6: Profile & Documents ──
    path("profile/", views.vendor_profile, name="vendor_profile"),
    path("documents/", views.vendor_documents, name="vendor_documents"),

    # ── Step 7: Notifications ──
    path("notifications/", views.notification_list, name="notification_list"),
    path("notifications/<int:notif_id>/read/", views.mark_notification_read, name="mark_notification_read"),
    path("notifications/mark-all-read/", views.mark_all_read, name="mark_all_read"),
]
