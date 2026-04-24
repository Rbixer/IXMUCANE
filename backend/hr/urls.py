from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PersonnelRecordViewSet, VacationLeaveViewSet, WorkScheduleViewSet

personnel_router = DefaultRouter()
personnel_router.register(r'', PersonnelRecordViewSet, basename='personnel')

vacation_router = DefaultRouter()
vacation_router.register(r'', VacationLeaveViewSet, basename='vacationleave')

schedule_router = DefaultRouter()
schedule_router.register(r'', WorkScheduleViewSet, basename='workschedule')

urlpatterns = [
    path('vacaciones/', include(vacation_router.urls)),
    path('horarios/', include(schedule_router.urls)),
    path('', include(personnel_router.urls)),
]
