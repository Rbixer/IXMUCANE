import io
import zipfile
from datetime import datetime, timedelta

from django.http import HttpResponse
from django.utils.timezone import is_aware, make_aware
from rest_framework import status, viewsets, mixins
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from pos.models import Customer, Sale

from .corpo_client import lookup_nit_corpo
from .models import FelDocumento, FelEmisor
from .serializers import FelDocumentoSerializer, FelEmisorSerializer
from .services import FelError, certificar


def _normaliza_nit(raw: str) -> str:
    return (raw or '').strip().upper().replace('-', '').replace(' ', '')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def consultar_nit(request):
    """GET /api/v1/fel/consulta-nit/?nit=XXXX

    Estrategia:
    1. Busca primero en el directorio local (`pos.Customer`).
    2. Si no existe, intenta consultar el endpoint externo configurable
       (variable de entorno `FEL_NIT_LOOKUP_URL`); si responde con un nombre
       fiscal lo devuelve como `source: "sat"`.
    3. Si ningún paso devuelve datos: `{found: false, nit: ...}`.

    Nunca falla por problemas externos: el frontend siempre puede registrar
    el cliente manualmente.
    """
    raw = (request.query_params.get('nit') or '').strip().upper()
    if not raw:
        return Response({'detail': 'Indique un NIT.'}, status=status.HTTP_400_BAD_REQUEST)
    nit_norm = _normaliza_nit(raw)
    if not nit_norm:
        return Response({'found': False, 'nit': nit_norm})
    if nit_norm in ('CF', 'CONSUMIDORFINAL'):
        return Response({
            'found': True,
            'source': 'cf',
            'nit': 'CF',
            'nombre': 'Consumidor Final',
            'direccion': '',
        })

    customer = None
    qs = Customer.objects.exclude(nit='')
    direct = qs.filter(nit__iexact=raw).first() or qs.filter(nit__iexact=nit_norm).first()
    if direct is not None:
        customer = direct
    else:
        for c in qs.only('id', 'nit'):
            if _normaliza_nit(c.nit) == nit_norm:
                customer = Customer.objects.get(pk=c.pk)
                break

    if customer is not None:
        return Response({
            'found': True,
            'source': 'local',
            'nit': customer.nit,
            'nombre': customer.name,
            'direccion': customer.address,
            'phone': customer.phone,
            'email': customer.email,
            'customer_id': customer.id,
        })

    emisor = (
        FelEmisor.objects.filter(is_active=True, is_default=True).first()
        or FelEmisor.objects.filter(is_active=True).first()
    )
    if emisor is not None:
        info = lookup_nit_corpo(
            nit_norm,
            entity=emisor.nit,
            requestor=emisor.requestor,
        )
        if info and info.get('nombre'):
            return Response({
                'found': True,
                'source': 'sat',
                'nit': nit_norm,
                'nombre': info.get('nombre') or '',
                'direccion': info.get('direccion') or '',
            })

    return Response({'found': False, 'nit': nit_norm})


def _parse_iso_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if not is_aware(dt):
        dt = make_aware(dt)
    return dt


class FelEmisorViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = FelEmisor.objects.filter(is_active=True)
    serializer_class = FelEmisorSerializer
    permission_classes = [IsAuthenticated]


class FelDocumentoViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = FelDocumento.objects.select_related('emisor', 'sale').all()
    serializer_class = FelDocumentoSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        sale = self.request.query_params.get('sale')
        if sale and str(sale).isdigit():
            qs = qs.filter(sale_id=int(sale))
        return qs

    @action(detail=False, methods=['post'], url_path='certificar/(?P<sale_id>[0-9]+)')
    def certificar_venta(self, request, sale_id: str):
        """POST /api/v1/fel/documentos/certificar/<sale_id>/"""
        try:
            sale = Sale.objects.get(pk=int(sale_id))
        except Sale.DoesNotExist:
            return Response({'detail': 'Venta no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            fel = certificar(sale)
        except FelError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        ser = FelDocumentoSerializer(fel)
        http_status = status.HTTP_200_OK if fel.estado == FelDocumento.Estado.CERTIFICADO else status.HTTP_202_ACCEPTED
        return Response(ser.data, status=http_status)

    def _xml_response(self, xml: str, filename: str) -> HttpResponse:
        resp = HttpResponse(xml, content_type='application/xml; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="{filename}"'
        return resp

    @action(detail=False, methods=['get'], url_path='xml-certificado/(?P<sale_id>[0-9]+)')
    def xml_certificado(self, request, sale_id: str):
        """GET /api/v1/fel/documentos/xml-certificado/<sale_id>/

        Descarga el XML certificado por SAT (el que devolvió Corpo). 404 si la
        venta aún no está certificada.
        """
        try:
            fel = FelDocumento.objects.get(sale_id=int(sale_id))
        except FelDocumento.DoesNotExist:
            return Response({'detail': 'La venta no tiene FEL.'}, status=status.HTTP_404_NOT_FOUND)
        if not fel.xml_certificado:
            return Response(
                {'detail': 'La venta aún no está certificada por SAT.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        nombre = (fel.numero_autorizacion or f'venta-{sale_id}').replace('/', '_')
        return self._xml_response(fel.xml_certificado, f'fel_certificado_{nombre}.xml')

    @action(detail=False, methods=['get'], url_path='xmls-zip')
    def xmls_zip(self, request):
        """GET /api/v1/fel/documentos/xmls-zip/?from=YYYY-MM-DD&to=YYYY-MM-DD

        Empaqueta en un ZIP los XMLs **certificados** de las ventas dentro del
        rango (filtrado por fecha de la venta). Sin parámetros entrega todas
        las certificadas (cap de seguridad: 1 000 archivos).
        """
        qs = (
            FelDocumento.objects.select_related('sale')
            .filter(estado=FelDocumento.Estado.CERTIFICADO)
            .exclude(xml_certificado='')
        )

        d_from = _parse_iso_date(request.query_params.get('from'))
        d_to = _parse_iso_date(request.query_params.get('to'))
        if d_from is not None:
            qs = qs.filter(sale__created_at__gte=d_from)
        if d_to is not None:
            qs = qs.filter(sale__created_at__lt=d_to + timedelta(days=1))

        qs = qs.order_by('sale__created_at')[:1000]

        if not qs.exists():
            return Response(
                {'detail': 'No hay XMLs certificados en el rango indicado.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        buf = io.BytesIO()
        used: set[str] = set()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for fel in qs:
                base = (fel.numero_autorizacion or f'venta-{fel.sale_id}').replace('/', '_')
                name = f'fel_venta_{fel.sale_id}_{base}.xml'
                if name in used:
                    name = f'fel_venta_{fel.sale_id}_{base}_{fel.pk}.xml'
                used.add(name)
                zf.writestr(name, fel.xml_certificado)

        suffix = ''
        if d_from is not None:
            suffix += f'_{d_from.date().isoformat()}'
        if d_to is not None:
            suffix += f'_{d_to.date().isoformat()}'
        filename = f'fel_certificados{suffix}.zip'

        resp = HttpResponse(buf.getvalue(), content_type='application/zip')
        resp['Content-Disposition'] = f'attachment; filename="{filename}"'
        return resp

    @action(detail=False, methods=['get'], url_path='xml-enviado/(?P<sale_id>[0-9]+)')
    def xml_enviado(self, request, sale_id: str):
        """GET /api/v1/fel/documentos/xml-enviado/<sale_id>/

        Descarga el DTE XML que se envió a Corpo (útil para depurar rechazos).
        """
        try:
            fel = FelDocumento.objects.get(sale_id=int(sale_id))
        except FelDocumento.DoesNotExist:
            return Response({'detail': 'La venta no tiene FEL.'}, status=status.HTTP_404_NOT_FOUND)
        if not fel.xml_enviado:
            return Response(
                {'detail': 'No se generó XML para esta venta.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return self._xml_response(fel.xml_enviado, f'fel_enviado_venta_{sale_id}.xml')
