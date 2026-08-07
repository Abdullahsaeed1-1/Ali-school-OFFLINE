import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

// Matches the popover's own w-72 / w-56 Tailwind widths below — needed as a
// plain number to compare against the trigger's real on-screen position.
const POPOVER_WIDTH_WITH_CHILDREN = 288
const POPOVER_WIDTH_PLAIN = 224
// Same idea, vertically — a rough ceiling rather than an exact measurement
// (reason text length varies), just enough to decide which DIRECTION to
// grow in. Generous on purpose: better to flip a little early than clip.
const POPOVER_HEIGHT_WITH_CHILDREN = 260
const POPOVER_HEIGHT_PLAIN = 90

/**
 * The "level 2" half of the inline-problem pattern: the caller is
 * responsible for the always-visible "level 1" flag (a red/amber border or
 * background on whatever's wrong) — this is just the small icon that, on
 * click, reveals the specific reason underneath it. Click instead of hover
 * so it works the same on touch devices and doesn't fire accidentally while
 * scanning a dense grid.
 *
 * `children`, when given, renders below the reason as a separated section —
 * used for an inline Capacity Advisor fix suggestion + action button (item
 * 5), so a flagged gap can be resolved without leaving the page. Only
 * mounted while the popover is open, so nothing is fetched until clicked.
 *
 * Rendered through a portal into document.body, positioned with `fixed` +
 * real viewport coordinates — NOT as a normal absolutely-positioned child.
 * Every table on this site (DataTable.tsx) wraps its rows in an
 * `overflow-hidden` card for the rounded corners, which was silently
 * clipping this popover whenever its trigger sat near the table's own
 * bottom edge, regardless of which direction it tried to open — a portal is
 * the only way to escape that ancestor's overflow rule generally, for any
 * table, not just by nudging one row's case.
 */
export function ProblemFlag({
  reason,
  tone = 'error',
  children,
}: {
  reason: string
  tone?: 'error' | 'warning'
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const insideTrigger = triggerRef.current?.contains(target)
      const insidePopover = popoverRef.current?.contains(target)
      if (!insideTrigger && !insidePopover) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popoverWidth = children ? POPOVER_WIDTH_WITH_CHILDREN : POPOVER_WIDTH_PLAIN
    const popoverHeight = children ? POPOVER_HEIGHT_WITH_CHILDREN : POPOVER_HEIGHT_PLAIN
    // 8px breathing room so the popover never sits flush against the
    // viewport edge even in the flipped case.
    const openUpward = rect.bottom + popoverHeight + 8 > window.innerHeight
    const alignRight = rect.left + popoverWidth + 8 > window.innerWidth
    const top = openUpward ? rect.top - popoverHeight - 4 : rect.bottom + 4
    const left = alignRight ? rect.right - popoverWidth : rect.left
    setPosition({
      top: Math.min(Math.max(8, top), window.innerHeight - popoverHeight - 8),
      left: Math.min(Math.max(8, left), window.innerWidth - popoverWidth - 8),
    })
  }, [open, children])

  const color = tone === 'error' ? 'text-brand-maroon' : 'text-amber-600'

  return (
    <div ref={triggerRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((current) => !current)
        }}
        className={`${color} shrink-0`}
        aria-label="Why is this flagged?"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              // stopPropagation so any interactive children (e.g. a Capacity
              // Advisor Add/Review button) never bubble a click up to
              // whatever the caller wrapped this flag in — on the Timetable
              // page that outer element is a clickable grid cell (item 18's
              // manual slot editor), which would otherwise open on top of
              // this popover.
              onClick={(e) => e.stopPropagation()}
              style={{ top: position.top, left: position.left }}
              className={`fixed z-[45] max-h-[70vh] overflow-y-auto rounded-lg border border-[rgba(20,55,130,0.12)] bg-white p-2.5 text-xs leading-snug text-text-primary shadow-lg ${
                children ? 'w-72' : 'w-56'
              }`}
            >
              <p>{reason}</p>
              {children ? <div className="mt-2 border-t border-[rgba(20,55,130,0.08)] pt-2">{children}</div> : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
