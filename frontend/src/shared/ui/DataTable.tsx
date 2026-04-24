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
  const thPad = compact ? 'px-2 py-2' : 'px-4 py-3'
  const thText = compact ? 'text-[10px] leading-tight' : 'text-xs'
  const tdPad = compact ? 'px-2 py-2' : 'px-4 py-3'
  const tdText = compact ? 'text-xs' : 'text-sm'
  const emptyPad = compact ? 'px-2 py-6' : 'px-4 py-8'
  const emptyText = compact ? 'text-xs' : 'text-sm'

  return (
    <div className="overflow-x-auto rounded-xl border border-material-outline">
      <table className="min-w-full divide-y divide-material-outline bg-material-surface">
        <thead className="bg-material-surface-variant">
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className={`${thPad} text-left font-semibold uppercase tracking-wide text-material-muted ${thText}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-material-divider">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={`${emptyPad} text-center text-material-muted ${emptyText}`}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className={rowClassName?.(row)}>
                {columns.map((column) => (
                  <td key={String(column.key)} className={`${tdPad} ${tdText} text-material-emphasis/90`}>
                    {column.render ? column.render(row) : String(row[column.key as keyof T] ?? '-')}
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
