from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.contrib.auth import get_user_model

from hr.models import PersonnelRecord
from hr.vacation_sync import sync_panel_user_active_for_codigo

from .models import PanelUserModulePermission, SystemVerificationGrant
from .panel_modules import PANEL_MODULES_ON_USER_CREATE
from .serializers import (
    UserSerializer,
    UserMiniSerializer,
    VerificationGrantSerializer,
    VerificationGrantCreateSerializer,
    PanelWorkerUserSerializer,
    PanelWorkerUserCreateSerializer,
    PanelWorkerUserUpdateSerializer,
    ChangePasswordSerializer,
)

User = get_user_model()


def _personnel_by_panel_user_ids(user_ids: list[int]) -> dict[int, PersonnelRecord]:
    if not user_ids:
        return {}
    return {
        p.panel_user_id: p
        for p in PersonnelRecord.objects.filter(panel_user_id__in=user_ids).select_related('branch')
    }


def _sync_panel_user_personnel(user: User, new_personnel: PersonnelRecord | None) -> None:
    PersonnelRecord.objects.filter(panel_user=user).update(panel_user=None)
    if new_personnel is not None:
        PersonnelRecord.objects.filter(pk=new_personnel.pk).update(panel_user=user)


def _staff_forbidden():
    return Response(
        {'detail': 'Solo cuentas de personal autorizado (staff) pueden gestionar verificadores.'},
        status=status.HTTP_403_FORBIDDEN,
    )


def _staff_panel_users_forbidden():
    return Response(
        {'detail': 'Solo cuentas staff pueden gestionar usuarios del panel (trabajadores).'},
        status=status.HTTP_403_FORBIDDEN,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profile(request):
    user = User.objects.select_related('panel_module_permission').get(pk=request.user.pk)
    serializer = UserSerializer(user)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    ser = ChangePasswordSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    old_pw = ser.validated_data['old_password']
    if not request.user.check_password(old_pw):
        return Response(
            {'old_password': ['La contraseña actual no es correcta.']},
            status=status.HTTP_400_BAD_REQUEST,
        )
    request.user.set_password(ser.validated_data['new_password'])
    request.user.save(update_fields=['password'])
    return Response({'detail': 'Contraseña actualizada correctamente.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def users_directory(request):
    if not request.user.is_staff:
        return _staff_forbidden()
    users = User.objects.all().order_by('username')
    return Response(UserMiniSerializer(users, many=True).data)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def verification_grants_collection(request):
    if not request.user.is_staff:
        return _staff_forbidden()
    if request.method == 'GET':
        qs = (
            SystemVerificationGrant.objects.select_related(
                'personnel',
                'personnel__branch',
                'promoted_user',
            )
            .order_by('-granted_at')
        )
        return Response(VerificationGrantSerializer(qs, many=True).data)
    ser = VerificationGrantCreateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    personnel = ser.validated_data['personnel']
    if SystemVerificationGrant.objects.filter(personnel=personnel).exists():
        return Response(
            {'detail': 'Este trabajador ya tiene permiso para verificar el sistema.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    grant_full = bool(ser.validated_data.get('grant_full_administration'))
    admin_username = (ser.validated_data.get('administration_username') or '').strip()
    promoted = None
    if grant_full:
        try:
            candidate = User.objects.get(username=admin_username)
        except User.DoesNotExist:
            return Response(
                {'detail': f'No existe un usuario con el nombre "{admin_username}". Cree la cuenta en Creador de usuarios.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if candidate.is_staff or candidate.is_superuser:
            return Response(
                {'detail': 'Esa cuenta ya tiene permisos de administracion en el sistema.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        candidate.is_staff = True
        candidate.is_superuser = True
        candidate.save(update_fields=['is_staff', 'is_superuser'])
        promoted = candidate

    obj = SystemVerificationGrant.objects.create(
        personnel=personnel,
        full_administration=grant_full,
        promoted_user=promoted,
    )
    obj = SystemVerificationGrant.objects.select_related('personnel', 'personnel__branch', 'promoted_user').get(
        pk=obj.pk
    )
    return Response(VerificationGrantSerializer(obj).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def panel_worker_users(request):
    """Cuentas de panel para trabajadores (no staff): listar y crear usuario/contraseña para el botón Ingresar."""
    if not request.user.is_staff:
        return _staff_panel_users_forbidden()
    if request.method == 'GET':
        qs = User.objects.filter(is_staff=False, is_superuser=False).select_related('panel_module_permission').order_by(
            'username',
        )
        users = list(qs)
        pmap = _personnel_by_panel_user_ids([u.pk for u in users])
        return Response(PanelWorkerUserSerializer(users, many=True, context={'personnel_by_user_id': pmap}).data)
    ser = PanelWorkerUserCreateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    user = User.objects.create_user(
        username=ser.validated_data['username'],
        password=ser.validated_data['password'],
        email='',
        is_staff=False,
        is_superuser=False,
    )
    personnel = ser.validated_data.get('personnel')
    if personnel is not None:
        personnel.panel_user = user
        personnel.save(update_fields=['panel_user'])
        sync_panel_user_active_for_codigo(personnel.codigo)
    PanelUserModulePermission.objects.create(user=user, modules=list(PANEL_MODULES_ON_USER_CREATE))
    user = User.objects.select_related('panel_module_permission').get(pk=user.pk)
    pmap = _personnel_by_panel_user_ids([user.pk])
    return Response(
        PanelWorkerUserSerializer(user, context={'personnel_by_user_id': pmap}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def verification_grants_detail(request, pk):
    if not request.user.is_staff:
        return _staff_forbidden()
    try:
        grant = SystemVerificationGrant.objects.select_related('promoted_user').get(pk=pk)
    except SystemVerificationGrant.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    promoted_id = grant.promoted_user_id
    grant.delete()
    if promoted_id:
        User.objects.filter(pk=promoted_id).update(is_staff=False, is_superuser=False)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def panel_worker_user_detail(request, pk):
    if not request.user.is_staff:
        return _staff_panel_users_forbidden()
    try:
        user = User.objects.select_related('panel_module_permission').get(pk=pk, is_staff=False, is_superuser=False)
    except User.DoesNotExist:
        return Response(
            {'detail': 'Usuario no encontrado o no se puede gestionar desde el creador de usuarios.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == 'DELETE':
        if user.id == request.user.id:
            return Response({'detail': 'No puede eliminar su propia cuenta.'}, status=status.HTTP_400_BAD_REQUEST)
        linked = PersonnelRecord.objects.filter(panel_user_id=user.pk).first()
        codigo_linked = linked.codigo if linked else None
        user.delete()
        if codigo_linked:
            sync_panel_user_active_for_codigo(codigo_linked)
        return Response(status=status.HTTP_204_NO_CONTENT)

    ser = PanelWorkerUserUpdateSerializer(data=request.data, partial=True, context={'user': user})
    ser.is_valid(raise_exception=True)
    data = ser.validated_data
    if 'username' in data:
        user.username = data['username']
    if data.get('password'):
        user.set_password(data['password'])
    if 'is_active' in data:
        user.is_active = data['is_active']
    user.save()
    if 'personnel' in data:
        prev = PersonnelRecord.objects.filter(panel_user_id=user.pk).first()
        prev_codigo = (prev.codigo or '').strip() if prev else ''
        _sync_panel_user_personnel(user, data['personnel'])
        if prev_codigo:
            sync_panel_user_active_for_codigo(prev_codigo)
        if data['personnel'] is not None:
            sync_panel_user_active_for_codigo(data['personnel'].codigo)
    if 'modules' in data:
        PanelUserModulePermission.objects.update_or_create(user=user, defaults={'modules': list(data['modules'])})
    user = User.objects.select_related('panel_module_permission').get(pk=user.pk)
    pmap = _personnel_by_panel_user_ids([user.pk])
    return Response(PanelWorkerUserSerializer(user, context={'personnel_by_user_id': pmap}).data)
