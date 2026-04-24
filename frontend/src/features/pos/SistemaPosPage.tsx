import { useQuery } from '@tanstack/react-query'
import { Card } from '../../shared/ui/Card'
import { formatApiError } from '../../shared/lib/apiError'
import { fetchPosPing } from './pos.service'

export function SistemaPosPage() {
  const pingQuery = useQuery({
    queryKey: ['pos', 'ping'],
    queryFn: fetchPosPing,
    staleTime: 15_000,
    retry: 1,
  })

  const ok = pingQuery.data?.ok === true && pingQuery.data?.module === 'pos'
  const errMsg =
    pingQuery.isError && pingQuery.error instanceof Error
      ? formatApiError(pingQuery.error)
      : pingQuery.isError
        ? 'Error de conexion.'
        : ''

  return (
    <Card
      title="Sistema POS"
      subtitle="Backend del punto de venta: comprobacion de API y base para futuras funciones (cajas, tickets, cierres)."
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <p className="text-sm font-semibold text-slate-800">Estado del backend</p>
        <p className="mt-1 text-xs text-slate-600">
          Peticion autenticada a <code className="rounded bg-white px-1 py-0.5 text-[11px]">GET /api/v1/pos/ping/</code>
        </p>
        <div className="mt-3">
          {pingQuery.isLoading ? (
            <p className="text-sm text-slate-600">Comprobando…</p>
          ) : ok ? (
            <p className="text-sm font-medium text-emerald-800">Conectado: modulo POS responde correctamente.</p>
          ) : errMsg ? (
            <p className="whitespace-pre-wrap text-sm text-red-800">{errMsg}</p>
          ) : (
            <p className="text-sm text-amber-800">Respuesta inesperada del servidor.</p>
          )}
        </div>
      </div>
    </Card>
  )
}
