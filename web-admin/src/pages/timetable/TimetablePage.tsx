import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Calendar, CheckCircle2, ChevronDown, ChevronUp, Lock, Pencil, Sparkles, Trash2, Unlock } from 'lucide-react'
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
import { classesApi, type ClassDetail, type ClassLockImpact, type ClassSummary } from '../../api/classes'
import { teachersApi, type TeacherSummary } from '../../api/teachers'
import { timetableApi, type GenerateTimetableStats, type TimetableEntry } from '../../api/timetable'
import { getApiErrorCode, getApiErrorMessage } from '../../utils/apiError'
import { getSubjectColor } from '../../utils/subjectColors'
import { periodDayType } from '../../utils/school'
import { ProblemFlag } from '../../components/ui/ProblemFlag'
import { ClassGapFixSuggestions } from './ClassGapFixSuggestions'
import { computeClassSubjectShortfalls } from './classSubjectShortfalls'
import logo from '../../../logo/logo.jpeg'

type Campus = Awaited<ReturnType<typeof campusesApi.getCampuses>>['data']['data'][number]
type CampusPeriod = Awaited<ReturnType<typeof campusesApi.getCampusPeriods>>['data']['data'][number]

const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const

function dayLabel(day: typeof weekdays[number]) {
  return day.slice(0, 3)
}

export default function TimetablePage() {
  const { pushToast } = useToast()
  const navigate = useNavigate()
  // Phase 3 follow-up (2026-08-01) — a real popup right after Generate
  // whenever Games couldn't be fully scheduled, instead of the admin only
  // finding out by separately visiting Warnings. Games is deliberately
  // excluded from every other gap-fix flow in this app (§7/§17 — it's a
  // duty-rotation model with no fixed eligibility, so "add a teacher" or
  // "reassign" never applies) — this popup is purely informational with a
  // link to where the real explanation and numbers already live, not a
  // new suggestion engine.
  const [gamesShortfallPrompt, setGamesShortfallPrompt] = useState<{ totalShortfall: number; classCount: number } | null>(
    null,
  )
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [classes, setClasses] = useState<ClassSummary[]>([])
  const [teachers, setTeachers] = useState<TeacherSummary[]>([])
  const [periods, setPeriods] = useState<CampusPeriod[]>([])
  const [campusId, setCampusId] = useState('')
  const [classId, setClassId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [classDetail, setClassDetail] = useState<ClassDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [gridLoading, setGridLoading] = useState(false)
  const [gridError, setGridError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<GenerateTimetableStats | null>(null)
  const [shortfallsExpanded, setShortfallsExpanded] = useState(false)
  const [lockImpact, setLockImpact] = useState<ClassLockImpact | null>(null)
  const [lockModalOpen, setLockModalOpen] = useState(false)
  const [lockImpactLoading, setLockImpactLoading] = useState(false)
  const [lockActionLoading, setLockActionLoading] = useState(false)

  // Manual single-slot override — edit exactly one (class, day, period)
  // without a full regenerate (§13 stability finding).
  const [editSlot, setEditSlot] = useState<{ day: (typeof weekdays)[number]; periodId: string; periodNumber: number } | null>(null)
  const [editSubjectId, setEditSubjectId] = useState('')
  const [editTeacherId, setEditTeacherId] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editClearing, setEditClearing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editNeedsConfirm, setEditNeedsConfirm] = useState(false)
  // Granular Lock, single-period level (§24) — freezes this exact period
  // from a future regenerate while the rest of its class stays open.
  const [editSlotLocked, setEditSlotLocked] = useState(false)
  const [editLockLoading, setEditLockLoading] = useState(false)

  const loadFilters = () => {
    setLoading(true)
    setLoadError(null)
    Promise.all([
      campusesApi.getCampuses(),
      teachersApi.getTeachers({ limit: 100 }),
      classesApi.getClasses(),
    ])
      .then(([campusesRes, teachersRes, classesRes]) => {
        setCampuses(campusesRes.data.data)
        setTeachers(teachersRes.data.data)
        setClasses(classesRes.data.data)
      })
      .catch((error) => setLoadError(getApiErrorMessage(error, 'Could not load campuses, teachers, and classes.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadFilters()
  }, [])

  // The result banner names the campus it was generated for — if that
  // isn't cleared on campus switch, a stale result from campus A gets
  // redisplayed mislabeled with campus B's name once selectedCampus changes.
  useEffect(() => {
    setLastResult(null)
    setGenerateError(null)
    setShortfallsExpanded(false)
  }, [campusId])

  const selectedCampus = campuses.find((campus) => campus.id === campusId)

  const loadGrid = () => {
    if (!campusId || !classId) {
      setEntries([])
      setPeriods([])
      setClassDetail(null)
      return
    }

    setGridLoading(true)
    setGridError(null)
    Promise.all([
      timetableApi.getTimetable({ campusId, classId, academicYear: '2026-2027' }),
      // No classGroup filter — §3's Mon-Thu/Friday durations differ, so both
      // day-types' periods (including the break) are needed to render the
      // grid correctly for every column, not just Mon-Thu's.
      campusesApi.getCampusPeriods(campusId),
      // Persisted quota data (not the ephemeral last-generate result) so a
      // blank cell can be explained by anyone opening this page fresh, not
      // just right after clicking Generate this session.
      classesApi.getClassDetail(classId),
    ])
      .then(([entriesRes, periodsRes, classDetailRes]) => {
        setEntries(entriesRes.data.data)
        setPeriods(periodsRes.data.data)
        setClassDetail(classDetailRes.data.data)
      })
      .catch((error) => setGridError(getApiErrorMessage(error, 'Could not load this timetable. Please try again.')))
      .finally(() => setGridLoading(false))
  }

  useEffect(() => {
    loadGrid()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId, classId])

  const visibleTeachers = useMemo(
    () => teachers.filter((teacher) => (campusId ? teacher.campusId === campusId : true)),
    [teachers, campusId],
  )

  // Shown in the "Teacher view" dropdown so picking a teacher who doesn't
  // teach the currently-selected class isn't a guessing game — e.g. Junior's
  // KG A/B/C each have a single, different homeroom teacher, and nothing in
  // a bare teacher list hints at which section is theirs.
  const teacherOptionLabel = (teacher: TeacherSummary) => {
    if (teacher.classNames.length === 0) return `${teacher.name} (no classes assigned)`
    const shown = teacher.classNames.slice(0, 3).join(', ')
    const rest = teacher.classNames.length - 3
    return `${teacher.name} — ${shown}${rest > 0 ? ` +${rest} more` : ''}`
  }

  const generate = async () => {
    if (!campusId) return
    setGenerating(true)
    setGenerateError(null)
    setShortfallsExpanded(false)
    try {
      const response = await timetableApi.generateTimetable({ campusId, academicYear: '2026-2027' })
      const { stats, conflicts, durationMs } = response.data
      const campusName = selectedCampus?.name ?? 'This campus'

      // Item 30 D.2 — this page only ever generates one campus at a time
      // (campusId is required above), so a non-empty conflicts array here
      // means THIS campus specifically lost a race against another
      // near-simultaneous Generate request. Nothing was persisted by this
      // call for it — must never be shown as a success, regardless of what
      // `stats` says (it reflects the OTHER, winning request instead).
      if (conflicts.some((c) => c.campusId === campusId)) {
        pushToast({
          kind: 'error',
          title: 'Generate conflicted',
          description: `Another Generate request for ${campusName} ran at the same time and committed first — this request's result was not saved. Please try again.`,
        })
        loadGrid()
        return
      }

      setLastResult(stats)
      loadGrid()

      if (stats.classesCovered === 0 && stats.classesSkipped > 0) {
        pushToast({
          kind: 'error',
          title: 'Nothing to generate',
          description: `${campusName} has no subject quotas seeded yet — see the Warnings page for what's missing.`,
        })
      } else {
        const shortfallCount = stats.classSubjectShortfalls.length + stats.teacherShortfalls.length
        const lockedNote = stats.classesLocked > 0 ? ` ${stats.classesLocked} locked class${stats.classesLocked === 1 ? '' : 'es'} left untouched.` : ''
        pushToast({
          kind: shortfallCount > 0 ? 'error' : 'success',
          title: shortfallCount > 0 ? 'Generated with gaps' : 'Timetable generated',
          description: (shortfallCount > 0
            ? `${stats.assignedEntries} periods assigned, ${stats.unassignedEntries} could not be scheduled (${shortfallCount} gaps) in ${durationMs}ms. See details below.`
            : `Generated ${stats.totalEntries} periods across ${stats.classesCovered} classes, all requirements met, in ${durationMs}ms.`) + lockedNote,
        })

        // 2026-07-31 — the solver already self-reports OPTIMAL vs FEASIBLE
        // (the search proved it found the best possible schedule vs. it hit
        // the time limit first with a valid-but-unproven one) but nothing
        // ever surfaced it, so a run that quietly landed short of optimal
        // looked identical to a fully-optimal one. Called out explicitly so
        // an admin who sees worse numbers than usual has a real explanation
        // and a real next step, instead of it looking unexplained.
        const diag = stats.solverDiagnostics[campusId]
        if (diag && diag.solverStatus !== 'OPTIMAL') {
          pushToast({
            kind: 'error',
            title: `Not proven optimal (${diag.solverStatus})`,
            description: `The solver hit its ${Math.round(diag.solveTimeMs / 1000)}s time limit before it could prove this is the best possible schedule — this run's result is valid but may be worse than a re-run would find. Try Generate again for a chance at a better result.`,
          })
        }

        // A real popup (not a toast — this needs a persistent link, and
        // toasts auto-dismiss in 3s) whenever Games couldn't be fully
        // scheduled this run. Games has no fixed eligibility on Girls/Boys
        // by design (§7/§17, a duty-rotation model) and is deliberately
        // excluded from every hire/reassign suggestion elsewhere in this
        // app — this is purely a "here's the real number, here's where the
        // full explanation and per-class breakdown already live" prompt.
        const gamesShortfalls = stats.classSubjectShortfalls.filter((s) => s.subjectName === 'Games')
        if (gamesShortfalls.length > 0) {
          setGamesShortfallPrompt({
            totalShortfall: gamesShortfalls.reduce((sum, s) => sum + s.shortfall, 0),
            classCount: gamesShortfalls.length,
          })
        }
      }
    } catch (error) {
      setGenerateError(getApiErrorMessage(error, 'Could not generate the timetable. Please try again.'))
    } finally {
      setGenerating(false)
    }
  }

  // Locking (§13) freezes one class out of every future regenerate for its
  // campus — its rows are never deleted or recreated. Only the LOCK
  // direction gets a confirmation step: it's the one that can leave a
  // teacher's load stuck below target with no way to close the gap short of
  // unlocking again, so the admin should see that cost before committing.
  // Unlocking has no such downside, so it's immediate.
  const openLockModal = async () => {
    if (!classId) return
    setLockImpactLoading(true)
    try {
      const response = await classesApi.getLockImpact(classId)
      setLockImpact(response.data.data)
      setLockModalOpen(true)
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not check lock impact', description: getApiErrorMessage(error, 'Please try again.') })
    } finally {
      setLockImpactLoading(false)
    }
  }

  const confirmLock = async () => {
    if (!classId) return
    setLockActionLoading(true)
    try {
      await classesApi.updateClass(classId, { isLocked: true })
      pushToast({ kind: 'success', title: 'Class locked', description: `${selectedClass?.name ?? 'This class'} will be left untouched by future regenerations.` })
      setLockModalOpen(false)
      loadFilters()
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not lock this class', description: getApiErrorMessage(error, 'Please try again.') })
    } finally {
      setLockActionLoading(false)
    }
  }

  const unlock = async () => {
    if (!classId) return
    setLockActionLoading(true)
    try {
      await classesApi.updateClass(classId, { isLocked: false })
      pushToast({ kind: 'success', title: 'Class unlocked', description: `${selectedClass?.name ?? 'This class'} will be regenerated again next time.` })
      loadFilters()
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not unlock this class', description: getApiErrorMessage(error, 'Please try again.') })
    } finally {
      setLockActionLoading(false)
    }
  }

  const openEditSlot = (day: (typeof weekdays)[number], periodId: string, periodNumber: number, currentEntry: TimetableEntry | undefined) => {
    setEditSlot({ day, periodId, periodNumber })
    setEditSubjectId(currentEntry?.subjectId ?? '')
    // Junior's homeroom model (§6b) means an empty slot has exactly one
    // sensible teacher too — pre-fill it the same as a filled one, so the
    // simplified picker below never shows a blank/unset teacher for Junior.
    setEditTeacherId(currentEntry?.teacherId ?? (isJuniorClass ? juniorHomeroomTeacherId ?? '' : ''))
    setEditError(null)
    setEditNeedsConfirm(false)
    setEditSlotLocked(currentEntry?.isLocked ?? false)
  }

  const toggleSlotLock = async () => {
    if (!editSlot || !classId) return
    setEditLockLoading(true)
    try {
      const nextLocked = !editSlotLocked
      await timetableApi.lockSlot({ classId, dayOfWeek: editSlot.day, periodId: editSlot.periodId, isLocked: nextLocked })
      setEditSlotLocked(nextLocked)
      pushToast({
        kind: 'success',
        title: nextLocked ? 'Period locked' : 'Period unlocked',
        description: nextLocked
          ? 'This exact period will survive the next regenerate untouched — the rest of this class stays fully open.'
          : 'This period can be edited or regenerated again.',
      })
      loadGrid()
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not update lock', description: getApiErrorMessage(error, 'Please try again.') })
    } finally {
      setEditLockLoading(false)
    }
  }

  const saveSlot = async () => {
    if (!editSlot || !classId || !editSubjectId || !editTeacherId) return
    setEditSaving(true)
    setEditError(null)
    try {
      const response = await timetableApi.putSlot({
        classId,
        dayOfWeek: editSlot.day,
        periodId: editSlot.periodId,
        subjectId: editSubjectId,
        teacherId: editTeacherId,
        confirmEligibilityOverride: editNeedsConfirm || undefined,
      })
      pushToast({
        kind: 'success',
        title: 'Period updated',
        description: `${response.data.data.subjectName ?? 'This period'} with ${response.data.data.teacherName ?? 'the selected teacher'} saved. No other period was touched.`,
      })
      setEditSlot(null)
      loadGrid()
    } catch (error) {
      const code = getApiErrorCode(error)
      if (code === 'ELIGIBILITY_WARNING') {
        // Soft warning — never applied silently. The same Save button, now
        // relabeled, re-submits with the confirm flag on the next click.
        setEditNeedsConfirm(true)
        setEditError(getApiErrorMessage(error, 'This teacher does not normally teach this subject for this class.'))
      } else {
        // Hard block (teacher busy) or anything else — no override path.
        setEditError(getApiErrorMessage(error, 'Could not save this period. Please try again.'))
      }
    } finally {
      setEditSaving(false)
    }
  }

  const clearSlot = async () => {
    if (!editSlot || !classId) return
    setEditClearing(true)
    try {
      await timetableApi.clearSlot({ classId, dayOfWeek: editSlot.day, periodId: editSlot.periodId })
      pushToast({ kind: 'success', title: 'Period cleared', description: 'This period is now empty. No other period was touched.' })
      setEditSlot(null)
      loadGrid()
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not clear this period', description: getApiErrorMessage(error, 'Please try again.') })
    } finally {
      setEditClearing(false)
    }
  }

  // A teacher can appear as either the primary or the games-duty second
  // teacher on an entry (§17) — match either, same as the backend does when
  // `teacherId` is passed as a query param, so a duty partner's own periods
  // still show up in their "teacher view" schedule.
  const teacherEntries = teacherId
    ? entries.filter((entry) => entry.teacherId === teacherId || entry.secondTeacherId === teacherId)
    : entries

  const selectedTeacher = teachers.find((teacher) => teacher.id === teacherId)
  const selectedClass = classes.find((item) => item.id === classId)
  // True only when the class grid itself loaded real data but the chosen
  // teacher has none of it — distinguishes "wrong teacher for this class"
  // from "this class has no timetable yet at all" (a different, unrelated
  // empty state already covered by the no-timetable-generated message below).
  const teacherClassMismatch = Boolean(teacherId) && entries.length > 0 && teacherEntries.length === 0

  // Per-subject shortfall for the selected class, computed from persisted
  // data (this class's own confirmed quota vs. what's actually scheduled)
  // rather than the last-generate response — so it's available to explain a
  // blank cell even when opening this page fresh, not just right after
  // clicking Generate this session.
  const subjectShortfalls = useMemo(
    () => computeClassSubjectShortfalls(classDetail, entries),
    [classDetail, entries],
  )

  const hasClassShortfall = subjectShortfalls.length > 0
  const shortfallReason = hasClassShortfall
    ? `This class has an unfilled requirement — ${subjectShortfalls
        .map((s) => `${s.subjectName} (${s.scheduled}/${s.required} scheduled)`)
        .join(', ')}. This empty period is very likely part of that gap.`
    : ''

  const teachersById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers])

  // Phase 2 item 4 — Junior's homeroom model (§6b) means one teacher covers
  // every subject for a section, so the general editor's "pick any campus
  // teacher" dropdown is both unnecessary friction and a real mistake risk
  // (that dropdown lists every teacher on the campus, unfiltered by class —
  // an admin could accidentally assign a different section's teacher here,
  // which the backend would only soft-warn about, never block, since it's
  // a real subject that teacher happens to teach elsewhere). Derived from
  // this class's own already-scheduled entries (not name-matching against
  // the campus teacher list) so it reflects who ACTUALLY teaches this
  // section right now. Only ever used when every entry agrees on one
  // teacher — any ambiguity falls back to the normal full picker rather
  // than guessing.
  const isJuniorClass = selectedCampus?.type === 'JUNIOR'
  const juniorHomeroomTeacherId = useMemo(() => {
    if (!isJuniorClass) return undefined
    const teacherIds = new Set(entries.map((e) => e.teacherId).filter((id): id is string => Boolean(id)))
    return teacherIds.size === 1 ? [...teacherIds][0] : undefined
  }, [isJuniorClass, entries])
  const juniorHomeroomTeacherName = juniorHomeroomTeacherId ? teachersById.get(juniorHomeroomTeacherId)?.name : undefined

  // Mon-Thu and Friday periods differ in duration (§3), so each row is
  // matched by periodNumber across both day-types rather than assuming one
  // shared time range — Friday's own (shorter) times show under its column,
  // not Mon-Thu's times relabeled.
  const periodsByDayType = useMemo(() => {
    const map = new Map<'MON_THU' | 'FRIDAY', CampusPeriod[]>()
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

  const periodFor = (periodNumber: number, day: (typeof weekdays)[number]) =>
    (periodsByDayType.get(periodDayType(day)) ?? []).find((p) => p.periodNumber === periodNumber)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-text-primary">Timetable</h2>
        <p className="mt-1 text-sm text-text-muted">View class schedules, teacher schedules, and generate new timetables.</p>
      </div>

      <div className="relative overflow-hidden rounded-[20px] bg-navy-gradient p-10">
        <img
          src={logo}
          alt=""
          aria-hidden
          className="pointer-events-none absolute bottom-4 right-4 h-20 w-20 rounded-full object-cover opacity-[0.05]"
        />
        <div className="relative max-w-xl">
          <h3 className="font-display text-[22px] text-white">Generate Conflict-Free Timetable</h3>
          <p className="mt-2 text-sm text-white/80">Auto-assigns all teachers and subjects — zero conflicts guaranteed.</p>
          <div className="mt-5">
            <Button
              onClick={() => {
                void generate()
              }}
              loading={generating}
              disabled={!campusId || generating}
              variant="gold"
            >
              <Sparkles className="h-4 w-4" /> {generating ? 'Generating...' : 'Generate Timetable'}
            </Button>
            {!campusId ? <p className="mt-2 text-xs text-white/50">Select a campus below first.</p> : null}
          </div>

          {lastResult ? (
            lastResult.classesCovered === 0 && lastResult.classesSkipped > 0 ? (
              <div className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-maroon/20 px-3 py-2 text-sm text-white">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {selectedCampus?.name ?? 'This campus'} has no subject quotas seeded yet — nothing was generated.
                <Link to="/dashboard/warnings" className="underline underline-offset-2 hover:text-gold-cta">
                  See Warnings
                </Link>
              </div>
            ) : (
              <div
                className={`mt-5 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  lastResult.classSubjectShortfalls.length + lastResult.teacherShortfalls.length + lastResult.gamesDutyGaps.length > 0
                    ? 'bg-brand-maroon/20 text-white'
                    : 'bg-[#16A34A]/15 text-[#B4DC78]'
                }`}
              >
                {lastResult.classSubjectShortfalls.length + lastResult.teacherShortfalls.length + lastResult.gamesDutyGaps.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                )}
                {lastResult.totalEntries} periods generated · {lastResult.classesCovered} classes · {lastResult.unassignedEntries} unassigned
              </div>
            )
          ) : null}
          {/* Persists past the toast (2026-07-31) — a run that hit the time
              limit without proving optimality shouldn't become invisible
              the moment the toast auto-dismisses; this stays as long as the
              banner above it does. */}
          {lastResult && campusId && lastResult.solverDiagnostics[campusId]?.solverStatus !== 'OPTIMAL' ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs text-amber-100">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Not proven optimal ({lastResult.solverDiagnostics[campusId]?.solverStatus}) — hit the solver's time
              limit. This result is valid but may be worse than a re-run would find.
            </div>
          ) : null}
        </div>
      </div>

      {generateError ? (
        <ErrorBanner
          message={generateError}
          onRetry={() => {
            void generate()
          }}
        />
      ) : null}

      {lastResult && (lastResult.classSubjectShortfalls.length > 0 || lastResult.teacherShortfalls.length > 0 || lastResult.gamesDutyGaps.length > 0) ? (
        <Card className="p-4">
          <button
            type="button"
            onClick={() => setShortfallsExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-brand-maroon" />
              <h3 className="font-display text-lg text-text-primary">
                {lastResult.classSubjectShortfalls.length + lastResult.teacherShortfalls.length + lastResult.gamesDutyGaps.length} gap
                {lastResult.classSubjectShortfalls.length + lastResult.teacherShortfalls.length + lastResult.gamesDutyGaps.length === 1 ? '' : 's'} in this generation
              </h3>
            </div>
            {shortfallsExpanded ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
          </button>

          {shortfallsExpanded ? (
            <div className="mt-4 space-y-4">
              {lastResult.classSubjectShortfalls.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">
                    Class-subject requirements not fully scheduled
                  </p>
                  <div className="overflow-hidden rounded-xl border border-[rgba(20,55,130,0.08)]">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-[0.08em] text-text-muted">
                        <tr>
                          <th className="px-3 py-2">Class</th>
                          <th className="px-3 py-2">Subject</th>
                          <th className="px-3 py-2 text-right">Required</th>
                          <th className="px-3 py-2 text-right">Scheduled</th>
                          <th className="px-3 py-2 text-right">Short by</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastResult.classSubjectShortfalls.map((gap) => (
                          <tr key={`${gap.classId}-${gap.subjectId}`} className="border-t border-[rgba(20,55,130,0.06)]">
                            <td className="px-3 py-2 font-medium text-text-primary">{gap.className}</td>
                            <td className="px-3 py-2"><SubjectPill name={gap.subjectName} /></td>
                            <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{gap.required}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{gap.scheduled}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-maroon">{gap.shortfall}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {lastResult.teacherShortfalls.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">
                    Teachers below their weekly target
                  </p>
                  <div className="overflow-hidden rounded-xl border border-[rgba(20,55,130,0.08)]">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-[0.08em] text-text-muted">
                        <tr>
                          <th className="px-3 py-2">Teacher</th>
                          <th className="px-3 py-2 text-right">Target</th>
                          <th className="px-3 py-2 text-right">Scheduled</th>
                          <th className="px-3 py-2 text-right">Short by</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastResult.teacherShortfalls.map((gap) => (
                          <tr key={gap.teacherId} className="border-t border-[rgba(20,55,130,0.06)]">
                            <td className="px-3 py-2 font-medium text-text-primary">{gap.teacherName}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{gap.target}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{gap.scheduled}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-maroon">{gap.shortfall}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {lastResult.gamesDutyGaps.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">
                    Games duty short-staffed (fewer than 2 free teachers found for that slot)
                  </p>
                  <div className="overflow-hidden rounded-xl border border-[rgba(20,55,130,0.08)]">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-[0.08em] text-text-muted">
                        <tr>
                          <th className="px-3 py-2">Class</th>
                          <th className="px-3 py-2">Day</th>
                          <th className="px-3 py-2 text-right">Period</th>
                          <th className="px-3 py-2 text-right">Teachers found</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastResult.gamesDutyGaps.map((gap, index) => (
                          <tr key={`${gap.classId}-${gap.day}-${gap.periodNumber}-${index}`} className="border-t border-[rgba(20,55,130,0.06)]">
                            <td className="px-3 py-2 font-medium text-text-primary">{gap.className}</td>
                            <td className="px-3 py-2 text-text-secondary">{gap.day}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{gap.periodNumber}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-maroon">{gap.teachersFound} / {gap.teachersNeeded}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <SelectInput value={campusId} onChange={(e) => { setCampusId(e.target.value); setClassId(''); setTeacherId('') }} disabled={loading}>
            <option value="">Select campus</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </SelectInput>
          <SelectInput
            value={classId}
            onChange={(e) => {
              // The teacher filter only makes sense within the class it was
              // set for — carrying it into a different class silently
              // filters out everyone who doesn't teach there (often
              // everyone, for Junior's one-teacher-per-class model),
              // producing a blank/wrong-looking grid with no explanation.
              setClassId(e.target.value)
              setTeacherId('')
            }}
            disabled={!campusId || loading}
          >
            <option value="">Select class</option>
            {classes
              .filter((item) => !campusId || item.campusId === campusId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.isLocked ? `🔒 ${item.name}` : item.name}
                </option>
              ))}
          </SelectInput>
          <SelectInput value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={!campusId || loading}>
            <option value="">Teacher view</option>
            {visibleTeachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id} title={teacher.classNames.join(', ') || 'No classes assigned'}>
                {teacherOptionLabel(teacher)}
              </option>
            ))}
          </SelectInput>
        </div>

        {selectedClass ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              {selectedClass.isLocked ? (
                <>
                  <Lock className="h-4 w-4 shrink-0 text-brand-navy" />
                  <span>
                    <span className="font-medium text-text-primary">{selectedClass.name}</span> is locked — future
                    regenerations for this campus will leave it untouched.
                  </span>
                </>
              ) : (
                <span>
                  <span className="font-medium text-text-primary">{selectedClass.name}</span> regenerates normally with
                  the rest of its campus.
                </span>
              )}
            </div>
            <Button
              variant={selectedClass.isLocked ? 'ghost' : 'ghost'}
              size="sm"
              loading={selectedClass.isLocked ? lockActionLoading : lockImpactLoading}
              onClick={() => {
                if (selectedClass.isLocked) {
                  void unlock()
                } else {
                  void openLockModal()
                }
              }}
            >
              {selectedClass.isLocked ? (
                <>
                  <Unlock className="h-4 w-4" /> Unlock
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" /> Lock
                </>
              )}
            </Button>
          </div>
        ) : null}
      </Card>

      <Modal
        isOpen={lockModalOpen}
        title={`Lock ${lockImpact?.className ?? 'this class'}?`}
        description="Future regenerations for this campus will skip this class entirely — its schedule stays exactly as-is until you unlock it again."
        confirmLabel="Lock anyway"
        intent={lockImpact && lockImpact.belowTargetCount > 0 ? 'danger' : 'primary'}
        confirmLoading={lockActionLoading}
        onConfirm={confirmLock}
        onClose={() => setLockModalOpen(false)}
      >
        {lockImpact ? (
          lockImpact.belowTargetCount > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-brand-maroon">
                {lockImpact.belowTargetCount} teacher{lockImpact.belowTargetCount === 1 ? '' : 's'} tied to this class{' '}
                {lockImpact.belowTargetCount === 1 ? 'is' : 'are'} currently below their weekly target — locking means
                their load won&apos;t be adjusted by future regenerations unless you unlock this class again.
              </p>
              <div className="space-y-1.5 rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3 text-sm">
                {lockImpact.affectedTeachers.map((t) => (
                  <div key={t.teacherId} className="flex items-center justify-between">
                    <span className={t.belowTarget ? 'font-medium text-brand-maroon' : 'text-text-secondary'}>{t.teacherName}</span>
                    <span className="tabular-nums text-text-secondary">
                      {t.currentPeriods} / {t.targetPeriodsPerWeek}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              Every teacher tied to this class is already at or above their weekly target — locking it won't leave
              anyone under-occupied.
            </p>
          )
        ) : null}
      </Modal>

      <Modal
        isOpen={editSlot !== null}
        title={editSlot ? `${dayLabel(editSlot.day)} · Period ${editSlot.periodNumber} — ${selectedClass?.name ?? ''}` : ''}
        description="Edits exactly this one period — nothing else in the schedule is touched."
        confirmLabel={editNeedsConfirm ? 'Confirm & Save Anyway' : 'Save'}
        intent={editNeedsConfirm ? 'danger' : 'primary'}
        confirmLoading={editSaving}
        onConfirm={saveSlot}
        onClose={() => setEditSlot(null)}
      >
        <div className="space-y-3">
          {editError ? (
            <div
              className={`rounded-lg p-2.5 text-xs ${
                editNeedsConfirm ? 'bg-amber-50 text-amber-800' : 'bg-brand-maroon/10 text-brand-maroon'
              }`}
            >
              {editError}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-2.5">
            <span className="text-xs text-text-secondary">
              {editSlotLocked
                ? 'Locked — survives the next regenerate untouched.'
                : 'Not locked — regenerates normally with the rest of this class.'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={editLockLoading}
              disabled={editLockLoading || (!editSlotLocked && !editSubjectId)}
              onClick={() => void toggleSlotLock()}
            >
              {editSlotLocked ? (
                <>
                  <Unlock className="h-3.5 w-3.5" /> Unlock
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" /> Lock
                </>
              )}
            </Button>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Subject</span>
            <SelectInput
              disabled={editSlotLocked}
              value={editSubjectId}
              onChange={(e) => {
                setEditSubjectId(e.target.value)
                setEditNeedsConfirm(false)
                setEditError(null)
              }}
            >
              <option value="">Select subject</option>
              {classDetail?.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          </label>
          {isJuniorClass && juniorHomeroomTeacherId ? (
            <div className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Teacher</span>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] px-3 py-2 text-sm text-text-secondary">
                <span className="font-medium text-text-primary">{juniorHomeroomTeacherName ?? 'This section’s teacher'}</span>
                <span className="text-xs text-text-muted">this section&apos;s homeroom teacher &mdash; only one is possible</span>
              </div>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Teacher</span>
              <SelectInput
                disabled={editSlotLocked}
                value={editTeacherId}
                onChange={(e) => {
                  setEditTeacherId(e.target.value)
                  setEditNeedsConfirm(false)
                  setEditError(null)
                }}
              >
                <option value="">Select teacher</option>
                {teachers
                  .filter((t) => t.campusId === campusId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </SelectInput>
            </label>
          )}
          <Button
            variant="ghost"
            size="sm"
            loading={editClearing}
            disabled={editClearing || editSlotLocked}
            onClick={() => void clearSlot()}
          >
            <Trash2 className="h-4 w-4" /> Clear this period
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={gamesShortfallPrompt !== null}
        title="Games couldn't be fully scheduled"
        description={
          gamesShortfallPrompt
            ? `${gamesShortfallPrompt.totalShortfall} Games period${gamesShortfallPrompt.totalShortfall === 1 ? '' : 's'} across ${gamesShortfallPrompt.classCount} class${gamesShortfallPrompt.classCount === 1 ? '' : 'es'} could not be placed this run.`
            : undefined
        }
        confirmLabel="View in Warnings"
        cancelLabel="Dismiss"
        intent="primary"
        confirmLoading={false}
        onConfirm={() => {
          setGamesShortfallPrompt(null)
          navigate('/dashboard/warnings')
        }}
        onClose={() => setGamesShortfallPrompt(null)}
      >
        <p className="text-sm text-text-secondary">
          Games doesn&apos;t have one fixed teacher like other subjects — two staff members rotate duty from whoever
          is free that period. When every teacher is already busy with academic periods at that time, there&apos;s
          nobody left to cover Games. Re-running Generate won&apos;t fix this by itself — it&apos;s a staffing
          shortage, not a scheduling mistake. Click &ldquo;View in Warnings&rdquo; below to see exactly which
          classes and periods still need someone assigned.
        </p>
      </Modal>

      {loading ? <LoadingSpinner label="Loading campuses, classes, and teachers..." /> : null}

      {loadError ? <ErrorBanner message={loadError} onRetry={loadFilters} /> : null}

      {gridError ? <ErrorBanner message={gridError} onRetry={loadGrid} /> : null}

      {gridLoading ? <LoadingSpinner label="Loading timetable..." /> : null}

      {campusId && classId && !gridLoading && !gridError && teacherClassMismatch ? (
        <div className="flex items-start gap-3 rounded-2xl border border-brand-maroon/20 bg-brand-maroon/5 p-4 text-sm text-text-primary">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-maroon" />
          <div>
            <p className="font-medium">
              {selectedTeacher?.name ?? 'This teacher'} doesn&apos;t teach {selectedClass?.name ?? 'this class'}.
            </p>
            <p className="mt-1 text-text-secondary">
              {selectedTeacher && selectedTeacher.classNames.length > 0
                ? `They teach: ${selectedTeacher.classNames.join(', ')}.`
                : 'No classes are assigned to them yet.'}{' '}
              Pick one of those, or clear the teacher filter to see {selectedClass?.name ?? 'this class'}&apos;s full schedule.
            </p>
          </div>
        </div>
      ) : null}

      {campusId && classId && !gridLoading && !gridError && !teacherClassMismatch && entries.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[rgba(20,55,130,0.1)] bg-[#F8FAFC] p-4 text-sm text-text-primary">
          <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
          <div>
            <p className="font-medium">No timetable generated yet for {selectedClass?.name ?? 'this class'}.</p>
            <p className="mt-1 text-text-secondary">Click &quot;Generate Timetable&quot; above to create one.</p>
          </div>
        </div>
      ) : null}

      {campusId && classId && !gridLoading && !gridError && !teacherClassMismatch && entries.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[rgba(20,55,130,0.08)] bg-white">
          <div className="grid grid-cols-6 border-b border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] text-center text-[11px] uppercase tracking-[0.14em] text-text-muted">
            <div className="px-3 py-3 text-left">Period</div>
            {weekdays.map((day) => <div key={day} className="px-3 py-3">{dayLabel(day)}</div>)}
          </div>

          {rowPeriodNumbers.map((periodNumber) => {
            const monThuPeriod = periodFor(periodNumber, 'MONDAY')
            const isBreakRow = monThuPeriod?.isBreak ?? false

            if (isBreakRow) {
              return (
                <div
                  key={`break-${periodNumber}`}
                  className="grid grid-cols-6 border-b border-[rgba(20,55,130,0.06)] bg-[#FFFBEB] last:border-b-0"
                >
                  <div className="px-3 py-2 text-sm font-medium text-amber-800">Break</div>
                  {weekdays.map((day) => {
                    const period = periodFor(periodNumber, day)
                    return (
                      <div key={day} className="border-l border-amber-100 px-3 py-2 text-center text-xs text-amber-700">
                        {period ? `${period.startTime} - ${period.endTime}` : '—'}
                      </div>
                    )
                  })}
                </div>
              )
            }

            return (
              <div key={`period-${periodNumber}`} className="grid grid-cols-6 border-b border-[rgba(20,55,130,0.06)] last:border-b-0">
                <div className="px-3 py-4 text-sm text-text-primary">
                  <div className="tabular-nums">{monThuPeriod?.name ?? `Period ${periodNumber}`}</div>
                </div>
                {weekdays.map((day) => {
                  const entry = teacherEntries.find((item) => item.dayOfWeek === day && item.period.periodNumber === periodNumber)
                  const color = entry ? getSubjectColor(entry.subjectName) : null

                  // The TRUE current occupant, regardless of the teacher-view
                  // filter — editing always targets what's actually there,
                  // never the filtered display, so a click can't silently
                  // overwrite a different teacher's period than what's shown.
                  const realEntry = entries.find((item) => item.dayOfWeek === day && item.period.periodNumber === periodNumber)
                  const cellPeriod = periodFor(periodNumber, day)

                  // A period actually covered, but only by a not-yet-hired
                  // placeholder — a real gap in staffing, not a data error,
                  // so it gets its own (amber, not red) flag rather than
                  // looking identical to a normal, fully-covered period.
                  const entryTeachers = entry
                    ? [entry.teacherId ? teachersById.get(entry.teacherId) : undefined, entry.secondTeacherId ? teachersById.get(entry.secondTeacherId) : undefined].filter(
                        (t): t is TeacherSummary => Boolean(t),
                      )
                    : []
                  const isVacantOnly = entryTeachers.length > 0 && entryTeachers.every((t) => t.hiringStatus === 'TO_BE_HIRED')

                  // Manual override (§13) always edits the real, unfiltered
                  // slot — disabled while a teacher-view filter is active to
                  // avoid ambiguity about which underlying entry a click
                  // would touch.
                  const canEdit = !teacherId && Boolean(cellPeriod)

                  return (
                    <div
                      key={day}
                      onClick={canEdit ? () => openEditSlot(day, cellPeriod!.id, periodNumber, realEntry) : undefined}
                      className={`group relative min-h-[86px] border-l border-[rgba(20,55,130,0.06)] px-3 py-3 ${
                        canEdit ? 'cursor-pointer hover:bg-[rgba(20,55,130,0.02)]' : ''
                      }`}
                    >
                      {canEdit ? (
                        <Pencil className="pointer-events-none absolute right-2 top-2 h-3 w-3 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
                      ) : null}
                      {entry ? (
                        <div
                          className={`rounded-lg p-3 ${isVacantOnly ? 'border border-amber-300 bg-amber-50' : 'bg-white'}`}
                          style={isVacantOnly ? undefined : { borderLeft: `3px solid ${color}`, backgroundColor: `${color}0D` }}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-[12px] font-semibold" style={{ color: isVacantOnly ? undefined : (color ?? undefined) }}>
                              {entry.subjectName ?? 'Unassigned'}
                            </p>
                            <div className="flex items-center gap-1">
                              {entry.isLocked ? (
                                <Lock
                                  className="h-3 w-3 shrink-0 text-brand-navy"
                                  aria-label="Locked — survives the next regenerate"
                                />
                              ) : null}
                              {isVacantOnly ? (
                                <ProblemFlag
                                  tone="warning"
                                  reason={`${entryTeachers.map((t) => t.name).join(' & ')} ${entryTeachers.length > 1 ? 'are' : 'is'} a placeholder for a not-yet-hired position — no real teacher is covering this period yet. Once the school hires someone, update this placeholder's record on the Teachers page with their real name and details, then Generate again.`}
                                />
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-1 text-[11px] text-text-secondary">
                            {teacherId
                              ? (() => {
                                  // Games duty (§17): show whichever of the pair
                                  // ISN'T the teacher currently being viewed.
                                  const viewedIsSecond = entry.secondTeacherId === teacherId
                                  const partner = viewedIsSecond ? entry.teacherName : entry.secondTeacherName
                                  return partner ? `${entry.className} (duty with ${partner})` : entry.className
                                })()
                              : entry.secondTeacherName
                                ? `${entry.teacherName ?? 'No teacher'} & ${entry.secondTeacherName}`
                                : entry.teacherName ?? 'No teacher'}
                          </p>
                          <span
                            className="mt-2 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                            style={{ backgroundColor: `${color}1F`, color: color ?? undefined }}
                          >
                            {entry.period.startTime} - {entry.period.endTime}
                          </span>
                        </div>
                      ) : hasClassShortfall ? (
                        <div className="flex h-full items-center justify-between gap-1 rounded-lg border border-dashed border-brand-maroon/40 bg-brand-maroon/5 px-2 text-sm text-brand-maroon">
                          <span>—</span>
                          <ProblemFlag tone="error" reason={shortfallReason}>
                            <ClassGapFixSuggestions
                              classId={classId}
                              subjects={subjectShortfalls.map((s) => ({ subjectId: s.subjectId, subjectName: s.subjectName }))}
                            />
                          </ProblemFlag>
                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[rgba(20,55,130,0.15)] text-sm text-text-muted">—</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ) : !campusId || !classId ? (
        <EmptyState icon={Calendar} title="Choose a campus and class" description="The timetable grid appears after you choose both selectors." />
      ) : null}
    </div>
  )
}
