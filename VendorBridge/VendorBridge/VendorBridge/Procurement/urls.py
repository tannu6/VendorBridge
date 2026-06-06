from django.urls import path
from . import views

urlpatterns = [
    # Dashboard
    path("", views.procurement_dashboard, name="procurement_dashboard"),
    
    # RFQs
    path("rfqs/", views.rfq_list, name="proc_rfq_list"),
    path("rfqs/create/", views.rfq_create, name="rfq_create"),
    path("rfqs/<int:rfq_id>/edit/", views.rfq_edit, name="rfq_edit"),
    path("rfqs/<int:rfq_id>/publish/", views.rfq_publish, name="rfq_publish"),
    path("rfqs/<int:rfq_id>/close/", views.rfq_close, name="rfq_close"),
    
    # Quotations
    path("quotations/", views.quotation_list, name="proc_quotation_list"),
    path("quotations/<int:quotation_id>/", views.quotation_detail, name="proc_quotation_detail"),
    path("quotations/<int:quotation_id>/approve/", views.quotation_approve, name="quotation_approve"),
    path("quotations/<int:quotation_id>/reject/", views.quotation_reject, name="quotation_reject"),
    
    # Purchase Orders
    path("purchase-orders/", views.po_list, name="proc_po_list"),
    path("purchase-orders/<int:po_id>/", views.po_detail, name="po_detail"),
    
    # Vendors
    path("vendors/", views.vendor_list, name="proc_vendor_list"),
    path("vendors/<int:vendor_id>/", views.vendor_detail, name="proc_vendor_detail"),
]
