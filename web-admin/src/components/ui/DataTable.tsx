import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export type DataTableColumn<T> = {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  className?: string
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyState,
}: {
  columns: Array<DataTableColumn<T>>
  data: T[]
  isLoading?: boolean
  emptyState: ReactNode
}) {
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[rgba(20,55,130,0.08)] bg-white">
        <div className="grid grid-cols-1 divide-y divide-[rgba(20,55,130,0.05)]">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-4">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[rgba(20,55,130,0.08)]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 animate-pulse rounded bg-[rgba(20,55,130,0.08)]" />
                <div className="h-2.5 w-1/5 animate-pulse rounded bg-[rgba(20,55,130,0.06)]" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded-full bg-[rgba(20,55,130,0.08)]" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return <>{emptyState}</>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgba(20,55,130,0.08)] bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] text-[10px] uppercase tracking-[0.14em] text-text-muted">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={['px-4 py-3 font-semibold', column.className ?? ''].join(' ')}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <motion.tr
              key={rowIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(rowIndex, 12) * 0.02 }}
              className="group border-b border-[rgba(20,55,130,0.05)] transition-colors duration-150 last:border-b-0 hover:bg-[rgba(20,55,130,0.025)]"
            >
              {columns.map((column) => (
                <td key={column.key} className={['px-4 py-4 align-top text-text-primary', column.className ?? ''].join(' ')}>
                  {column.render(row)}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
