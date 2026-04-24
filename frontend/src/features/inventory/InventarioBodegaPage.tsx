import { useSearchParams } from 'react-router-dom'
import { Warehouse } from 'lucide-react'
import { Card } from '../../shared/ui/Card'

export function InventarioBodegaPage() {
  const [searchParams] = useSearchParams()
  const branch = searchParams.get('branch')

  return (
    <Card
      title="Bodega"
      subtitle="Vista de inventario y movimientos desde almacen central o bodega (en construccion)."
    >
      <div className="flex items-start gap-3 rounded-xl border border-material-outline bg-material-surface-variant/60 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-material-surface text-boutique-600 shadow-sm">
          <Warehouse size={22} strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 text-sm text-material-muted">
          <p className="text-material-emphasis">
            Use esta seccion para consolidar existencias y traslados desde bodega. Conecte aqui reportes y APIs cuando
            esten listos.
          </p>
          {branch ? (
            <p className="mt-2 text-xs font-medium text-material-emphasis">
              Filtro en URL: <span className="text-boutique-600">#{branch}</span>
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
