import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRightLeft, CheckCircle2, Gauge, Plus, ShieldAlert } from 'lucide-react'
import { Badge, campusBadgeColor } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorBanner } from '../../components/ui/ErrorBanner'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { Modal } from '../../components/ui/Modal'
import { SelectInput } from '../../components/ui/SelectInput'
import { SubjectPill } from '../../components/ui/SubjectPill'
import { useToast } from '../../components/ui/Toast'
import { campusesApi } from '../../api/campuses'
import {
  capacityAdvisorApi,
  type ReassignmentSuggestion,
  type UnderOccupiedTeacher,
} from '../../api/capacityAdvisor'
import { getApiErrorMessage } from '../../utils/apiError'
import { BeyondSoftwareGuidancePanel } from './BeyondSoftwareGuidance'

type Campus = Awaited<ReturnType<typeof campusesApi.getCampuses>>['data']['data'][number]

function AllClear({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[rgba(22,163,74,0.2)] bg-[#F0FDF4] p-3 text-sm text-[#166534]">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      {text}
    </div>
  )
}

export default function CapacityAdvisorPage() {
  const { pushToast } = useToast()
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [campusId, setCampusId] = useState('')
  const [data, setData] = useState<UnderOccupiedTeacher[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applyingKey, setApplyingKey] = useState<string | null>(null)
  const [reassignTarget, setReassignTarget] = useState<{ teacher: UnderOccupiedTeacher; suggestion: ReassignmentSuggestion } | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([capacityAdvisorApi.getAdvisor(), campusesApi.getCampuses()])
      .then(([advisorRes, campusesRes]) => {
        setData(advisorRes.data.data)
        setCampuses(campusesRes.data.data)
      })
      .catch((err) => setError(getApiErrorMessage(err, 'Could not load the capacity advisor. Please try again.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  // Campuses are always kept visually separate everywhere else in this app
  // (Timetable, Teachers, Classes) — a Girls "Miss X" and a Boys "Miss X"
  // should never sit in the same unlabeled list. Filtering is purely
  // client-side: the advisor response already carries each teacher's real
  // campusId, so no backend call or data mutation is involved in adding
  // this — it only changes what's rendered.
  const visibleData = campusId ? (data ?? []).filter((teacher) => teacher.campusId === campusId) : []

  const applySafeFill = async (teacher: UnderOccupiedTeacher, suggestion: ReassignmentSuggestion | UnderOccupiedTeacher['safeFills'][number]) => {
    const key = `safefill:${teacher.teacherId}:${suggestion.classId}:${suggestion.subjectId}`
    setApplyingKey(key)
    try {
      await capacityAdvisorApi.applySafeFill({ teacherId: teacher.teacherId, classId: suggestion.classId, subjectId: suggestion.subjectId })
      pushToast({
        kind: 'success',
        title: 'Eligibility added',
        description: `${teacher.teacherName} is now eligible for ${suggestion.subjectName} in ${suggestion.className}. This takes effect next time the timetable is generated.`,
      })
      load()
    } catch (err) {
      pushToast({ kind: 'error', title: 'Could not add this pair', description: getApiErrorMessage(err, 'Please try again.') })
    } finally {
      setApplyingKey(null)
    }
  }

  const confirmReassignment = async () => {
    if (!reassignTarget) return
    const { teacher, suggestion } = reassignTarget
    const key = `reassign:${teacher.teacherId}:${suggestion.classId}:${suggestion.subjectId}`
    setApplyingKey(key)
    try {
      await capacityAdvisorApi.applyReassignment({
        toTeacherId: teacher.teacherId,
        fromTeacherId: suggestion.fromTeacherId,
        classId: suggestion.classId,
        subjectId: suggestion.subjectId,
      })
      pushToast({
        kind: 'success',
        title: 'Reassigned',
        description: `${suggestion.subjectName} in ${suggestion.className} moved from ${suggestion.fromTeacherName} to ${teacher.teacherName}. Takes effect next time the timetable is generated.`,
      })
      setReassignTarget(null)
      load()
    } catch (err) {
      pushToast({ kind: 'error', title: 'Could not reassign this pair', description: getApiErrorMessage(err, 'Please try again.') })
    } finally {
      setApplyingKey(null)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorBanner message={error} onRetry={load} />
  if (!data) return null

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="font-display text-2xl text-text-primary">Capacity Advisor</h2>
        <p className="mt-1 text-sm text-text-muted">
          Warnings reports problems — this suggests safe fixes for under-occupied teachers, matched against their
          existing subjects only. Nothing here is applied automatically.
        </p>
      </motion.div>

      <Card className="p-4">
        <SelectInput value={campusId} onChange={(e) => setCampusId(e.target.value)} disabled={loading}>
          <option value="">Select campus</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </SelectInput>
      </Card>

      {!campusId ? (
        <EmptyState
          icon={Gauge}
          title="Choose a campus"
          description="Under-occupied teachers and their suggestions appear here once you pick a campus — Junior, Girls, and Boys are always shown separately, never mixed."
        />
      ) : visibleData.length === 0 ? (
        <Card className="p-4">
          <AllClear text="Every teacher on this campus is at or above their weekly target — nothing for this page to suggest." />
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleData.map((teacher) => (
            <Card key={teacher.teacherId} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(20,55,130,0.08)] pb-3">
                <div className="flex items-center gap-2">
                  <Gauge className="h-5 w-5 text-brand-maroon" />
                  <span className="font-display text-lg text-text-primary">{teacher.teacherName}</span>
                  <Badge color={campusBadgeColor(teacher.campusName)} label={teacher.campusName.replace(' Campus', '')} />
                </div>
                <div className="text-right">
                  <span className="tabular-nums text-sm font-semibold text-brand-maroon">
                    {teacher.currentPeriods} / {teacher.targetPeriodsPerWeek}
                  </span>
                  <p className="text-xs text-text-muted">{teacher.shortfall} period{teacher.shortfall === 1 ? '' : 's'} short</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs uppercase tracking-[0.1em] text-text-muted">Current subjects:</span>
                {teacher.subjectNames.map((name) => <SubjectPill key={name} name={name} />)}
                {!teacher.subjectNames.length ? <span className="text-xs text-text-muted">None yet.</span> : null}
              </div>

              {teacher.beyondSoftware ? (
                <div className="mt-4 rounded-xl border border-[rgba(20,55,130,0.1)] bg-[#F8FAFC] p-3 text-sm text-text-secondary">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                    <span>
                      Beyond software — no class-subject gap matches any subject {teacher.teacherName} already
                      teaches. Closing this gap needs a human staffing decision (adding a new subject to their
                      profile), not a suggestion this page can make.
                    </span>
                  </div>
                  {teacher.beyondSoftwareGuidance ? (
                    <BeyondSoftwareGuidancePanel guidance={teacher.beyondSoftwareGuidance} />
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {teacher.safeFills.length > 0 ? (
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#166534]">
                        <Plus className="h-3.5 w-3.5" /> Safe fill — pure gain, affects no one else
                      </p>
                      <div className="space-y-2">
                        {teacher.safeFills.map((s) => {
                          const key = `safefill:${teacher.teacherId}:${s.classId}:${s.subjectId}`
                          const projected = Math.min(teacher.targetPeriodsPerWeek, teacher.currentPeriods + s.periodsPerWeek)
                          return (
                            <div key={key} className="rounded-xl border border-[rgba(22,163,74,0.2)] bg-[#F0FDF4] p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-sm">
                                  <SubjectPill name={s.subjectName} />
                                  <span className="text-text-primary">{s.className}</span>
                                  <span className="text-text-muted">({s.periodsPerWeek}/week, currently no eligible teacher)</span>
                                </div>
                                <Button size="sm" loading={applyingKey === key} disabled={applyingKey !== null && applyingKey !== key} onClick={() => applySafeFill(teacher, s)}>
                                  <Plus className="h-4 w-4" /> Confirm &amp; Add
                                </Button>
                              </div>
                              <p className="mt-2 text-xs text-[#166534]">
                                This will take {teacher.teacherName} from {teacher.currentPeriods}/{teacher.targetPeriodsPerWeek} to up to{' '}
                                {projected}/{teacher.targetPeriodsPerWeek} once regenerated. No other teacher is affected.
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {teacher.reassignments.length > 0 ? (
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-amber-700">
                        <ArrowRightLeft className="h-3.5 w-3.5" /> Reassignment — moves this pair from another under-occupied teacher
                      </p>
                      <div className="space-y-2">
                        {teacher.reassignments.map((s) => {
                          const key = `reassign:${teacher.teacherId}:${s.classId}:${s.subjectId}`
                          return (
                            <div key={key} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-sm">
                                  <SubjectPill name={s.subjectName} />
                                  <span className="text-text-primary">{s.className}</span>
                                  <span className="text-text-muted">
                                    (currently {s.fromTeacherName}, {s.fromTeacherCurrentPeriods}/{s.fromTeacherTarget})
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  loading={applyingKey === key}
                                  disabled={applyingKey !== null && applyingKey !== key}
                                  onClick={() => setReassignTarget({ teacher, suggestion: s })}
                                >
                                  <ArrowRightLeft className="h-4 w-4" /> Review &amp; Confirm
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={reassignTarget !== null}
        title={reassignTarget ? `Reassign ${reassignTarget.suggestion.subjectName} in ${reassignTarget.suggestion.className}?` : ''}
        description="This moves the eligibility pair from the current holder to this teacher — not an addition, a real move."
        confirmLabel="Confirm & Add"
        intent="danger"
        confirmLoading={applyingKey !== null}
        onConfirm={confirmReassignment}
        onClose={() => setReassignTarget(null)}
      >
        {reassignTarget ? (
          <div className="space-y-2 text-sm">
            <div className="rounded-xl border border-[rgba(22,163,74,0.2)] bg-[#F0FDF4] p-3">
              <p className="font-medium text-[#166534]">{reassignTarget.teacher.teacherName} (gains)</p>
              <p className="mt-1 text-text-secondary">
                {reassignTarget.teacher.currentPeriods}/{reassignTarget.teacher.targetPeriodsPerWeek} → up to{' '}
                {Math.min(
                  reassignTarget.teacher.targetPeriodsPerWeek,
                  reassignTarget.teacher.currentPeriods + reassignTarget.suggestion.periodsPerWeek,
                )}
                /{reassignTarget.teacher.targetPeriodsPerWeek} once regenerated.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="font-medium text-amber-800">{reassignTarget.suggestion.fromTeacherName} (loses)</p>
              <p className="mt-1 text-text-secondary">
                {reassignTarget.suggestion.fromTeacherCurrentPeriods}/{reassignTarget.suggestion.fromTeacherTarget} → down to{' '}
                {reassignTarget.suggestion.fromTeacherCurrentPeriods - reassignTarget.suggestion.fromTeacherPairScheduled}/
                {reassignTarget.suggestion.fromTeacherTarget}, losing the {reassignTarget.suggestion.fromTeacherPairScheduled} period
                {reassignTarget.suggestion.fromTeacherPairScheduled === 1 ? '' : 's'}/week they're currently actually teaching this pair
                (already below target — this makes their gap {reassignTarget.suggestion.fromTeacherPairScheduled > 0 ? 'wider' : 'no worse'}).
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
