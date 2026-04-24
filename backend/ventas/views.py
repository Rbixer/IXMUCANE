from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ventas_ping(request):
    """Comprueba que el modulo Ventas responde (GET /api/v1/ventas/ping/)."""
    return Response({'module': 'ventas', 'ok': True})
