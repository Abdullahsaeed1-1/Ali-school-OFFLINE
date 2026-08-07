import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import Button from '../../components/ui/Button'
import { ErrorBanner } from '../../components/ui/ErrorBanner'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { campusesApi, type Period } from '../../api/campuses'
import { teachersApi, type TeacherDetail } from '../../api/teachers'
import { timetableApi, type TimetableEntry } from '../../api/timetable'
import { getApiErrorMessage } from '../../utils/apiError'
import { TeacherWeeklyGrid } from './TeacherWeeklyGrid'

const ACADEMIC_YEAR = '2026-2027'

export default function TeacherPrintableSheetPage() {
  const { teacherId } = useParams<{ teacherId: string }>()
  const navigate = useNavigate()
  const [teacher, setTeacher] = useState<TeacherDetail | null>(null)
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!teacherId) return
    setLoading(true)
    setError(null)
    teachersApi
      .getTeacher(teacherId)
      .then(async (teacherRes) => {
        setTeacher(teacherRes.data.data)
        const [timetableRes, periodsRes] = await Promise.all([
          timetableApi.getTimetable({ teacherId, academicYear: ACADEMIC_YEAR }),
          // No classGroup filter — Mon-Thu and Friday periods (and the
          // break between them) differ in duration (§3), both are needed.
          campusesApi.getCampusPeriods(teacherRes.data.data.campusId),
        ])
        setEntries(timetableRes.data.data)
        setPeriods(periodsRes.data.data)
      })
      .catch((err) => setError(getApiErrorMessage(err, 'Could not load this teacher’s timetable.')))
      .finally(() => setLoading(false))
  }, [teacherId])

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorBanner message={error} />
  if (!teacher) return null

  return (
    <div className="printable-sheet space-y-6">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate('/dashboard/teachers')}>
          <ArrowLeft className="h-4 w-4" /> Back to Teachers
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>

      <div className="rounded-2xl border border-[rgba(20,55,130,0.1)] bg-white p-6">
        <h2 className="font-display text-2xl text-text-primary">{teacher.name}</h2>
        <p className="mt-1 text-sm text-text-muted">
          {teacher.campusName} &middot; {ACADEMIC_YEAR} &middot; {teacher.currentPeriods} / {teacher.targetPeriodsPerWeek} periods/week
        </p>

        <div className="mt-6">
          <TeacherWeeklyGrid teacherId={teacher.id} entries={entries} periods={periods} />
        </div>
      </div>
    </div>
  )
}
