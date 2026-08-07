import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Gauge } from 'lucide-react'
import Card from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorBanner } from '../../components/ui/ErrorBanner'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { PillToggle } from '../../components/ui/PillToggle'
import { SelectInput } from '../../components/ui/SelectInput'
import { SubjectPill } from '../../components/ui/SubjectPill'
import { campusesApi } from '../../api/campuses'
import { classesApi, type ClassDetail, type ClassSummary } from '../../api/classes'
import { teachersApi, type TeacherSummary } from '../../api/teachers'
import { timetableApi, type TimetableEntry } from '../../api/timetable'
import { getApiErrorMessage } from '../../utils/apiError'
import { ClassGapFixSuggestions } from '../timetable/ClassGapFixSuggestions'
import { computeClassSubjectShortfalls } from '../timetable/classSubjectShortfalls'
import { TeacherFillSuggestions } from '../teachers/TeacherFillSuggestions'

const ACADEMIC_YEAR = '2026-2027'

type Campus = Awaited<ReturnType<typeof campusesApi.getCampuses>>['data']['data'][number]

/**
 * Consolidates what was scattered across Warnings, Capacity Advisor, and the
 * Timetable page's inline popups into one class-centric / teacher-centric
 * browsing view. Deliberately reuses existing logic rather than
 * duplicating it: Class view is computeClassSubjectShortfalls (extracted
 * from TimetablePage) + ClassGapFixSuggestions (item 5/21's inline
 * fix-suggestion component); Teacher view is the exact same
 * TeacherFillSuggestions widget already used in the Edit Teacher drawer.
 * No new backend endpoints — this page is purely a new way to browse data
 * that already exists.
 */
export default function GapsAndSuggestionsPage() {
  const [mode, setMode] = useState<'class' | 'teacher'>('class')
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [loadingFilters, setLoadingFilters] = useState(true)
  const [filterError, setFilterError] = useState<string | null>(null)

  const [campusId, setCampusId] = useState('')

  // ---- Class view state ----
  const [classes, setClasses] = useState<ClassSummary[]>([])
  const [classId, setClassId] = useState('')
  const [classDetail, setClassDetail] = useState<ClassDetail | null>(null)
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [classLoading, setClassLoading] = useState(false)
  const [classError, setClassError] = useState<string | null>(null)

  // ---- Teacher view state ----
  const [teachers, setTeachers] = useState<TeacherSummary[]>([])
  const [teacherId, setTeacherId] = useState('')

  useEffect(() => {
    setLoadingFilters(true)
    campusesApi
      .getCampuses()
      .then((res) => setCampuses(res.data.data))
      .catch((err) => setFilterError(getApiErrorMessage(err, 'Could not load campuses.')))
      .finally(() => setLoadingFilters(false))
  }, [])

  // Campus change resets whichever downstream selection is active — a
  // stale class/teacher id from a different campus should never silently
  // carry over.
  useEffect(() => {
    setClassId('')
    setTeacherId('')
    setClassDetail(null)
    setEntries([])
    if (!campusId) {
      setClasses([])
      setTeachers([])
      return
    }
    classesApi
      .getClasses({ campusId })
      .then((res) => setClasses(res.data.data))
      .catch((err) => setFilterError(getApiErrorMessage(err, 'Could not load classes.')))
    teachersApi
      .getTeachers({ campusId, limit: 200 })
      .then((res) => setTeachers(res.data.data))
      .catch((err) => setFilterError(getApiErrorMessage(err, 'Could not load teachers.')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId])

  useEffect(() => {
    if (!classId) {
      setClassDetail(null)
      setEntries([])
      return
    }
    setClassLoading(true)
    setClassError(null)
    Promise.all([classesApi.getClassDetail(classId), timetableApi.getTimetable({ classId, academicYear: ACADEMIC_YEAR })])
      .then(([detailRes, entriesRes]) => {
        setClassDetail(detailRes.data.data)
        setEntries(entriesRes.data.data)
      })
      .catch((err) => setClassError(getApiErrorMessage(err, 'Could not load this class.')))
      .finally(() => setClassLoading(false))
  }, [classId])

  const shortfalls = useMemo(() => computeClassSubjectShortfalls(classDetail, entries), [classDetail, entries])
  const selectedTeacher = teachers.find((t) => t.id === teacherId)

  const refetchTeachers = () => {
    if (!campusId) return
    teachersApi.getTeachers({ campusId, limit: 200 }).then((res) => setTeachers(res.data.data))
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-text-primary">Gaps & Suggestions</h2>
          <p className="mt-1 text-sm text-text-muted">
            Browse a class's or teacher's real gaps directly, with the same Safe Fill / Reassignment / Beyond
            Software suggestions used across Warnings and Capacity Advisor.
          </p>
        </div>
        <PillToggle
          value={mode}
          onChange={(value) => setMode(value)}
          options={[
            { value: 'class', label: 'Class view' },
            { value: 'teacher', label: 'Teacher view' },
          ]}
        />
      </motion.div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <SelectInput value={campusId} onChange={(e) => setCampusId(e.target.value)} disabled={loadingFilters}>
            <option value="">Select campus</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </SelectInput>
          {mode === 'class' ? (
            <SelectInput value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!campusId}>
              <option value="">{campusId ? 'Select class' : 'Select a campus first'}</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </SelectInput>
          ) : (
            <SelectInput value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={!campusId}>
              <option value="">{campusId ? 'Select teacher' : 'Select a campus first'}</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </SelectInput>
          )}
        </div>
      </Card>

      {filterError ? <ErrorBanner message={filterError} /> : null}

      {mode === 'class' ? (
        !classId ? (
          <EmptyState icon={Gauge} title="Choose a campus and class" description="Its unfilled requirements and suggested fixes appear here." />
        ) : classLoading ? (
          <LoadingSpinner label="Loading this class..." />
        ) : classError ? (
          <ErrorBanner message={classError} />
        ) : (
          <Card className="p-4">
            <h3 className="font-display text-lg text-text-primary">{classDetail?.name}</h3>
            {!shortfalls.length ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-[rgba(22,163,74,0.2)] bg-[#F0FDF4] p-3 text-sm text-[#166534]">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Every subject requirement for this class is fully scheduled — nothing to suggest.
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                {shortfalls.map((s) => (
                  <div key={s.subjectId} className="rounded-xl border border-[rgba(20,55,130,0.08)] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <SubjectPill name={s.subjectName} />
                      <span className="tabular-nums text-sm text-text-secondary">
                        {s.scheduled}/{s.required} scheduled
                      </span>
                    </div>
                    <ClassGapFixSuggestions classId={classId} subjects={[{ subjectId: s.subjectId, subjectName: s.subjectName }]} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        )
      ) : !teacherId ? (
        <EmptyState icon={Gauge} title="Choose a campus and teacher" description="Any gap in their own schedule and suggested fixes appear here." />
      ) : (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg text-text-primary">{selectedTeacher?.name}</h3>
            <span className="tabular-nums text-sm text-text-secondary">
              {selectedTeacher?.currentPeriods}/{selectedTeacher?.targetPeriodsPerWeek} periods/week
            </span>
          </div>
          {selectedTeacher && selectedTeacher.currentPeriods >= selectedTeacher.targetPeriodsPerWeek ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[rgba(22,163,74,0.2)] bg-[#F0FDF4] p-3 text-sm text-[#166534]">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              At or above target — nothing to suggest.
            </div>
          ) : (
            <div className="mt-3">
              <TeacherFillSuggestions
                teacherId={teacherId}
                onApplied={refetchTeachers}
                beyondSoftwareManualAddHref={`/dashboard/teachers?teacherId=${teacherId}`}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
