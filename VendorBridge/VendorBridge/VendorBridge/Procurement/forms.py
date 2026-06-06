from django import forms
from django.forms import inlineformset_factory
from Vendors.models import RFQ, RFQItem

class RFQForm(forms.ModelForm):
    class Meta:
        model = RFQ
        fields = [
            'title',
            'description',
            'category',
            'estimated_budget',
            'currency',
            'show_budget_to_vendors',
            'submission_deadline',
            'delivery_deadline',
            'priority',
            'terms_and_conditions',
            'delivery_location',
            'payment_terms',
            'attachment',
        ]
        widgets = {
            'title': forms.TextInput(attrs={'class': 'form-input', 'placeholder': 'RFQ Title'}),
            'description': forms.Textarea(attrs={'class': 'form-input', 'placeholder': 'RFQ Description', 'rows': 4}),
            'category': forms.Select(attrs={'class': 'form-input'}),
            'estimated_budget': forms.NumberInput(attrs={'class': 'form-input', 'placeholder': 'Estimated Budget'}),
            'currency': forms.TextInput(attrs={'class': 'form-input', 'placeholder': 'INR'}),
            'show_budget_to_vendors': forms.CheckboxInput(attrs={'class': 'form-checkbox'}),
            'submission_deadline': forms.DateTimeInput(attrs={'type': 'datetime-local', 'class': 'form-input'}),
            'delivery_deadline': forms.DateInput(attrs={'type': 'date', 'class': 'form-input'}),
            'priority': forms.Select(attrs={'class': 'form-input'}),
            'terms_and_conditions': forms.Textarea(attrs={'class': 'form-input', 'rows': 3}),
            'delivery_location': forms.TextInput(attrs={'class': 'form-input'}),
            'payment_terms': forms.TextInput(attrs={'class': 'form-input'}),
            'attachment': forms.ClearableFileInput(attrs={'class': 'form-input'}),
        }

class RFQItemForm(forms.ModelForm):
    class Meta:
        model = RFQItem
        fields = ['description', 'quantity', 'unit']
        widgets = {
            'description': forms.TextInput(attrs={'class': 'form-input', 'placeholder': 'Item description/name'}),
            'quantity': forms.NumberInput(attrs={'class': 'form-input', 'placeholder': 'Quantity'}),
            'unit': forms.TextInput(attrs={'class': 'form-input', 'placeholder': 'e.g. units, kg'}),
        }

    def save(self, commit=True):
        instance = super().save(commit=False)
        if not instance.item_name:
            instance.item_name = instance.description or "Item"
        if commit:
            instance.save()
        return instance

RFQItemFormSet = inlineformset_factory(
    RFQ,
    RFQItem,
    form=RFQItemForm,
    extra=1,
    can_delete=True,
)
