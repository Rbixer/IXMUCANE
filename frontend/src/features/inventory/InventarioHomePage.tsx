import { Boxes, ClipboardList, FolderInput, Package } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { esModoPanelSoloSeleccion, panelTieneModuloEscritura } from '../../shared/lib/accesoSesion'

const items = [
  {
    title: 'TIENDA',
    desc: 'Alta y gestion de inventario de tienda (separado de bodegas).',
    to: '/inventario/productos',
    Icon: Package,
  },
  {
    title: 'Bodegas',
    desc: 'Carga por Bodega 1, 2 y 3.',
    to: '/inventario/bodegas',
    Icon: Boxes,
  },
  {
    title: 'Pedidos',
    desc: 'Revision y seguimiento de pedidos.',
    to: '/inventario/pedidos',
    Icon: ClipboardList,
  },
  {
    title: 'Categorias',
    desc: 'Organizacion de categorias del catalogo.',
    to: '/inventario/categorias',
    Icon: FolderInput,
  },
] as const

export function InventarioHomePage() {
  const navigate = useNavigate()
  const modoPanel = esModoPanelSoloSeleccion()
  const puedeInventario = panelTieneModuloEscritura('inventario')
  const puedeBodega1 = panelTieneModuloEscritura('inventario_bodega_1')
  const puedeBodega2 = panelTieneModuloEscritura('inventario_bodega_2')
  const puedeBodega3 = panelTieneModuloEscritura('inventario_bodega_3')
  const puedeBodegas = puedeBodega1 || puedeBodega2 || puedeBodega3
  const visibles = modoPanel ? items.filter((it) => (it.to === '/inventario/bodegas' ? puedeBodegas || puedeInventario : puedeInventario)) : items

  return (
    <div className="space-y-6">
      <header className="border-b border-material-outline pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">Inventario</h1>
        <p className="mt-1 max-w-2xl text-sm text-material-muted">
          Seleccione el modulo que desea abrir dentro de inventario.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visibles.map(({ title, desc, to, Icon }) => (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            className="rounded-xl border border-material-outline bg-material-surface p-5 text-left shadow-material transition hover:border-boutique-300 hover:bg-boutique-50/60"
          >
            <div className="mb-3 inline-flex rounded-lg bg-boutique-50 p-2 text-boutique-700">
              <Icon size={18} aria-hidden />
            </div>
            <h2 className="text-sm font-semibold text-material-emphasis">{title}</h2>
            <p className="mt-1 text-xs text-material-muted">{desc}</p>
          </button>
        ))}
      </section>
    </div>
  )
}

