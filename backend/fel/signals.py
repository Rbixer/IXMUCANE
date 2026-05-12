"""Signals del módulo FEL.

`autocertificar_venta` se dispara después de guardar una venta nueva. Si el
flag de configuración `FEL_AUTO_CERTIFICAR` está activo, intenta certificarla
contra Corpo justo después de la commit de la transacción de la venta.

La certificación nunca debe romper la creación de la venta: cualquier error se
captura y se anota en el `FelDocumento` (lo cual ya hace `services.certificar`).
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from pos.models import Sale

from .services import FelError, certificar

logger = logging.getLogger('boutique.api')


@receiver(post_save, sender=Sale)
def autocertificar_venta(sender, instance: Sale, created: bool, **kwargs) -> None:
    if not created:
        return
    if not getattr(settings, 'FEL_AUTO_CERTIFICAR', False):
        return
    # Las ventas marcadas como envío se procesan como recibo y NO se certifican.
    if getattr(instance, 'is_envio', False):
        logger.info('fel.auto skip envio sale_id=%s', instance.pk)
        return

    sale_id = instance.pk

    def _do() -> None:
        try:
            sale = Sale.objects.get(pk=sale_id)
        except Sale.DoesNotExist:
            return
        try:
            fel = certificar(sale)
            logger.info(
                'fel.auto sale_id=%s estado=%s serie=%s numero=%s',
                sale_id,
                fel.estado,
                fel.serie or '-',
                fel.numero_autorizacion or '-',
            )
        except FelError as exc:
            logger.warning('fel.auto fallo configuracion sale_id=%s: %s', sale_id, exc)
        except Exception:
            logger.exception('fel.auto error inesperado sale_id=%s', sale_id)

    transaction.on_commit(_do)
