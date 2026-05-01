import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { cartStorage, type CartItem } from '../../shared/lib/cart'
import { notifySuccess } from '../../shared/lib/notify'
import type { FormEvent } from 'react'

type CheckoutForm = {
  name: string
  phone: string
  address: string
}

export function CartPage() {
  const [items, setItems] = useState<CartItem[]>(() => cartStorage.list())
  const [form, setForm] = useState<CheckoutForm>({ name: '', phone: '', address: '' })

  const total = useMemo(
    () =>
      items.reduce((acc, item) => {
        const price = Number(item.unit_price || 0)
        return acc + price * item.quantity
      }, 0),
    [items],
  )

  const handleRemove = (id: number, name: string) => {
    cartStorage.remove(id)
    setItems(cartStorage.list())
    notifySuccess(`«${name}» quitado del carrito.`)
  }

  const handleCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name || !form.phone || !form.address || items.length === 0) return
    notifySuccess('Datos de compra registrados correctamente.')
  }

  return (
    <div className="space-y-6">
      <Card title="Carrito de compras" subtitle="Productos seleccionados para la compra.">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No tienes productos seleccionados.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div>
                  <p className="font-semibold text-slate-900">{item.name}</p>
                  <p className="text-sm text-slate-500">SKU: {item.sku}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Cantidad:</span>{' '}
                    {item.quantity}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id, item.name)}
                    aria-label={`Quitar ${item.name} del carrito`}
                    title="Quitar del carrito"
                    className="inline-flex items-center justify-center rounded-md bg-red-600 p-2 text-white transition hover:bg-red-700"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </div>
            ))}
            <p className="text-right text-lg font-semibold text-slate-900">
              Total: ${total.toLocaleString('es-CO')}
            </p>
          </div>
        )}
      </Card>

      <Card title="Informacion de entrega" subtitle="Completa tus datos para procesar la compra.">
        <form className="space-y-3" onSubmit={handleCheckout}>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Nombre completo"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Telefono"
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
          />
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Direccion"
            rows={3}
            value={form.address}
            onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Confirmar compra
          </button>
        </form>
      </Card>
    </div>
  )
}
