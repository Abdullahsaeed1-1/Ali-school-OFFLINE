import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Lock, Unlock } from 'lucide-react'
import type { Period } from '../../api/campuses'
import type { TimetableEntry } from '../../api/timetable'
import { periodDayType } from '../../utils/school'

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const

/**
 * The period/day grid table shared by the printable sheet and the
 * browsable Teacher Timetable page — a pure read/view of whatever
 * TimetableEntry rows are passed in, no mutation of any kind.
 *
 * `blankCellHint`, when given, renders as a hover tooltip over every blank
 * (non-break) cell — the same Capacity Advisor fix-suggestion idea used on
 * the Timetable page's shortfall flags (item 5), applied here to a
 * teacher's own free periods. Left undefined by the printable sheet, which
 * has no use for a hover-triggered interactive tooltip on paper. Uses
 * CSS-only hover (not click/JS state) so the shared confirmation modal it
 * may open (rendered once by the caller, not per cell) is never at risk of
 * being unmounted by the mouse moving off the trigger cell mid-interaction.
 *
 * `onToggleLock`, when given, adds the one mutating action this
 * otherwise-read-only page exposes (Phase 3 item 5): a lock/unlock button on
 * each filled period, reusing the exact same single-period-lock endpoint
 * TimetablePage.tsx's manual editor already uses (timetableApi.lockSlot)
 * rather than a second implementation -- this component only renders the
 * button and reports which entry was clicked; the caller owns the actual API
 * call. Left undefined by the printable sheet, which stays pure display.
 */
export function TeacherWeeklyGrid({
  teacherId,
  entries,
  periods,
  blankCellHint,
  onToggleLock,
  lockLoadingEntryId,
}: {
  teacherId: string
  entries: TimetableEntry[]
  periods: Period[]
  blankCellHint?: ReactNode
  onToggleLock?: (entry: TimetableEntry) => void
  lockLoadingEntryId?: string | null
}) {
  const periodsByDayType = useMemo(() => {
    const map = new Map<'MON_THU' | 'FRIDAY', Period[]>()
    for (const period of periods) {
      const key = period.classGroup === 'FRIDAY' ? 'FRIDAY' : 'MON_THU'
      const rows = map.get(key) ?? []
      rows.push(period)
      map.set(key, rows)
    }
    return map
  }, [periods])

  const rowPeriodNumbers = useMemo(() => {
    const numbers = new Set<number>()
    for (const period of periods) numbers.add(period.periodNumber)
    return [...numbers].sort((a, b) => a - b)
  }, [periods])

  const periodFor = (periodNumber: number, day: (typeof WEEKDAYS)[number]) =>
    (periodsByDayType.get(periodDayType(day)) ?? []).find((p) => p.periodNumber === periodNumber)

  const cell = (periodNumber: number, day: (typeof WEEKDAYS)[number]) =>
    entries.find((e) => e.period.periodNumber === periodNumber && e.dayOfWeek === day)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-[rgba(20,55,130,0.15)] bg-[#F8FAFC] px-3 py-2 text-left">Period</th>
            {WEEKDAYS.map((day) => (
              <th key={day} className="border border-[rgba(20,55,130,0.15)] bg-[#F8FAFC] px-3 py-2 text-left">
                {day.charAt(0) + day.slice(1).toLowerCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowPeriodNumbers.map((periodNumber) => {
            const monThuPeriod = periodFor(periodNumber, 'MONDAY')
            const isBreakRow = monThuPeriod?.isBreak ?? false

            if (isBreakRow) {
              return (
                <tr key={`break-${periodNumber}`} className="bg-amber-50">
                  <td className="border border-amber-100 px-3 py-2 font-medium text-amber-800">Break</td>
                  {WEEKDAYS.map((day) => {
                    const period = periodFor(periodNumber, day)
                    return (
                      <td key={day} className="border border-amber-100 px-3 py-2 text-center text-xs text-amber-700">
                        {period ? `${period.startTime} - ${period.endTime}` : '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            }

            return (
              <tr key={`period-${periodNumber}`}>
                <td className="border border-[rgba(20,55,130,0.1)] px-3 py-2 font-medium text-text-secondary">
                  {monThuPeriod?.name ?? `Period ${periodNumber}`}
                </td>
                {WEEKDAYS.map((day) => {
                  const entry = cell(periodNumber, day)
                  return (
                    <td key={day} className="group/cell relative border border-[rgba(20,55,130,0.1)] px-3 py-2">
                      {entry ? (
                        <div>
                          <div className="flex items-start justify-between gap-1">
                            <p className="font-medium text-text-primary">{entry.subjectName ?? '—'}</p>
                            {entry.isLocked ? (
                              <Lock className="mt-0.5 h-3 w-3 shrink-0 text-brand-navy" aria-label="Locked — survives the next regenerate" />
                            ) : null}
                          </div>
                          <p className="text-xs text-text-muted">
                            {entry.className}
                            {/* Games duty (§17): show whichever of the pair isn't this teacher. */}
                            {entry.secondTeacherName
                              ? ` (duty with ${entry.secondTeacherId === teacherId ? entry.teacherName : entry.secondTeacherName})`
                              : ''}
                          </p>
                          {onToggleLock ? (
                            <button
                              type="button"
                              onClick={() => onToggleLock(entry)}
                              disabled={lockLoadingEntryId === entry.id}
                              className="mt-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-text-muted opacity-0 transition-opacity duration-150 hover:bg-brand-navy/10 hover:text-brand-navy group-hover/cell:opacity-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {lockLoadingEntryId === entry.id ? (
                                '...'
                              ) : entry.isLocked ? (
                                <>
                                  <Unlock className="h-3 w-3" /> Unlock
                                </>
                              ) : (
                                <>
                                  <Lock className="h-3 w-3" /> Lock
                                </>
                              )}
                            </button>
                          ) : null}
                        </div>
                      ) : blankCellHint ? (
                        <div className="group relative inline-block">
                          <span className="cursor-help text-text-muted underline decoration-dotted decoration-text-muted/50 underline-offset-4">
                            —
                          </span>
                          <div className="invisible absolute left-1/2 top-full z-20 mt-1 w-72 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
                            <div className="rounded-lg border border-[rgba(20,55,130,0.12)] bg-white p-2.5 text-xs leading-snug text-text-primary shadow-lg">
                              {blankCellHint}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {!rowPeriodNumbers.length ? (
            <tr>
              <td colSpan={WEEKDAYS.length + 1} className="border border-[rgba(20,55,130,0.1)] px-3 py-6 text-center text-text-muted">
                No period structure found for this campus.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {rowPeriodNumbers.length && !entries.length ? (
        <p className="mt-3 text-sm text-text-muted">No timetable entries found — generate a timetable for this teacher's campus first.</p>
      ) : null}
    </div>
  )
}
