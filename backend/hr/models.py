from django.conf import settings
from django.db import models

from branches.models import Branch


class PersonnelRecord(models.Model):
    class Estado(models.TextChoices):
        ACTIVO = 'ACTIVO', 'Activo'
        INACTIVO = 'INACTIVO', 'Inactivo'
        SUSPENDIDO = 'SUSPENDIDO', 'Suspendido'

    codigo = models.CharField(max_length=32, unique=True, db_index=True)
    nombre = models.CharField(max_length=200)
    apellidos = models.CharField(max_length=200, blank=True, default='')
    fecha_nacimiento = models.DateField(null=True, blank=True)
    puesto = models.CharField(max_length=120)
    telefono = models.CharField(max_length=32, blank=True, default='')
    dpi = models.CharField(max_length=32, unique=True, null=True, blank=True, db_index=True)
    direccion_domicilio = models.TextField(blank=True, default='')
    branch = models.ForeignKey(
        Branch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='personnel_records',
    )
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.ACTIVO)
    permisos = models.JSONField(default=list)
    panel_user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='boutique_personnel',
        verbose_name='Usuario de panel (Ingresar)',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nombre', 'apellidos']
        verbose_name = 'Registro de personal'
        verbose_name_plural = 'Registros de personal'

    def __str__(self):
        return f'{self.nombre_completo} ({self.codigo})'

    @property
    def nombre_completo(self) -> str:
        return f'{self.nombre} {self.apellidos}'.strip()


class VacationLeave(models.Model):
    """Periodo de vacaciones u otro permiso con fechas de salida y regreso."""

    codigo_empleado = models.CharField(max_length=32)
    nombre_empleado = models.CharField(max_length=200)
    tipo_periodo = models.CharField(max_length=120, default='Vacaciones')
    fecha_salida = models.DateField()
    fecha_regreso = models.DateField()
    notas = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_salida', '-id']
        verbose_name = 'Permiso / vacaciones'
        verbose_name_plural = 'Permisos y vacaciones'

    def __str__(self):
        return f'{self.nombre_empleado} ({self.codigo_empleado}) {self.fecha_salida}–{self.fecha_regreso}'


class WorkSchedule(models.Model):
    """Horario de entrada y salida por trabajador."""

    personnel = models.ForeignKey(
        PersonnelRecord,
        on_delete=models.CASCADE,
        related_name='work_schedules',
    )
    dias = models.CharField(max_length=200, blank=True, default='', help_text='Ej.: Lun a Vie')
    hora_entrada = models.TimeField()
    hora_salida = models.TimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['personnel_id', 'hora_entrada', 'id']
        verbose_name = 'Horario de trabajo'
        verbose_name_plural = 'Horarios de trabajo'

    def __str__(self) -> str:
        return f'{self.personnel.codigo} {self.hora_entrada}-{self.hora_salida}'
