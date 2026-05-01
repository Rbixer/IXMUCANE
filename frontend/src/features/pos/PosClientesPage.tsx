import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Mail, MapPin, Phone, Receipt, Search, User, UserPlus, Users, X } from 'lucide-react'
import { createPosCustomer, listPosCustomers, listPosSales } from './pos.service'
import type { PosCustomer } from './pos.service'

function FieldInput({
  label,
  icon,
  type = 'text',
  value,
  onChange,
  placeholder,
}: {
  label: string
  icon: React.ReactNode
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-4 text-sm font-medium text-gray-900 outline-none transition focus:border-red-400 focus:bg-white focus:ring-2 focus:ring-red-100"
        />
      </div>
    </label>
  )
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const AVATAR_COLORS = [
  ['#FEF3C7', '#92400E'],
  ['#DBEAFE', '#1E40AF'],
  ['#D1FAE5', '#065F46'],
  ['#EDE9FE', '#5B21B6'],
  ['#FCE7F3', '#9D174D'],
  ['#FFEDD5', '#9A3412'],
]

function avatarStyle(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  const [bg, color] = AVATAR_COLORS[idx]
  return { background: bg, color }
}

function CustomerHistoryDrawer({ customer, onClose }: { customer: PosCustomer; onClose: () => void }) {
  const salesQuery = useQuery({
    queryKey: ['pos', 'sales', 'facturas', 'all'],
    queryFn: () => listPosSales(),
    staleTime: 30_000,
  })

  const customerSales = useMemo(() => {
    const all = salesQuery.data ?? []
    return all.filter(
      (s) =>
        s.customer === customer.id ||
        (s.customer_name ?? '').toLowerCase() === customer.name.toLowerCase(),
    )
  }, [salesQuery.data, customer])

  const totalGastado = customerSales.reduce((s, r) => s + (Number(r.total) || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black" style={avatarStyle(customer.name)}>
              {getInitials(customer.name) || '?'}
            </div>
            <div>
              <p className="text-sm font-black text-gray-900">{customer.name}</p>
              <p className="text-[11px] text-gray-400">Historial de compras</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:bg-gray-50">
            <X size={16} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 border-b border-gray-100 px-5 py-4">
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Compras</p>
            <p className="mt-0.5 text-2xl font-black text-gray-900">{customerSales.length}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total gastado</p>
            <p className="mt-0.5 text-lg font-black text-gray-900">
              Q {totalGastado.toLocaleString('es-GT', { minimumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Lista de ventas */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {salesQuery.isLoading ? (
            <p className="text-center text-sm text-gray-400 py-8">Cargando…</p>
          ) : customerSales.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <Receipt size={28} className="text-gray-200" />
              <p className="text-sm font-bold text-gray-400">Sin compras registradas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {customerSales.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-gray-500">#{s.id}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(s.created_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {s.lines_count} ítem{s.lines_count !== 1 ? 's' : ''} · {s.payment_method === 'cash' ? 'Efectivo' : s.payment_method === 'card' ? 'Tarjeta' : 'Otro'}
                    </p>
                  </div>
                  <span className="text-sm font-black tabular-nums text-gray-900">
                    Q {Number(s.total).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function PosClientesPage() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null)

  const customersQuery = useQuery({
    queryKey: ['pos', 'customers'],
    queryFn: () => listPosCustomers(),
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: createPosCustomer,
    onSuccess: async () => {
      setName('')
      setPhone('')
      setEmail('')
      setAddress('')
      setError('')
      setFormOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['pos', 'customers'] })
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cliente.')
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customersQuery.data ?? []
    return (customersQuery.data ?? []).filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q),
    )
  }, [customersQuery.data, search])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const cleanedName = name.trim()
    if (!cleanedName) {
      setError('El nombre del cliente es obligatorio.')
      return
    }
    createMutation.mutate({
      name: cleanedName,
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
    })
  }

  const total = customersQuery.data?.length ?? 0
  const conTelefono = customersQuery.data?.filter((c) => c.phone).length ?? 0
  const conEmail = customersQuery.data?.filter((c) => c.email).length ?? 0

  return (
    <div className="mx-auto w-full max-w-[min(100%,64rem)] space-y-4">
      {selectedCustomer ? (
        <CustomerHistoryDrawer customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
      ) : null}

      {/* ── Hero header ──────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-5 text-white"
        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, #DC2626 0%, transparent 60%)' }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black tracking-tight">Clientes</h1>
            <p className="mt-0.5 text-[13px] font-medium text-white/60">
              Directorio de clientes · Búsqueda en tiempo real
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white transition"
            style={{ background: '#DC2626' }}
          >
            <UserPlus size={16} />
            {formOpen ? 'Cancelar' : 'Nuevo cliente'}
          </button>
        </div>

        {/* Stats rápidas */}
        <div className="relative mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Total</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-white">{total}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Con teléfono</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-white">{conTelefono}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Con email</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-white">{conEmail}</p>
          </div>
        </div>
      </div>

      {/* ── Formulario nuevo cliente (collapsible) ────────────────────── */}
      {formOpen ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: '#FEF2F2' }}>
              <UserPlus size={20} style={{ color: '#DC2626' }} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900">Registrar nuevo cliente</h2>
              <p className="text-xs font-medium text-gray-400">Solo el nombre es obligatorio</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                {error}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldInput
                label="Nombre *"
                icon={<User size={14} />}
                value={name}
                onChange={setName}
                placeholder="Nombre completo del cliente"
              />
              <FieldInput
                label="Teléfono"
                icon={<Phone size={14} />}
                value={phone}
                onChange={setPhone}
                placeholder="Ej. 5555-1234"
              />
              <FieldInput
                label="Correo electrónico"
                icon={<Mail size={14} />}
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="correo@ejemplo.com"
              />
              <FieldInput
                label="Dirección"
                icon={<MapPin size={14} />}
                value={address}
                onChange={setAddress}
                placeholder="Zona, municipio, departamento"
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => { setFormOpen(false); setError('') }}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white transition disabled:opacity-60"
                style={{ background: '#DC2626' }}
              >
                {createMutation.isPending ? 'Guardando…' : 'Registrar cliente'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ── Tabla de clientes ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        {/* Barra de búsqueda */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2 text-gray-500">
            <Users size={17} />
            <span className="text-sm font-bold text-gray-700">
              {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}
            </span>
          </div>
          <div className="relative w-full max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:bg-white focus:ring-2 focus:ring-red-100"
              placeholder="Buscar por nombre, teléfono o email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Estado de carga */}
        {customersQuery.isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm font-medium text-gray-400">
            Cargando clientes…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
              <Users size={28} className="text-gray-300" />
            </div>
            <p className="text-sm font-bold text-gray-400">
              {search ? 'Sin resultados para esa búsqueda' : 'No hay clientes registrados'}
            </p>
            {!search ? (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="mt-1 rounded-xl px-4 py-2 text-xs font-black text-white"
                style={{ background: '#DC2626' }}
              >
                Registrar primer cliente
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-50">
              <thead>
                <tr style={{ background: '#1a1a2e' }}>
                  <th className="rounded-none px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-white/70">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-white/70">
                    Teléfono
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-white/70">
                    Correo
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-white/70">
                    Dirección
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-white/70">
                    Historial
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c, idx) => {
                  const initials = getInitials(c.name)
                  const style = avatarStyle(c.name)
                  return (
                    <tr
                      key={c.id}
                      className="transition-colors hover:bg-red-50/40"
                      style={{ background: idx % 2 === 1 ? '#f9fafb' : '#ffffff' }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black"
                            style={style}
                          >
                            {initials || '?'}
                          </div>
                          <span className="text-sm font-bold text-gray-900">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-red-600"
                          >
                            <Phone size={12} className="text-gray-400" />
                            {c.phone}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-red-600"
                          >
                            <Mail size={12} className="text-gray-400" />
                            {c.email}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.address ? (
                          <div className="flex items-start gap-1.5">
                            <MapPin size={12} className="mt-0.5 shrink-0 text-gray-400" />
                            <span className="text-sm text-gray-600">{c.address}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedCustomer(c)}
                          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-700 transition hover:bg-gray-50 hover:border-gray-300"
                        >
                          <Receipt size={12} />
                          Compras
                          <ChevronRight size={11} className="text-gray-400" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
