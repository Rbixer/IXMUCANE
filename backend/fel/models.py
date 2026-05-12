"""Modelos para integrar con Corpo Sistemas (FEL Guatemala).

`FelEmisor`   → datos del contribuyente que emite la factura (NIT, dirección,
                requestor de Corpo, ambiente). Sin datos sensibles aquí: el
                requestor real puede vivir en variables de entorno; este
                modelo guarda solo lo que se necesita para construir el DTE.
`FelDocumento`→ una fila por venta certificada (1‑a‑1 con `pos.Sale`).
                Guarda XML enviado, XML certificado y la respuesta de Corpo.
"""

from __future__ import annotations

from django.db import models


class FelEmisor(models.Model):
    """Datos del emisor (uno por sucursal o una sola fila si solo hay un NIT)."""

    class Ambiente(models.TextChoices):
        PRUEBAS = 'pruebas', 'Pruebas'
        PRODUCCION = 'produccion', 'Producción'

    class AfiliacionIVA(models.TextChoices):
        GENERAL = 'GEN', 'Régimen general'
        PEQUENO = 'PEQ', 'Pequeño contribuyente'
        EXENTO = 'EXE', 'Exento'

    nombre = models.CharField(max_length=200)
    nit = models.CharField(
        max_length=40,
        unique=True,
        help_text='NIT del emisor (solo números, sin guion).',
    )
    nombre_comercial = models.CharField(max_length=200, blank=True, default='')
    codigo_establecimiento = models.PositiveIntegerField(default=1)
    afiliacion_iva = models.CharField(
        max_length=8,
        choices=AfiliacionIVA.choices,
        default=AfiliacionIVA.GENERAL,
    )

    direccion = models.CharField(max_length=300)
    codigo_postal = models.CharField(max_length=10, default='01001')
    municipio = models.CharField(max_length=100, default='GUATEMALA')
    departamento = models.CharField(max_length=100, default='GUATEMALA')
    pais = models.CharField(max_length=4, default='GT')

    ambiente = models.CharField(
        max_length=16,
        choices=Ambiente.choices,
        default=Ambiente.PRUEBAS,
    )
    requestor = models.CharField(
        max_length=80,
        blank=True,
        default='',
        help_text='GUID del requestor de Corpo (vacío = se toma de la variable FEL_REQUESTOR).',
    )
    username = models.CharField(
        max_length=80,
        blank=True,
        default='',
        help_text='Usuario para Corpo (vacío = se toma de FEL_USERNAME, por defecto ADMINISTRADOR).',
    )

    is_default = models.BooleanField(
        default=True,
        help_text='Emisor a usar cuando no se elige uno en concreto.',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_default', 'nombre']
        verbose_name = 'Emisor FEL'
        verbose_name_plural = 'Emisores FEL'

    def __str__(self) -> str:  # pragma: no cover
        return f'{self.nombre} ({self.nit})'


class FelDocumento(models.Model):
    """Estado de certificación de una venta POS."""

    class Estado(models.TextChoices):
        PENDIENTE = 'pendiente', 'Pendiente'
        CERTIFICADO = 'certificado', 'Certificado'
        RECHAZADO = 'rechazado', 'Rechazado'
        ERROR = 'error', 'Error'

    sale = models.OneToOneField(
        'pos.Sale',
        on_delete=models.CASCADE,
        related_name='fel',
    )
    emisor = models.ForeignKey(
        FelEmisor,
        on_delete=models.PROTECT,
        related_name='documentos',
    )
    estado = models.CharField(
        max_length=16,
        choices=Estado.choices,
        default=Estado.PENDIENTE,
    )
    ambiente = models.CharField(
        max_length=16,
        choices=FelEmisor.Ambiente.choices,
        default=FelEmisor.Ambiente.PRUEBAS,
    )

    serie = models.CharField(max_length=40, blank=True, default='')
    numero_autorizacion = models.CharField(max_length=80, blank=True, default='')
    fecha_certificacion = models.DateTimeField(null=True, blank=True)

    xml_enviado = models.TextField(blank=True, default='')
    xml_certificado = models.TextField(blank=True, default='')
    respuesta_cruda = models.TextField(blank=True, default='')
    error_mensaje = models.TextField(blank=True, default='')

    intentos = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Documento FEL'
        verbose_name_plural = 'Documentos FEL'

    def __str__(self) -> str:  # pragma: no cover
        return f'FEL venta #{self.sale_id} {self.estado}'
