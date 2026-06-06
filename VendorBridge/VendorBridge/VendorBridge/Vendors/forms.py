from django import forms
from django.contrib.auth.models import User
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from .models import (
    Vendor,
    VendorDocument,
    Quotation,
    QuotationItem,
    Invoice,
)


# ──────────────────────────────────────────────────────────────────────────────
# STEP 1 — AUTHENTICATION FORMS
# ──────────────────────────────────────────────────────────────────────────────

class VendorRegistrationForm(UserCreationForm):
    """
    Registration form that creates a Django User + linked Vendor profile.
    """

    # User fields
    first_name = forms.CharField(
        max_length=50,
        widget=forms.TextInput(attrs={
            "placeholder": "First Name",
            "class": "form-input",
        }),
    )
    last_name = forms.CharField(
        max_length=50,
        widget=forms.TextInput(attrs={
            "placeholder": "Last Name",
            "class": "form-input",
        }),
    )
    email = forms.EmailField(
        widget=forms.EmailInput(attrs={
            "placeholder": "Email Address",
            "class": "form-input",
        }),
    )

    # Vendor fields
    company_name = forms.CharField(
        max_length=255,
        widget=forms.TextInput(attrs={
            "placeholder": "Company Name",
            "class": "form-input",
        }),
    )
    contact_person = forms.CharField(
        max_length=150,
        widget=forms.TextInput(attrs={
            "placeholder": "Contact Person",
            "class": "form-input",
        }),
    )
    contact_phone = forms.CharField(
        max_length=20,
        widget=forms.TextInput(attrs={
            "placeholder": "Phone Number",
            "class": "form-input",
        }),
    )
    industry = forms.CharField(
        max_length=150,
        required=False,
        widget=forms.TextInput(attrs={
            "placeholder": "Industry (e.g. IT, Manufacturing)",
            "class": "form-input",
        }),
    )
    city = forms.CharField(
        max_length=100,
        widget=forms.TextInput(attrs={
            "placeholder": "City",
            "class": "form-input",
        }),
    )
    state = forms.CharField(
        max_length=100,
        widget=forms.TextInput(attrs={
            "placeholder": "State",
            "class": "form-input",
        }),
    )
    country = forms.CharField(
        max_length=100,
        initial="India",
        widget=forms.TextInput(attrs={
            "placeholder": "Country",
            "class": "form-input",
        }),
    )
    address_line_1 = forms.CharField(
        max_length=255,
        widget=forms.TextInput(attrs={
            "placeholder": "Address Line 1",
            "class": "form-input",
        }),
    )
    postal_code = forms.CharField(
        max_length=20,
        widget=forms.TextInput(attrs={
            "placeholder": "Postal Code",
            "class": "form-input",
        }),
    )

    class Meta:
        model = User
        fields = [
            "username",
            "first_name",
            "last_name",
            "email",
            "password1",
            "password2",
        ]
        widgets = {
            "username": forms.TextInput(attrs={
                "placeholder": "Choose a username",
                "class": "form-input",
            }),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["password1"].widget.attrs.update({
            "placeholder": "Password",
            "class": "form-input",
        })
        self.fields["password2"].widget.attrs.update({
            "placeholder": "Confirm Password",
            "class": "form-input",
        })

    def clean_email(self):
        email = self.cleaned_data.get("email")
        if User.objects.filter(email=email).exists():
            raise forms.ValidationError("This email is already registered.")
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.first_name = self.cleaned_data["first_name"]
        user.last_name = self.cleaned_data["last_name"]
        user.email = self.cleaned_data["email"]
        if commit:
            user.save()
            Vendor.objects.create(
                user=user,
                company_name=self.cleaned_data["company_name"],
                contact_person=self.cleaned_data["contact_person"],
                contact_email=self.cleaned_data["email"],
                contact_phone=self.cleaned_data["contact_phone"],
                industry=self.cleaned_data.get("industry", ""),
                city=self.cleaned_data["city"],
                state=self.cleaned_data["state"],
                country=self.cleaned_data["country"],
                address_line_1=self.cleaned_data["address_line_1"],
                postal_code=self.cleaned_data["postal_code"],
            )
        return user


class VendorLoginForm(AuthenticationForm):
    """Custom styled login form."""

    username = forms.CharField(
        widget=forms.TextInput(attrs={
            "placeholder": "Username",
            "class": "form-input",
        }),
    )
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={
            "placeholder": "Password",
            "class": "form-input",
        }),
    )


# ──────────────────────────────────────────────────────────────────────────────
# STEP 3 — QUOTATION FORMS
# ──────────────────────────────────────────────────────────────────────────────

class QuotationForm(forms.ModelForm):
    """Form for vendor to submit quotation metadata."""

    class Meta:
        model = Quotation
        fields = [
            "delivery_days",
            "payment_terms",
            "warranty_period",
            "validity_period",
            "notes",
            "attachment",
        ]
        widgets = {
            "delivery_days": forms.NumberInput(attrs={
                "placeholder": "Estimated delivery in business days",
                "class": "form-input",
                "min": "1",
            }),
            "payment_terms": forms.TextInput(attrs={
                "placeholder": "e.g. Net 30, 50% advance",
                "class": "form-input",
            }),
            "warranty_period": forms.TextInput(attrs={
                "placeholder": "e.g. 12 months",
                "class": "form-input",
            }),
            "validity_period": forms.NumberInput(attrs={
                "placeholder": "Quotation valid for (days)",
                "class": "form-input",
                "min": "1",
            }),
            "notes": forms.Textarea(attrs={
                "placeholder": "Any additional remarks...",
                "class": "form-input",
                "rows": 3,
            }),
            "attachment": forms.ClearableFileInput(attrs={
                "class": "form-input",
            }),
        }


class QuotationItemForm(forms.ModelForm):
    """Form for pricing a single RFQ item."""

    class Meta:
        model = QuotationItem
        fields = ["unit_price", "quantity", "remarks"]
        widgets = {
            "unit_price": forms.NumberInput(attrs={
                "placeholder": "Unit Price (₹)",
                "class": "form-input",
                "min": "0.01",
                "step": "0.01",
            }),
            "quantity": forms.NumberInput(attrs={
                "placeholder": "Quantity",
                "class": "form-input",
                "min": "0.01",
                "step": "0.01",
            }),
            "remarks": forms.TextInput(attrs={
                "placeholder": "Optional remarks",
                "class": "form-input",
            }),
        }


# ──────────────────────────────────────────────────────────────────────────────
# STEP 5 — INVOICE FORM
# ──────────────────────────────────────────────────────────────────────────────

class InvoiceForm(forms.ModelForm):
    """Form for vendor to raise an invoice against a PO."""

    class Meta:
        model = Invoice
        fields = [
            "invoice_date",
            "due_date",
            "subtotal",
            "tax_amount",
            "discount_amount",
            "total_amount",
            "notes",
            "invoice_file",
        ]
        widgets = {
            "invoice_date": forms.DateInput(attrs={
                "type": "date",
                "class": "form-input",
            }),
            "due_date": forms.DateInput(attrs={
                "type": "date",
                "class": "form-input",
            }),
            "subtotal": forms.NumberInput(attrs={
                "placeholder": "Subtotal (₹)",
                "class": "form-input",
                "min": "0.01",
                "step": "0.01",
            }),
            "tax_amount": forms.NumberInput(attrs={
                "placeholder": "Tax Amount (₹)",
                "class": "form-input",
                "min": "0",
                "step": "0.01",
            }),
            "discount_amount": forms.NumberInput(attrs={
                "placeholder": "Discount (₹)",
                "class": "form-input",
                "min": "0",
                "step": "0.01",
            }),
            "total_amount": forms.NumberInput(attrs={
                "placeholder": "Total Amount (₹)",
                "class": "form-input",
                "min": "0.01",
                "step": "0.01",
            }),
            "notes": forms.Textarea(attrs={
                "placeholder": "Invoice notes...",
                "class": "form-input",
                "rows": 3,
            }),
            "invoice_file": forms.ClearableFileInput(attrs={
                "class": "form-input",
            }),
        }


# ──────────────────────────────────────────────────────────────────────────────
# STEP 6 — PROFILE & DOCUMENT FORMS
# ──────────────────────────────────────────────────────────────────────────────

class VendorProfileForm(forms.ModelForm):
    """Form for vendor to update their company profile."""

    class Meta:
        model = Vendor
        fields = [
            "company_name",
            "company_size",
            "industry",
            "description",
            "logo",
            "website",
            "contact_person",
            "contact_email",
            "contact_phone",
            "alternate_phone",
            "address_line_1",
            "address_line_2",
            "city",
            "state",
            "country",
            "postal_code",
            "gstin",
            "pan_number",
            "registration_number",
            "bank_name",
            "bank_account_number",
            "bank_ifsc_code",
            "bank_branch",
        ]
        widgets = {
            "company_name": forms.TextInput(attrs={"class": "form-input"}),
            "company_size": forms.Select(attrs={"class": "form-input"}),
            "industry": forms.TextInput(attrs={"class": "form-input"}),
            "description": forms.Textarea(attrs={"class": "form-input", "rows": 3}),
            "website": forms.URLInput(attrs={"class": "form-input", "placeholder": "https://"}),
            "contact_person": forms.TextInput(attrs={"class": "form-input"}),
            "contact_email": forms.EmailInput(attrs={"class": "form-input"}),
            "contact_phone": forms.TextInput(attrs={"class": "form-input"}),
            "alternate_phone": forms.TextInput(attrs={"class": "form-input"}),
            "address_line_1": forms.TextInput(attrs={"class": "form-input"}),
            "address_line_2": forms.TextInput(attrs={"class": "form-input"}),
            "city": forms.TextInput(attrs={"class": "form-input"}),
            "state": forms.TextInput(attrs={"class": "form-input"}),
            "country": forms.TextInput(attrs={"class": "form-input"}),
            "postal_code": forms.TextInput(attrs={"class": "form-input"}),
            "gstin": forms.TextInput(attrs={"class": "form-input", "placeholder": "15-digit GSTIN"}),
            "pan_number": forms.TextInput(attrs={"class": "form-input", "placeholder": "10-char PAN"}),
            "registration_number": forms.TextInput(attrs={"class": "form-input"}),
            "bank_name": forms.TextInput(attrs={"class": "form-input"}),
            "bank_account_number": forms.TextInput(attrs={"class": "form-input"}),
            "bank_ifsc_code": forms.TextInput(attrs={"class": "form-input", "placeholder": "11-char IFSC"}),
            "bank_branch": forms.TextInput(attrs={"class": "form-input"}),
        }


class VendorDocumentForm(forms.ModelForm):
    """Form for vendor to upload documents."""

    class Meta:
        model = VendorDocument
        fields = ["document_type", "document_name", "file", "expiry_date", "notes"]
        widgets = {
            "document_type": forms.Select(attrs={"class": "form-input"}),
            "document_name": forms.TextInput(attrs={
                "class": "form-input",
                "placeholder": "Document name",
            }),
            "file": forms.ClearableFileInput(attrs={"class": "form-input"}),
            "expiry_date": forms.DateInput(attrs={
                "type": "date",
                "class": "form-input",
            }),
            "notes": forms.Textarea(attrs={
                "class": "form-input",
                "rows": 2,
                "placeholder": "Optional notes...",
            }),
        }
