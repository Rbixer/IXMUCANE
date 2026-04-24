from django.urls import path
from .jwt_auth import BoutiqueTokenObtainPairView, BoutiqueTokenRefreshView
from .views import (
    profile,
    change_password,
    users_directory,
    verification_grants_collection,
    verification_grants_detail,
    panel_worker_users,
    panel_worker_user_detail,
)

urlpatterns = [
    path('token/', BoutiqueTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', BoutiqueTokenRefreshView.as_view(), name='token_refresh'),
    path('profile/', profile, name='profile'),
    path('change-password/', change_password, name='change_password'),
    path('users/', users_directory, name='users_directory'),
    path('verification-grants/', verification_grants_collection, name='verification_grants'),
    path('verification-grants/<int:pk>/', verification_grants_detail, name='verification_grant_detail'),
    path('panel-worker-users/', panel_worker_users, name='panel_worker_users'),
    path('panel-worker-users/<int:pk>/', panel_worker_user_detail, name='panel_worker_user_detail'),
]
