from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
from django.urls import reverse
from django.utils.html import strip_tags
from django.contrib.auth.models import User

def send_rfq_published_email(rfq, invited_vendors):
    """
    Send RFQ published notification to invited vendors
    """
    try:
        for vendor in invited_vendors:
            context = {
                'vendor': vendor,
                'rfq': rfq,
                'submission_deadline': rfq.submission_deadline,
                'view_url': f"{settings.SITE_URL}/vendor/rfq/{rfq.id}/",
            }
            
            html_message = render_to_string('emails/rfq_published.html', context)
            plain_message = strip_tags(html_message)
            
            send_mail(
                subject=f"New RFQ Available: {rfq.rfq_number} - {rfq.title}",
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[vendor.contact_email],
                html_message=html_message,
                fail_silently=True,
            )
    except Exception as e:
        print(f"Error sending RFQ published email: {e}")


def send_quotation_submitted_email(quotation):
    """
    Send notification when vendor submits quotation
    """
    try:
        procurement_officers = User.objects.filter(
            groups__name='Procurement Officer'
        ).values_list('email', flat=True)
        
        for email in procurement_officers:
            context = {
                'quotation': quotation,
                'rfq': quotation.rfq,
                'vendor': quotation.vendor,
                'review_url': f"{settings.SITE_URL}/procurement/quotations/{quotation.id}/",
            }
            
            html_message = render_to_string('emails/quotation_submitted.html', context)
            plain_message = strip_tags(html_message)
            
            send_mail(
                subject=f"New Quotation Received: {quotation.quotation_number}",
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                html_message=html_message,
                fail_silently=True,
            )
    except Exception as e:
        print(f"Error sending quotation submitted email: {e}")


def send_quotation_approved_email(quotation, purchase_order):
    """
    Send notification when quotation is approved and PO is created
    """
    try:
        context = {
            'quotation': quotation,
            'vendor': quotation.vendor,
            'purchase_order': purchase_order,
            'po_url': f"{settings.SITE_URL}/vendor/purchase-order/{purchase_order.id}/",
        }
        
        html_message = render_to_string('emails/quotation_approved.html', context)
        plain_message = strip_tags(html_message)
        
        send_mail(
            subject=f"Your Quotation Approved - Purchase Order Issued: {purchase_order.po_number}",
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[quotation.vendor.contact_email],
            html_message=html_message,
            fail_silently=True,
        )
    except Exception as e:
        print(f"Error sending quotation approved email: {e}")


def send_quotation_rejected_email(quotation, rejection_reason=""):
    """
    Send notification when quotation is rejected
    """
    try:
        context = {
            'quotation': quotation,
            'rfq': quotation.rfq,
            'vendor': quotation.vendor,
            'rejection_reason': rejection_reason,
        }
        
        html_message = render_to_string('emails/quotation_rejected.html', context)
        plain_message = strip_tags(html_message)
        
        send_mail(
            subject=f"Quotation Status Update: {quotation.quotation_number}",
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[quotation.vendor.contact_email],
            html_message=html_message,
            fail_silently=True,
        )
    except Exception as e:
        print(f"Error sending quotation rejected email: {e}")


def send_purchase_order_email(purchase_order):
    """
    Send PO notification to vendor
    """
    try:
        context = {
            'purchase_order': purchase_order,
            'vendor': purchase_order.vendor,
            'po_items': purchase_order.po_items.all(),
            'acknowledge_url': f"{settings.SITE_URL}/vendor/purchase-order/{purchase_order.id}/acknowledge/",
        }
        
        html_message = render_to_string('emails/purchase_order_issued.html', context)
        plain_message = strip_tags(html_message)
        
        send_mail(
            subject=f"Purchase Order Issued: {purchase_order.po_number}",
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[purchase_order.vendor.contact_email],
            html_message=html_message,
            fail_silently=True,
        )
    except Exception as e:
        print(f"Error sending purchase order email: {e}")
