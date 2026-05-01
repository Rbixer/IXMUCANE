import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Printer, Save, Settings, X } from 'lucide-react'
import { listInventory } from '../inventory/inventory.service'
import type { InventoryItem } from '../../shared/types/domain'
import { ProductSearchAddPanel } from '../inventory/InventoryProductSearch'
import { Card } from '../../shared/ui/Card'
import {
  createPosQuote,
  fetchPosQuote,
  listPosQuotes,
  type PosQuote,
  type PosQuoteListItem,
} from './pos.service'

type QuoteDocKind = 'ticket' | 'recibo'
type QuoteUnitKind = 'unit' | 'package' | 'fardo'
type QuoteLineDraft = { inventory_item: number; quantity: number; unit_kind: QuoteUnitKind }
type QuotePanel = 'new' | 'done' | null
type QuoteHeader = {
  companyName: string
  address: string
  phone1: string
  phone2: string
}
type QuoteCustomerMeta = {
  customerAddress: string
  customerPhone: string
  deliveryTime24h: string
}

type QuotePreviewRow = {
  sku: string
  productName: string
  unitKindLabel: string
  quantity: number
  unitPrice: number
  subtotal: number
}

const QUOTE_HEADER_STORAGE_KEY = 'pos_quote_header_v1'
const DEFAULT_QUOTE_HEADER: QuoteHeader = {
  companyName: 'Aluminios Ixmucane',
  address: '',
  phone1: '',
  phone2: '',
}

function encodeQuoteMeta(meta: QuoteCustomerMeta): string {
  return `[quote_meta]${JSON.stringify(meta)}[/quote_meta]`
}

function decodeQuoteMeta(raw: string): QuoteCustomerMeta {
  const m = raw.match(/\[quote_meta\](.*?)\[\/quote_meta\]/)
  if (!m?.[1]) return { customerAddress: '', customerPhone: '', deliveryTime24h: '' }
  try {
    const p = JSON.parse(m[1]) as Partial<QuoteCustomerMeta>
    return {
      customerAddress: (p.customerAddress || '').trim(),
      customerPhone: (p.customerPhone || '').trim(),
      deliveryTime24h: (p.deliveryTime24h || '').trim(),
    }
  } catch {
    return { customerAddress: '', customerPhone: '', deliveryTime24h: '' }
  }
}

function formatQ(amount: number): string {
  return `Q ${amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function unitKindLabel(kind: QuoteUnitKind): string {
  if (kind === 'package') return 'Paquete'
  if (kind === 'fardo') return 'Fardo'
  return 'Unidad'
}

function quoteUnitPrice(item: InventoryItem, kind: QuoteUnitKind): number {
  const unit = Number(String(item.unit_price).trim())
  const packagePriceRaw = Number(String(item.package_price ?? '0').trim())
  const fardoPriceRaw = Number(String(item.fardo_price ?? '0').trim())
  const safeUnit = Number.isFinite(unit) ? unit : 0
  const byPackage =
    Number.isFinite(packagePriceRaw) && packagePriceRaw > 0
      ? packagePriceRaw
      : safeUnit * Math.max(1, Number(item.units_per_package ?? 1))
  const byFardo =
    Number.isFinite(fardoPriceRaw) && fardoPriceRaw > 0
      ? fardoPriceRaw
      : safeUnit *
        Math.max(1, Number(item.units_per_package ?? 1)) *
        Math.max(1, Number(item.packages_per_fardo ?? 1))
  if (kind === 'package') return byPackage
  if (kind === 'fardo') return byFardo
  return safeUnit
}

function buildPreviewRowsFromDraft(
  lines: QuoteLineDraft[],
  itemById: Map<number, InventoryItem>,
): QuotePreviewRow[] {
  const out: QuotePreviewRow[] = []
  for (const line of lines) {
    const it = itemById.get(line.inventory_item)
    if (!it) continue
    const unit = quoteUnitPrice(it, line.unit_kind)
    const subtotal = unit * line.quantity
    out.push({
      sku: it.sku,
      productName: it.name,
      unitKindLabel: unitKindLabel(line.unit_kind),
      quantity: line.quantity,
      unitPrice: unit,
      subtotal,
    })
  }
  return out
}

function buildPreviewRowsFromSaved(q: PosQuote): QuotePreviewRow[] {
  return q.lines.map((ln) => ({
    sku: ln.sku,
    productName: ln.product_name,
    unitKindLabel: unitKindLabel(ln.unit_kind),
    quantity: ln.quantity,
    unitPrice: Number(ln.line_unit_price),
    subtotal: Number(ln.line_unit_price) * ln.quantity,
  }))
}

function QuoteHeaderModal({
  open,
  value,
  onClose,
  onSave,
}: {
  open: boolean
  value: QuoteHeader
  onClose: () => void
  onSave: (next: QuoteHeader) => void
}) {
  const [draft, setDraft] = useState<QuoteHeader>(value)

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-950/60" onClick={onClose} aria-label="Cerrar" />
      <div className="relative z-10 w-full max-w-xl rounded-2xl bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Encabezado de cotización</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
            Nombre
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={draft.companyName}
              onChange={(e) => setDraft((v) => ({ ...v, companyName: e.target.value }))}
              placeholder="Nombre de la empresa"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
            Dirección
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={draft.address}
              onChange={(e) => setDraft((v) => ({ ...v, address: e.target.value }))}
              placeholder="Dirección comercial"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Teléfono 1
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={draft.phone1}
              onChange={(e) => setDraft((v) => ({ ...v, phone1: e.target.value }))}
              placeholder="Primer teléfono"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Teléfono 2
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={draft.phone2}
              onChange={(e) => setDraft((v) => ({ ...v, phone2: e.target.value }))}
              placeholder="Segundo teléfono"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() =>
              onSave({
                companyName: draft.companyName.trim() || DEFAULT_QUOTE_HEADER.companyName,
                address: draft.address.trim(),
                phone1: draft.phone1.trim(),
                phone2: draft.phone2.trim(),
              })
            }
            className="inline-flex items-center gap-1 rounded-lg bg-[#c40000] px-3 py-2 text-sm font-semibold text-white hover:bg-red-800"
          >
            <Save size={16} />
            Guardar encabezado
          </button>
        </div>
      </div>
    </div>
  )
}

function QuotePreviewModal({
  open,
  kind,
  customerName,
  customerNit,
  customerAddress,
  customerPhone,
  deliveryTime24h,
  notes,
  header,
  rows,
  total,
  /** Número oficial (#id) cuando la cotización ya está guardada en servidor. */
  savedQuoteId,
  onClose,
}: {
  open: boolean
  kind: QuoteDocKind
  customerName: string
  customerNit: string
  customerAddress: string
  customerPhone: string
  deliveryTime24h: string
  notes: string
  header: QuoteHeader
  rows: QuotePreviewRow[]
  total: number
  savedQuoteId?: number | null
  onClose: () => void
}) {
  if (!open) return null

  const now = new Date()
  const provisionalNo = `COT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const displayNo = savedQuoteId != null && savedQuoteId > 0 ? `#${savedQuoteId}` : provisionalNo

  const handlePrint = () => {
    document.body.classList.add('printing-pos-receipt')
    const clear = () => document.body.classList.remove('printing-pos-receipt')
    window.addEventListener('afterprint', clear, { once: true })
    setTimeout(clear, 2000)
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:static print:block print:p-0">
      <button type="button" className="absolute inset-0 bg-slate-950/60 print:hidden" onClick={onClose} aria-label="Cerrar" />
      <div
        className={`pos-receipt-print-root relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-soft print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none ${
          kind === 'ticket' ? 'max-w-md font-mono' : 'max-w-4xl'
        }`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 print:hidden">
          <h2 className="text-base font-semibold text-slate-900">
            {kind === 'ticket' ? 'Cotización tipo ticket' : 'Cotización tipo recibo'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-5 text-slate-800">
          <header className={kind === 'ticket' ? 'text-center' : 'flex items-start justify-between gap-3 border-b pb-3'}>
            <div>
              <img src="/brand-logo-boutique.png" alt="Logo empresa" className="mx-auto mb-2 h-12 w-auto object-contain" />
              <p className="text-xs uppercase tracking-wider text-slate-500">{header.companyName || 'Aluminios Ixmucane'}</p>
              <p className="text-lg font-bold">{kind === 'ticket' ? 'Cotización' : 'Cotización / Recibo'}</p>
              <p className="text-xs text-slate-600">Dirección: {header.address || '—'}</p>
              <p className="text-xs text-slate-600">Tel. 1: {header.phone1 || '—'}</p>
              <p className="text-xs text-slate-600">Tel. 2: {header.phone2 || '—'}</p>
            </div>
            <div className={kind === 'ticket' ? 'mt-2 text-xs text-slate-600' : 'text-right text-xs text-slate-600'}>
              <p>No: {displayNo}</p>
              <p>{now.toLocaleString('es-GT')}</p>
            </div>
          </header>

          <section className="mt-3 text-sm">
            <p>
              <span className="font-semibold">Dirección cliente:</span> {customerAddress.trim() || '—'}
            </p>
            <p>
              <span className="font-semibold">Cliente:</span> {customerName.trim() || 'Consumidor final'}
            </p>
            <p>
              <span className="font-semibold">NIT/ID:</span> {customerNit.trim() || 'CF'}
            </p>
            <p>
              <span className="font-semibold">Teléfono cliente:</span> {customerPhone.trim() || '—'}
            </p>
            <p>
              <span className="font-semibold">Hora de entrega:</span> {deliveryTime24h.trim() || '—'}
            </p>
          </section>

          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
                <th className="py-1 pr-2">SKU</th>
                <th className="py-1 pr-2">Producto</th>
                <th className="py-1 pr-2">Tipo</th>
                <th className="py-1 pr-2">Cant.</th>
                <th className="py-1 pr-2">P.U.</th>
                <th className="py-1">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${row.sku}-${idx}`} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2">{row.sku}</td>
                  <td className="py-1.5 pr-2">{row.productName}</td>
                  <td className="py-1.5 pr-2">{row.unitKindLabel}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{row.quantity}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{formatQ(row.unitPrice)}</td>
                  <td className="py-1.5 tabular-nums">{formatQ(row.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-xs rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Total cotizado</span>
                <span className="font-bold tabular-nums">{formatQ(total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Printer size={16} />
            Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#c40000] px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

export function PosCotizacionesPage() {
  const queryClient = useQueryClient()
  const [customerName, setCustomerName] = useState('')
  const [customerNit, setCustomerNit] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryTime24h, setDeliveryTime24h] = useState('')
  const [lines, setLines] = useState<QuoteLineDraft[]>([])
  const [docKind, setDocKind] = useState<QuoteDocKind>('ticket')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [savedPreview, setSavedPreview] = useState<{ quote: PosQuote; kind: QuoteDocKind } | null>(null)
  const [loadingQuoteId, setLoadingQuoteId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [activePanel, setActivePanel] = useState<QuotePanel>(null)
  const [headerConfig, setHeaderConfig] = useState<QuoteHeader>(DEFAULT_QUOTE_HEADER)
  const [headerModalOpen, setHeaderModalOpen] = useState(false)

  useEffect(() => {
    const raw = window.localStorage.getItem(QUOTE_HEADER_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Partial<QuoteHeader>
      setHeaderConfig({
        companyName: (parsed.companyName || DEFAULT_QUOTE_HEADER.companyName).trim() || DEFAULT_QUOTE_HEADER.companyName,
        address: (parsed.address || '').trim(),
        phone1: (parsed.phone1 || '').trim(),
        phone2: (parsed.phone2 || '').trim(),
      })
    } catch {
      // Si el localStorage está corrupto, se conservan valores por defecto.
    }
  }, [])

  const invQuery = useQuery({
    queryKey: ['inventory', 'cotizaciones', 'all'],
    queryFn: () => listInventory(),
  })

  const quotesQuery = useQuery({
    queryKey: ['pos', 'quotes'],
    queryFn: () => listPosQuotes(),
  })

  const saveMutation = useMutation({
    mutationFn: createPosQuote,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['pos', 'quotes'] })
      setSuccessMsg(`Cotización guardada con número #${data.id}.`)
      setError('')
      setCustomerName('')
      setCustomerNit('')
      setCustomerAddress('')
      setCustomerPhone('')
      setDeliveryTime24h('')
      setLines([])
      window.setTimeout(() => setSuccessMsg(''), 5000)
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar la cotización.'
      setError(msg)
      setSuccessMsg('')
    },
  })

  const items = invQuery.data ?? []
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const subtotal = useMemo(() => {
    let sum = 0
    for (const line of lines) {
      const it = itemById.get(line.inventory_item)
      if (!it) continue
      sum += quoteUnitPrice(it, line.unit_kind) * line.quantity
    }
    return sum
  }, [lines, itemById])

  const previewRowsDraft = useMemo(() => buildPreviewRowsFromDraft(lines, itemById), [lines, itemById])

  const addProduct = (item: InventoryItem) => {
    setLines((prev) => {
      const ix = prev.findIndex((l) => l.inventory_item === item.id)
      if (ix >= 0) return prev.map((l, i) => (i === ix ? { ...l, quantity: l.quantity + 1 } : l))
      return [...prev, { inventory_item: item.id, quantity: 1, unit_kind: 'unit' }]
    })
  }

  const setLineQty = (idx: number, raw: number) => {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, quantity: Math.max(1, Math.floor(Number(raw)) || 1) } : l)),
    )
  }

  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx))
  const setLineUnitKind = (idx: number, kind: QuoteUnitKind) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unit_kind: kind } : l)))

  const openPreview = (kind: QuoteDocKind) => {
    setError('')
    if (lines.length === 0) {
      setError('Agrega al menos un producto para generar la cotización.')
      return
    }
    setDocKind(kind)
    setPreviewOpen(true)
  }

  const handleSaveQuote = () => {
    setError('')
    setSuccessMsg('')
    if (lines.length === 0) {
      setError('Agrega al menos un producto para guardar la cotización.')
      return
    }
    const payloadLines: {
      inventory_item: number
      quantity: number
      unit_kind: QuoteUnitKind
      line_unit_price: string
    }[] = []
    for (const l of lines) {
      const it = itemById.get(l.inventory_item)
      if (!it) {
        setError('Un producto de la lista ya no está en el catálogo. Quite la línea o vuelva a cargar.')
        return
      }
      const pu = quoteUnitPrice(it, l.unit_kind)
      payloadLines.push({
        inventory_item: l.inventory_item,
        quantity: l.quantity,
        unit_kind: l.unit_kind,
        line_unit_price: pu.toFixed(2),
      })
    }
    saveMutation.mutate({
      customer_name: customerName,
      customer_nit: customerNit,
      notes: encodeQuoteMeta({ customerAddress, customerPhone, deliveryTime24h }),
      lines: payloadLines,
    })
  }

  const openSavedPreview = async (row: PosQuoteListItem, kind: QuoteDocKind) => {
    setLoadingQuoteId(row.id)
    setError('')
    setPreviewOpen(false)
    try {
      const quote = await fetchPosQuote(row.id)
      setSavedPreview({ quote, kind })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la cotización.')
    } finally {
      setLoadingQuoteId(null)
    }
  }

  return (
    <div className="space-y-6">
      <QuoteHeaderModal
        open={headerModalOpen}
        value={headerConfig}
        onClose={() => setHeaderModalOpen(false)}
        onSave={(next) => {
          setHeaderConfig(next)
          window.localStorage.setItem(QUOTE_HEADER_STORAGE_KEY, JSON.stringify(next))
          setHeaderModalOpen(false)
        }}
      />
      <QuotePreviewModal
        open={previewOpen}
        kind={docKind}
        customerName={customerName}
        customerNit={customerNit}
        customerAddress={customerAddress}
        customerPhone={customerPhone}
        deliveryTime24h={deliveryTime24h}
        notes=""
        header={headerConfig}
        rows={previewRowsDraft}
        total={subtotal}
        savedQuoteId={null}
        onClose={() => setPreviewOpen(false)}
      />

      {savedPreview ? (
        <QuotePreviewModal
          open
          kind={savedPreview.kind}
          customerName={savedPreview.quote.customer_name}
          customerNit={savedPreview.quote.customer_nit}
          customerAddress={decodeQuoteMeta(savedPreview.quote.notes).customerAddress}
          customerPhone={decodeQuoteMeta(savedPreview.quote.notes).customerPhone}
          deliveryTime24h={decodeQuoteMeta(savedPreview.quote.notes).deliveryTime24h}
          notes=""
          header={headerConfig}
          rows={buildPreviewRowsFromSaved(savedPreview.quote)}
          total={Number(savedPreview.quote.total)}
          savedQuoteId={savedPreview.quote.id}
          onClose={() => setSavedPreview(null)}
        />
      ) : null}

      {activePanel === null ? (
        <div className="flex min-h-[min(70vh,560px)] flex-col items-center justify-center gap-6 rounded-xl border border-slate-200 bg-material-surface p-8 shadow-material">
          <button
            type="button"
            onClick={() => setHeaderModalOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Settings size={16} />
            Encabezado
          </button>
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-center">
            <button
              type="button"
              onClick={() => setActivePanel('new')}
              className="rounded-xl border-2 border-[#c40000] bg-[#c40000] px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-red-800"
            >
              Nuevas cotizaciones
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('done')}
              className="rounded-xl border-2 border-[#c40000] bg-white px-8 py-4 text-base font-semibold text-[#c40000] shadow-sm hover:bg-red-50"
            >
              Cotizaciones realizadas
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setHeaderModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Settings size={16} />
              Encabezado
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('new')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                activePanel === 'new'
                  ? 'bg-[#c40000] text-white'
                  : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              Nuevas cotizaciones
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('done')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                activePanel === 'done'
                  ? 'bg-[#c40000] text-white'
                  : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              Cotizaciones realizadas
            </button>
          </div>

          <div className="space-y-6">
            {activePanel === 'new' ? (
        <Card
          title="Nuevas cotizaciones"
          subtitle="Arme la cotización y guárdela para obtener un número correlativo. No se descuenta inventario."
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              openPreview('ticket')
            }}
          >
            {successMsg ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">{successMsg}</p>
            ) : null}
            {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Nombre
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nombre del cliente"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                NIT / ID
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={customerNit}
                  onChange={(e) => setCustomerNit(e.target.value)}
                  placeholder="CF"
                />
              </label>
            </div>

            <label className="text-sm font-semibold text-slate-700">
              Dirección
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Dirección del cliente"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Teléfono
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Teléfono del cliente"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Hora de entrega (24 hrs)
              <input
                type="time"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={deliveryTime24h}
                onChange={(e) => setDeliveryTime24h(e.target.value)}
              />
            </label>

            <ProductSearchAddPanel
              items={items}
              purpose="purchase"
              title="Agregar productos a cotización"
              addButtonLabel="Agregar"
              onAdd={(item) => addProduct(item)}
            />

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase text-slate-600">Detalle de cotización</p>
              {lines.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Sin productos agregados.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {lines.map((line, idx) => {
                    const it = itemById.get(line.inventory_item)
                    if (!it) return null
                    const unit = quoteUnitPrice(it, line.unit_kind)
                    const lineTotal = unit * line.quantity
                    return (
                      <li key={`${line.inventory_item}-${idx}`} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-500">SKU {it.sku}</p>
                          <p className="text-sm font-semibold text-slate-900">{it.name}</p>
                          <p className="text-xs text-slate-600">
                            Precio seleccionado ({unitKindLabel(line.unit_kind)}):{' '}
                            <span className="font-semibold tabular-nums">{formatQ(unit)}</span>
                          </p>
                        </div>
                        <select
                          value={line.unit_kind}
                          onChange={(e) => setLineUnitKind(idx, e.target.value as QuoteUnitKind)}
                          className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        >
                          <option value="unit">Unidad</option>
                          <option value="package">Paquete</option>
                          <option value="fardo">Fardo</option>
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => setLineQty(idx, Number(e.target.value))}
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums"
                        />
                        <div className="text-right text-sm font-semibold tabular-nums text-slate-900">{formatQ(lineTotal)}</div>
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Quitar
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-800">
                Total cotizado: <span className="tabular-nums">{formatQ(subtotal)}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openPreview('ticket')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Eye size={16} />
                  Vista ticket
                </button>
                <button
                  type="button"
                  onClick={() => openPreview('recibo')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Eye size={16} />
                  Vista recibo
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuote}
                  disabled={saveMutation.isPending || lines.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#c40000] px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                >
                  <Save size={16} />
                  {saveMutation.isPending ? 'Guardando…' : 'Guardar cotización'}
                </button>
              </div>
            </div>
          </form>
        </Card>
            ) : null}

            {activePanel === 'done' ? (
        <Card title="Cotizaciones realizadas" subtitle="Listado con número autogenerado por el sistema al guardar.">
          {quotesQuery.isLoading ? (
            <p className="text-sm text-slate-600">Cargando…</p>
          ) : quotesQuery.isError ? (
            <p className="text-sm text-red-700">No se pudo cargar el historial.</p>
          ) : (quotesQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-600">Aún no hay cotizaciones guardadas.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
                    <th className="px-3 py-2">No.</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {(quotesQuery.data ?? []).map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-semibold tabular-nums text-slate-900">#{row.id}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {new Date(row.created_at).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-slate-800" title={row.customer_name || '—'}>
                        {row.customer_name?.trim() || '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">
                        Q {Number(row.total).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={loadingQuoteId === row.id}
                          onClick={() => void openSavedPreview(row, 'ticket')}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Eye size={14} />
                          {loadingQuoteId === row.id ? '…' : 'Ticket'}
                        </button>
                        <button
                          type="button"
                          disabled={loadingQuoteId === row.id}
                          onClick={() => void openSavedPreview(row, 'recibo')}
                          className="ml-1 inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Eye size={14} />
                          {loadingQuoteId === row.id ? '…' : 'Recibo'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
