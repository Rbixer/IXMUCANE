from rest_framework import serializers

from .models import PersonnelRecord, VacationLeave, WorkSchedule
from .vacation_sync import sync_panel_users_for_vacation_leave


class PersonnelRecordSerializer(serializers.ModelSerializer):
    branch_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PersonnelRecord
        fields = [
            'id',
            'codigo',
            'nombre',
            'apellidos',
            'fecha_nacimiento',
            'puesto',
            'telefono',
            'dpi',
            'direccion_domicilio',
            'branch',
            'branch_name',
            'estado',
            'permisos',
            'created_at',
        ]
        extra_kwargs = {
            'created_at': {'read_only': True},
            'branch': {'allow_null': True, 'required': False},
            'direccion_domicilio': {'required': False, 'allow_blank': True},
            'dpi': {'required': True, 'allow_null': False, 'allow_blank': False},
        }

    def get_branch_name(self, obj):
        if obj.branch_id and obj.branch:
            return obj.branch.name
        return ''

    def validate_dpi(self, value):
        v = (value or '').strip()
        if not v:
            raise serializers.ValidationError('El DPI es obligatorio.')
        qs = PersonnelRecord.objects.filter(dpi=v)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Este DPI ya esta registrado en otro trabajador.')
        return v

    def validate_permisos(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Los permisos deben ser una lista de codigos.')
        return value


class VacationLeaveSerializer(serializers.ModelSerializer):
    class Meta:
        model = VacationLeave
        fields = [
            'id',
            'codigo_empleado',
            'nombre_empleado',
            'tipo_periodo',
            'fecha_salida',
            'fecha_regreso',
            'notas',
            'created_at',
        ]
        extra_kwargs = {'created_at': {'read_only': True}}

    def validate_tipo_periodo(self, value):
        v = (value or '').strip()
        allowed = {'Vacaciones', 'Descansos'}
        if v in allowed:
            return v
        # Registros antiguos u otros textos: normalizar a Vacaciones al guardar
        if v:
            return 'Vacaciones'
        return 'Vacaciones'

    def validate(self, attrs):
        salida = attrs.get('fecha_salida') or getattr(self.instance, 'fecha_salida', None)
        regreso = attrs.get('fecha_regreso') or getattr(self.instance, 'fecha_regreso', None)
        if salida and regreso and regreso < salida:
            raise serializers.ValidationError(
                {'fecha_regreso': 'La fecha de regreso no puede ser anterior a la fecha de salida.'}
            )
        return attrs

    def create(self, validated_data):
        instance = super().create(validated_data)
        sync_panel_users_for_vacation_leave(instance, None)
        return instance

    def update(self, instance, validated_data):
        old_codigo = (instance.codigo_empleado or '').strip()
        inst = super().update(instance, validated_data)
        sync_panel_users_for_vacation_leave(inst, old_codigo=old_codigo or None)
        return inst


class WorkScheduleSerializer(serializers.ModelSerializer):
    personnel_codigo = serializers.CharField(source='personnel.codigo', read_only=True)
    personnel_nombre = serializers.SerializerMethodField(read_only=True)
    hora_entrada = serializers.TimeField(input_formats=['%H:%M:%S', '%H:%M'])
    hora_salida = serializers.TimeField(input_formats=['%H:%M:%S', '%H:%M'])

    class Meta:
        model = WorkSchedule
        fields = [
            'id',
            'personnel',
            'personnel_codigo',
            'personnel_nombre',
            'dias',
            'hora_entrada',
            'hora_salida',
            'created_at',
        ]
        extra_kwargs = {'created_at': {'read_only': True}}

    def get_personnel_nombre(self, obj):
        return obj.personnel.nombre_completo if obj.personnel_id else ''

    def validate(self, attrs):
        ent = attrs.get('hora_entrada') or getattr(self.instance, 'hora_entrada', None)
        sal = attrs.get('hora_salida') or getattr(self.instance, 'hora_salida', None)
        if ent and sal and sal <= ent:
            raise serializers.ValidationError({'hora_salida': 'La hora de salida debe ser posterior a la entrada.'})
        return attrs
