import type { LucideIcon } from 'lucide-react'
import Button from './Button'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-[rgba(20,55,130,0.15)] bg-white p-8 text-center">
      <div className="max-w-sm space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          <p className="text-sm leading-6 text-text-muted">{description}</p>
        </div>
        {action ? (
          <Button onClick={action.onClick} variant="primary" size="md">
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
