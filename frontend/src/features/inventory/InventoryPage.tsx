import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, ShoppingCart, Trash2 } from 'lucide-react'
import {
  createInventoryItem,
  deleteInventoryItem,
  listInventory,
  updateInventoryItem,
  type CreateInventoryPayload,
} from './inventory.service'
import { listProductCategories } from './categories.service'
import { Card } from '../../shared/ui/Card'
import { DataTable } from '../../shared/ui/DataTable'
import type { InventoryItem, InventoryLine } from '../../shared/types/domain'
import { listBranches } from '../branches/branches.service'
import { cartStorage } from '../../shared/lib/cart'
import { esModoPanelSoloSeleccion, esPanelSoloLecturaEnModulo } from '../../shared/lib/accesoSesion'
import { getPanelBranchIdFromStorage } from '../../shared/lib/panelBranch'
import { formatApiError } from '../../shared/lib/apiError'
import {
  formatHierarchyLabel,
  splitStockHierarchy,
  totalUnitsFromHierarchy,
} from '../../shared/lib/unitHierarchy'
import { notifyError, notifyInfo } from '../../shared/lib/notify'
import { useConfirm } from '../../shared/ui/ConfirmProvider'

/** Línea interna única en API (catálogo local sin división dama/caballero en la interfaz). */
const DEFAULT_LINE: InventoryLine = 'ropa-dama'

const CABECERA = {
  title: 'Productos',
  subtitle:
    'Alta y edición del catálogo. Las mismas existencias se ven aquí, en Reportes · Inventario general y en POS · Vender; al facturar o anular un ticket el stock se sincroniza en todos los listados.',
} as const

function stockHierarchyLabel(item: InventoryItem): string {
  const h = item.hierarchy
  if (h) return formatHierarchyLabel(h.fardos, h.paquetes, h.unidades)
  const { fardos, paquetes, unidades } = splitStockHierarchy(
    item.quantity,
    item.units_per_package ?? 1,
    item.packages_per_fardo ?? 1,
  )
  return formatHierarchyLabel(fardos, paquetes, unidades)
}

function unitsPerFardoFromItem(item: InventoryItem): number {
  const up = Math.max(1, item.units_per_package ?? 1)
  const pf = Math.max(1, item.packages_per_fardo ?? 1)
  return up * pf
}

function parseBranchParam(raw: string | null): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** FK de catálogo en base de datos: en modo panel se toma el punto asignado a la sesión. */
function branchForProductPayload(
  branchLockedId: number | null,
  branches: { id: number }[] | undefined,
  formBranch: number,
): number {
  if (branchLockedId != null && branchLockedId > 0) return branchLockedId
  const first = branches?.find((b) => b.id > 0)?.id
  if (first != null && first > 0) return first
  return formBranch > 0 ? formBranch : 0
}

export function InventoryPage() {
  const { confirm } = useConfirm()
  const modoPanelInv = esModoPanelSoloSeleccion()
  const soloLecturaInventario = esPanelSoloLecturaEnModulo('inventario')
  const [searchParams, setSearchParams] = useSearchParams()
  const branchLockedId =
    parseBranchParam(searchParams.get('branch')) ??
    (modoPanelInv ? getPanelBranchIdFromStorage() : null)

  const categoriaFiltro = useMemo(() => {
    const raw = searchParams.get('categoria')
    if (raw == null || raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [searchParams])

  const cabecera = CABECERA

  const queryClient = useQueryClient()
  const saveInFlightRef = useRef(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [cartTarget, setCartTarget] = useState<InventoryItem | null>(null)
  const [cartQtyStr, setCartQtyStr] = useState('1')
  const [cartError, setCartError] = useState('')
  const [cartRevision, setCartRevision] = useState(0)
  const [previewItem, setPreviewItem] = useState<InventoryItem | null>(null)
  const [apiError, setApiError] = useState('')
  /** Errores al eliminar desde la tabla (el modal usa `apiError`). */
  const [listDeleteError, setListDeleteError] = useState('')
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [form, setForm] = useState<CreateInventoryPayload>({
    name: '',
    sku: '',
    quantity: 0,
    units_per_package: 1,
    packages_per_fardo: 1,
    unit_price: '',
    cost_price: '0',
    branch: 0,
    line: DEFAULT_LINE,
    category: null,
    display_order: 1,
  })
  const [stockFardos, setStockFardos] = useState(0)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [existingImageUrl, setExistingImageUrl] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)

  const nombreArchivoImagenGuardada = useMemo(() => {
    const u = existingImageUrl.trim()
    if (!u) return ''
    try {
      const path = new URL(u).pathname
      const seg = path.split('/').filter(Boolean).pop()
      return seg ? decodeURIComponent(seg) : ''
    } catch {
      const seg = u.split('/').filter(Boolean).pop()
      return seg ? decodeURIComponent(seg) : ''
    }
  }, [existingImageUrl])

  const query = useQuery({
    queryKey: ['inventory', 'all', branchLockedId ?? 'all', categoriaFiltro ?? 'all'],
    queryFn: () =>
      listInventory({
        ...(branchLockedId != null ? { branch: branchLockedId } : {}),
        ...(categoriaFiltro != null ? { category: categoriaFiltro } : {}),
      }),
  })
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const categoriesQuery = useQuery({
    queryKey: ['inventory', 'categories'],
    queryFn: () => listProductCategories(),
    enabled: !soloLecturaInventario,
  })

  const nombreCategoriaFiltro = useMemo(() => {
    if (categoriaFiltro == null) return null
    return (categoriesQuery.data ?? []).find((c) => c.id === categoriaFiltro)?.name ?? null
  }, [categoriaFiltro, categoriesQuery.data])

  const clearCategoriaFiltro = () => {
    const next = new URLSearchParams(searchParams.toString())
    next.delete('categoria')
    setSearchParams(next, { replace: true })
  }

  const branchById = useMemo(() => {
    const m = new Map<number, string>()
    for (const b of branchesQuery.data ?? []) m.set(b.id, b.name)
    return m
  }, [branchesQuery.data])

  const lockedBranchName = branchLockedId != null ? branchById.get(branchLockedId) : undefined

  const rows = query.data ?? []

  useEffect(() => {
    const onCart = () => setCartRevision((n) => n + 1)
    window.addEventListener('boutique-cart-changed', onCart)
    return () => window.removeEventListener('boutique-cart-changed', onCart)
  }, [])

  const nextDisplayOrder = useMemo(() => {
    if (rows.length === 0) return 1
    return Math.max(...rows.map((r) => r.display_order ?? 0), 0) + 1
  }, [rows])

  useEffect(() => {
    setForm((prev) => {
      const q = totalUnitsFromHierarchy(stockFardos, 0, 0, prev.units_per_package, prev.packages_per_fardo)
      return prev.quantity === q ? prev : { ...prev, quantity: q }
    })
  }, [stockFardos, form.units_per_package, form.packages_per_fardo])

  useEffect(() => {
    setForm((prev) => {
      if (branchLockedId != null && branchLockedId > 0 && prev.branch !== branchLockedId) {
        return { ...prev, branch: branchLockedId }
      }
      const first = branchesQuery.data?.find((x) => x.id > 0)?.id ?? 0
      if (prev.branch === 0 && first > 0) {
        return { ...prev, branch: first }
      }
      return prev
    })
  }, [branchLockedId, branchesQuery.data])

  const createMutation = useMutation({
    mutationFn: (vars: { payload: CreateInventoryPayload; imageFile?: File | null }) =>
      createInventoryItem(vars.payload, vars.imageFile),
    onSuccess: () => {
      setApiError('')
      setImageFile(null)
      setExistingImageUrl('')
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['stock'] })
      void queryClient.invalidateQueries({ queryKey: ['reports', 'inventario'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'ventas'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'proveedores'] })
      const line = DEFAULT_LINE
      setIsModalOpen(false)
      setStockFardos(0)
      setForm({
        name: '',
        sku: '',
        quantity: 0,
        units_per_package: 1,
        packages_per_fardo: 1,
        unit_price: '',
        cost_price: '0',
        branch: branchLockedId ?? 0,
        line: line,
        category: null,
        display_order: nextDisplayOrder,
      })
      setEditingItemId(null)
      saveInFlightRef.current = false
    },
    onError: (err: Error) => {
      setApiError(err.message)
      saveInFlightRef.current = false
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
      imageFile,
    }: {
      id: number
      payload: CreateInventoryPayload
      imageFile?: File | null
    }) => updateInventoryItem(id, payload, imageFile),
    onSuccess: () => {
      setApiError('')
      setImageFile(null)
      setExistingImageUrl('')
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['stock'] })
      void queryClient.invalidateQueries({ queryKey: ['reports', 'inventario'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'ventas'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'proveedores'] })
      setIsModalOpen(false)
      setEditingItemId(null)
      setStockFardos(0)
      setForm({
        name: '',
        sku: '',
        quantity: 0,
        units_per_package: 1,
        packages_per_fardo: 1,
        unit_price: '',
        cost_price: '0',
        branch: branchLockedId ?? 0,
        line: DEFAULT_LINE,
        category: null,
        display_order: nextDisplayOrder,
      })
      saveInFlightRef.current = false
    },
    onError: (err: Error) => {
      setApiError(err.message)
      saveInFlightRef.current = false
    },
  })
  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const branchId = branchForProductPayload(branchLockedId, branchesQuery.data, form.branch)
    if (!form.name.trim() || !form.sku.trim() || form.quantity <= 0 || !form.unit_price || !branchId) {
      setApiError(
        'Revise nombre, SKU, existencias (al menos 1 unidad), precio de venta y que exista un punto de inventario.',
      )
      return
    }
    setApiError('')
    const payload: CreateInventoryPayload = {
      ...form,
      branch: branchId,
      line: DEFAULT_LINE,
      display_order: Math.max(0, Math.floor(Number(form.display_order)) || 0),
      units_per_package: Math.max(1, Math.floor(Number(form.units_per_package)) || 1),
      packages_per_fardo: Math.max(1, Math.floor(Number(form.packages_per_fardo)) || 1),
    }
    if (editingItemId) {
      saveInFlightRef.current = true
      const payloadEdicion = { ...payload, branch: branchId }
      updateMutation.mutate({ id: editingItemId, payload: payloadEdicion, imageFile })
      return
    }
    saveInFlightRef.current = true
    createMutation.mutate({ payload, imageFile })
  }

  const cantidadEnCarrito = (itemId: number) =>
    cartStorage.list().find((line) => line.id === itemId)?.quantity ?? 0

  const maxAgregable = (item: InventoryItem) =>
    Math.max(0, item.quantity - cantidadEnCarrito(item.id))

  const openCartModal = (item: InventoryItem) => {
    if (item.quantity <= 0) {
      notifyInfo('Este producto no tiene stock disponible.')
      return
    }
    const max = maxAgregable(item)
    if (max <= 0) {
      notifyInfo(
        soloLecturaInventario
          ? 'Ya tiene todo el stock disponible de este producto en el carrito.'
          : 'Ya tienes todo el stock disponible de este producto en el carrito.',
      )
      return
    }
    setCartError('')
    setCartQtyStr('1')
    setCartTarget(item)
  }

  const closeCartModal = () => {
    setCartTarget(null)
    setCartError('')
  }

  const confirmAddToCart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!cartTarget) return
    const max = maxAgregable(cartTarget)
    const raw = Number(cartQtyStr.trim())
    const qty = Math.floor(raw)
    if (!Number.isFinite(qty) || qty < 1) {
      setCartError('Indica una cantidad valida (minimo 1).')
      return
    }
    if (qty > max) {
      setCartError(`Solo puedes agregar hasta ${max} unidad(es) (stock en almacen).`)
      return
    }
    cartStorage.addFromInventory(cartTarget, qty)
    closeCartModal()
  }

  const handleOpenCreateModal = () => {
    setApiError('')
    setImageFile(null)
    setExistingImageUrl('')
    setEditingItemId(null)
    setStockFardos(0)
    setForm({
      name: '',
      sku: '',
      quantity: 0,
      units_per_package: 1,
      packages_per_fardo: 1,
      unit_price: '',
      cost_price: '0',
      branch: branchLockedId ?? 0,
      line: DEFAULT_LINE,
      category: null,
      display_order: nextDisplayOrder,
    })
    setIsModalOpen(true)
  }

  useEffect(() => {
    if (soloLecturaInventario || searchParams.get('accion') !== 'agregar') return
    const next = new URLSearchParams(searchParams.toString())
    next.delete('accion')
    setSearchParams(next, { replace: true })
    setApiError('')
    setImageFile(null)
    setExistingImageUrl('')
    setEditingItemId(null)
    setStockFardos(0)
    setForm({
      name: '',
      sku: '',
      quantity: 0,
      units_per_package: 1,
      packages_per_fardo: 1,
      unit_price: '',
      cost_price: '0',
      branch: branchLockedId ?? 0,
      line: DEFAULT_LINE,
      category: null,
      display_order: nextDisplayOrder,
    })
    setIsModalOpen(true)
  }, [soloLecturaInventario, searchParams, setSearchParams, branchLockedId, nextDisplayOrder])

  const handleEdit = (item: InventoryItem) => {
    setApiError('')
    setImageFile(null)
    setExistingImageUrl((item.image_url ?? '').trim())
    setEditingItemId(item.id)
    const upp = Math.max(1, item.units_per_package ?? 1)
    const ppf = Math.max(1, item.packages_per_fardo ?? 1)
    const perFardo = upp * ppf
    const fardos = Math.floor(Math.max(0, item.quantity) / perFardo)
    setStockFardos(fardos)
    setForm({
      name: item.name,
      sku: item.sku,
      quantity: fardos * perFardo,
      units_per_package: upp,
      packages_per_fardo: ppf,
      unit_price: item.unit_price,
      cost_price: item.cost_price ?? '0',
      branch: item.branch,
      line: item.line,
      category: item.category ?? null,
      display_order: item.display_order ?? 0,
    })
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setApiError('')
    setImageFile(null)
    setExistingImageUrl('')
    setIsModalOpen(false)
    setEditingItemId(null)
    setStockFardos(0)
    setForm({
      name: '',
      sku: '',
      quantity: 0,
      units_per_package: 1,
      packages_per_fardo: 1,
      unit_price: '',
      cost_price: '0',
      branch: branchLockedId ?? 0,
      line: DEFAULT_LINE,
      category: null,
      display_order: nextDisplayOrder,
    })
  }

  const deleteMutation = useMutation({
    mutationFn: deleteInventoryItem,
    onMutate: () => {
      setListDeleteError('')
    },
    onSuccess: async () => {
      try {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['inventory'] }),
          queryClient.invalidateQueries({ queryKey: ['inventory-summary'] }),
          queryClient.invalidateQueries({ queryKey: ['stock'] }),
          queryClient.invalidateQueries({ queryKey: ['pos', 'sales'] }),
          queryClient.invalidateQueries({ queryKey: ['suppliers', 'ordenes'] }),
          queryClient.invalidateQueries({ queryKey: ['reports', 'inventario'] }),
          queryClient.invalidateQueries({ queryKey: ['inventory', 'ventas'] }),
          queryClient.invalidateQueries({ queryKey: ['inventory', 'proveedores'] }),
        ])
      } catch {
        /* invalidación no debe bloquear el flujo */
      }
      setListDeleteError('')
    },
    onError: (err: unknown) => {
      const msg = formatApiError(err)
      setListDeleteError(msg)
      notifyError(msg)
    },
  })

  const handleDelete = async (item: InventoryItem) => {
    const accepted = await confirm({
      title: 'Eliminar producto',
      message: `¿Eliminar el producto «${item.name}»? Esta acción quita el artículo del catálogo.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!accepted) return
    setListDeleteError('')
    try {
      await deleteMutation.mutateAsync(item.id)
      setPreviewItem(null)
      handleCloseModal()
    } catch {
      /* mensaje en onError */
    }
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[min(100%,64rem)]">
      {categoriaFiltro != null && !soloLecturaInventario ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50/90 px-4 py-2.5 text-sm text-violet-950">
          <p>
            <span className="font-semibold">Filtro:</span> categoría «{nombreCategoriaFiltro ?? `#${categoriaFiltro}`}».
          </p>
          <button
            type="button"
            onClick={clearCategoriaFiltro}
            className="rounded-md border border-violet-300 bg-white px-3 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100"
          >
            Quitar filtro
          </button>
        </div>
      ) : null}

      <Card
        className="p-4 sm:p-5"
        title={
          branchLockedId != null && lockedBranchName
            ? `${cabecera.title} — ${lockedBranchName}`
            : cabecera.title
        }
        subtitle={
          soloLecturaInventario
            ? `${branchLockedId != null ? `Vista de su catálogo asignado. ` : ''}${cabecera.subtitle} Fardos, paquetes y unidades reflejan lo disponible (stock menos carrito). Pulse el producto o el icono del carrito para indicar cantidad.`
            : branchLockedId != null
              ? `Catálogo filtrado. ${cabecera.subtitle}`
              : cabecera.subtitle
        }
        action={
          soloLecturaInventario ? null : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Agregar producto
              </button>
            </div>
          )
        }
      >
        {!soloLecturaInventario && listDeleteError ? (
          <p className="mb-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {listDeleteError}
          </p>
        ) : null}
        <DataTable<InventoryItem>
          compact
          columns={[
            {
              key: 'display_order',
              label: 'Orden',
              render: (item) => String(item.display_order ?? '—'),
            },
            {
              key: 'name',
              label: 'Nombre',
              render: (item) =>
                soloLecturaInventario ? (
                  <div className="max-w-[11rem] sm:max-w-[12rem]">
                    <button
                      type="button"
                      onClick={() => openCartModal(item)}
                      className="text-left font-medium text-[#c40000] underline decoration-red-200 underline-offset-2 hover:text-red-800"
                    >
                      {item.name}
                    </button>
                    <p className="mt-0.5 truncate text-[11px] text-slate-600" title={item.sku}>
                      SKU {item.sku}
                    </p>
                  </div>
                ) : (
                  <div className="max-w-[11rem] sm:max-w-[12rem]">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="text-left font-medium text-[#c40000] underline decoration-red-200 underline-offset-2 hover:text-red-800"
                    >
                      {item.name}
                    </button>
                    <p className="mt-0.5 truncate text-[11px] text-slate-600" title={item.sku}>
                      SKU {item.sku}
                    </p>
                  </div>
                ),
            },
            {
              key: 'categoria',
              label: 'Categoría',
              render: (item) => (
                <span className="max-w-[7rem] truncate text-xs text-slate-700 sm:max-w-[9rem]" title={item.category_name ?? ''}>
                  {(item.category_name ?? '').trim() ? item.category_name : '—'}
                </span>
              ),
            },
            {
              key: 'units_per_package',
              label: 'U/paquete',
              render: (item) => (
                <span className="tabular-nums">{Math.max(1, item.units_per_package ?? 1)}</span>
              ),
            },
            {
              key: 'units_per_fardo',
              label: 'U/fardo',
              render: (item) => <span className="tabular-nums">{unitsPerFardoFromItem(item)}</span>,
            },
            {
              key: 'cantidad',
              label: 'Unidades',
              render: (item) => {
                void cartRevision
                return (
                  <span
                    className="tabular-nums font-medium text-slate-900"
                    title={
                      soloLecturaInventario
                        ? 'Stock total en sistema (igual que Reportes · Inventario general). El carrito reserva hasta facturar.'
                        : 'Total de piezas en inventario (igual que Reportes · Inventario general).'
                    }
                  >
                    {item.quantity}
                  </span>
                )
              },
            },
            {
              key: 'cost_price',
              label: 'Precio costo',
              render: (item) => <span className="tabular-nums">{item.cost_price ?? '0'}</span>,
            },
            { key: 'unit_price', label: 'Precio venta' },
            {
              key: 'actions',
              label: 'Acciones',
              render: (item) => (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      openCartModal(item)
                    }}
                    aria-label="Agregar al carrito"
                    title="Agregar al carrito"
                    className="inline-flex items-center justify-center rounded-md bg-brand-500 p-1.5 text-white transition hover:bg-brand-600"
                  >
                    <ShoppingCart size={15} aria-hidden />
                  </button>
                  {!soloLecturaInventario ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEdit(item)
                        }}
                        aria-label="Editar producto"
                        title="Editar producto"
                        className="inline-flex items-center justify-center rounded-md bg-slate-900 p-1.5 text-white transition hover:bg-slate-700"
                      >
                        <Pencil size={15} aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={deleteMutation.isPending}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleDelete(item)
                        }}
                        aria-label="Eliminar producto"
                        title="Eliminar producto"
                        className="inline-flex items-center justify-center rounded-md bg-red-600 p-1.5 text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </>
                  ) : null}
                </div>
              ),
            },
          ]}
          rows={rows}
          emptyMessage={query.isLoading ? 'Cargando inventario...' : 'No hay productos registrados.'}
        />
      </Card>
      </div>

      {previewItem ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inv-preview-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewItem(null)
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-soft">
            <div className="grid max-h-[90vh] sm:grid-cols-2 sm:max-h-[min(90vh,520px)]">
              <div className="aspect-square bg-slate-100 sm:aspect-auto sm:min-h-[280px]">
                {(previewItem.image_url ?? '').trim() ? (
                  <img src={(previewItem.image_url ?? '').trim()} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-[200px] items-center justify-center p-4 text-center text-sm text-slate-500">
                    Sin imagen
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-between p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#c40000]">
                    {(previewItem.image_url ?? '').trim() ? 'Foto del producto' : 'Sin foto'}
                  </p>
                  <h2 id="inv-preview-title" className="mt-1 text-lg font-semibold text-slate-900">
                    {previewItem.name}
                  </h2>
                  <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
                    <li>
                      <span className="text-slate-500">SKU:</span> {previewItem.sku}
                    </li>
                    <li>
                      <span className="text-slate-500">Precio costo:</span> Q {previewItem.cost_price ?? '0'}
                    </li>
                    <li>
                      <span className="text-slate-500">Precio venta:</span> Q {previewItem.unit_price}
                    </li>
                    <li>
                      <span className="text-slate-500">Stock (unidades):</span> {previewItem.quantity}
                    </li>
                    <li>
                      <span className="text-slate-500">Jerarquia:</span> {stockHierarchyLabel(previewItem)} (U/paq.{' '}
                      {previewItem.units_per_package ?? 1}, paq./fardo {previewItem.packages_per_fardo ?? 1})
                    </li>
                    <li>
                      <span className="text-slate-500">Orden:</span> {previewItem.display_order ?? '—'}
                    </li>
                  </ul>
                  {(previewItem.image_url ?? '').trim() ? (
                    <p className="mt-3 text-xs text-slate-500">
                      Foto cargada en el registro. El resto de datos coinciden con el catálogo.
                    </p>
                  ) : null}
                </div>
                {!soloLecturaInventario ? (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-stretch">
                    <button
                      type="button"
                      onClick={() => {
                        const it = previewItem
                        setPreviewItem(null)
                        if (it) handleEdit(it)
                      }}
                      className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={(e) => {
                        e.preventDefault()
                        if (previewItem) handleDelete(previewItem)
                      }}
                      className="flex-1 rounded-lg border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar del inventario'}
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className={`w-full rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${!soloLecturaInventario ? 'mt-2' : 'mt-4'}`}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {cartTarget ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cart-qty-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCartModal()
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft">
            <h3 id="cart-qty-title" className="text-lg font-semibold text-slate-900">
              {soloLecturaInventario ? '¿Cuántas unidades necesita?' : 'Agregar al carrito'}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-medium text-slate-900">{cartTarget.name}</span>
              <span className="block text-slate-500">SKU: {cartTarget.sku}</span>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {soloLecturaInventario ? (
                <>
                  En almacen: {cartTarget.quantity} u. ({stockHierarchyLabel(cartTarget)}). En carrito:{' '}
                  {cantidadEnCarrito(cartTarget.id)}. Puede pedir hasta{' '}
                  <span className="font-semibold text-slate-800">{maxAgregable(cartTarget)}</span> unidad(es) mas.
                </>
              ) : (
                <>
                  Stock en almacen: {cartTarget.quantity} u. ({stockHierarchyLabel(cartTarget)}). Puedes agregar hasta{' '}
                  <span className="font-semibold text-slate-800">{maxAgregable(cartTarget)}</span> unidad(es) mas en el
                  carrito.
                </>
              )}
            </p>
            <form className="mt-4 space-y-3" onSubmit={confirmAddToCart}>
              {cartError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {cartError}
                </p>
              ) : null}
              <label className="block text-xs font-semibold text-slate-600">
                {soloLecturaInventario ? 'Cantidad que necesita' : 'Cantidad necesaria'}
                <input
                  type="number"
                  min={1}
                  max={maxAgregable(cartTarget)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  value={cartQtyStr}
                  onChange={(e) => setCartQtyStr(e.target.value)}
                  autoFocus
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeCartModal}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  Agregar al carrito
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
          <div className="max-h-[min(92vh,640px)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-soft sm:max-w-lg">
            <h3 className="text-base font-semibold leading-tight text-black">
              {editingItemId ? 'Editar producto' : 'Agregar producto'}
            </h3>
            <p className="mt-1 text-xs leading-snug text-slate-700">
              {editingItemId
                ? 'Actualice datos y las existencias en fardos completos. El total en unidades es fardos × U/fardo; al guardar se alinea con la columna Unidades del inventario general.'
                : 'Complete nombre, SKU, empaque, existencias, precios y categoría; nada se guarda en el catálogo hasta que pulse Guardar producto.'}
            </p>
            {!editingItemId ? (
              <p className="mt-1 text-[11px] leading-snug text-slate-600">
                Defina <strong className="font-semibold text-slate-800">U/paquete</strong> y{' '}
                <strong className="font-semibold text-slate-800">paquetes por fardo</strong>; luego indique{' '}
                <strong className="font-semibold text-slate-800">fardos completos</strong>. El total en unidades (fardos ×
                U/fardo) debe ser mayor que cero para poder guardar.
              </p>
            ) : null}

            <form className="mt-3 space-y-2" onSubmit={handleCreate}>
              {apiError ? (
                <p className="whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                  {apiError}
                </p>
              ) : null}
              {(branchesQuery.data ?? []).length === 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  No hay punto de inventario registrado. Cree el registro en administración Django antes de agregar
                  productos.
                </p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-[11px] font-semibold text-black sm:col-span-2">
                  Orden en listado
                  <input
                    type="number"
                    min={0}
                    className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-700"
                    placeholder="0"
                    value={form.display_order}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        display_order: Number(event.target.value || 0),
                      }))
                    }
                  />
                </label>
                <input
                  className="sm:col-span-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-700"
                  placeholder="Nombre del producto"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
                <input
                  className="sm:col-span-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-700"
                  placeholder="SKU (único en el catálogo)"
                  value={form.sku}
                  onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))}
                />

                <fieldset className="sm:col-span-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                  <legend className="px-1 text-xs font-semibold tracking-wide text-slate-800">
                    Empaque (columnas U/paquete y U/fardo del inventario)
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-[11px] font-semibold text-black">
                      Unidades por paquete
                      <input
                        type="number"
                        min={1}
                        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-black"
                        value={form.units_per_package || ''}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            units_per_package: Math.max(1, Math.floor(Number(event.target.value) || 1)),
                          }))
                        }
                      />
                    </label>
                    <label className="block text-[11px] font-semibold text-black">
                      Paquetes por fardo
                      <input
                        type="number"
                        min={1}
                        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-black"
                        value={form.packages_per_fardo || ''}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            packages_per_fardo: Math.max(1, Math.floor(Number(event.target.value) || 1)),
                          }))
                        }
                      />
                    </label>
                    <p className="text-[11px] leading-snug text-slate-700 sm:col-span-2">
                      <span className="font-semibold text-slate-900">U/fardo</span> (piezas por fardo):{' '}
                      <span className="tabular-nums font-mono font-semibold text-slate-900">
                        {Math.max(1, Math.floor(Number(form.units_per_package)) || 1) *
                          Math.max(1, Math.floor(Number(form.packages_per_fardo)) || 1)}
                      </span>
                      <span className="text-slate-600"> — coincide con la columna del mismo nombre en la tabla.</span>
                    </p>
                  </div>
                </fieldset>

                <fieldset className="sm:col-span-2 space-y-2 rounded-lg border border-red-200 bg-red-50/40 p-3">
                  <legend className="px-1 text-xs font-semibold tracking-wide text-red-950">
                    {editingItemId ? 'Existencias (solo fardos completos)' : 'Existencias iniciales (solo fardos completos) — obligatorio'}
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-[11px] font-semibold text-black sm:col-span-2">
                      Fardos completos
                      <input
                        type="number"
                        min={0}
                        className="mt-0.5 w-full max-w-xs rounded-md border border-slate-300 px-2 py-1.5 text-sm text-black"
                        value={stockFardos || ''}
                        onChange={(event) => setStockFardos(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                      />
                    </label>
                    <p className="text-[10px] leading-snug text-slate-700 sm:col-span-2">
                      Un fardo equivale a «paquetes por fardo» × «unidades por paquete». El total guardado es fardos ×
                      U/fardo (columna «Unidades» del inventario general).
                      {editingItemId ? (
                        <>
                          {' '}
                          Si había stock que no completaba un fardo, al abrir el formulario solo se muestran fardos
                          enteros; al guardar, el total quedará en esos fardos completos.
                        </>
                      ) : null}
                    </p>
                    <p className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-900 sm:col-span-2">
                      Total en unidades (columna Unidades): {form.quantity}
                    </p>
                  </div>
                </fieldset>
                <label className="block text-[11px] font-semibold text-black sm:col-span-2">
                  Precio costo
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-0.5 w-full max-w-xs rounded-md border border-slate-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-700"
                    placeholder="Precio costo"
                    value={form.cost_price ?? ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, cost_price: event.target.value }))}
                  />
                </label>
                <label className="block text-[11px] font-semibold text-black sm:col-span-2">
                  Precio venta
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-0.5 w-full max-w-xs rounded-md border border-slate-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-700"
                    placeholder="Precio venta"
                    value={form.unit_price}
                    onChange={(event) => setForm((prev) => ({ ...prev, unit_price: event.target.value }))}
                  />
                </label>

                {!soloLecturaInventario ? (
                  <label className="block text-[11px] font-semibold text-black sm:col-span-2">
                    Categoría (opcional)
                    <select
                      className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-black"
                      value={form.category != null && form.category > 0 ? String(form.category) : ''}
                      onChange={(event) => {
                        const v = event.target.value
                        setForm((prev) => ({
                          ...prev,
                          category: v === '' ? null : Number(v),
                        }))
                      }}
                    >
                      <option value="">Sin categoría</option>
                      {(categoriesQuery.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {!soloLecturaInventario ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2 sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-black">Foto del producto (opcional)</label>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="mt-1 block w-full text-[11px] text-slate-800 file:mr-2 file:rounded file:border-0 file:bg-red-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-red-900"
                      onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                    />
                    <p className="mt-1 break-all text-[11px] text-slate-800">
                      {imageFile ? (
                        <>
                          <span className="font-semibold text-black">Archivo seleccionado:</span>{' '}
                          <span className="text-slate-900">{imageFile.name}</span>
                        </>
                      ) : nombreArchivoImagenGuardada ? (
                        <>
                          <span className="font-semibold text-black">Imagen guardada:</span>{' '}
                          <span className="text-slate-900">{nombreArchivoImagenGuardada}</span>
                        </>
                      ) : (
                        <span className="text-slate-500">Ningún archivo seleccionado.</span>
                      )}
                    </p>
                    {imageFile ? (
                      <button
                        type="button"
                        className="mt-1 text-[11px] font-semibold text-red-700 underline hover:text-red-900"
                        onClick={() => {
                          setImageFile(null)
                          if (imageInputRef.current) imageInputRef.current.value = ''
                        }}
                      >
                        Quitar archivo seleccionado
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 sm:text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 sm:text-sm"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Guardando...'
                    : editingItemId
                      ? 'Actualizar producto'
                      : 'Guardar producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
