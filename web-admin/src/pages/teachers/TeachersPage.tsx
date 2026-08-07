import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Eye, Loader2, Lock, Pencil, Printer, Plus, Trash2, Unlock, Users, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, campusBadgeColor } from '../../components/ui/Badge'
import { Avatar } from '../../components/ui/Avatar'
import { StatusDot, teacherStatusDot } from '../../components/ui/StatusDot'
import { SubjectPill } from '../../components/ui/SubjectPill'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { Drawer } from '../../components/ui/Drawer'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorBanner } from '../../components/ui/ErrorBanner'
import { Modal } from '../../components/ui/Modal'
import { ProblemFlag } from '../../components/ui/ProblemFlag'
import { SearchInput } from '../../components/ui/SearchInput'
import { SelectInput } from '../../components/ui/SelectInput'
import { useToast } from '../../components/ui/Toast'
import { campusesApi } from '../../api/campuses'
import { classesApi } from '../../api/classes'
import { subjectsApi } from '../../api/subjects'
import { timetableApi, type TimetableEntry } from '../../api/timetable'
import {
  teachersApi,
  type TeacherDetail,
  type TeacherEligibilityInput,
  type TeacherReallocationRisk,
  type TeacherSummary,
} from '../../api/teachers'
import { getApiErrorCode, getApiErrorMessage } from '../../utils/apiError'
import { MobileAppAccessSection } from './MobileAppAccessSection'
import { TeacherFillSuggestions } from './TeacherFillSuggestions'

type Campus = Awaited<ReturnType<typeof campusesApi.getCampuses>>['data']['data'][number]
type Subject = Awaited<ReturnType<typeof subjectsApi.getSubjects>>['data']['data'][number]
type ClassSummary = Awaited<ReturnType<typeof classesApi.getClasses>>['data']['data'][number]

// Fixed display order — matches ClassesPage, never alphabetical, so
// campuses don't reorder between renders as filters change.
const CAMPUS_DISPLAY_ORDER = ['Junior Campus', 'Girls Campus', 'Boys Campus']

/** Groups teachers by campus, in a fixed Junior/Girls/Boys order — used so
 * e.g. Girls "Miss TBH" and Junior "Miss TBH" (same name, different real
 * vacancies) never sit in the same visual list with only a small badge
 * distinguishing them (§13, same reasoning as ClassesPage's grouping). */
function groupByCampus(list: TeacherSummary[]): Array<[string, TeacherSummary[]]> {
  const groups = new Map<string, TeacherSummary[]>()
  for (const t of list) {
    const existing = groups.get(t.campusName) ?? []
    existing.push(t)
    groups.set(t.campusName, existing)
  }
  const ordered = CAMPUS_DISPLAY_ORDER.filter((name) => groups.has(name)).map(
    (name) => [name, groups.get(name)!] as [string, TeacherSummary[]],
  )
  for (const [name, items] of groups) {
    if (!CAMPUS_DISPLAY_ORDER.includes(name)) ordered.push([name, items])
  }
  return ordered
}

type TeacherForm = {
  name: string
  email: string
  phone: string
  campusId: string
  targetPeriodsPerWeek: number
  maxPeriodsPerWeek: number
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE'
  hiringStatus: 'HIRED' | 'TO_BE_HIRED'
  eligibilities: TeacherEligibilityInput[]
}

const emptyForm: TeacherForm = {
  name: '',
  email: '',
  phone: '',
  campusId: '',
  targetPeriodsPerWeek: 30,
  maxPeriodsPerWeek: 35,
  status: 'ACTIVE',
  hiringStatus: 'HIRED',
  eligibilities: [],
}

const inputClass =
  'rounded-lg border border-[rgba(20,55,130,0.15)] bg-white px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-navy focus:ring-1 focus:ring-brand-navy/20'

// Matches the default used across the rest of the app (timetable
// controller's resolveYear) — there's only ever been one academic year's
// worth of data in this system so far.
const ACADEMIC_YEAR = '2026-2027'
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const
const WEEKDAY_LABEL: Record<(typeof WEEKDAYS)[number], string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
}

export default function TeachersPage() {
  const { pushToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [teachers, setTeachers] = useState<TeacherSummary[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [classes, setClasses] = useState<ClassSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [campusId, setCampusId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherDetail | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // The teacher's updatedAt as of when it was last loaded into the form —
  // sent back on save as expectedUpdatedAt so the server can tell if
  // someone else saved a change in the meantime (optimistic concurrency).
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null)
  const [staleConflict, setStaleConflict] = useState(false)
  const [lockActionLoading, setLockActionLoading] = useState(false)
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false)
  // Granular Lock, teacher-day level (§24) — bulk convenience over the same
  // row-level lock single-period locking uses.
  const [dayEntries, setDayEntries] = useState<TimetableEntry[]>([])
  const [dayEntriesLoading, setDayEntriesLoading] = useState(false)
  const [dayLockActionLoading, setDayLockActionLoading] = useState<string | null>(null)
  const [dayLockConfirm, setDayLockConfirm] = useState<(typeof WEEKDAYS)[number] | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<TeacherForm>(emptyForm)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pairSubjectId, setPairSubjectId] = useState('')
  const [pairClassId, setPairClassId] = useState('')
  // Reallocation-risk preview (§22 follow-up) — shown before adding a pair
  // to a teacher already at/over target, since the solver has no spare
  // capacity to draw from and would have to take periods away from one of
  // their existing classes instead. Never silently reallocated.
  const [reallocationPending, setReallocationPending] = useState<{ subjectId: string; classId: string } | null>(null)
  const [reallocationRisk, setReallocationRisk] = useState<TeacherReallocationRisk | null>(null)
  const [reallocationLoading, setReallocationLoading] = useState(false)

  // No campus filter active — fetch everything (grouped by campus below)
  // rather than paginating, same as ClassesPage. Pagination only makes
  // sense once a specific campus narrows the list to one unambiguous set.
  const fetchTeachers = (pageOverride?: number) => {
    setLoading(true)
    setListError(null)
    return teachersApi
      .getTeachers({
        page: campusId ? (pageOverride ?? page) : 1,
        limit: campusId ? 20 : 500,
        search,
        campusId: campusId || undefined,
        subjectId: subjectId || undefined,
      })
      .then((response) => {
        setTeachers(response.data.data)
        setTotal(response.data.total)
      })
      .catch((error) => setListError(getApiErrorMessage(error, 'Could not load teachers. Please try again.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    Promise.all([campusesApi.getCampuses(), subjectsApi.getSubjects()])
      .then(([campusesRes, subjectsRes]) => {
        setCampuses(campusesRes.data.data)
        setSubjects(subjectsRes.data.data)
      })
      .catch((error) => pushToast({ kind: 'error', title: 'Could not load filters', description: getApiErrorMessage(error, 'Please refresh the page.') }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchTeachers()
    }, 300)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, campusId, subjectId])

  useEffect(() => {
    if (!form.campusId) return
    classesApi
      .getClasses({ campusId: form.campusId })
      .then((response) => setClasses(response.data.data))
      .catch((error) => pushToast({ kind: 'error', title: 'Could not load classes', description: getApiErrorMessage(error, 'Unable to load classes for this campus.') }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.campusId])

  const totalPages = Math.max(1, Math.ceil(total / 20))
  const teacherGroups = useMemo(() => (campusId ? null : groupByCampus(teachers)), [campusId, teachers])

  const openCreate = () => {
    setEditingId(null)
    setEditingUpdatedAt(null)
    setStaleConflict(false)
    setLockConfirmOpen(false)
    setSelectedTeacher(null)
    setForm(emptyForm)
    setFormError(null)
    setDayEntries([])
    setDayLockConfirm(null)
    setDrawerOpen(true)
  }

  // Granular Lock, teacher-day level (§24) — loaded independently of the
  // main teacher detail, same pattern as TeacherFillSuggestions, so a slow
  // fetch here never blocks the drawer from opening.
  const loadDayEntries = async (teacherId: string) => {
    setDayEntriesLoading(true)
    try {
      // getTeacherTimetable (/timetable/teacher/:id) returns a differently
      // shaped, nested response (entry.class.name, no isLocked) — this page
      // needs the flattened shape getTimetable already returns everywhere
      // else, so it uses the same endpoint TeacherTimetablePage.tsx does.
      const response = await timetableApi.getTimetable({ teacherId, academicYear: ACADEMIC_YEAR })
      setDayEntries(response.data.data)
    } catch {
      setDayEntries([])
    } finally {
      setDayEntriesLoading(false)
    }
  }

  // Shared by openEdit and the "Reload" action on a stale-conflict error —
  // both need to load a fresh snapshot of the teacher into the form and
  // record its updatedAt for the next save's optimistic-concurrency check.
  const applyTeacherDetail = (detail: TeacherDetail) => {
    setSelectedTeacher(detail)
    setEditingUpdatedAt(detail.updatedAt)
    setForm({
      name: detail.name,
      email: detail.email ?? '',
      phone: detail.phone ?? '',
      campusId: detail.campusId,
      targetPeriodsPerWeek: detail.targetPeriodsPerWeek,
      maxPeriodsPerWeek: detail.maxPeriodsPerWeek,
      status: detail.status,
      hiringStatus: detail.hiringStatus,
      eligibilities: detail.eligibilities.map((item) => ({ subjectId: item.subjectId, classId: item.classId })),
    })
  }

  const openEdit = async (teacherId: string) => {
    setOpeningId(teacherId)
    try {
      const response = await teachersApi.getTeacher(teacherId)
      applyTeacherDetail(response.data.data)
      setEditingId(teacherId)
      setFormError(null)
      setStaleConflict(false)
      setLockConfirmOpen(false)
      setDayLockConfirm(null)
      setDrawerOpen(true)
      void loadDayEntries(teacherId)
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not open teacher', description: getApiErrorMessage(error, 'Unable to load teacher details.') })
    } finally {
      setOpeningId(null)
    }
  }

  // Deep-linked from another page (e.g. Gaps & Suggestions' "beyond
  // software" note pointing here to add a subject manually) — auto-opens
  // that teacher's Edit drawer once, then clears the param so navigating
  // back to this same URL later doesn't reopen it unexpectedly.
  useEffect(() => {
    const deepLinkTeacherId = searchParams.get('teacherId')
    if (deepLinkTeacherId) {
      void openEdit(deepLinkTeacherId)
      // Deliberately NOT React Router's setSearchParams here: calling it
      // triggers a real remount of this page (goes through AppLayout's
      // AnimatePresence-keyed Outlet) partway through openEdit's async
      // work, wiping the drawerOpen state it had just set — found live,
      // 2026-07-28. Updating the URL via the raw History API instead
      // clears the param without going through React Router's navigation
      // state at all, so this component never remounts.
      window.history.replaceState(null, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Called from the stale-conflict banner's "Reload" button — pulls the
  // latest saved version of this teacher (whoever else just saved) and
  // discards this admin's unsaved local edits, per the agreed design: never
  // let a save silently overwrite someone else's change.
  const reloadEditingTeacher = async () => {
    if (!editingId) return
    setFormLoading(true)
    try {
      const response = await teachersApi.getTeacher(editingId)
      applyTeacherDetail(response.data.data)
      setFormError(null)
      setStaleConflict(false)
      pushToast({
        kind: 'success',
        title: 'Reloaded',
        description: 'Showing the latest saved version of this teacher. Your unsaved changes were discarded.',
      })
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not reload', description: getApiErrorMessage(error, 'Please close and reopen this teacher.') })
    } finally {
      setFormLoading(false)
    }
  }

  // Teacher Lock (§20) — independent of Class Lock, freezes the whole
  // record (details + eligibility) from further edits or deletion, so a
  // profile that's already correct can't be accidentally changed by anyone,
  // including mid-way through a bulk edit of other teachers.
  const confirmLockTeacher = async () => {
    if (!editingId) return
    setLockActionLoading(true)
    try {
      await teachersApi.updateTeacherLock(editingId, true)
      const response = await teachersApi.getTeacher(editingId)
      applyTeacherDetail(response.data.data)
      setLockConfirmOpen(false)
      pushToast({ kind: 'success', title: 'Teacher locked', description: `${response.data.data.name}'s record is frozen until unlocked.` })
      await fetchTeachers()
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not lock teacher', description: getApiErrorMessage(error, 'Please try again.') })
    } finally {
      setLockActionLoading(false)
    }
  }

  const unlockTeacher = async () => {
    if (!editingId) return
    setLockActionLoading(true)
    try {
      await teachersApi.updateTeacherLock(editingId, false)
      const response = await teachersApi.getTeacher(editingId)
      applyTeacherDetail(response.data.data)
      pushToast({ kind: 'success', title: 'Teacher unlocked', description: `${response.data.data.name} can be edited again.` })
      await fetchTeachers()
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not unlock teacher', description: getApiErrorMessage(error, 'Please try again.') })
    } finally {
      setLockActionLoading(false)
    }
  }

  // Granular Lock, teacher-day level (§24) — a bulk convenience over the
  // same row-level TimetableEntry.isLocked flag single-period locking uses.
  // Independent of Teacher Lock above, which only protects the profile.
  const dayEntrySummary = (day: (typeof WEEKDAYS)[number]) => {
    const forDay = dayEntries.filter((e) => e.dayOfWeek === day)
    const classNames = [...new Set(forDay.map((e) => e.className))]
    const fullyLocked = forDay.length > 0 && forDay.every((e) => e.isLocked)
    return { count: forDay.length, classNames, fullyLocked }
  }

  const unlockDay = async (day: (typeof WEEKDAYS)[number]) => {
    if (!editingId) return
    setDayLockActionLoading(day)
    try {
      await teachersApi.updateTeacherDayLock(editingId, { dayOfWeek: day, academicYear: ACADEMIC_YEAR, isLocked: false })
      pushToast({ kind: 'success', title: `${WEEKDAY_LABEL[day]} unlocked`, description: 'These periods can be edited or regenerated again.' })
      await loadDayEntries(editingId)
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not unlock this day', description: getApiErrorMessage(error, 'Please try again.') })
    } finally {
      setDayLockActionLoading(null)
    }
  }

  // Locking opens a confirm modal (real impact preview, same principle as
  // Class Lock); unlocking is immediate, matching that same precedent.
  const requestDayLock = (day: (typeof WEEKDAYS)[number]) => {
    const summary = dayEntrySummary(day)
    if (summary.fullyLocked) {
      void unlockDay(day)
      return
    }
    if (summary.count === 0) return
    setDayLockConfirm(day)
  }

  const confirmDayLock = async () => {
    if (!editingId || !dayLockConfirm) return
    const day = dayLockConfirm
    setDayLockActionLoading(day)
    try {
      const response = await teachersApi.updateTeacherDayLock(editingId, { dayOfWeek: day, academicYear: ACADEMIC_YEAR, isLocked: true })
      pushToast({
        kind: 'success',
        title: `${WEEKDAY_LABEL[day]} locked`,
        description: `${response.data.data.affectedPeriods} period${response.data.data.affectedPeriods === 1 ? '' : 's'} will survive the next regenerate untouched.`,
      })
      setDayLockConfirm(null)
      await loadDayEntries(editingId)
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not lock this day', description: getApiErrorMessage(error, 'Please try again.') })
    } finally {
      setDayLockActionLoading(null)
    }
  }

  // Reallocation-risk preview (§22 follow-up) — same principle as the
  // Lock-impact preview: show the real, current numbers before an action
  // happens, rather than let a teacher already at/over target silently lose
  // periods elsewhere on the next regenerate to make room for a new pair.
  const commitEligibilityPair = (subjectId: string, classId: string) => {
    setForm((current) => ({
      ...current,
      eligibilities: [...current.eligibilities, { subjectId, classId }],
    }))
    setPairClassId('')
  }

  const addEligibilityPair = async () => {
    if (!pairSubjectId || !pairClassId) return
    const exists = form.eligibilities.some((e) => e.subjectId === pairSubjectId && e.classId === pairClassId)
    if (exists) {
      setPairClassId('')
      return
    }
    // Only a real risk for an existing teacher already at/over target — a
    // brand-new teacher (no editingId yet) has no current load to risk.
    if (editingId && selectedTeacher && selectedTeacher.currentPeriods >= selectedTeacher.targetPeriodsPerWeek) {
      setReallocationLoading(true)
      try {
        const response = await teachersApi.getReallocationRisk(editingId)
        setReallocationRisk(response.data.data)
        setReallocationPending({ subjectId: pairSubjectId, classId: pairClassId })
      } catch (error) {
        pushToast({
          kind: 'error',
          title: 'Could not check reallocation risk',
          description: getApiErrorMessage(error, 'Adding this pair directly instead.'),
        })
        commitEligibilityPair(pairSubjectId, pairClassId)
      } finally {
        setReallocationLoading(false)
      }
      return
    }
    commitEligibilityPair(pairSubjectId, pairClassId)
  }

  const confirmReallocationRisk = () => {
    if (!reallocationPending) return
    commitEligibilityPair(reallocationPending.subjectId, reallocationPending.classId)
    setReallocationPending(null)
    setReallocationRisk(null)
  }

  const openView = async (teacherId: string) => {
    setOpeningId(teacherId)
    try {
      const response = await teachersApi.getTeacher(teacherId)
      setSelectedTeacher(response.data.data)
      setEditingId(null)
      setForm(emptyForm)
      setDrawerOpen(true)
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not open teacher', description: getApiErrorMessage(error, 'Unable to load teacher details.') })
    } finally {
      setOpeningId(null)
    }
  }

  const saveTeacher = async () => {
    setFormLoading(true)
    setFormError(null)
    setStaleConflict(false)
    try {
      const payload = {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        campusId: form.campusId,
        targetPeriodsPerWeek: form.targetPeriodsPerWeek,
        maxPeriodsPerWeek: form.maxPeriodsPerWeek,
        eligibilities: form.eligibilities,
        status: form.status,
        hiringStatus: form.hiringStatus,
      }
      if (editingId) {
        // editingUpdatedAt is always populated together with editingId (by
        // openEdit / reloadEditingTeacher), so it's never null here.
        await teachersApi.updateTeacher(editingId, { ...payload, expectedUpdatedAt: editingUpdatedAt! })
        pushToast({ kind: 'success', title: 'Teacher updated', description: 'Changes were saved successfully.' })
      } else {
        await teachersApi.createTeacher(payload)
        pushToast({ kind: 'success', title: 'Teacher created', description: 'The teacher was added to the database.' })
      }
      setDrawerOpen(false)
      setPage(1)
      await fetchTeachers(1)
    } catch (error) {
      if (editingId && getApiErrorCode(error) === 'STALE_TEACHER') {
        setStaleConflict(true)
      }
      // Shown inline in the drawer (not just a toast) so validation errors
      // stay visible next to the form while the admin fixes the input.
      setFormError(getApiErrorMessage(error, 'Could not save this teacher. Please try again.'))
    } finally {
      setFormLoading(false)
    }
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setFormError(null)
    // Refresh so the account-status dot reflects any mobile access change
    // made while the drawer was open, without waiting for the next save.
    // Best-effort: this is a background sync, not a user-initiated action,
    // so a transient failure here doesn't need its own toast.
    teachersApi
      .getTeachers({ page, limit: 20, search, campusId: campusId || undefined, subjectId: subjectId || undefined })
      .then((response) => {
        setTeachers(response.data.data)
        setTotal(response.data.total)
      })
      .catch(() => {})
  }

  const deleteTeacher = async (teacherId: string) => {
    setDeletingId(teacherId)
    try {
      await teachersApi.deleteTeacher(teacherId)
      pushToast({ kind: 'success', title: 'Teacher removed', description: 'The teacher was deleted or deactivated.' })
      setConfirmDeleteId(null)
      await fetchTeachers()
    } catch (error) {
      pushToast({ kind: 'error', title: 'Delete failed', description: getApiErrorMessage(error, 'Could not delete this teacher. Please try again.') })
    } finally {
      setDeletingId(null)
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Name / Email',
      render: (teacher: TeacherSummary) => (
        <div className="flex items-center gap-3">
          <Avatar name={teacher.name} subjectName={teacher.subjectNames[0]} size={34} />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-text-primary">{teacher.name}</p>
              {teacher.isLocked ? (
                <span
                  title="Locked — record can't be edited or deleted until unlocked"
                  className="inline-flex items-center gap-1 rounded-full bg-brand-navy/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-navy"
                >
                  <Lock className="h-2.5 w-2.5" /> Locked
                </span>
              ) : null}
              {teacher.hiringStatus === 'TO_BE_HIRED' ? (
                <>
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                    Vacant
                  </span>
                  <ProblemFlag
                    tone="warning"
                    reason={`"${teacher.name}" is a placeholder for a not-yet-hired position, not a real person — their periods on the timetable are unstaffed until someone is hired and this record is updated to a real teacher.`}
                  />
                </>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-text-muted">{teacher.email ?? 'No email'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'campus',
      header: 'Campus',
      render: (teacher: TeacherSummary) => <Badge color={campusBadgeColor(teacher.campusName)} label={teacher.campusName.replace(' Campus', '')} />,
    },
    {
      key: 'subjects',
      header: 'Subjects',
      render: (teacher: TeacherSummary) => (
        <div className="flex flex-wrap items-center gap-1">
          {teacher.subjectNames.slice(0, 2).map((name) => (
            <SubjectPill key={name} name={name} />
          ))}
          {teacher.subjectNames.length > 2 ? (
            <span className="text-xs text-text-muted">+{teacher.subjectNames.length - 2} more</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'load',
      header: 'Target / Week',
      render: (teacher: TeacherSummary) => {
        const ratio = teacher.targetPeriodsPerWeek > 0 ? Math.min(1, teacher.currentPeriods / teacher.targetPeriodsPerWeek) : 0
        return (
          <div>
            <span className="tabular-nums text-sm text-text-primary">
              {teacher.currentPeriods} / {teacher.targetPeriodsPerWeek}
            </span>
            <div className="mt-1.5 h-1 w-16 overflow-hidden rounded-full bg-[rgba(20,55,130,0.1)]">
              <div className="h-full rounded-full bg-brand-navy" style={{ width: `${ratio * 100}%` }} />
            </div>
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (teacher: TeacherSummary) => {
        const dot = teacherStatusDot(teacher.status)
        return (
          <div className="flex items-center gap-2">
            <StatusDot color={dot.color} label={dot.label} />
            {teacher.hasAccount ? (
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#16A34A]" title="Can log in to mobile app" />
            ) : (
              // Was a native `title` tooltip only — invisible on touch
              // devices and inconsistent with every other flagged state in
              // this app. Upgraded to the same click-to-explain pattern.
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-brand-maroon" />
                <ProblemFlag
                  tone="warning"
                  reason={`${teacher.name} has no mobile app login set up yet — open this row's Edit drawer to create one.`}
                />
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'w-[205px]',
      render: (teacher: TeacherSummary) => (
        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          <button
            onClick={() => openView(teacher.id)}
            disabled={openingId !== null}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-[#0891B2]/10 hover:text-[#0891B2] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {openingId === teacher.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            onClick={() => openEdit(teacher.id)}
            disabled={openingId !== null}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-brand-navy/10 hover:text-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
          >
            {openingId === teacher.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
          </button>
          <button
            onClick={() => navigate(`/dashboard/teachers/${teacher.id}/timetable`)}
            disabled={openingId !== null}
            title="Browse weekly timetable"
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-brand-navy/10 hover:text-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Calendar className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate(`/dashboard/teachers/${teacher.id}/print`)}
            disabled={openingId !== null}
            title="Printable weekly sheet"
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-[#0F766E]/10 hover:text-[#0F766E] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            onClick={() => setConfirmDeleteId(teacher.id)}
            disabled={openingId !== null || teacher.isLocked}
            title={teacher.isLocked ? "Locked — unlock this teacher before deleting" : undefined}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-brand-maroon/10 hover:text-brand-maroon disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  const selectedCampusClasses = classes
  // Teacher Lock (§20) freezes the whole record — every field in the edit
  // form, plus adding/removing eligibility pairs, is disabled while locked.
  const locked = Boolean(editingId && selectedTeacher?.isLocked)

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-text-primary">Teachers</h2>
          <p className="mt-1 text-sm text-text-muted">Manage teachers, subject load, and class eligibility.</p>
        </div>
        <Button onClick={openCreate} variant="primary" size="md">
          <Plus className="h-4 w-4" /> Add Teacher
        </Button>
      </motion.div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <SearchInput value={search} onChange={(e) => { setPage(1); setSearch(e.target.value) }} placeholder="Search teachers" />
          <SelectInput value={campusId} onChange={(e) => { setPage(1); setCampusId(e.target.value) }}>
            <option value="">All campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </SelectInput>
          <SelectInput value={subjectId} onChange={(e) => { setPage(1); setSubjectId(e.target.value) }}>
            <option value="">All subjects</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </SelectInput>
        </div>
      </Card>

      {listError ? (
        <ErrorBanner message={listError} onRetry={() => fetchTeachers()} />
      ) : teacherGroups ? (
        // Grouped by campus (Junior/Girls/Boys), each in its own labeled
        // section — e.g. Girls "Miss TBH" and Junior "Miss TBH" never sit
        // in the same visual list with only a small badge to tell them
        // apart (§13, same treatment as ClassesPage).
        <div className="space-y-6">
          {teacherGroups.map(([campusName, items]) => (
            <div key={campusName}>
              <div className="mb-2 flex items-center gap-2">
                <Badge color={campusBadgeColor(campusName)} label={campusName.replace(' Campus', '')} />
                <h3 className="font-display text-base text-text-primary">{campusName}</h3>
                <span className="text-xs text-text-muted">({items.length} teachers)</span>
              </div>
              <DataTable columns={columns} data={items} isLoading={loading} emptyState={null} />
            </div>
          ))}
          {!teacherGroups.length && !loading ? (
            <EmptyState icon={Users} title="No teachers found" description="Add the first teacher or widen your filters." action={{ label: 'Add Teacher', onClick: openCreate }} />
          ) : null}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={teachers}
          isLoading={loading}
          emptyState={<EmptyState icon={Users} title="No teachers found" description="Add the first teacher or widen your filters." action={{ label: 'Add Teacher', onClick: openCreate }} />}
        />
      )}

      {campusId ? (
        <div className="flex items-center justify-between text-sm text-text-muted">
          <span>Page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Prev</Button>
            <Button variant="ghost" size="sm" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      ) : null}

      <Drawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        title={editingId ? 'Edit Teacher' : selectedTeacher ? 'Teacher Details' : 'Add Teacher'}
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              {editingId ? (
                <Button variant="danger" loading={formLoading} disabled={locked} onClick={() => setConfirmDeleteId(editingId)}>
                  Delete
                </Button>
              ) : null}
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={closeDrawer}>Cancel</Button>
              <Button loading={formLoading} disabled={locked} onClick={saveTeacher}>{editingId ? 'Update' : 'Save'}</Button>
            </div>
          </div>
        }
      >
        {selectedTeacher && !editingId ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={selectedTeacher.name} subjectName={selectedTeacher.eligibilities[0]?.subjectName} size={52} />
              <div>
                <p className="font-display text-lg text-text-primary">{selectedTeacher.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge color={campusBadgeColor(selectedTeacher.campusName)} label={selectedTeacher.campusName.replace(' Campus', '')} />
                  {selectedTeacher.hiringStatus === 'TO_BE_HIRED' ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-800">
                      To Be Hired
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="grid gap-3 text-sm text-text-secondary">
              <div className="rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3">Email: {selectedTeacher.email ?? 'No email'}</div>
              <div className="rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3">Load: {selectedTeacher.currentPeriods} / {selectedTeacher.maxPeriodsPerWeek}</div>
              <div className="rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.12em] text-text-muted">Subject + Class Eligibility</p>
                <div className="space-y-1.5">
                  {selectedTeacher.eligibilities.map((item) => (
                    <div key={`${item.subjectId}-${item.classId}`} className="flex items-center gap-2">
                      <SubjectPill name={item.subjectName} />
                      <span className="text-text-primary">{item.className}</span>
                    </div>
                  ))}
                  {!selectedTeacher.eligibilities.length ? <p className="text-text-muted">No eligibilities set yet.</p> : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {formError ? (
              <ErrorBanner
                message={formError}
                onRetry={staleConflict ? reloadEditingTeacher : undefined}
                retryLabel="Reload"
              />
            ) : null}
            {editingId && selectedTeacher ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  {selectedTeacher.isLocked ? (
                    <>
                      <Lock className="h-4 w-4 shrink-0 text-brand-navy" />
                      <span>
                        <span className="font-medium text-text-primary">{selectedTeacher.name}</span> is locked —
                        nothing in this record can change until unlocked.
                      </span>
                    </>
                  ) : (
                    <span>Not locked — this record can be edited or deleted by anyone with admin access.</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={lockActionLoading}
                  onClick={() => (selectedTeacher.isLocked ? unlockTeacher() : setLockConfirmOpen(true))}
                >
                  {selectedTeacher.isLocked ? (
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
            {editingId && !locked ? (
              <div className="rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Lock specific days
                </p>
                <p className="mb-2 text-xs text-text-muted">
                  Freezes only this teacher's real periods on that day (across whichever classes they're in) — every
                  other day stays fully open to the next regenerate.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const summary = dayEntrySummary(day)
                    return (
                      <Button
                        key={day}
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={dayLockActionLoading === day}
                        disabled={dayEntriesLoading || (summary.count === 0 && !summary.fullyLocked)}
                        onClick={() => requestDayLock(day)}
                        title={summary.count === 0 ? 'No periods this day' : `${summary.count} period${summary.count === 1 ? '' : 's'} on ${WEEKDAY_LABEL[day]}`}
                      >
                        {summary.fullyLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        {WEEKDAY_LABEL[day]}
                      </Button>
                    )
                  })}
                </div>
              </div>
            ) : null}
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Details</p>
              <div className="grid gap-3 md:grid-cols-2">
                <input disabled={locked} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Name" className={inputClass} />
                <input disabled={locked} value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} placeholder="Email" className={inputClass} />
                <input disabled={locked} value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} placeholder="Phone" className={inputClass} />
                <SelectInput disabled={locked} value={form.campusId} onChange={(e) => setForm((current) => ({ ...current, campusId: e.target.value }))}>
                  <option value="">Select campus</option>
                  {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                </SelectInput>
                <SelectInput disabled={locked} value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as TeacherForm['status'] }))}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="ON_LEAVE">On Leave</option>
                </SelectInput>
                <SelectInput disabled={locked} value={form.hiringStatus} onChange={(e) => setForm((current) => ({ ...current, hiringStatus: e.target.value as TeacherForm['hiringStatus'] }))}>
                  <option value="HIRED">Hired</option>
                  <option value="TO_BE_HIRED">To Be Hired</option>
                </SelectInput>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {/* Bare number inputs pre-filled with real values (e.g. 30, 35)
                  never show their placeholder text, so without a persistent
                  label these two fields were indistinguishable at a glance. */}
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Target periods/week
                </span>
                <input
                  type="number"
                  disabled={locked}
                  value={form.targetPeriodsPerWeek}
                  onChange={(e) => setForm((current) => ({ ...current, targetPeriodsPerWeek: Number(e.target.value) }))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Max periods/week (hard ceiling)
                </span>
                <input
                  type="number"
                  disabled={locked}
                  value={form.maxPeriodsPerWeek}
                  onChange={(e) => setForm((current) => ({ ...current, maxPeriodsPerWeek: Number(e.target.value) }))}
                  className={inputClass}
                />
              </label>
            </div>
            {editingId && !locked ? (
              <div>
                <TeacherFillSuggestions teacherId={editingId} onApplied={() => fetchTeachers()} />
              </div>
            ) : null}
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Subject + Class Eligibility
              </p>
              <p className="mb-2 text-xs text-text-muted">
                Add one pair at a time — this teacher will only ever be assignable to exactly these
                subject/class combinations, not every subject in every class listed below.
              </p>
              <div className="mb-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <SelectInput disabled={locked} value={pairSubjectId} onChange={(e) => setPairSubjectId(e.target.value)}>
                  <option value="">Select subject</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </SelectInput>
                <SelectInput value={pairClassId} onChange={(e) => setPairClassId(e.target.value)} disabled={locked || !form.campusId}>
                  <option value="">{form.campusId ? 'Select class' : 'Select a campus first'}</option>
                  {selectedCampusClasses.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                </SelectInput>
                <Button
                  type="button"
                  variant="ghost"
                  loading={reallocationLoading}
                  disabled={locked || !pairSubjectId || !pairClassId}
                  onClick={addEligibilityPair}
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-[rgba(20,55,130,0.1)] bg-[#F8FAFC] p-3">
                {form.eligibilities.map((pair) => {
                  const subject = subjects.find((s) => s.id === pair.subjectId)
                  const cls = classes.find((c) => c.id === pair.classId)
                  return (
                    <div key={`${pair.subjectId}-${pair.classId}`} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <SubjectPill name={subject?.name ?? 'Unknown subject'} />
                        <span className="text-text-primary">{cls?.name ?? 'Unknown class'}</span>
                      </div>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            eligibilities: current.eligibilities.filter(
                              (e) => !(e.subjectId === pair.subjectId && e.classId === pair.classId),
                            ),
                          }))
                        }
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-brand-maroon/10 hover:text-brand-maroon disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
                {!form.eligibilities.length ? <p className="text-sm text-text-muted">No eligibility pairs added yet.</p> : null}
              </div>
            </div>
            {editingId ? <MobileAppAccessSection teacherId={editingId} formEmail={form.email} /> : null}
          </div>
        )}
      </Drawer>

      <Modal
        isOpen={confirmDeleteId !== null}
        title="Delete teacher"
        description="If the teacher has timetable entries, they will be set inactive instead of removed."
        confirmLabel="Delete"
        intent="danger"
        confirmLoading={deletingId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => (confirmDeleteId ? deleteTeacher(confirmDeleteId) : undefined)}
      />

      <Modal
        isOpen={lockConfirmOpen}
        title={`Lock ${selectedTeacher?.name ?? 'this teacher'}?`}
        description="Nothing about this teacher — details or subject/class eligibility — can be edited or deleted (including via Capacity Advisor suggestions) until you unlock them again. This doesn't affect their existing timetable placements."
        confirmLabel="Lock anyway"
        intent="primary"
        confirmLoading={lockActionLoading}
        onConfirm={confirmLockTeacher}
        onClose={() => setLockConfirmOpen(false)}
      />

      <Modal
        isOpen={reallocationPending !== null}
        title={`Add ${subjects.find((s) => s.id === reallocationPending?.subjectId)?.name ?? 'this subject'} in ${classes.find((c) => c.id === reallocationPending?.classId)?.name ?? 'this class'}?`}
        description={
          reallocationRisk
            ? `${reallocationRisk.teacherName} is already at ${reallocationRisk.currentPeriods}/${reallocationRisk.targetPeriodsPerWeek} periods (their target) — there's no spare capacity, so the next regenerate would need to take periods away from one of their current classes below to make room for this one. Nothing is reallocated yet — only if this pair is used by the generator later.`
            : undefined
        }
        confirmLabel="Add anyway"
        intent="danger"
        confirmLoading={false}
        onConfirm={confirmReallocationRisk}
        onClose={() => {
          setReallocationPending(null)
          setReallocationRisk(null)
        }}
      >
        {reallocationRisk ? (
          <div className="space-y-1.5 rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3 text-sm">
            <p className="mb-1 text-xs uppercase tracking-[0.12em] text-text-muted">Currently teaching (at risk of losing periods)</p>
            {reallocationRisk.currentClasses.map((c) => (
              <div key={c.classId} className="flex items-center justify-between">
                <span className="text-text-primary">{c.className}</span>
                <span className="tabular-nums text-text-secondary">{c.periods} period{c.periods === 1 ? '' : 's'}</span>
              </div>
            ))}
            {!reallocationRisk.currentClasses.length ? <p className="text-text-muted">No current classes on record.</p> : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={dayLockConfirm !== null}
        title={dayLockConfirm ? `Lock ${WEEKDAY_LABEL[dayLockConfirm]} for ${selectedTeacher?.name ?? 'this teacher'}?` : ''}
        description={
          dayLockConfirm
            ? `Every period ${selectedTeacher?.name ?? 'this teacher'} has on ${WEEKDAY_LABEL[dayLockConfirm]} will survive the next regenerate untouched. Every other day stays fully open.`
            : undefined
        }
        confirmLabel="Lock anyway"
        intent="primary"
        confirmLoading={dayLockActionLoading === dayLockConfirm}
        onConfirm={confirmDayLock}
        onClose={() => setDayLockConfirm(null)}
      >
        {dayLockConfirm ? (
          <div className="space-y-1.5 rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3 text-sm">
            <p className="mb-1 text-xs uppercase tracking-[0.12em] text-text-muted">Classes on {WEEKDAY_LABEL[dayLockConfirm]}</p>
            {dayEntrySummary(dayLockConfirm).classNames.map((name) => (
              <div key={name} className="text-text-primary">{name}</div>
            ))}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
