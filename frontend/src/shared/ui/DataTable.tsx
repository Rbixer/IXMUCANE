import type { ReactNode } from 'react'

type Column<T> = {
  key: keyof T | string
  label: string
  render?: (row: T) => ReactNode
}

type DataTableProps<T> = {
  columns: Array<Column<T>>
  rows: T[]
  emptyMessage: string
  rowClassName?: (row: T) => string | undefined
  /** Menos padding y tipografía algo menor (p. ej. tablas anchas en inventario). */
  compact?: boolean
}

export function DataTable<T extends { id: number | string }>({
  columns,
  rows,
  emptyMessage,
  rowClassName,
  compact = false,
}: DataTableProps<T>) {
  const thPad = compact ? 'px-3 py-2.5' : 'px-4 py-3'
  const thText = compact ? 'text-[10px] leading-tight' : 'text-xs'
  const tdPad = compact ? 'px-3 py-2.5' : 'px-4 py-3.5'
  const tdText = compact ? 'text-xs' : 'text-sm'
  const emptyPad = compact ? 'px-3 py-10' : 'px-4 py-12'
  const emptyText = compact ? 'text-xs' : 'text-sm'

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
      <table className="min-w-full divide-y divide-gray-100 bg-white">
        <thead>
          <tr style={{ background: '#1a1a2e' }}>
            {columns.map((column, i) => (
              <th
                key={String(column.key)}
                className={`${thPad} text-left font-bold uppercase tracking-wider text-white/70 ${thText} ${
                  i === 0 ? 'rounded-tl-2xl' : ''
                } ${i === columns.length - 1 ? 'rounded-tr-2xl' : ''}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={`${emptyPad} text-center font-medium text-gray-400 ${emptyText}`}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr
                key={row.id}
                className={`transition-colors hover:bg-red-50/40 ${rowIdx % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'} ${rowClassName?.(row) ?? ''}`}
              >
                {columns.map((column) => (
                  <td key={String(column.key)} className={`${tdPad} ${tdText} font-medium text-gray-700`}>
                    {column.render ? column.render(row) : String(row[column.key as keyof T] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
