"""Capa de servicio: orquesta builder + cliente Corpo + persistencia."""

from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Optional
from xml.etree import ElementTree as ET

from django.utils import timezone

from pos.models import Sale

from .corpo_client import cargar_config, request_transaction
from .dte_builder import construir_dte_xml
from .models import FelDocumento, FelEmisor


class FelError(RuntimeError):
    """Error de negocio FEL (configuración, validación previa)."""


def _emisor_para(sale: Sale) -> FelEmisor:
    emisor = FelEmisor.objects.filter(is_active=True, is_default=True).first()
    if emisor is None:
        emisor = FelEmisor.objects.filter(is_active=True).first()
    if emisor is None:
        raise FelError(
            'No hay un emisor FEL configurado. Cree uno en /admin/fel/felemisor/.'
        )
    return emisor


def _decodificar_b64(value: str) -> str:
    """Devuelve XML desde una cadena base64; cadena vacía si no decodifica."""
    if not isinstance(value, str):
        return ''
    raw = value.strip()
    if not raw:
        return ''
    try:
        decoded = base64.b64decode(raw, validate=False)
    except Exception:
        return ''
    text = decoded.decode('utf-8', errors='replace')
    return text if text.lstrip().startswith('<') else ''


def _xml_certificado_de_response_data(rd) -> str:
    """`responseData` de Corpo trae el XML certificado en Base64 (claves variables)."""
    if not isinstance(rd, dict):
        return ''
    for key in (
        'responsedata1', 'responseData1', 'ResponseData1',
        'data1', 'Data1', 'xml', 'XML', 'documento', 'Documento',
    ):
        val = rd.get(key)
        if isinstance(val, str) and val.strip():
            decoded = _decodificar_b64(val) if not val.lstrip().startswith('<') else val
            if decoded:
                return decoded
    for val in rd.values():
        if isinstance(val, str) and val.strip().startswith('<'):
            return val
    return ''


def _interpretar_respuesta(texto: str) -> dict:
    """Saca los campos importantes del JSON/XML que devuelve Corpo.

    Soporta el formato actual del web service REST (`result`, `identifier`,
    `responseData`) y el formato anterior con `Resultado`/`XML`.
    """

    out = {
        'ok': False,
        'descripcion': '',
        'xml_certificado': '',
        'serie': '',
        'numero': '',
        'fecha': None,
    }
    texto_strip = (texto or '').strip()
    body = None
    if texto_strip.startswith('{') or texto_strip.startswith('['):
        try:
            body = json.loads(texto_strip)
        except Exception:
            body = None

    if isinstance(body, dict):
        out['descripcion'] = str(
            body.get('description')
            or body.get('Descripcion')
            or body.get('descripcion')
            or body.get('hint')
            or body.get('Mensaje')
            or body.get('mensaje')
            or ''
        ).strip()

        result = body.get('result', body.get('Resultado'))
        if isinstance(result, bool):
            out['ok'] = result
        elif isinstance(result, str):
            out['ok'] = result.lower() in ('true', 'ok', '1', 'success', 'éxito', 'exito')

        identifier = body.get('identifier') or body.get('Identifier') or {}
        if isinstance(identifier, dict):
            out['serie'] = str(identifier.get('serie') or identifier.get('Serie') or '').strip()
            out['numero'] = str(
                identifier.get('numeroAutorizacion')
                or identifier.get('NumeroAutorizacion')
                or identifier.get('numero')
                or identifier.get('Numero')
                or ''
            ).strip()

        out['xml_certificado'] = _xml_certificado_de_response_data(
            body.get('responseData') or body.get('ResponseData') or {}
        )
        if not out['xml_certificado']:
            for key in ('Data1', 'XML', 'data1', 'xml', 'Resultado_Xml'):
                val = body.get(key)
                if isinstance(val, str) and val.strip().startswith('<'):
                    out['xml_certificado'] = val
                    break
                if isinstance(val, str) and val.strip():
                    decoded = _decodificar_b64(val)
                    if decoded:
                        out['xml_certificado'] = decoded
                        break

    elif texto_strip.startswith('<'):
        out['xml_certificado'] = texto_strip

    if out['xml_certificado']:
        try:
            root = ET.fromstring(out['xml_certificado'])
        except ET.ParseError:
            root = None
        if root is not None:
            ns = {'dte': 'http://www.sat.gob.gt/dte/fel/0.2.0'}
            num = root.find('.//dte:NumeroAutorizacion', ns)
            if num is not None:
                out['serie'] = out['serie'] or (num.attrib.get('Serie') or '').strip()
                if not out['numero']:
                    out['numero'] = (num.attrib.get('Numero') or '').strip()
                    if not out['numero'] and num.text:
                        out['numero'] = num.text.strip()
            fecha_el = root.find('.//dte:FechaHoraCertificacion', ns)
            if fecha_el is not None and fecha_el.text:
                try:
                    out['fecha'] = datetime.fromisoformat(fecha_el.text.strip())
                except ValueError:
                    out['fecha'] = None

    if out['serie'] and out['numero']:
        out['ok'] = True

    return out


def certificar(sale: Sale, *, emisor: Optional[FelEmisor] = None) -> FelDocumento:
    """Construye el DTE, lo envía a Corpo y guarda el resultado.

    Es idempotente respecto a la venta: si ya existe `FelDocumento` certificado
    no vuelve a enviarlo; si está en estado de error, reintenta.
    """

    emisor = emisor or _emisor_para(sale)

    fel = FelDocumento.objects.filter(sale=sale).first()
    if fel and fel.estado == FelDocumento.Estado.CERTIFICADO:
        return fel

    if fel is None:
        fel = FelDocumento.objects.create(
            sale=sale,
            emisor=emisor,
            ambiente=emisor.ambiente,
            estado=FelDocumento.Estado.PENDIENTE,
        )
    else:
        fel.emisor = emisor
        fel.ambiente = emisor.ambiente
        fel.estado = FelDocumento.Estado.PENDIENTE
        fel.error_mensaje = ''

    xml = construir_dte_xml(sale, emisor)
    fel.xml_enviado = xml
    fel.intentos = (fel.intentos or 0) + 1
    fel.save(update_fields=['xml_enviado', 'intentos', 'estado', 'error_mensaje', 'emisor', 'ambiente'])

    config = cargar_config(emisor.ambiente, emisor.requestor, emisor.username)
    data2 = base64.b64encode(xml.encode('utf-8')).decode('ascii')

    # `data3` debe ser único por documento (Corpo bloquea duplicados con TrCode 9).
    # Incluimos el número de intento para evitar choques en reintentos por errores
    # transitorios; la idempotencia real la garantiza el chequeo de
    # `estado=CERTIFICADO` al inicio de esta función.
    data3 = f'venta-{sale.pk}-{fel.intentos}'

    status_code, body = request_transaction(
        config,
        entity=emisor.nit,
        data1='POST_DOCUMENT_SAT',
        data2_b64=data2,
        data3=data3,
    )
    fel.respuesta_cruda = body[:60000]

    if status_code == 0 or status_code >= 500:
        fel.estado = FelDocumento.Estado.ERROR
        fel.error_mensaje = f'HTTP {status_code}: {body[:600]}'
        fel.save(update_fields=['estado', 'error_mensaje', 'respuesta_cruda'])
        return fel

    parsed = _interpretar_respuesta(body)
    if parsed['ok'] and parsed['xml_certificado']:
        fel.estado = FelDocumento.Estado.CERTIFICADO
        fel.xml_certificado = parsed['xml_certificado']
        fel.serie = parsed['serie'] or ''
        fel.numero_autorizacion = parsed['numero'] or ''
        fel.fecha_certificacion = parsed['fecha'] or timezone.now()
        fel.error_mensaje = ''
    else:
        fel.estado = FelDocumento.Estado.RECHAZADO
        fel.error_mensaje = parsed['descripcion'] or f'HTTP {status_code}'
    fel.save()
    return fel
