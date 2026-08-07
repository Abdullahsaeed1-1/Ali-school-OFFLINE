import Button from './Button'

/**
 * Inline, persistent error message for a section of a page (a form, a
 * drawer, a data panel). Unlike a toast, this stays visible until the user
 * retries or the underlying state clears — use it wherever a stale/blank
 * view would otherwise hide the fact that a fetch or action failed.
 */
export function ErrorBanner({
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  message: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-maroon/20 bg-brand-maroon/[0.06] px-3 py-2.5 text-sm text-brand-maroon">
      <span>{message}</span>
      {onRetry ? (
        <Button variant="danger" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
