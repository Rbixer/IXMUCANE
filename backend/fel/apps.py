from django.apps import AppConfig


class FelConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'fel'
    verbose_name = 'Facturación Electrónica (FEL)'

    def ready(self) -> None:
        from . import signals  # noqa: F401  (registrar receivers)
