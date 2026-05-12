import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Barcode, Pencil, Printer, ShoppingCart, Trash2 } from 'lucide-react'
import {
  createInventoryItem,
  deleteInventoryItem,
  downloadEtiquetaProducto,
  downloadEtiquetasLote,
  listInventory,
  updateInventoryItem,
  type CreateInventoryPayload,
} from './inventory.service'
import { listProductCategories } from './categories.service'
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
import { notifyError, notifyInfo, notifySuccess } from '../../shared/lib/notify'
import { useConfirm } from '../../shared/ui/ConfirmProvider'

/** Línea interna única en API (catálogo local sin división dama/caballero en la interfaz). */
const DEFAULT_LINE: InventoryLine = 'ropa-dama'

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

function parseBodegaSlot(raw: string | null): 1 | 2 | 3 | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (n === 1 || n === 2 || n === 3) return n
  return null
}

function isBodegaBranchName(name: string): boolean {
  return /\bbodega\b/i.test(name)
}

function bodegaSlotFromName(name: string): 1 | 2 | 3 | null {
  const m = name.trim().toLowerCase().match(/^bodega\s*([123])$/)
  if (!m) return null
  const n = Number(m[1])
  return n === 1 || n === 2 || n === 3 ? n : null
}

function pickBodegaBranchIds(branches: { id: number; name: string }[]): Set<number> {
  const ids = new Set<number>()
  for (const b of branches) {
    const slot = bodegaSlotFromName(b.name)
    if (slot != null && b.id > 0) ids.add(b.id)
  }
  return ids
}

function pickBodegaBranchIdBySlot(branches: { id: number; name: string }[], slot: 1 | 2 | 3): number | null {
  const found = branches.find((b) => b.id > 0 && bodegaSlotFromName(b.name) === slot)
  if (found) return found.id
  return null
}

/** FK de catálogo en base de datos: en modo panel se toma el punto asignado a la sesión. */
function branchForProductPayload(
  branchLockedId: number | null,
  branches: { id: number; name: string }[] | undefined,
  formBranch: number,
): number {
  if (branchLockedId != null && branchLockedId > 0) return branchLockedId
  const nonBodega = (branches ?? []).filter((b) => b.id > 0 && !isBodegaBranchName(b.name))
  const first = nonBodega.find((b) => b.id > 0)?.id
  if (first != null && first > 0) return first
  return formBranch > 0 ? formBranch : 0
}

export function InventoryPage() {
  const { confirm } = useConfirm()
  const modoPanelInv = esModoPanelSoloSeleccion()
  const soloLecturaInventario = esPanelSoloLecturaEnModulo('inventario')
  const [searchParams, setSearchParams] = useSearchParams()
  const branchFromQuery =
    parseBranchParam(searchParams.get('branch')) ??
    (modoPanelInv ? getPanelBranchIdFromStorage() : null)
  const bodegaSlot = parseBodegaSlot(searchParams.get('bodega'))

  const categoriaFiltro = useMemo(() => {
    const raw = searchParams.get('categoria')
    if (raw == null || raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [searchParams])

  const queryClient = useQueryClient()
  const saveInFlightRef = useRef(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [cartTarget, setCartTarget] = useState<InventoryItem | null>(null)
  const [cartQtyStr, setCartQtyStr] = useState('1')
  const [cartError, setCartError] = useState('')
  const [cartRevision, setCartRevision] = useState(0)
  const [previewItem, setPreviewItem] = useState<InventoryItem | null>(null)
  const [labelsModalOpen, setLabelsModalOpen] = useState(false)
  const [labelsCopies, setLabelsCopies] = useState(1)
  const [labelsSelectedIds, setLabelsSelectedIds] = useState<Set<number>>(new Set())
  const [labelsBusy, setLabelsBusy] = useState(false)
  const [singleLabelBusyId, setSingleLabelBusyId] = useState<number | null>(null)
  const [apiError, setApiError] = useState('')
  /** Errores al eliminar desde la tabla (el modal usa `apiError`). */
  const [listDeleteError, setListDeleteError] = useState('')
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [inventorySearch, setInventorySearch] = useState('')
  const LOW_STOCK_THRESHOLD = 10
  const [form, setForm] = useState<CreateInventoryPayload>({
    name: '',
    sku: '',
    quantity: 0,
    units_per_package: 1,
    packages_per_fardo: 1,
    unit_price: '',
    package_price: '0',
    fardo_price: '0',
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

  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const branchLockedId = useMemo(() => {
    if (branchFromQuery != null) return branchFromQuery
    if (bodegaSlot == null) return null
    return pickBodegaBranchIdBySlot(branchesQuery.data ?? [], bodegaSlot)
  }, [branchFromQuery, bodegaSlot, branchesQuery.data])
  const bodegaSinConfigurar = bodegaSlot != null && branchLockedId == null
  const query = useQuery({
    queryKey: ['inventory', 'all', branchLockedId ?? 'all', categoriaFiltro ?? 'all'],
    queryFn: () =>
      listInventory({
        ...(branchLockedId != null ? { branch: branchLockedId } : {}),
        ...(categoriaFiltro != null ? { category: categoriaFiltro } : {}),
      }),
    enabled: !bodegaSinConfigurar,
  })
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

  const rows = query.data ?? []
  const bodegaBranchIds = useMemo(() => pickBodegaBranchIds(branchesQuery.data ?? []), [branchesQuery.data])
  const lockedBranchName =
    bodegaSlot != null ? `Bodega ${bodegaSlot}` : branchLockedId != null ? branchById.get(branchLockedId) : undefined
  const visibleRows = useMemo(() => {
    if (bodegaSinConfigurar) return []
    const base = branchLockedId != null ? rows : rows.filter((row) => !bodegaBranchIds.has(row.branch))
    if (!inventorySearch.trim()) return base
    const q = inventorySearch.trim().toLowerCase()
    return base.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        (row.category_name ?? '').toLowerCase().includes(q),
    )
  }, [rows, branchLockedId, bodegaBranchIds, bodegaSinConfigurar, inventorySearch])

  useEffect(() => {
    const onCart = () => setCartRevision((n) => n + 1)
    window.addEventListener('boutique-cart-changed', onCart)
    return () => window.removeEventListener('boutique-cart-changed', onCart)
  }, [])

  const nextDisplayOrder = useMemo(() => {
    if (visibleRows.length === 0) return 1
    return Math.max(...visibleRows.map((r) => r.display_order ?? 0), 0) + 1
  }, [visibleRows])

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
      const first =
        branchesQuery.data?.find((x) => x.id > 0 && !isBodegaBranchName(x.name))?.id ?? 0
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
        package_price: '0',
        fardo_price: '0',
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
        package_price: '0',
        fardo_price: '0',
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
    if (bodegaSinConfigurar) {
      setApiError('La bodega actual no esta configurada. Cree el registro correspondiente (Bodega 1, 2 o 3).')
      return
    }
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
      notifyInfo('Este producto no está disponible (sin stock).')
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
    if (bodegaSinConfigurar) {
      notifyInfo('Esta bodega no esta configurada como almacen principal en el sistema (Bodega 1, 2 o 3).')
      return
    }
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
      package_price: '0',
      fardo_price: '0',
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
      package_price: '0',
      fardo_price: '0',
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
      package_price: item.package_price ?? '0',
      fardo_price: item.fardo_price ?? '0',
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
      package_price: '0',
      fardo_price: '0',
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
      notifySuccess('Producto eliminado del inventario.')
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

  const handleDownloadSingleLabel = async (item: InventoryItem, copies = 1) => {
    setSingleLabelBusyId(item.id)
    try {
      await downloadEtiquetaProducto(item.id, copies, item.sku)
      notifySuccess(`Etiqueta de «${item.sku}» generada (${copies} copia${copies !== 1 ? 's' : ''}).`)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'No se pudo generar la etiqueta.')
    } finally {
      setSingleLabelBusyId(null)
    }
  }

  const openLabelsBatchModal = () => {
    setLabelsSelectedIds(new Set(visibleRows.map((r) => r.id)))
    setLabelsCopies(1)
    setLabelsModalOpen(true)
  }

  const toggleLabelSelection = (id: number) => {
    setLabelsSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setAllLabelsSelected = (checked: boolean) => {
    setLabelsSelectedIds(checked ? new Set(visibleRows.map((r) => r.id)) : new Set())
  }

  const handleDownloadBatchLabels = async () => {
    const ids = Array.from(labelsSelectedIds)
    if (ids.length === 0) {
      notifyError('Selecciona al menos un producto.')
      return
    }
    setLabelsBusy(true)
    try {
      await downloadEtiquetasLote(ids, labelsCopies)
      notifySuccess(`PDF generado con ${ids.length * labelsCopies} etiquetas.`)
      setLabelsModalOpen(false)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'No se pudo generar el PDF.')
    } finally {
      setLabelsBusy(false)
    }
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[min(100%,68rem)] space-y-4">

        {/* ── Hero header ─────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-2xl px-6 py-5 text-white"
          style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)' }}
        >
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, #DC2626 0%, transparent 60%)' }}
          />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black tracking-tight">
                {bodegaSlot == null
                  ? 'INVENTARIO TIENDA'
                  : branchLockedId != null && lockedBranchName
                    ? `Inventario — ${lockedBranchName}`
                    : 'Inventario'}
              </h1>
              <p className="mt-0.5 text-[13px] text-white/60 font-medium">
                {bodegaSinConfigurar
                  ? `Bodega ${bodegaSlot}: configure un punto de inventario con ese nombre exacto.`
                  : soloLecturaInventario
                  ? 'Vista de catálogo asignado. Pulse el nombre para agregar al carrito.'
                  : 'Gestión completa del catálogo · Precios · Stock · Jerarquías'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openLabelsBatchModal}
                disabled={visibleRows.length === 0}
                className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-40"
                title="Imprimir etiquetas con código de barra para varios productos"
              >
                <Printer size={15} />
                Imprimir etiquetas
              </button>
              {!soloLecturaInventario && !bodegaSinConfigurar ? (
                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white transition"
                  style={{ background: '#DC2626' }}
                >
                  + Agregar producto
                </button>
              ) : null}
            </div>
          </div>

          {/* Stats rápidas */}
          <div className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Productos</p>
              <p className="mt-0.5 text-2xl font-black tabular-nums text-white">{query.data?.length ?? 0}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Con stock</p>
              <p className="mt-0.5 text-2xl font-black tabular-nums text-white">
                {(query.data ?? []).filter((r) => r.quantity > 0).length}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Stock bajo</p>
              <p className="mt-0.5 text-2xl font-black tabular-nums" style={{ color: '#FCD34D' }}>
                {(query.data ?? []).filter((r) => r.quantity > 0 && r.quantity <= LOW_STOCK_THRESHOLD).length}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Sin stock</p>
              <p className="mt-0.5 text-2xl font-black tabular-nums" style={{ color: '#FCA5A5' }}>
                {(query.data ?? []).filter((r) => r.quantity <= 0).length}
              </p>
            </div>
          </div>
        </div>

        {/* Filtro de categoría activo */}
        {categoriaFiltro != null && !soloLecturaInventario ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm">
            <p className="font-semibold text-blue-800">
              Filtro activo: categoría «{nombreCategoriaFiltro ?? `#${categoriaFiltro}`}»
            </p>
            <button
              type="button"
              onClick={clearCategoriaFiltro}
              className="rounded-lg border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-800 hover:bg-blue-50"
            >
              Quitar filtro
            </button>
          </div>
        ) : null}

        {/* ── Tabla ─────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          {/* Barra búsqueda + contador */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <p className="text-sm font-bold text-gray-600">
              {visibleRows.length} producto{visibleRows.length !== 1 ? 's' : ''}
              {inventorySearch ? ` · filtro: "${inventorySearch}"` : ''}
            </p>
            <div className="relative w-full max-w-xs">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                type="text"
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                placeholder="Buscar por nombre, SKU o categoría…"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:bg-white focus:ring-2 focus:ring-red-100"
              />
            </div>
          </div>

          {!soloLecturaInventario && listDeleteError ? (
            <div className="border-b border-red-100 bg-red-50 px-4 py-3">
              <p className="text-sm font-semibold text-red-800">{listDeleteError}</p>
            </div>
          ) : null}

          <DataTable<InventoryItem>
            compact
            columns={[
              {
                key: 'display_order',
                label: '#',
                render: (item) => (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px] font-black text-gray-600">
                    {item.display_order ?? '—'}
                  </span>
                ),
              },
              {
                key: 'name',
                label: 'Producto',
                render: (item) =>
                  soloLecturaInventario ? (
                    <div className="min-w-[9rem]">
                      <button
                        type="button"
                        onClick={() => openCartModal(item)}
                        className="text-left text-sm font-bold text-red-600 hover:text-red-800 hover:underline"
                      >
                        {item.name}
                      </button>
                      <p className="mt-0.5 font-mono text-[10px] text-gray-400">SKU: {item.sku}</p>
                    </div>
                  ) : (
                    <div className="min-w-[9rem]">
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        className="text-left text-sm font-bold text-red-600 hover:text-red-800 hover:underline"
                      >
                        {item.name}
                      </button>
                      <p className="mt-0.5 font-mono text-[10px] text-gray-400">SKU: {item.sku}</p>
                    </div>
                  ),
              },
              {
                key: 'categoria',
                label: 'Categoría',
                render: (item) => (
                  <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">
                    {(item.category_name ?? '').trim() ? item.category_name : '—'}
                  </span>
                ),
              },
              {
                key: 'units_per_package',
                label: 'U/paq',
                render: (item) => (
                  <span className="tabular-nums font-bold text-gray-700">{Math.max(1, item.units_per_package ?? 1)}</span>
                ),
              },
              {
                key: 'units_per_fardo',
                label: 'U/fardo',
                render: (item) => <span className="tabular-nums font-bold text-gray-700">{unitsPerFardoFromItem(item)}</span>,
              },
              {
                key: 'cantidad',
                label: 'Stock',
                render: (item) => {
                  void cartRevision
                  return (
                    <div className="flex flex-col">
                      <span className="tabular-nums text-sm font-black text-gray-900">{item.quantity}</span>
                      <span className="text-[10px] text-gray-400">{stockHierarchyLabel(item)}</span>
                    </div>
                  )
                },
              },
              {
                key: 'cost_price',
                label: 'Costo',
                render: (item) => (
                  <span className="tabular-nums text-xs font-semibold text-gray-500">Q {item.cost_price ?? '0'}</span>
                ),
              },
              {
                key: 'unit_price',
                label: 'Precio venta',
                render: (item) => (
                  <span className="tabular-nums font-black text-gray-900">Q {item.unit_price}</span>
                ),
              },
              {
                key: 'disponibilidad',
                label: 'Estado',
                render: (item) => {
                  if (item.quantity <= 0) {
                    return (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-black text-red-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        Sin stock
                      </span>
                    )
                  }
                  if (item.quantity <= LOW_STOCK_THRESHOLD) {
                    return (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Stock bajo
                      </span>
                    )
                  }
                  return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      En stock
                    </span>
                  )
                },
              },
              {
                key: 'actions',
                label: 'Acciones',
                render: (item) => (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openCartModal(item) }}
                      aria-label="Agregar al carrito"
                      title="Agregar al carrito"
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white transition hover:bg-red-700"
                    >
                      <ShoppingCart size={13} aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={singleLabelBusyId === item.id}
                      onClick={(e) => { e.stopPropagation(); void handleDownloadSingleLabel(item, 1) }}
                      aria-label="Descargar etiqueta con código de barras"
                      title="Descargar etiqueta (PDF) con código de barras"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100 disabled:opacity-40"
                    >
                      <Barcode size={13} aria-hidden />
                    </button>
                    {!soloLecturaInventario ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleEdit(item) }}
                          aria-label="Editar"
                          title="Editar producto"
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-white transition hover:bg-gray-700"
                        >
                          <Pencil size={13} aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={deleteMutation.isPending}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(item) }}
                          aria-label="Eliminar"
                          title="Eliminar producto"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 size={13} aria-hidden />
                        </button>
                      </>
                    ) : null}
                  </div>
                ),
              },
            ]}
            rows={visibleRows}
            emptyMessage={query.isLoading ? 'Cargando inventario...' : 'No hay productos registrados.'}
          />
        </div>
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

      {labelsModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLabelsModalOpen(false)
          }}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                  <Barcode size={18} className="text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-black text-gray-900">Imprimir etiquetas</h2>
                  <p className="text-xs font-medium text-gray-400">
                    Genera un PDF con códigos de barra de los productos seleccionados.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLabelsModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:bg-gray-50"
              >
                ×
              </button>
            </div>

            {/* Controles */}
            <div className="grid grid-cols-1 gap-4 border-b border-gray-100 px-5 py-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">
                  Copias por producto
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={labelsCopies}
                  onChange={(e) => setLabelsCopies(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold tabular-nums text-gray-900 outline-none focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div className="sm:col-span-2 flex items-end justify-between gap-2">
                <div className="text-xs">
                  <p className="font-bold text-gray-700">
                    {labelsSelectedIds.size} de {visibleRows.length} seleccionados
                  </p>
                  <p className="text-gray-500">
                    {labelsSelectedIds.size * labelsCopies} etiquetas en total
                    · ~{Math.ceil((labelsSelectedIds.size * labelsCopies) / 24)} hojas (24 por hoja carta)
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAllLabelsSelected(true)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                  >
                    Seleccionar todo
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllLabelsSelected(false)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </div>

            {/* Lista de productos */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {visibleRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  No hay productos en la vista actual. Ajusta los filtros y vuelve a intentar.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {visibleRows.map((item) => {
                    const checked = labelsSelectedIds.has(item.id)
                    return (
                      <label
                        key={item.id}
                        className={
                          'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ' +
                          (checked
                            ? 'border-violet-300 bg-violet-50'
                            : 'border-gray-200 bg-white hover:bg-gray-50')
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLabelSelection(item.id)}
                          className="h-4 w-4 rounded text-violet-600 focus:ring-violet-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-bold text-gray-900">{item.name}</p>
                          <p className="font-mono text-[11px] text-gray-500">
                            SKU: {item.sku || `IXM-${String(item.id).padStart(6, '0')}`} · Stock: {item.quantity}
                          </p>
                        </div>
                        <span className="text-xs font-bold tabular-nums text-gray-700">
                          Q {item.unit_price}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setLabelsModalOpen(false)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadBatchLabels()}
                disabled={labelsBusy || labelsSelectedIds.size === 0}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                <Printer size={14} />
                {labelsBusy ? 'Generando…' : 'Generar PDF'}
              </button>
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
                ? 'Actualice datos y las existencias en fardos completos. El total en unidades es fardos × U/fardo; al guardar se alinea con la columna Unidades del inventario consolidado.'
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
                      U/fardo (columna «Unidades» del inventario consolidado).
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
                <label className="block text-[11px] font-semibold text-black sm:col-span-2">
                  Precio por paquete
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-0.5 w-full max-w-xs rounded-md border border-slate-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-700"
                    placeholder="Precio por paquete"
                    value={form.package_price ?? '0'}
                    onChange={(event) => setForm((prev) => ({ ...prev, package_price: event.target.value }))}
                  />
                </label>
                <label className="block text-[11px] font-semibold text-black sm:col-span-2">
                  Precio por fardo
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-0.5 w-full max-w-xs rounded-md border border-slate-300 px-2 py-1.5 text-sm text-black placeholder:text-neutral-700"
                    placeholder="Precio por fardo"
                    value={form.fardo_price ?? '0'}
                    onChange={(event) => setForm((prev) => ({ ...prev, fardo_price: event.target.value }))}
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
