from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from Vendors.models import (
    Vendor,
    User,
    RFQ,
    RFQItem,
    Quotation,
    QuotationItem,
)
import random


class Command(BaseCommand):
    help = "Seed database with test data for procurement testing"

    def handle(self, *args, **options):
        self.stdout.write("Starting test data seed...")
        
        # Create test users if not exists
        test_user, created = User.objects.get_or_create(
            username="procurement_officer",
            defaults={
                "email": "procurement@vendorbridge.local",
                "first_name": "John",
                "last_name": "Procurement",
                "is_staff": True,
                "is_superuser": False,
            }
        )
        if created:
            test_user.set_password("test123")
            test_user.save()
            self.stdout.write(self.style.SUCCESS("✓ Created procurement officer user"))
        
        # Create test vendors
        vendor_data = [
            {
                "company_name": "TechSupply Inc",
                "contact_person": "Alice Johnson",
                "contact_email": "alice@techsupply.com",
                "contact_phone": "+91-9876543210",
                "company_size": "MEDIUM",
                "status": "APPROVED",
                "address_line_1": "123 Tech Street",
                "city": "Bangalore",
            },
            {
                "company_name": "GlobalDistributors Ltd",
                "contact_person": "Bob Smith",
                "contact_email": "bob@globaldist.com",
                "contact_phone": "+91-9876543211",
                "company_size": "LARGE",
                "status": "APPROVED",
                "address_line_1": "456 Business Avenue",
                "city": "Mumbai",
            },
            {
                "company_name": "PremiumGoods Co",
                "contact_person": "Charlie Brown",
                "contact_email": "charlie@premiumgoods.com",
                "contact_phone": "+91-9876543212",
                "company_size": "MEDIUM",
                "status": "APPROVED",
                "address_line_1": "789 Quality Drive",
                "city": "Delhi",
            },
            {
                "company_name": "BudgetOptions LLC",
                "contact_person": "Diana Prince",
                "contact_email": "diana@budgetoptions.com",
                "contact_phone": "+91-9876543213",
                "company_size": "SMALL",
                "status": "PENDING",
                "address_line_1": "321 Value Street",
                "city": "Hyderabad",
            },
        ]
        
        vendors = []
        for idx, data in enumerate(vendor_data):
            vendor_username = f"vendor{idx+1}"
            vendor_user, _ = User.objects.get_or_create(
                username=vendor_username,
                defaults={
                    "email": data["contact_email"],
                    "first_name": data["contact_person"].split()[0],
                    "last_name": " ".join(data["contact_person"].split()[1:]) or "Vendor",
                }
            )
            
            vendor, created = Vendor.objects.get_or_create(
                company_name=data["company_name"],
                defaults={**data, "user": vendor_user}
            )
            vendors.append(vendor)
            if created:
                self.stdout.write(f"  ✓ Created vendor: {vendor.company_name}")
        
        # Create test RFQs
        rfq_data = [
            {
                "title": "Industrial Pumps - Batch Order",
                "description": "Seeking quotes for 50 industrial water pumps for manufacturing plant upgrades.",
                "status": "PUBLISHED",
                "priority": "HIGH",
                "published_date": timezone.now() - timedelta(days=2),
                "submission_deadline": timezone.now() + timedelta(days=5),
            },
            {
                "title": "Office Furniture Supply",
                "description": "New office furnishings including desks, chairs, and filing cabinets for expansion.",
                "status": "PUBLISHED",
                "priority": "MEDIUM",
                "published_date": timezone.now() - timedelta(days=1),
                "submission_deadline": timezone.now() + timedelta(days=7),
            },
            {
                "title": "Raw Materials - Monthly Stock",
                "description": "Regular monthly procurement of raw materials for production.",
                "status": "DRAFT",
                "priority": "MEDIUM",
                "published_date": None,
                "submission_deadline": timezone.now() + timedelta(days=10),
            },
        ]
        
        rfqs = []
        for data in rfq_data:
            rfq, created = RFQ.objects.get_or_create(
                title=data["title"],
                defaults={**data, "created_by": test_user}
            )
            rfqs.append(rfq)
            if created:
                self.stdout.write(f"  ✓ Created RFQ: {rfq.rfq_number}")
            
            # Add items to RFQ if not already there
            if not rfq.items.exists():
                items = [
                    {"description": f"Item 1 - {rfq.title}", "quantity": 50, "unit": "PCS"},
                    {"description": f"Item 2 - {rfq.title}", "quantity": 100, "unit": "KG"},
                ]
                for item_data in items:
                    RFQItem.objects.create(rfq=rfq, **item_data)
                self.stdout.write(f"    ✓ Added items to RFQ {rfq.rfq_number}")
        
        # Create test quotations for first RFQ
        if len(rfqs) > 0 and len(vendors) > 0:
            rfq = rfqs[0]
            for vendor in vendors[:2]:  # Only first 2 vendors
                quotation, created = Quotation.objects.get_or_create(
                    rfq=rfq,
                    vendor=vendor,
                    defaults={
                        "status": "SUBMITTED",
                        "total_amount": random.randint(50000, 150000),
                        "tax_amount": 0,  # Will be calculated
                        "discount_percentage": random.choice([0, 5, 10]),
                    }
                )
                if created:
                    quotation.tax_amount = quotation.total_amount * 0.18
                    quotation.grand_total = quotation.total_amount + quotation.tax_amount - (
                        quotation.total_amount * (quotation.discount_percentage / 100)
                    )
                    quotation.save()
                    
                    # Add quotation items
                    for rfq_item in rfq.items.all():
                        QuotationItem.objects.create(
                            quotation=quotation,
                            rfq_item=rfq_item,
                            quantity=rfq_item.quantity,
                            unit_price=random.randint(100, 1000),
                        )
                    
                    self.stdout.write(f"  ✓ Created quotation from {vendor.company_name}")
        
        self.stdout.write(self.style.SUCCESS("\n✓ Test data seed completed successfully!"))
        self.stdout.write("\nTest Account:")
        self.stdout.write("  Username: procurement_officer")
        self.stdout.write("  Password: test123")
        self.stdout.write("\nTest Vendors:")
        for vendor in vendors[:3]:
            self.stdout.write(f"  - {vendor.company_name} ({vendor.get_status_display()})")
