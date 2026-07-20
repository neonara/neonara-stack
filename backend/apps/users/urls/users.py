from django.urls import path
from ..views import UserMeView, UserListCreateView

urlpatterns = [
    path('', UserListCreateView.as_view()),
    path('me/', UserMeView.as_view()),
]
