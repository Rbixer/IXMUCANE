from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import PersonnelRecord, VacationLeave, WorkSchedule
from .vacation_sync import sync_panel_users_for_vacation_leave
from .serializers import (
    PersonnelRecordSerializer,
    VacationLeaveSerializer,
    WorkScheduleSerializer,
)


def next_personnel_codigo() -> str:
    best = 0
    for raw in PersonnelRecord.objects.values_list('codigo', flat=True):
        s = (raw or '').strip()
        if s.isdigit():
            best = max(best, int(s))
    return str(best + 1)


class PersonnelRecordViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = PersonnelRecord.objects.select_related('branch').all()
    serializer_class = PersonnelRecordSerializer

    @action(detail=False, methods=['get'], url_path='next-codigo')
    def next_codigo(self, request):
        return Response({'next_codigo': next_personnel_codigo()})


class VacationLeaveViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = VacationLeave.objects.all()
    serializer_class = VacationLeaveSerializer

    def perform_destroy(self, instance):
        codigo = (instance.codigo_empleado or '').strip()
        super().perform_destroy(instance)
        sync_panel_users_for_vacation_leave(None, old_codigo=codigo or None)


class WorkScheduleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = WorkSchedule.objects.select_related('personnel').all()
    serializer_class = WorkScheduleSerializer
