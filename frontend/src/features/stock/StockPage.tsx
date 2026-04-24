import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listStockMovements } from './stock.service'
import { Card } from '../../shared/ui/Card'
import { DataTable } from '../../shared/ui/DataTable'
import type { StockMovement } from '../../shared/types/domain'
import { listBranches } from '../branches/branches.service'
import { esModoPanelSoloSeleccion } from '../../shared/lib/accesoSesion'
import { getPanelBranchIdFromStorage } from '../../shared/lib/panelBranch'

function parseBranchParam(raw: string | null): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function StockPage() {
  const [searchParams] = useSearchParams()
  const branchLockedId =
    parseBranchParam(searchParams.get('branch')) ??
    (esModoPanelSoloSeleccion() ? getPanelBranchIdFromStorage() : null)

  const query = useQuery({
    queryKey: ['stock', branchLockedId ?? 'all'],
    queryFn: () =>
      listStockMovements(branchLockedId != null ? { branch: branchLockedId } : undefined),
  })
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const branchName =
    branchLockedId != null
      ? (branchesQuery.data ?? []).find((b) => b.id === branchLockedId)?.name
      : undefined

  return (
    <>
      {branchLockedId != null ? (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <span className="font-semibold">Movimientos filtrados:</span>{' '}
          {branchName ?? `ID ${branchLockedId}`}.{' '}
          <Link
            to="/inventario/stock"
            className="font-semibold text-[#c40000] underline underline-offset-2 hover:text-red-800"
          >
            Ver todo
          </Link>
          {' · '}
          <Link
            to="/inventario/productos"
            className="font-semibold text-[#c40000] underline underline-offset-2 hover:text-red-800"
          >
            Ir a productos
          </Link>
        </div>
      ) : null}

      <Card title="Stock" subtitle="Movimientos de entrada y salida.">
        <DataTable<StockMovement>
          columns={[
            {
              key: 'product_name',
              label: 'Producto',
              render: (row) => row.product_name ?? `#${row.inventory_item}`,
            },
            {
              key: 'existencia_actual',
              label: 'Stock actual',
              render: (row) =>
                row.existencia_actual != null ? String(row.existencia_actual) : '—',
            },
            { key: 'movement_type', label: 'Tipo' },
            { key: 'quantity', label: 'Cantidad (movimiento)' },
            { key: 'note', label: 'Nota' },
            { key: 'created_at', label: 'Fecha' },
          ]}
          rows={query.data ?? []}
          emptyMessage={query.isLoading ? 'Cargando movimientos...' : 'No hay movimientos registrados.'}
        />
      </Card>
    </>
  )
}
