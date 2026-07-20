from django_tenants.models import TenantMixin, DomainMixin
from django.db import models


class Tenant(TenantMixin):
    class Status(models.TextChoices):
        TRIAL = 'trial', 'Trial'
        ACTIVE = 'active', 'Active'
        SUSPENDED = 'suspended', 'Suspended'

    name = models.CharField(max_length=200)
    matricule_fiscal = models.CharField(max_length=20, blank=True, unique=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TRIAL)
    trial_expires_at = models.DateTimeField(null=True, blank=True)
    primary_color = models.CharField(max_length=7, default='#1E3A8A')
    logo_url = models.URLField(blank=True)
    created_on = models.DateField(auto_now_add=True)
    auto_create_schema = True

    class Meta:
        app_label = 'tenants'


class Domain(DomainMixin):
    email_domain = models.CharField(max_length=253, blank=True)

    class Meta:
        app_label = 'tenants'
