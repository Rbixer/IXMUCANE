from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import BranchViewSet, branches_count

router = DefaultRouter()
router.register(r'', BranchViewSet, basename='branch')

urlpatterns = [
    path('count/', branches_count, name='branches-count'),
    path('', include(router.urls)),
]
