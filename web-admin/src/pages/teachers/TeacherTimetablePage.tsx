import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRightLeft, Calendar, Plus } from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorBanner } from '../../components/ui/ErrorBanner'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ReassignmentConfirmModal } from '../../components/ui/ReassignmentConfirmModal'
import { SelectInput } from '../../components/ui/SelectInput'
import { useToast } from '../../components/ui/Toast'
import { BeyondSoftwareGuidancePanel } from '../capacityAdvisor/BeyondSoftwareGuidance'
import { campusesApi, type Period } from '../../api/campuses'
import { teachersApi, type TeacherDetail, type TeacherSummary } from '../../api/teachers'
import { timetableApi, type TimetableEntry } from '../../api/timetable'
import { getApiErrorMessage } from '../../utils/apiError'
import { TeacherWeeklyGrid } from './TeacherWeeklyGrid'
import { useTeacherFillSuggestions, type FillSuggestion } from './useTeacherFillSuggestions'

const ACADEMIC_YEAR = '2026-2027'

type Campus = Awaited<ReturnType<typeof campusesApi.getCampuses>>['data']['data'][number]

/**
 * Browsable weekly schedule for any teacher — a pure read/view of the
 * TimetableEntry rows already written by the last generate. No mutation of
 * any kind lives here (that's Edit Teacher / the Capacity Advisor); this
 * page only ever fetches and displays.
 */
export default function TeacherTimetablePage() {
  const { teacherId: teacherIdFromRoute } = useParams<{ teacherId?: string }>()
  const navigate = useNavigate()
  const { pushToast } = useToast()

  const [campuses, setCampuses] = useState<Campus[]>([])
  const [teachers, setTeachers] = useState<TeacherSummary[]>([])
  const [campusId, setCampusId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [loadingFilters, setLoadingFilters] = useState(true)
  const [filterError, setFilterError] = useState<string | null>(null)

  const [teacher, setTeacher] = useState<TeacherDetail | null>(null)
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [gridLoading, setGridLoading] = useState(false)
  const [gridError, setGridError] = useState<string | null>(null)

  useEffect(() => {
    setLoadingFilters(true)
    Promise.all([campusesApi.getCampuses(), teachersApi.getTeachers({ limit: 100 })])
      .then(([campusesRes, teachersRes]) => {
        setCampuses(campusesRes.data.data)
        setTeachers(teachersRes.data.data)
        // Deep-linked from a Teachers-list row — pre-select that teacher
        // (and their campus) once the lists are in, instead of landing on
        // an empty "choose a campus" prompt.
        if (teacherIdFromRoute) {
          const match = teachersRes.data.data.find((t) => t.id === teacherIdFromRoute)
          if (match) {
            setCampusId(match.campusId)
            setTeacherId(match.id)
          }
        }
      })
      .catch((err) => setFilterError(getApiErrorMessage(err, 'Could not load campuses and teachers.')))
      .finally(() => setLoadingFilters(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!teacherId) {
      setTeacher(null)
      setEntries([])
      setPeriods([])
      return
    }
    setGridLoading(true)
    setGridError(null)
    teachersApi
      .getTeacher(teacherId)
      .then(async (teacherRes) => {
        setTeacher(teacherRes.data.data)
        const [timetableRes, periodsRes] = await Promise.all([
          timetableApi.getTimetable({ teacherId, academicYear: ACADEMIC_YEAR }),
          campusesApi.getCampusPeriods(teacherRes.data.data.campusId),
        ])
        setEntries(timetableRes.data.data)
        setPeriods(periodsRes.data.data)
      })
      .catch((err) => setGridError(getApiErrorMessage(err, 'Could not load this teacher’s timetable.')))
      .finally(() => setGridLoading(false))
  }, [teacherId])

  // Phase 3 item 5 — the one mutating action this otherwise-read-only page
  // exposes: locking/unlocking a single already-scheduled period directly
  // from here, instead of requiring a trip to the Timetable page to find
  // the right class/day/period manually. Reuses the exact same
  // single-period-lock endpoint (`timetableApi.lockSlot`) TimetablePage.tsx's
  // manual editor already uses — no separate lock logic.
  const [lockLoadingEntryId, setLockLoadingEntryId] = useState<string | null>(null)
  const toggleEntryLock = async (entry: TimetableEntry) => {
    setLockLoadingEntryId(entry.id)
    try {
      const nextLocked = !entry.isLocked
      await timetableApi.lockSlot({
        classId: entry.classId,
        dayOfWeek: entry.dayOfWeek,
        periodId: entry.period.id,
        isLocked: nextLocked,
      })
      pushToast({
        kind: 'success',
        title: nextLocked ? 'Period locked' : 'Period unlocked',
        description: nextLocked
          ? `${entry.className}'s ${entry.subjectName ?? 'period'} on ${entry.dayOfWeek.charAt(0)}${entry.dayOfWeek.slice(1).toLowerCase()} will survive the next regenerate untouched.`
          : 'This period can be regenerated again.',
      })
      const refreshed = await timetableApi.getTimetable({ teacherId, academicYear: ACADEMIC_YEAR })
      setEntries(refreshed.data.data)
    } catch (err) {
      pushToast({ kind: 'error', title: 'Could not update lock', description: getApiErrorMessage(err, 'Please try again.') })
    } finally {
      setLockLoadingEntryId(null)
    }
  }

  const visibleTeachers = teachers.filter((t) => !campusId || t.campusId === campusId)

  // Same Capacity Advisor fix-suggestion idea as the Timetable page's
  // shortfall flags (item 5), scoped to this one teacher — surfaced as a
  // hover tooltip on their own blank periods below, so a genuine gap can be
  // closed without leaving this page. teacherId is stable while blank when
  // no teacher is selected, so the hook's fetch is simply a no-op then.
  const fillSuggestions = useTeacherFillSuggestions(teacherId)
  const {
    teacher: advisorTeacher,
    loading: advisorLoading,
    applying: advisorApplying,
    reassignTarget,
    setReassignTarget,
    applySafeFill,
    confirmReassignment,
  } = fillSuggestions

  const blankCellHint =
    !advisorLoading && advisorTeacher
      ? advisorTeacher.beyondSoftware
        ? (
            <div>
              <p className="text-text-secondary">
                {advisorTeacher.shortfall} period{advisorTeacher.shortfall === 1 ? '' : 's'} short of target — beyond
                software, no existing subject matches a real gap here.
              </p>
              {/* Was plain text only — the same "why, and what's worth
                  looking at" guidance already exists (item 26) and is shown
                  for this exact same beyond-software case in the Edit
                  Teacher drawer and Gaps & Suggestions, just never plugged
                  in here. Reused directly, not reimplemented. */}
              {advisorTeacher.beyondSoftwareGuidance ? (
                <BeyondSoftwareGuidancePanel guidance={advisorTeacher.beyondSoftwareGuidance} />
              ) : null}
            </div>
          )
        : (
            <div className="space-y-1.5">
              <p className="font-medium text-text-primary">
                {advisorTeacher.shortfall} short of target — Capacity Advisor suggestion{advisorTeacher.safeFills.length + advisorTeacher.reassignments.length === 1 ? '' : 's'}:
              </p>
              {(
                [
                  ...advisorTeacher.safeFills.map((s): FillSuggestion => ({ ...s, kind: 'safeFill' })),
                  ...advisorTeacher.reassignments.map((s): FillSuggestion => ({ ...s, kind: 'reassignment' })),
                ].slice(0, 2)
              ).map((s) => (
                <div
                  key={`${s.kind}:${s.classId}:${s.subjectId}`}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-1.5 ${
                    s.kind === 'safeFill' ? 'border-[rgba(22,163,74,0.2)] bg-[#F0FDF4]' : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <span className="text-text-primary">
                    {s.subjectName} in {s.className}
                    {s.kind === 'reassignment' ? ` (from ${s.fromTeacherName})` : ''}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    loading={advisorApplying}
                    disabled={advisorApplying}
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
            </div>
          )
      : undefined

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" onClick={() => navigate('/dashboard/teachers')}>
          <ArrowLeft className="h-4 w-4" /> Back to Teachers
        </Button>
        <h2 className="mt-2 font-display text-2xl text-text-primary">Teacher Timetable</h2>
        <p className="mt-1 text-sm text-text-muted">Browse any teacher's aggregated weekly schedule directly — a read-only view.</p>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <SelectInput
            value={campusId}
            onChange={(e) => {
              setCampusId(e.target.value)
              setTeacherId('')
              // Deep-link URL no longer matches the newly-picked campus —
              // drop back to the campus-agnostic route so the URL stays honest.
              if (teacherIdFromRoute) navigate('/dashboard/teachers/timetable')
            }}
            disabled={loadingFilters}
          >
            <option value="">Select campus</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value)
              if (teacherIdFromRoute) navigate('/dashboard/teachers/timetable')
            }}
            disabled={!campusId || loadingFilters}
          >
            <option value="">Select teacher</option>
            {visibleTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectInput>
        </div>
      </Card>

      {loadingFilters ? <LoadingSpinner label="Loading campuses and teachers..." /> : null}
      {filterError ? <ErrorBanner message={filterError} /> : null}
      {gridError ? <ErrorBanner message={gridError} /> : null}
      {gridLoading ? <LoadingSpinner label="Loading timetable..." /> : null}

      {!campusId || !teacherId ? (
        !loadingFilters && !filterError ? (
          <EmptyState icon={Calendar} title="Choose a campus and teacher" description="Their weekly schedule appears here once both are selected." />
        ) : null
      ) : teacher && !gridLoading && !gridError ? (
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg text-text-primary">{teacher.name}</h3>
              <p className="text-sm text-text-muted">
                {teacher.campusName} &middot; {ACADEMIC_YEAR} &middot; {teacher.currentPeriods} / {teacher.targetPeriodsPerWeek} periods/week
              </p>
            </div>
          </div>
          <TeacherWeeklyGrid
            teacherId={teacher.id}
            entries={entries}
            periods={periods}
            blankCellHint={blankCellHint}
            onToggleLock={toggleEntryLock}
            lockLoadingEntryId={lockLoadingEntryId}
          />
        </Card>
      ) : null}

      <ReassignmentConfirmModal
        target={
          reassignTarget && advisorTeacher
            ? {
                className: reassignTarget.className,
                subjectName: reassignTarget.subjectName,
                periodsPerWeek: reassignTarget.periodsPerWeek,
                toTeacherName: advisorTeacher.teacherName,
                toTeacherCurrentPeriods: advisorTeacher.currentPeriods,
                toTeacherTarget: advisorTeacher.targetPeriodsPerWeek,
                fromTeacherName: reassignTarget.fromTeacherName,
                fromTeacherCurrentPeriods: reassignTarget.fromTeacherCurrentPeriods,
                fromTeacherTarget: reassignTarget.fromTeacherTarget,
                fromTeacherPairScheduled: reassignTarget.fromTeacherPairScheduled,
              }
            : null
        }
        applying={advisorApplying}
        onConfirm={confirmReassignment}
        onClose={() => setReassignTarget(null)}
      />
    </div>
  )
}
