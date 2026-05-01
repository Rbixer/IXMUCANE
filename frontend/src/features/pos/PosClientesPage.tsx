import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card } from '../../shared/ui/Card'
import { createPosCustomer, listPosCustomers } from './pos.service'

export function PosClientesPage() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

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
      await queryClient.invalidateQueries({ queryKey: ['pos', 'customers'] })
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cliente.')
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customersQuery.data ?? []
    return (customersQuery.data ?? []).filter((c) => c.name.toLowerCase().includes(q))
  }, [customersQuery.data, search])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const cleanedName = name.trim()
    if (!cleanedName) {
      setError('El nombre es obligatorio.')
      return
    }
    createMutation.mutate({
      name: cleanedName,
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
    })
  }

  return (
    <div className="space-y-6">
      <Card title="Clientes POS" subtitle="Registro de clientes para asociar ventas y pedidos.">
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          {error ? <p className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Nombre</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Teléfono</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Correo</span>
            <input type="email" className="w-full rounded-lg border border-slate-300 px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Dirección</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {createMutation.isPending ? 'Guardando…' : 'Registrar cliente'}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Listado de clientes" subtitle="Búsqueda por nombre en tiempo real.">
        <div className="space-y-3">
          <input
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Buscar cliente por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {customersQuery.isLoading ? <p className="text-sm text-slate-600">Cargando…</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2 pr-2">Nombre</th>
                  <th className="py-2 pr-2">Teléfono</th>
                  <th className="py-2 pr-2">Correo</th>
                  <th className="py-2 pr-2">Dirección</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-medium">{c.name}</td>
                    <td className="py-2 pr-2">{c.phone || '—'}</td>
                    <td className="py-2 pr-2">{c.email || '—'}</td>
                    <td className="py-2 pr-2">{c.address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!customersQuery.isLoading && filtered.length === 0 ? <p className="mt-3 text-sm text-slate-500">Sin resultados.</p> : null}
          </div>
        </div>
      </Card>
    </div>
  )
}
