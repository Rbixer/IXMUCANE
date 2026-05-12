"""Construcción del XML DTE para FEL Guatemala (esquema SAT 0.2.0).

Recibe una `pos.Sale` (con sus líneas y emisor) y devuelve la cadena XML lista
para codificar en Base64 y enviar a Corpo Sistemas.

El cálculo de IVA asume que el `unit_price` ya incluye el 12% (escenario más
común en POS minorista). Para emisores `PEQ` (pequeño contribuyente) no se
desglosa IVA: la línea solo lleva `Total` y se incluye la frase `TipoFrase=2,
CodigoEscenario=1` ("Sujeto a retención del Pequeño Contribuyente").
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import TYPE_CHECKING
from xml.etree import ElementTree as ET

if TYPE_CHECKING:  # pragma: no cover
    from pos.models import Sale

    from .models import FelEmisor


NS = {
    'dte': 'http://www.sat.gob.gt/dte/fel/0.2.0',
    'ds': 'http://www.w3.org/2000/09/xmldsig#',
}

IVA_RATE = Decimal('0.12')
DEC_4 = Decimal('0.0001')
DEC_2 = Decimal('0.01')
DEC_6 = Decimal('0.000001')


def _q(value: Decimal, places: Decimal = DEC_4) -> str:
    return str(Decimal(value).quantize(places, rounding=ROUND_HALF_UP))


def _registrar_namespaces() -> None:
    for prefix, uri in NS.items():
        ET.register_namespace(prefix, uri)


def _sub(parent: ET.Element, tag: str, attrib: dict | None = None, text: str | None = None) -> ET.Element:
    el = ET.SubElement(parent, f'{{{NS["dte"]}}}{tag}', attrib=attrib or {})
    if text is not None:
        el.text = text
    return el


def _calcular_montos_linea(unit_price: Decimal, qty: int, afiliacion: str) -> dict:
    precio_unitario = Decimal(unit_price).quantize(DEC_6, rounding=ROUND_HALF_UP)
    precio = (precio_unitario * Decimal(qty)).quantize(DEC_6, rounding=ROUND_HALF_UP)
    if afiliacion == 'GEN':
        gravable = (precio / (Decimal('1') + IVA_RATE)).quantize(DEC_6, rounding=ROUND_HALF_UP)
        impuesto = (precio - gravable).quantize(DEC_6, rounding=ROUND_HALF_UP)
    else:
        gravable = precio
        impuesto = Decimal('0')
    return {
        'precio_unitario': precio_unitario,
        'precio': precio,
        'gravable': gravable,
        'impuesto': impuesto,
    }


def construir_dte_xml(sale: 'Sale', emisor: 'FelEmisor') -> str:
    """Devuelve el XML DTE como string (sin la `Certificacion`)."""

    _registrar_namespaces()

    root = ET.Element(f'{{{NS["dte"]}}}GTDocumento', attrib={'Version': '0.1'})
    sat = _sub(root, 'SAT', attrib={'ClaseDocumento': 'dte'})
    dte = _sub(sat, 'DTE', attrib={'ID': 'DatosCertificados'})
    datos_emision = _sub(dte, 'DatosEmision', attrib={'ID': 'DatosEmision'})

    fecha = sale.created_at.strftime('%Y-%m-%dT%H:%M:%S')
    _sub(
        datos_emision,
        'DatosGenerales',
        attrib={
            'Tipo': 'FACT',
            'FechaHoraEmision': fecha,
            'CodigoMoneda': 'GTQ',
        },
    )

    emisor_el = _sub(
        datos_emision,
        'Emisor',
        attrib={
            'NITEmisor': emisor.nit,
            'NombreEmisor': emisor.nombre,
            'CodigoEstablecimiento': str(emisor.codigo_establecimiento),
            'NombreComercial': emisor.nombre_comercial or emisor.nombre,
            'AfiliacionIVA': emisor.afiliacion_iva,
        },
    )
    direccion_em = _sub(emisor_el, 'DireccionEmisor')
    _sub(direccion_em, 'Direccion', text=emisor.direccion)
    _sub(direccion_em, 'CodigoPostal', text=emisor.codigo_postal)
    _sub(direccion_em, 'Municipio', text=emisor.municipio)
    _sub(direccion_em, 'Departamento', text=emisor.departamento)
    _sub(direccion_em, 'Pais', text=emisor.pais)

    nit_receptor = (
        (sale.customer_nit or '').strip()
        or (sale.customer.nit if sale.customer_id and sale.customer.nit else '')
    ).strip().upper().replace('-', '').replace(' ', '')
    if not nit_receptor:
        nit_receptor = 'CF'
    nombre_receptor = (
        sale.customer_name
        or (sale.customer.name if sale.customer_id else '')
        or 'Consumidor Final'
    )
    receptor_el = _sub(
        datos_emision,
        'Receptor',
        attrib={
            'IDReceptor': nit_receptor,
            'NombreReceptor': nombre_receptor,
        },
    )
    direccion_rc = _sub(receptor_el, 'DireccionReceptor')
    _sub(direccion_rc, 'Direccion', text=sale.customer_address or 'CIUDAD')
    _sub(direccion_rc, 'CodigoPostal', text='01000')
    _sub(direccion_rc, 'Municipio', text='.')
    _sub(direccion_rc, 'Departamento', text='.')
    _sub(direccion_rc, 'Pais', text='GT')

    frases = _sub(datos_emision, 'Frases')
    if emisor.afiliacion_iva == 'PEQ':
        _sub(frases, 'Frase', attrib={'TipoFrase': '2', 'CodigoEscenario': '1'})
    else:
        _sub(frases, 'Frase', attrib={'TipoFrase': '1', 'CodigoEscenario': '1'})

    items = _sub(datos_emision, 'Items')
    total_impuestos = Decimal('0')
    gran_total = Decimal('0')
    for idx, line in enumerate(sale.lines.select_related('inventory_item').all(), start=1):
        montos = _calcular_montos_linea(line.unit_price, int(line.quantity), emisor.afiliacion_iva)
        item = _sub(
            items,
            'Item',
            attrib={'NumeroLinea': str(idx), 'BienOServicio': 'B'},
        )
        _sub(item, 'Cantidad', text=_q(Decimal(line.quantity), DEC_6))
        _sub(item, 'UnidadMedida', text='UNI')
        _sub(item, 'Descripcion', text=line.inventory_item.name[:200])
        _sub(item, 'PrecioUnitario', text=_q(montos['precio_unitario'], DEC_6))
        _sub(item, 'Precio', text=_q(montos['precio'], DEC_6))
        _sub(item, 'Descuento', text='0.000000')

        if emisor.afiliacion_iva == 'GEN':
            impuestos_el = _sub(item, 'Impuestos')
            impuesto_el = _sub(impuestos_el, 'Impuesto')
            _sub(impuesto_el, 'NombreCorto', text='IVA')
            _sub(impuesto_el, 'CodigoUnidadGravable', text='1')
            _sub(impuesto_el, 'MontoGravable', text=_q(montos['gravable'], DEC_6))
            _sub(impuesto_el, 'MontoImpuesto', text=_q(montos['impuesto'], DEC_6))
            total_impuestos += montos['impuesto']

        gran_total += montos['precio']
        _sub(item, 'Total', text=_q(montos['precio'], DEC_4))

    totales = _sub(datos_emision, 'Totales')
    if emisor.afiliacion_iva == 'GEN':
        total_impuestos_el = _sub(totales, 'TotalImpuestos')
        _sub(
            total_impuestos_el,
            'TotalImpuesto',
            attrib={
                'NombreCorto': 'IVA',
                'TotalMontoImpuesto': _q(total_impuestos, DEC_6),
            },
        )
    _sub(totales, 'GranTotal', text=_q(gran_total, DEC_4))

    return ET.tostring(root, encoding='unicode')
