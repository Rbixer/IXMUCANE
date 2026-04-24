from inventory.models import InventoryItem
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import StockMovement
from .serializers import StockMovementSerializer


class StockMovementViewSet(viewsets.ModelViewSet):
    serializer_class = StockMovementSerializer

    def get_queryset(self):
        existing_ids = InventoryItem.objects.values_list('id', flat=True)
        qs = StockMovement.objects.select_related('inventory_item').filter(
            inventory_item_id__in=existing_ids,
        )
        branch = self.request.query_params.get('branch')
        if branch:
            qs = qs.filter(inventory_item__branch_id=branch)
        return qs


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stock_count(request):
    existing_ids = InventoryItem.objects.values_list('id', flat=True)
    return Response(
        {'count': StockMovement.objects.filter(inventory_item_id__in=existing_ids).count()}
    )
