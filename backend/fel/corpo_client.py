"""Cliente HTTP a Corpo Sistemas (REST `RequestTransaction`).

No depende del modelo: recibe un `payload` y devuelve la respuesta cruda.
Los reintentos quedan a cargo del servicio (queremos persistir cada intento).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from urllib import error as urlerror
from urllib import request as urlrequest

URL_PRUEBAS = 'https://app.corposistemasgt.com/webapitest/RequestTransaction'
URL_PRODUCCION = 'https://app.corposistemasgt.com/webapi/RequestTransaction'


@dataclass
class CorpoConfig:
    ambiente: str
    requestor: str
    username: str

    @property
    def url(self) -> str:
        return URL_PRODUCCION if self.ambiente == 'produccion' else URL_PRUEBAS


def cargar_config(ambiente: str, requestor: str = '', username: str = '') -> CorpoConfig:
    requestor = (requestor or os.environ.get('FEL_REQUESTOR', '')).strip()
    username = (username or os.environ.get('FEL_USERNAME', 'ADMINISTRADOR')).strip()
    if not requestor:
        raise RuntimeError(
            'Falta el requestor de Corpo. Configure FEL_REQUESTOR en el entorno '
            'o en el FelEmisor.'
        )
    return CorpoConfig(ambiente=ambiente, requestor=requestor, username=username)


_CORPO_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json, text/plain, */*',
    # Cloudflare delante de Corpo bloquea el UA por defecto de urllib.
    'User-Agent': (
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'
    ),
    'Cache-Control': 'no-cache',
}

# Servicio público de Corpo Sistemas para consulta de NIT/Razón social.
# Documentación: https://app.corposistemasgt.com/getnit/ConsultaNIT.asmx?op=getNIT
URL_CONSULTA_NIT = 'https://app.corposistemasgt.com/getnit/ConsultaNIT.asmx/getNIT'


def lookup_nit_corpo(
    nit: str,
    *,
    entity: str = '',
    requestor: str = '',
    timeout: float = 15.0,
) -> dict | None:
    """Consulta el NIT contra el servicio público de Corpo (`getNIT`).

    Devuelve `{nombre, direccion}` si Corpo responde con `<Result>true</Result>`
    o `None` si el NIT es inválido / hay error de red. La dirección viene vacía
    porque el servicio público no la entrega; pero el nombre fiscal sí.

    `entity`/`requestor` se toman de los argumentos o, si están vacíos, de
    `FEL_REQUESTOR`/`FEL_ENTITY`/el NIT del emisor.
    """

    nit = (nit or '').strip().upper().replace('-', '').replace(' ', '')
    if not nit:
        return None

    requestor = (requestor or os.environ.get('FEL_REQUESTOR', '')).strip()
    entity = (entity or os.environ.get('FEL_ENTITY', '')).strip()
    if not requestor or not entity:
        return None

    from urllib.parse import urlencode
    qs = urlencode({'vNIT': nit, 'Entity': entity, 'Requestor': requestor})
    url = f'{URL_CONSULTA_NIT}?{qs}'

    try:
        req = urlrequest.Request(
            url,
            headers={
                'User-Agent': _CORPO_HEADERS['User-Agent'],
                'Accept': 'text/xml, */*',
                'Cache-Control': 'no-cache',
            },
            method='GET',
        )
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode('utf-8', errors='replace')
    except (urlerror.HTTPError, urlerror.URLError, TimeoutError):
        return None
    except Exception:  # noqa: BLE001
        return None

    return _parse_consulta_nit_xml(text)


def _parse_consulta_nit_xml(xml_text: str) -> dict | None:
    """Extrae nombre/error del XML que devuelve `getNIT` (namespace tempuri.org)."""
    if not xml_text or not xml_text.lstrip().startswith('<'):
        return None
    from xml.etree import ElementTree as ET

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return None

    ns = {'t': 'http://tempuri.org/'}
    # OJO: Element sin hijos es "falsy", por lo que NO se puede usar `or` para
    # encadenar `find()`. Hay que comparar contra None explícitamente.
    response = root.find('t:Response', ns)
    if response is None:
        response = root.find('Response')
    if response is None:
        return None

    def _txt(tag: str) -> str:
        el = response.find(f't:{tag}', ns)
        if el is None:
            el = response.find(tag)
        if el is None or el.text is None:
            return ''
        return el.text.strip()

    result = _txt('Result').lower()
    nombre = _txt('nombre')
    error = _txt('error')
    if result not in ('true', '1', 'yes') or not nombre:
        return None
    return {'nombre': nombre, 'direccion': '', 'error': error}


def request_transaction(
    config: CorpoConfig,
    *,
    entity: str,
    data1: str,
    data2_b64: str,
    data3: str,
    timeout: float = 30.0,
) -> tuple[int, str]:
    """Hace POST a Corpo. Devuelve (status_code, body_text)."""

    body = {
        'country': 'GT',
        'entity': entity,
        'username': config.username,
        'password': config.requestor,
        'transaction': 'SYSTEM_REQUEST',
        'data1': data1,
        'data2': data2_b64,
        'data3': data3,
    }
    payload = json.dumps(body).encode('utf-8')
    req = urlrequest.Request(config.url, data=payload, headers=_CORPO_HEADERS, method='POST')
    try:
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode('utf-8', errors='replace')
            return resp.status, text
    except urlerror.HTTPError as exc:
        text = exc.read().decode('utf-8', errors='replace') if exc.fp else str(exc)
        return exc.code, text
    except urlerror.URLError as exc:  # red caída, DNS, etc.
        return 0, f'URLError: {exc.reason}'
