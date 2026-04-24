from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

User = get_user_model()


class Command(BaseCommand):
    help = (
        'Crea o actualiza un usuario staff/superusuario para el panel (permisos de administración y verificación).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            default='adminprueba',
            help='Nombre de usuario en Django (por defecto: adminprueba).',
        )
        parser.add_argument(
            '--password',
            default=None,
            help='Contraseña. En producción es obligatoria. En DEBUG, si se omite, se usa una por defecto de desarrollo.',
        )

    def handle(self, *args, **options):
        username = (options['username'] or '').strip()
        password = options['password']
        if not username:
            raise CommandError('Indique un nombre de usuario válido.')
        if not password:
            if not settings.DEBUG:
                raise CommandError('En producción debe pasar --password de forma explícita.')
            password = 'admin123'

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': '',
                'is_staff': True,
                'is_superuser': True,
            },
        )
        if not created:
            user.is_staff = True
            user.is_superuser = True
        user.set_password(password)
        user.save()

        self.stdout.write(
            self.style.SUCCESS(
                f'Listo. Usuario "{username}" con is_staff e is_superuser activos. '
                f'Use el botón de Administración en el inicio de sesión del panel.'
            )
        )
        if settings.DEBUG and not options['password']:
            self.stdout.write(
                self.style.WARNING(
                    'DEBUG: se asignó la contraseña por defecto de desarrollo. '
                    'Cámbiela con --password o desde el admin de Django.'
                )
            )
