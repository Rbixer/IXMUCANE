import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { fetchProfile } from '../auth/auth.service'
import { deletePosSale, listPosSales } from '../pos/pos.service'
import { deletePurchaseOrder, listPurchaseOrders } from '../suppliers/suppliers.service'
import { esModoPanelSoloSeleccion, panelTieneModuloEscritura } from '../../shared/lib/accesoSesion'
import { getPanelBranchIdFromStorage } from '../../shared/lib/panelBranch'
import { formatApiError } from '../../shared/lib/apiError'
import { useConfirm } from '../../shared/ui/ConfirmProvider'
import type { PedidoInventoryLine } from '../../shared/types/domain'

type TabPedidos = 'general' | 'proveedores'

function formatMoney(s: string) {
  const n = Number(s)
  if (!Number.isFinite(n)) return s
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n)
}

function LineasPedidoTable({ lines }: { lines: PedidoInventoryLine[] }) {
  if (lines.length === 0) {
    return <p className="mt-2 text-xs text-material-muted">No hay líneas en esta respuesta.</p>
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-material-outline bg-material-surface">
      <table className="w-full min-w-[720px] border-collapse text-left text-xs">
        <thead className="bg-material-surface-variant font-semibold text-material-emphasis">
          <tr>
            <th className="px-2 py-2">Orden</th>
            <th className="px-2 py-2">Producto</th>
            <th className="px-2 py-2 text-right">Fardos</th>
            <th className="px-2 py-2 text-right">Paquetes</th>
            <th className="px-2 py-2 text-right">Unidades</th>
            <th className="px-2 py-2 text-right">Precio costo</th>
            <th className="px-2 py-2 text-right">Precio venta</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((ln) => (
            <tr key={ln.id} className="border-t border-material-outline">
              <td className="px-2 py-1.5 tabular-nums text-material-emphasis">{ln.display_order}</td>
              <td className="px-2 py-1.5">
                <div className="font-medium text-material-emphasis">{ln.product_name}</div>
                <div className="text-[10px] text-material-muted">SKU {ln.sku}</div>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{ln.fardos}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{ln.paquetes}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{ln.unidades}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(ln.cost_price)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(ln.unit_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PedidosPage() {
  const { confirm } = useConfirm()
  const queryClient = useQueryClient()
  const modoPanelPedidos = esModoPanelSoloSeleccion()
  const puedeTabProveedores = !modoPanelPedidos || panelTieneModuloEscritura('proveedores')
  const puedeEditarVentasPos = !modoPanelPedidos || panelTieneModuloEscritura('pos')
  const puedeEditarOrdenesProveedor = !modoPanelPedidos || panelTieneModuloEscritura('proveedores')
  const [tab, setTab] = useState<TabPedidos>('general')
  const [deleteErr, setDeleteErr] = useState('')

  const profileQuery = useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: fetchProfile,
    staleTime: 60_000,
  })
  const branchFromProfile =
    profileQuery.data?.personnel_branch_id != null &&
    Number.isFinite(profileQuery.data.personnel_branch_id) &&
    profileQuery.data.personnel_branch_id > 0
      ? profileQuery.data.personnel_branch_id
      : null
  const branchFromStorage = modoPanelPedidos ? getPanelBranchIdFromStorage() : null
  const branchFilter = branchFromStorage ?? branchFromProfile ?? undefined

  const salesQuery = useQuery({
    queryKey: ['pos', 'sales', 'pedidos', branchFilter ?? 'all'],
    queryFn: () => listPosSales(branchFilter),
  })

  const ordersQuery = useQuery({
    queryKey: ['suppliers', 'ordenes', 'pedidos', branchFilter ?? 'all'],
    queryFn: () => listPurchaseOrders(branchFilter),
    enabled: puedeTabProveedores && tab === 'proveedores',
  })

  const ventas = salesQuery.data ?? []
  const ordenes = ordersQuery.data ?? []

  const deleteSaleMut = useMutation({
    mutationFn: deletePosSale,
    onMutate: () => setDeleteErr(''),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos', 'sales'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['reports', 'inventario'] }),
        queryClient.invalidateQueries({ queryKey: ['reports', 'sistema-pos'] }),
      ])
    },
    onError: (e: unknown) => setDeleteErr(formatApiError(e)),
  })

  const deleteOrderMut = useMutation({
    mutationFn: deletePurchaseOrder,
    onMutate: () => setDeleteErr(''),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['suppliers', 'ordenes'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['reports', 'inventario'] }),
      ])
    },
    onError: (e: unknown) => setDeleteErr(formatApiError(e)),
  })

  return (
    <div className="space-y-6">
      <header className="border-b border-material-outline pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">Pedidos</h1>
        <p className="mt-1 max-w-2xl text-sm text-material-muted">
          Ventas (POS) y órdenes de compra con el mismo desglose que inventario: orden, producto, fardos, paquetes,
          unidades, precio de costo y precio de venta por línea.
        </p>
        {modoPanelPedidos && branchFilter ? (
          <p className="mt-2 text-xs text-material-muted">
            Filtrado por su tienda asignada (#{branchFilter}). Si no ve resultados, registre ventas desde un usuario con
            permiso POS.
          </p>
        ) : null}
      </header>
      {deleteErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{deleteErr}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('general')}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            tab === 'general' ? 'bg-boutique-500 text-white' : 'border border-material-outline bg-white text-material-emphasis'
          }`}
        >
          General (ventas)
        </button>
        {puedeTabProveedores ? (
          <button
            type="button"
            onClick={() => setTab('proveedores')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === 'proveedores'
                ? 'bg-boutique-500 text-white'
                : 'border border-material-outline bg-white text-material-emphasis'
            }`}
          >
            Por proveedores
          </button>
        ) : null}
      </div>

      {tab === 'general' ? (
        <section className="space-y-4">
          {salesQuery.isLoading ? <p className="text-sm text-material-muted">Cargando ventas…</p> : null}
          {ventas.length === 0 && !salesQuery.isLoading ? (
            <p className="text-sm text-material-muted">No hay ventas registradas.</p>
          ) : null}
          {ventas.map((v) => (
            <article
              key={v.id}
              className="rounded-xl border border-material-outline bg-material-surface p-4 shadow-material"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-material-emphasis">Venta #{v.id}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-boutique-600">{v.branch_name}</span>
                  <button
                    type="button"
                    title="Eliminar venta y devolver stock"
                    disabled={!puedeEditarVentasPos || deleteSaleMut.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `¿Eliminar la venta #${v.id} (Q ${v.total})? Se anulará y se devolverá el inventario.`,
                        )
                      )
                        return
                      deleteSaleMut.mutate(v.id)
                    }}
                    className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-material-muted">
                {new Date(v.created_at).toLocaleString('es-GT')} ·{' '}
                {v.payment_method === 'cash' ? 'Efectivo' : v.payment_method === 'card' ? 'Tarjeta' : 'Otro'} · Total{' '}
                <span className="font-semibold tabular-nums text-material-emphasis">{formatMoney(v.total)}</span>
              </p>
              <LineasPedidoTable lines={v.lines ?? []} />
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'proveedores' && puedeTabProveedores ? (
        <section className="space-y-4">
          {ordersQuery.isLoading ? <p className="text-sm text-material-muted">Cargando órdenes…</p> : null}
          {ordenes.length === 0 && !ordersQuery.isLoading ? (
            <p className="text-sm text-material-muted">No hay órdenes de compra.</p>
          ) : null}
          {ordenes.map((o) => (
            <article
              key={o.id}
              className="rounded-xl border border-material-outline bg-material-surface p-4 shadow-material"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-material-emphasis">Orden proveedor #{o.id}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-boutique-600">{o.supplier_name}</span>
                  <button
                    type="button"
                    title="Eliminar orden y revertir entrada de inventario"
                    disabled={!puedeEditarOrdenesProveedor || deleteOrderMut.isPending}
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Eliminar orden de compra',
                        message: `¿Eliminar la orden de compra #${o.id}? Se descontará del inventario lo recibido en esta orden.`,
                        confirmLabel: 'Eliminar',
                        tone: 'danger',
                      })
                      if (!ok) return
                      deleteOrderMut.mutate(o.id)
                    }}
                    className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-material-muted">
                {new Date(o.created_at).toLocaleString('es-GT')} · {o.branch_name}
                {o.reference ? ` · Ref: ${o.reference}` : ''}
              </p>
              <LineasPedidoTable lines={o.lines ?? []} />
            </article>
          ))}
        </section>
      ) : null}

      {modoPanelPedidos && !puedeTabProveedores ? (
        <p className="text-xs text-material-muted">
          La pestaña «Por proveedores» requiere permiso de módulo Proveedores en su usuario.
        </p>
      ) : null}
    </div>
  )
}
