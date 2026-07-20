from django.urls import path, include

urlpatterns = [
    path('v1/auth/', include('apps.users.urls.auth')),
    path('v1/users/', include('apps.users.urls.users')),
    path('v1/tenants/', include('apps.tenants.urls')),
]
