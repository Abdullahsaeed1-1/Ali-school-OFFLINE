import { useEffect, useState } from 'react'
import { ArrowRightLeft, Plus } from 'lucide-react'
import Button from '../../components/ui/Button'
import { ReassignmentConfirmModal } from '../../components/ui/ReassignmentConfirmModal'
import { useToast } from '../../components/ui/Toast'
import { capacityAdvisorApi, type ClassSubjectGapFix, type GapFixCandidate } from '../../api/capacityAdvisor'
import { getApiErrorMessage } from '../../utils/apiError'

type ReassignCandidate = Extract<GapFixCandidate, { kind: 'reassignment' }>

/**
 * Inline Capacity Advisor fix suggestion for a class's shortfall flag (item
 * 5) — the mirror image of TeacherFillSuggestions: instead of "what could
 * this one under-occupied teacher fill," it answers "who could fill THIS
 * flagged gap," across every under-occupied teacher on the same campus who
 * already teaches the subject. Only fetches once its ProblemFlag popover is
 * actually opened (it's rendered as that popover's children).
 */
export function ClassGapFixSuggestions({
  classId,
  subjects,
}: {
  classId: string
  subjects: Array<{ subjectId: string; subjectName: string }>
}) {
  const { pushToast } = useToast()
  const [gaps, setGaps] = useState<ClassSubjectGapFix[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [reassignTarget, setReassignTarget] = useState<{ gap: ClassSubjectGapFix; candidate: ReassignCandidate } | null>(null)

  // Games is deliberately excluded from this analysis — it has no fixed
  // eligibility on Girls/Boys by design (§7/§17, a separate duty-rotation
  // model, 2 teachers per slot covering every class sharing the ground, not
  // per-class capacity at all). Running it through the same "hire someone
  // or reassign" gap-fix logic would produce a misleading suggestion for a
  // constraint that's already correctly explained on the Warnings page.
  const gapAnalysisSubjects = subjects.filter((s) => s.subjectName !== 'Games')
  const gamesSubjects = subjects.filter((s) => s.subjectName === 'Games')
  const subjectKey = gapAnalysisSubjects.map((s) => s.subjectId).join(',')

  const load = () => {
    if (!gapAnalysisSubjects.length) {
      setLoading(false)
      setGaps([])
      return
    }
    setLoading(true)
    Promise.all(gapAnalysisSubjects.map((s) => capacityAdvisorApi.getClassSubjectGapFix({ classId, subjectId: s.subjectId })))
      // Keep every subject, including ones with zero candidates — those are
      // shown as "beyond software" below (item 5's original version silently
      // dropped them here, so a shortfall subject with no fix never told the
      // admin that plainly; the new Gaps & Suggestions page needs that
      // message explicitly, and the Timetable popup benefits from it too).
      .then((responses) => setGaps(responses.map((r) => r.data.data)))
      .catch(() => setGaps([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, subjectKey])

  const applySafeFill = async (gap: ClassSubjectGapFix, candidate: Extract<GapFixCandidate, { kind: 'safeFill' }>) => {
    setApplying(true)
    try {
      await capacityAdvisorApi.applySafeFill({ teacherId: candidate.teacherId, classId: gap.classId, subjectId: gap.subjectId })
      pushToast({
        kind: 'success',
        title: 'Eligibility added',
        description: `${candidate.teacherName} can now teach ${gap.subjectName} in ${gap.className}. Takes effect next time the timetable is generated.`,
      })
      load()
    } catch (err) {
      pushToast({ kind: 'error', title: 'Could not add this pair', description: getApiErrorMessage(err, 'Please try again.') })
    } finally {
      setApplying(false)
    }
  }

  const confirmReassignment = async () => {
    if (!reassignTarget) return
    const { gap, candidate } = reassignTarget
    setApplying(true)
    try {
      await capacityAdvisorApi.applyReassignment({
        toTeacherId: candidate.toTeacherId,
        fromTeacherId: candidate.fromTeacherId,
        classId: gap.classId,
        subjectId: gap.subjectId,
      })
      pushToast({
        kind: 'success',
        title: 'Reassigned',
        description: `${gap.subjectName} in ${gap.className} moved from ${candidate.fromTeacherName} to ${candidate.toTeacherName}.`,
      })
      setReassignTarget(null)
      load()
    } catch (err) {
      pushToast({ kind: 'error', title: 'Could not reassign this pair', description: getApiErrorMessage(err, 'Please try again.') })
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <p className="text-text-muted">Checking Capacity Advisor…</p>

  if (!gaps.length && !gamesSubjects.length) return null

  return (
    <div className="space-y-2">
      {gamesSubjects.map((s) => (
        <div key={s.subjectId}>
          <p className="mb-1 font-semibold text-text-primary">{s.subjectName}</p>
          <p className="rounded-lg border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-2 text-text-secondary">
            Games has its own duty-rotation model (2 teachers cover the whole ground per slot, shared across every
            class with Games then) — not a hire-or-reassign gap. See the Warnings page's Games duty section for its
            real capacity status.
          </p>
        </div>
      ))}
      {gaps.map((gap) => (
        <div key={`${gap.classId}:${gap.subjectId}`}>
          <p className="mb-1 font-semibold text-text-primary">{gap.subjectName}</p>
          {gap.candidates.length === 0 ? (
            // Phase 3 item 7 — root-cause breakdown: WHY no fix exists, not
            // just that one doesn't. Two distinct causes, told apart by
            // whether any eligible holder exists at all for this exact pair.
            gap.holders.length === 0 ? (
              <p className="rounded-lg border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-2 text-text-secondary">
                <span className="font-medium text-text-primary">No eligible teacher anywhere on this campus.</span>{' '}
                Beyond software — the school needs to either hire someone for {gap.subjectName} or have an existing
                teacher take it on.
              </p>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-text-secondary">
                <p className="font-medium text-amber-800">
                  Capacity exhausted — every eligible teacher is already at or over their weekly target.
                </p>
                <p className="mt-1 text-xs">
                  Reassigning would push them over target instead of fixing this gap, so nothing is offered. Closing
                  this needs either a target increase for one of them or a new hire.
                </p>
                <div className="mt-1.5 space-y-1">
                  {gap.holders.map((h) => (
                    <div key={h.teacherId} className="flex items-center justify-between text-xs">
                      <span className="text-text-primary">{h.teacherName}</span>
                      <span className="tabular-nums text-text-muted">
                        {h.currentPeriods}/{h.targetPeriodsPerWeek}
                        {h.currentPeriods >= h.targetPeriodsPerWeek ? ' — at target' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="space-y-1">
              {gap.candidates.slice(0, 2).map((candidate) => (
                <div
                  key={candidate.kind === 'safeFill' ? candidate.teacherId : `${candidate.toTeacherId}:${candidate.fromTeacherId}`}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-1.5 ${
                    candidate.kind === 'safeFill' ? 'border-[rgba(22,163,74,0.2)] bg-[#F0FDF4]' : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <span className="text-text-primary">
                    {candidate.kind === 'safeFill' ? candidate.teacherName : `${candidate.toTeacherName} (from ${candidate.fromTeacherName})`}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    loading={applying}
                    disabled={applying}
                    onClick={() =>
                      candidate.kind === 'safeFill' ? applySafeFill(gap, candidate) : setReassignTarget({ gap, candidate })
                    }
                  >
                    {candidate.kind === 'safeFill' ? (
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
            </div>
          )}
        </div>
      ))}

      <ReassignmentConfirmModal
        target={
          reassignTarget
            ? {
                className: reassignTarget.gap.className,
                subjectName: reassignTarget.gap.subjectName,
                periodsPerWeek: reassignTarget.gap.periodsPerWeek,
                toTeacherName: reassignTarget.candidate.toTeacherName,
                toTeacherCurrentPeriods: reassignTarget.candidate.toTeacherCurrentPeriods,
                toTeacherTarget: reassignTarget.candidate.toTeacherTarget,
                fromTeacherName: reassignTarget.candidate.fromTeacherName,
                fromTeacherCurrentPeriods: reassignTarget.candidate.fromTeacherCurrentPeriods,
                fromTeacherTarget: reassignTarget.candidate.fromTeacherTarget,
                fromTeacherPairScheduled: reassignTarget.candidate.fromTeacherPairScheduled,
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
