from rest_framework import serializers
from django.contrib.auth import get_user_model

from django.core.exceptions import ObjectDoesNotExist

from hr.models import PersonnelRecord
from .models import SystemVerificationGrant
from .panel_modules import PANEL_MODULES_LEGACY_DEFAULT, PANEL_MODULES_ON_USER_CREATE, normalize_panel_modules

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Perfil API: si hay trabajador enlazado (panel_user), expone codigo y nombre completo RR.HH."""

    personnel_codigo = serializers.SerializerMethodField()
    personnel_nombre_completo = serializers.SerializerMethodField()
    personnel_branch_id = serializers.SerializerMethodField()
    personnel_branch_name = serializers.SerializerMethodField()
    panel_allowed_modules = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'is_staff',
            'is_superuser',
            'personnel_codigo',
            'personnel_nombre_completo',
            'personnel_branch_id',
            'personnel_branch_name',
            'panel_allowed_modules',
        ]
        read_only_fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'is_staff',
            'is_superuser',
            'personnel_codigo',
            'personnel_nombre_completo',
            'personnel_branch_id',
            'personnel_branch_name',
            'panel_allowed_modules',
        ]

    def _linked_personnel(self, obj):
        cache = getattr(self, '_personnel_cache', None)
        if cache is None:
            cache = {}
            setattr(self, '_personnel_cache', cache)
        if obj.pk not in cache:
            cache[obj.pk] = PersonnelRecord.objects.filter(panel_user=obj).select_related('branch').first()
        return cache[obj.pk]

    def get_personnel_codigo(self, obj):
        p = self._linked_personnel(obj)
        return p.codigo if p else ''

    def get_personnel_nombre_completo(self, obj):
        p = self._linked_personnel(obj)
        if p:
            return p.nombre_completo
        parts = [obj.first_name or '', obj.last_name or '']
        return ' '.join(x for x in parts if x).strip()

    def get_personnel_branch_id(self, obj):
        p = self._linked_personnel(obj)
        return int(p.branch_id) if p and p.branch_id else None

    def get_personnel_branch_name(self, obj):
        p = self._linked_personnel(obj)
        if p and p.branch_id and getattr(p, 'branch', None):
            return p.branch.name
        return ''

    def get_panel_allowed_modules(self, obj: User):
        if obj.is_staff or obj.is_superuser:
            return None
        try:
            raw = obj.panel_module_permission.modules
        except ObjectDoesNotExist:
            return list(PANEL_MODULES_LEGACY_DEFAULT)
        return normalize_panel_modules(raw if isinstance(raw, list) else [])


class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']


class VerificationGrantSerializer(serializers.ModelSerializer):
    personnel_id = serializers.IntegerField(source='personnel.id', read_only=True)
    codigo = serializers.CharField(source='personnel.codigo', read_only=True)
    nombre_completo = serializers.SerializerMethodField()
    puesto = serializers.CharField(source='personnel.puesto', read_only=True)
    branch_name = serializers.SerializerMethodField()
    promoted_username = serializers.SerializerMethodField()

    class Meta:
        model = SystemVerificationGrant
        fields = [
            'id',
            'personnel_id',
            'codigo',
            'nombre_completo',
            'puesto',
            'branch_name',
            'granted_at',
            'full_administration',
            'promoted_username',
        ]

    def get_nombre_completo(self, obj):
        p = obj.personnel
        return f'{p.nombre} {p.apellidos}'.strip()

    def get_branch_name(self, obj):
        b = getattr(obj.personnel, 'branch', None)
        return b.name if b else ''

    def get_promoted_username(self, obj):
        u = getattr(obj, 'promoted_user', None)
        return u.username if u is not None else ''


class VerificationGrantCreateSerializer(serializers.Serializer):
    personnel = serializers.PrimaryKeyRelatedField(queryset=PersonnelRecord.objects.select_related('branch').all())
    grant_full_administration = serializers.BooleanField(default=False, required=False)
    administration_username = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )

    def validate(self, attrs):
        if attrs.get('grant_full_administration'):
            raw = (attrs.get('administration_username') or '').strip()
            if not raw:
                raise serializers.ValidationError(
                    {
                        'administration_username': (
                            'Indique el nombre de usuario de la cuenta que recibira permisos de administracion total.'
                        )
                    }
                )
            attrs['administration_username'] = raw
        return attrs


class PanelWorkerUserSerializer(serializers.ModelSerializer):
    personnel_id = serializers.SerializerMethodField()
    personnel_label = serializers.SerializerMethodField()
    modules = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'is_active', 'personnel_id', 'personnel_label', 'modules']

    def get_modules(self, obj: User):
        try:
            raw = obj.panel_module_permission.modules
        except ObjectDoesNotExist:
            return list(PANEL_MODULES_ON_USER_CREATE)
        return normalize_panel_modules(raw if isinstance(raw, list) else [])

    def get_personnel_id(self, obj):
        pmap = self.context.get('personnel_by_user_id') or {}
        p = pmap.get(obj.pk)
        return p.id if p else None

    def get_personnel_label(self, obj):
        pmap = self.context.get('personnel_by_user_id') or {}
        p = pmap.get(obj.pk)
        if not p:
            return ''
        return f'{p.codigo} — {p.nombre_completo}'


class PanelWorkerUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, trim_whitespace=True)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    password_confirm = serializers.CharField(write_only=True)
    personnel = serializers.PrimaryKeyRelatedField(
        queryset=PersonnelRecord.objects.select_related('branch').all(),
        required=False,
        allow_null=True,
    )

    def validate_username(self, value):
        v = (value or '').strip()
        if not v:
            raise serializers.ValidationError('Usuario requerido.')
        if User.objects.filter(username=v).exists():
            raise serializers.ValidationError('Este nombre de usuario ya existe.')
        return v

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Las contraseñas no coinciden.'})
        return attrs

    def validate_personnel(self, value):
        if value is None:
            return value
        if value.panel_user_id is not None:
            raise serializers.ValidationError('Ese trabajador ya tiene un usuario de panel asignado.')
        return value


class PanelWorkerUserUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, required=False, trim_whitespace=True)
    password = serializers.CharField(write_only=True, required=False, allow_null=True, min_length=8, max_length=128)
    password_confirm = serializers.CharField(write_only=True, required=False, allow_null=True, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    modules = serializers.ListField(
        child=serializers.CharField(max_length=64),
        required=False,
        allow_empty=True,
    )
    personnel = serializers.PrimaryKeyRelatedField(
        queryset=PersonnelRecord.objects.select_related('branch').all(),
        required=False,
        allow_null=True,
    )

    def validate_modules(self, value):
        if value is None:
            return value
        return normalize_panel_modules(value)

    def validate_username(self, value):
        if value is None:
            return value
        v = (value or '').strip()
        if not v:
            raise serializers.ValidationError('Usuario requerido.')
        user = self.context['user']
        if User.objects.exclude(pk=user.pk).filter(username=v).exists():
            raise serializers.ValidationError('Este nombre de usuario ya existe.')
        return v

    def validate(self, attrs):
        pw = attrs.get('password')
        pwc = attrs.get('password_confirm')
        has_pw = pw not in (None, '')
        has_pwc = pwc not in (None, '')
        if has_pw != has_pwc:
            raise serializers.ValidationError('Envie contraseña y confirmacion juntas, o ninguna.')
        if has_pw and pw != pwc:
            raise serializers.ValidationError({'password_confirm': 'Las contraseñas no coinciden.'})
        if 'password' in attrs and attrs['password'] in (None, ''):
            attrs.pop('password', None)
        attrs.pop('password_confirm', None)
        return attrs

    def validate_personnel(self, value):
        if value is None:
            return value
        user = self.context['user']
        if value.panel_user_id is not None and value.panel_user_id != user.pk:
            raise serializers.ValidationError('Ese trabajador ya tiene otro usuario de panel asignado.')
        return value


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'Las contraseñas no coinciden.'})
        return attrs
