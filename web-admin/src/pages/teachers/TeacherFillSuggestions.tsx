import { ArrowRightLeft, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { ReassignmentConfirmModal } from '../../components/ui/ReassignmentConfirmModal'
import { SubjectPill } from '../../components/ui/SubjectPill'
import { BeyondSoftwareGuidancePanel } from '../capacityAdvisor/BeyondSoftwareGuidance'
import { useTeacherFillSuggestions, type FillSuggestion } from './useTeacherFillSuggestions'

/**
 * Compact version of the Capacity Advisor, scoped to a single teacher —
 * shown inside the Edit Teacher drawer so a 1-2 period gap can be closed
 * on the spot instead of a separate trip to the full page. Same
 * categorization and same "never silently move anything" rule: a SAFE FILL
 * click applies immediately (pure gain), a REASSIGNMENT click opens the
 * same both-sides confirmation the full page uses before it touches
 * anyone else's eligibility. Both apply directly against the backend the
 * moment they're confirmed — independent of this drawer's own "Update"
 * button below, which only covers the manually-edited fields/pairs.
 */
export function TeacherFillSuggestions({
  teacherId,
  onApplied,
  beyondSoftwareManualAddHref,
}: {
  teacherId: string
  onApplied?: () => void
  // Where "closing this needs a new subject added manually" should point.
  // Defaults to "below" (true when this widget sits directly above the
  // eligibility editor — the Edit Teacher drawer, this component's
  // original home). Pass a route instead when this widget is used
  // somewhere without that editor nearby (e.g. the Gaps & Suggestions
  // page), so the message links to where the action can actually be taken
  // instead of promising something that isn't there (bug found live,
  // 2026-07-28 — see PENDING_QUESTIONS.md).
  beyondSoftwareManualAddHref?: string
}) {
  const { teacher, loading, applying, reassignTarget, setReassignTarget, applySafeFill, confirmReassignment } =
    useTeacherFillSuggestions(teacherId, onApplied)

  if (loading || !teacher) return null // at/above target already — nothing to suggest

  if (teacher.beyondSoftware) {
    return (
      <div className="rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-2.5 text-xs text-text-secondary">
        {teacher.shortfall} period{teacher.shortfall === 1 ? '' : 's'} short of target — beyond software, no existing subject
        matches a real gap.{' '}
        {beyondSoftwareManualAddHref ? (
          <>
            Closing this needs a new subject added to their profile manually.{' '}
            <Link to={beyondSoftwareManualAddHref} className="font-medium text-brand-navy underline">
              Edit this teacher's subjects →
            </Link>
          </>
        ) : (
          'Closing this needs a new subject added manually below.'
        )}
        {teacher.beyondSoftwareGuidance ? <BeyondSoftwareGuidancePanel guidance={teacher.beyondSoftwareGuidance} /> : null}
      </div>
    )
  }

  const suggestions: FillSuggestion[] = [
    ...teacher.safeFills.map((s): FillSuggestion => ({ ...s, kind: 'safeFill' })),
    ...teacher.reassignments.map((s): FillSuggestion => ({ ...s, kind: 'reassignment' })),
  ].slice(0, 2)

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        Capacity Advisor — {teacher.shortfall} short, {suggestions.length} quick option{suggestions.length === 1 ? '' : 's'}{' '}
        <span className="normal-case tracking-normal text-text-muted/80">(applies immediately, separate from Update below)</span>
      </p>
      {suggestions.map((s) => (
        <div
          key={`${s.kind}:${s.classId}:${s.subjectId}`}
          className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-xs ${
            s.kind === 'safeFill' ? 'border-[rgba(22,163,74,0.2)] bg-[#F0FDF4]' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <SubjectPill name={s.subjectName} />
            <span className="text-text-primary">{s.className}</span>
            {s.kind === 'reassignment' ? <span className="text-text-muted">(currently {s.fromTeacherName})</span> : null}
          </div>
          <Button
            size="sm"
            variant="ghost"
            loading={applying}
            disabled={applying}
            onClick={() => (s.kind === 'safeFill' ? applySafeFill(s) : setReassignTarget(s))}
          >
            {s.kind === 'safeFill' ? (
              <>
                <Plus className="h-3.5 w-3.5" /> Add
              </>
            ) : (
              <>
                <ArrowRightLeft className="h-3.5 w-3.5" /> Review
              </>
            )}
          </Button>
        </div>
      ))}

      <ReassignmentConfirmModal
        target={
          reassignTarget
            ? {
                className: reassignTarget.className,
                subjectName: reassignTarget.subjectName,
                periodsPerWeek: reassignTarget.periodsPerWeek,
                toTeacherName: teacher.teacherName,
                toTeacherCurrentPeriods: teacher.currentPeriods,
                toTeacherTarget: teacher.targetPeriodsPerWeek,
                fromTeacherName: reassignTarget.fromTeacherName,
                fromTeacherCurrentPeriods: reassignTarget.fromTeacherCurrentPeriods,
                fromTeacherTarget: reassignTarget.fromTeacherTarget,
                fromTeacherPairScheduled: reassignTarget.fromTeacherPairScheduled,
              }
            : null
        }
        applying={applying}
        onConfirm={confirmReassignment}
        onClose={() => setReassignTarget(null)}
      />
    </div>
  )
}
