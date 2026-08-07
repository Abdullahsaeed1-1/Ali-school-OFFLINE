/** A colored dot + label — used for teacher status and active/inactive state. */
export function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

export function teacherStatusDot(status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE') {
  if (status === 'ACTIVE') return { color: '#16A34A', label: 'Active' }
  if (status === 'ON_LEAVE') return { color: '#D97706', label: 'On Leave' }
  return { color: '#94A3B8', label: 'Inactive' }
}
