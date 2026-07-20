from django.contrib import admin
from django.urls import path, include
from graphene_django.views import GraphQLView
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', include('core.health.urls')),
    path('api/', include('config.api_router')),
    path('graphql/', csrf_exempt(GraphQLView.as_view(
        graphiql=settings.DEBUG
    ))),
]
