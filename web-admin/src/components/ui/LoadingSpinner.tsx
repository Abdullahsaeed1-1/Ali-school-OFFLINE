import { Loader2 } from 'lucide-react'

export function LoadingSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <Loader2 className="h-4 w-4 animate-spin text-brand-navy" />
      <span>{label}</span>
    </div>
  )
}
