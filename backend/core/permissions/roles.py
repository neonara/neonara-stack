from django.db import models


class Role(models.TextChoices):
    SUPER_ADMIN = 'super_admin', 'Super Admin'
    ADMIN_CLIENT = 'admin_client', 'Admin Client'
    HR = 'hr', 'HR'
    MANAGER = 'manager', 'Manager'
    CANDIDATE = 'candidate', 'Candidate'
