import type { InventoryItem } from '../types/domain'

const CART_KEY = 'boutique_cart'

export type CartItem = {
  id: number
  name: string
  sku: string
  unit_price: string
  quantity: number
}

function readCart(): CartItem[] {
  const raw = localStorage.getItem(CART_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as CartItem[]
  } catch {
    return []
  }
}

function writeCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('boutique-cart-changed'))
  }
}

export const cartStorage = {
  list: () => readCart(),
  addFromInventory: (product: InventoryItem, amount = 1) => {
    const qty = Math.max(1, Math.floor(Number(amount)) || 1)
    const items = readCart()
    const existing = items.find((item) => item.id === product.id)
    if (existing) {
      existing.quantity += qty
    } else {
      items.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        unit_price: product.unit_price,
        quantity: qty,
      })
    }
    writeCart(items)
  },
  remove: (id: number) => {
    const items = readCart().filter((item) => item.id !== id)
    writeCart(items)
  },
}
