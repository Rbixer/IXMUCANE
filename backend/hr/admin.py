from django.contrib import admin
from .models import PersonnelRecord, VacationLeave, WorkSchedule


@admin.register(PersonnelRecord)
class PersonnelRecordAdmin(admin.ModelAdmin):
    list_display = ('codigo', 'nombre', 'apellidos', 'telefono', 'dpi', 'puesto', 'branch', 'panel_user', 'estado', 'created_at')
    search_fields = ('codigo', 'nombre', 'apellidos', 'puesto', 'dpi', 'telefono')


@admin.register(VacationLeave)
class VacationLeaveAdmin(admin.ModelAdmin):
    list_display = (
        'codigo_empleado',
        'nombre_empleado',
        'tipo_periodo',
        'fecha_salida',
        'fecha_regreso',
        'created_at',
    )
    search_fields = ('codigo_empleado', 'nombre_empleado', 'tipo_periodo')


@admin.register(WorkSchedule)
class WorkScheduleAdmin(admin.ModelAdmin):
    list_display = ('personnel', 'dias', 'hora_entrada', 'hora_salida', 'created_at')
    list_filter = ('personnel',)
    search_fields = ('personnel__codigo', 'personnel__nombre', 'dias')
