import { useId, useMemo } from 'react'

export const LINE_SVG_W = 640
export const LINE_SVG_H = 260
const LINE_PAD = { l: 54, r: 54, t: 22, b: 44 } as const

export type LinePoint = { key: string; label: string; value: number }

/** Gráfico de líneas + área bajo una serie. */
export function LineTimeseriesChart({
  points,
  formatY,
  stroke,
}: {
  points: LinePoint[]
  formatY: (n: number) => string
  stroke: string
}) {
  const gradId = useId().replace(/:/g, '')

  const geom = useMemo(() => {
    if (points.length === 0) {
      return null
    }
    const vals = points.map((p) => p.value)
    let minY = Math.min(...vals)
    let maxY = Math.max(...vals)
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return null
    if (minY === maxY) {
      minY = Math.min(0, minY * 0.95)
      maxY = Math.max(maxY * 1.1, maxY + 1, 1)
    } else {
      const pad = (maxY - minY) * 0.06
      minY -= pad
      maxY += pad
      if (minY < 0 && Math.min(...vals) >= 0) minY = 0
    }
    const range = maxY - minY || 1
    const innerW = LINE_SVG_W - LINE_PAD.l - LINE_PAD.r
    const innerH = LINE_SVG_H - LINE_PAD.t - LINE_PAD.b
    const n = points.length
    const xAt = (i: number) =>
      n <= 1 ? LINE_PAD.l + innerW / 2 : LINE_PAD.l + (i / (n - 1)) * innerW
    const yAt = (v: number) => LINE_PAD.t + innerH * (1 - (v - minY) / range)

    let dLine = ''
    const circles: { cx: number; cy: number; key: string }[] = []
    points.forEach((p, i) => {
      const x = xAt(i)
      const y = yAt(p.value)
      dLine += `${i === 0 ? 'M' : 'L'}${x},${y} `
      circles.push({ cx: x, cy: y, key: p.key })
    })
    dLine = dLine.trim()
    const firstX = xAt(0)
    const lastX = xAt(n - 1)
    const yBottom = LINE_PAD.t + innerH
    const dArea = `${dLine} L ${lastX} ${yBottom} L ${firstX} ${yBottom} Z`

    const tickVals = [0, 1, 2, 3].map((i) => maxY - (i / 3) * (maxY - minY))
    const gridYs = tickVals.map((v) => ({
      v,
      y: yAt(v),
      label: formatY(v),
    }))

    return { dLine, dArea, circles, gridYs, xAt, n }
  }, [points, formatY])

  if (!geom || points.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos.</p>
  }

  const labelEvery = Math.max(1, Math.ceil(geom.n / 10))

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100 bg-slate-50/40 p-2">
      <svg
        viewBox={`0 0 ${LINE_SVG_W} ${LINE_SVG_H}`}
        className="h-auto w-full min-w-[280px]"
        role="img"
        aria-label="Gráfico de líneas"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {geom.gridYs.map((row, i) => (
          <g key={i}>
            <line
              x1={LINE_PAD.l}
              x2={LINE_SVG_W - LINE_PAD.r}
              y1={row.y}
              y2={row.y}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text
              x={LINE_PAD.l - 6}
              y={row.y + 3}
              textAnchor="end"
              fill="#64748b"
              fontSize="10"
              fontFamily="system-ui, sans-serif"
            >
              {row.label}
            </text>
          </g>
        ))}

        <path d={geom.dArea} fill={`url(#${gradId})`} stroke="none" />
        <path
          d={geom.dLine}
          fill="none"
          stroke={stroke}
          strokeWidth="2.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {geom.circles.map((c) => (
          <circle key={c.key} cx={c.cx} cy={c.cy} r="4" fill="white" stroke={stroke} strokeWidth="2" />
        ))}

        {points.map((p, i) => {
          if (i % labelEvery !== 0 && i !== geom.n - 1) return null
          const x = geom.xAt(i)
          return (
            <text
              key={`lbl-${p.key}`}
              x={x}
              y={LINE_SVG_H - 10}
              textAnchor="middle"
              fill="#64748b"
              fontSize="10"
              fontFamily="system-ui, sans-serif"
            >
              {p.label}
            </text>
          )
        })}

        <line
          x1={LINE_PAD.l}
          x2={LINE_SVG_W - LINE_PAD.r}
          y1={LINE_PAD.t + (LINE_SVG_H - LINE_PAD.t - LINE_PAD.b)}
          y2={LINE_PAD.t + (LINE_SVG_H - LINE_PAD.t - LINE_PAD.b)}
          stroke="#94a3b8"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  )
}

export type DualDailyPoint = { key: string; label: string; amount: number; count: number }

/**
 * Dos líneas en el mismo eje X (día): facturación (eje izquierdo, Q) y tickets (eje derecho, unidades).
 */
export function DualLineDailySalesChart({
  points,
  formatMoneyY,
}: {
  points: DualDailyPoint[]
  formatMoneyY: (n: number) => string
}) {
  const gradAmt = useId().replace(/:/g, '')
  const gradCnt = useId().replace(/:/g, '')

  const geom = useMemo(() => {
    if (points.length === 0) return null
    const amounts = points.map((p) => p.amount)
    const counts = points.map((p) => p.count)
    const padSeries = (vals: number[]) => {
      let lo = Math.min(...vals)
      let hi = Math.max(...vals)
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, range: 1 }
      if (lo === hi) {
        lo = Math.min(0, lo * 0.95)
        hi = Math.max(hi * 1.1, hi + 1, 1)
      } else {
        const p = (hi - lo) * 0.06
        lo -= p
        hi += p
        if (lo < 0 && Math.min(...vals) >= 0) lo = 0
      }
      return { min: lo, max: hi, range: hi - lo || 1 }
    }
    const amt = padSeries(amounts)
    const cnt = padSeries(counts)
    const innerW = LINE_SVG_W - LINE_PAD.l - LINE_PAD.r
    const innerH = LINE_SVG_H - LINE_PAD.t - LINE_PAD.b
    const n = points.length
    const xAt = (i: number) =>
      n <= 1 ? LINE_PAD.l + innerW / 2 : LINE_PAD.l + (i / (n - 1)) * innerW
    const yAtAmt = (v: number) => LINE_PAD.t + innerH * (1 - (v - amt.min) / amt.range)
    const yAtCnt = (v: number) => LINE_PAD.t + innerH * (1 - (v - cnt.min) / cnt.range)

    let dAmt = ''
    let dCnt = ''
    const ca: { cx: number; cy: number; key: string }[] = []
    const cc: { cx: number; cy: number; key: string }[] = []
    points.forEach((p, i) => {
      const x = xAt(i)
      const ya = yAtAmt(p.amount)
      const yc = yAtCnt(p.count)
      dAmt += `${i === 0 ? 'M' : 'L'}${x},${ya} `
      dCnt += `${i === 0 ? 'M' : 'L'}${x},${yc} `
      ca.push({ cx: x, cy: ya, key: `a-${p.key}` })
      cc.push({ cx: x, cy: yc, key: `c-${p.key}` })
    })
    dAmt = dAmt.trim()
    dCnt = dCnt.trim()

    const gridRows = [0, 1, 2, 3].map((i) => {
      const t = i / 3
      const y = LINE_PAD.t + innerH * t
      const vAmt = amt.max - t * amt.range
      const vCnt = cnt.max - t * cnt.range
      return {
        y,
        left: formatMoneyY(vAmt),
        right: String(Math.round(vCnt)),
      }
    })

    return { dAmt, dCnt, ca, cc, xAt, n, gridRows }
  }, [points, formatMoneyY])

  if (!geom || points.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos.</p>
  }

  const labelEvery = Math.max(1, Math.ceil(geom.n / 10))

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100 bg-slate-50/40 p-2">
      <svg
        viewBox={`0 0 ${LINE_SVG_W} ${LINE_SVG_H}`}
        className="h-auto w-full min-w-[300px]"
        role="img"
        aria-label="Gráfico de líneas de ventas diarias"
      >
        <defs>
          <linearGradient id={gradAmt} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={gradCnt} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f766e" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0f766e" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {geom.gridRows.map((row, i) => (
          <g key={i}>
            <line
              x1={LINE_PAD.l}
              x2={LINE_SVG_W - LINE_PAD.r}
              y1={row.y}
              y2={row.y}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text
              x={LINE_PAD.l - 6}
              y={row.y + 3}
              textAnchor="end"
              fill="#1e40af"
              fontSize="10"
              fontFamily="system-ui, sans-serif"
            >
              {row.left}
            </text>
            <text
              x={LINE_SVG_W - LINE_PAD.r + 6}
              y={row.y + 3}
              textAnchor="start"
              fill="#0f766e"
              fontSize="10"
              fontFamily="system-ui, sans-serif"
            >
              {row.right}
            </text>
          </g>
        ))}

        {/* Áreas bajo curvas (misma base) */}
        {(() => {
          const innerH = LINE_SVG_H - LINE_PAD.t - LINE_PAD.b
          const yBottom = LINE_PAD.t + innerH
          const firstX = geom.xAt(0)
          const lastX = geom.xAt(geom.n - 1)
          const areaAmt = `${geom.dAmt} L ${lastX} ${yBottom} L ${firstX} ${yBottom} Z`
          const areaCnt = `${geom.dCnt} L ${lastX} ${yBottom} L ${firstX} ${yBottom} Z`
          return (
            <>
              <path d={areaAmt} fill={`url(#${gradAmt})`} stroke="none" />
              <path d={areaCnt} fill={`url(#${gradCnt})`} stroke="none" opacity={0.65} />
            </>
          )
        })()}

        <path
          d={geom.dAmt}
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="2.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={geom.dCnt}
          fill="none"
          stroke="#0f766e"
          strokeWidth="2.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {geom.ca.map((c) => (
          <circle key={c.key} cx={c.cx} cy={c.cy} r="3.5" fill="white" stroke="#1d4ed8" strokeWidth="2" />
        ))}
        {geom.cc.map((c) => (
          <circle key={c.key} cx={c.cx} cy={c.cy} r="3.5" fill="white" stroke="#0f766e" strokeWidth="2" />
        ))}

        {points.map((p, i) => {
          if (i % labelEvery !== 0 && i !== geom.n - 1) return null
          const x = geom.xAt(i)
          return (
            <text
              key={`lbl-${p.key}`}
              x={x}
              y={LINE_SVG_H - 8}
              textAnchor="middle"
              fill="#64748b"
              fontSize="10"
              fontFamily="system-ui, sans-serif"
            >
              {p.label}
            </text>
          )
        })}

        <line
          x1={LINE_PAD.l}
          x2={LINE_SVG_W - LINE_PAD.r}
          y1={LINE_PAD.t + (LINE_SVG_H - LINE_PAD.t - LINE_PAD.b)}
          y2={LINE_PAD.t + (LINE_SVG_H - LINE_PAD.t - LINE_PAD.b)}
          stroke="#94a3b8"
          strokeWidth="1.5"
        />
      </svg>
      <div className="mt-2 flex flex-wrap justify-center gap-6 text-xs">
        <span className="inline-flex items-center gap-2 font-medium text-slate-700">
          <span className="h-0.5 w-6 rounded-full bg-[#1d4ed8]" aria-hidden />
          Facturación del día (Q)
        </span>
        <span className="inline-flex items-center gap-2 font-medium text-slate-700">
          <span className="h-0.5 w-6 rounded-full bg-[#0f766e]" aria-hidden />
          Tickets del día
        </span>
      </div>
    </div>
  )
}
