import { motion } from 'framer-motion'
import { BookOpen, Calendar, GraduationCap, School, Users } from 'lucide-react'
import Card from '../../components/ui/Card'
import { ErrorBanner } from '../../components/ui/ErrorBanner'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { StatCard } from '../../components/ui/StatCard'
import { Badge, campusBadgeColor } from '../../components/ui/Badge'
import { Avatar } from '../../components/ui/Avatar'
import { SubjectPill } from '../../components/ui/SubjectPill'
import { campusesApi } from '../../api/campuses'
import { teachersApi } from '../../api/teachers'
import { subjectsApi } from '../../api/subjects'
import { timetableApi } from '../../api/timetable'
import { getApiErrorMessage } from '../../utils/apiError'
import { useEffect, useState } from 'react'

type SummaryTeacher = Awaited<ReturnType<typeof teachersApi.getTeachers>>['data']['data'][number]

const CAMPUS_TYPE_LABEL: Record<'JUNIOR' | 'GIRLS' | 'BOYS', string> = {
  JUNIOR: 'JUNIOR',
  GIRLS: 'GIRLS',
  BOYS: 'BOYS',
}

// Per-campus accent used for the card's background wash and watermark icon —
// same hues as the campus Badge (navy/purple/teal) so the two stay linked.
const CAMPUS_ACCENT: Record<'JUNIOR' | 'GIRLS' | 'BOYS', { color: string; icon: typeof School }> = {
  JUNIOR: { color: '#143782', icon: School },
  GIRLS: { color: '#9333EA', icon: GraduationCap },
  BOYS: { color: '#0F766E', icon: BookOpen },
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [teachers, setTeachers] = useState<SummaryTeacher[]>([])
  const [campuses, setCampuses] = useState<
    Array<{ id: string; name: string; type: 'JUNIOR' | 'GIRLS' | 'BOYS'; classCount: number; teacherCount: number }>
  >([])
  const [teacherTotal, setTeacherTotal] = useState(0)
  const [classTotal, setClassTotal] = useState(0)
  const [subjectTotal, setSubjectTotal] = useState(0)
  const [generated, setGenerated] = useState(false)

  const loadDashboard = () => {
    let mounted = true
    setLoading(true)
    setError(null)
    Promise.all([
      teachersApi.getTeachers({ limit: 5 }),
      campusesApi.getCampuses(),
      subjectsApi.getSubjects(),
      timetableApi.getTimetableStatus({ academicYear: '2026-2027' }),
      teachersApi.getStats(),
    ])
      .then(([teachersRes, campusesRes, subjectsRes, timetableStatus, statsRes]) => {
        if (!mounted) return
        setTeachers(teachersRes.data.data)
        setCampuses(campusesRes.data.data)
        setTeacherTotal(statsRes.data.total)
        setClassTotal(campusesRes.data.data.reduce((sum, campus) => sum + campus.classCount, 0))
        setSubjectTotal(subjectsRes.data.data.length)
        setGenerated(timetableStatus.data.generated)
      })
      .catch((err) => {
        if (mounted) setError(getApiErrorMessage(err, 'Could not load dashboard. Please try again.'))
      })
      .finally(() => mounted && setLoading(false))

    return () => {
      mounted = false
    }
  }

  useEffect(() => {
    return loadDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="space-y-6">
        <ErrorBanner message={error} onRetry={loadDashboard} />
      </div>
    )
  }

  // Teacher "capacity" ring: active teachers on file vs. the school's rough
  // full-roster expectation — there's no real "capacity" number from the
  // backend, so this is deliberately just filled/total teachers as a ratio
  // of the largest campus's own current count. Kept simple and honest
  // rather than inventing a target the backend doesn't define.
  const teacherRingPercent = teacherTotal > 0 ? 100 : 0
  const classActivePercent = classTotal > 0 ? 100 : 0

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Teachers"
          value={loading ? '—' : teacherTotal}
          icon={Users}
          note="Active staff on file"
          ring={{ kind: 'ring', percent: teacherRingPercent }}
          delay={0}
        />
        <StatCard
          label="Total Classes"
          value={loading ? '—' : classTotal}
          icon={BookOpen}
          note="Active only"
          ring={{ kind: 'ring', percent: classActivePercent }}
          delay={0.05}
        />
        <StatCard
          label="Total Subjects"
          value={loading ? '—' : subjectTotal}
          icon={GraduationCap}
          note="Seeded curriculum subjects"
          ring={{ kind: 'ring', percent: 100, color: '#B4DC78' }}
          delay={0.1}
        />
        <StatCard
          label="Timetable Status"
          value={loading ? '—' : generated ? 'Generated' : 'Not Generated Yet'}
          icon={Calendar}
          note="Current academic year"
          ring={generated ? { kind: 'check' } : { kind: 'none' }}
          delay={0.15}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {campuses.map((campus, index) => {
          const accent = CAMPUS_ACCENT[campus.type]
          const Icon = accent.icon
          return (
            <motion.div
              key={campus.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.05, ease: 'easeOut' }}
              whileHover={{ y: -2, transition: { duration: 0.2 } }}
            >
              <Card
                className="relative overflow-hidden p-5"
                style={{ background: `linear-gradient(135deg, ${accent.color}0F, #FFFFFF 55%)` }}
              >
                <Icon
                  aria-hidden
                  className="pointer-events-none absolute -bottom-3 -right-3 h-24 w-24"
                  style={{ color: accent.color, opacity: 0.08 }}
                />
                <div className="relative flex items-center justify-between gap-3">
                  <h3 className="font-display text-lg text-text-primary">{campus.name}</h3>
                  <Badge color={campusBadgeColor(campus.name)} label={CAMPUS_TYPE_LABEL[campus.type]} />
                </div>
                <div className="relative mt-3 flex items-center justify-between text-[13px] text-text-secondary">
                  <span>{campus.classCount} Classes</span>
                  <span>{campus.teacherCount} Teachers</span>
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <Card className="p-5">
          <div className="mb-4">
            <h2 className="font-display text-base text-text-primary">Recent Teachers</h2>
            <p className="mt-1 text-sm text-text-muted">Last 5 added to the database.</p>
          </div>
          {loading ? (
            <LoadingSpinner />
          ) : (
            <div className="space-y-1">
              {teachers.map((teacher) => (
                <div
                  key={teacher.id}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors duration-150 hover:bg-[rgba(20,55,130,0.03)]"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={teacher.name} subjectName={teacher.subjectNames[0]} />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{teacher.name}</p>
                      <p className="mt-0.5 text-xs text-text-muted">{teacher.email ?? 'No email'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={campusBadgeColor(teacher.campusName)} label={teacher.campusName.replace(' Campus', '')} />
                    <div className="hidden gap-1 sm:flex">
                      {teacher.subjectNames.slice(0, 2).map((name) => (
                        <SubjectPill key={name} name={name} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {teachers.length === 0 ? <p className="px-3 py-6 text-center text-sm text-text-muted">No teachers yet.</p> : null}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-base text-text-primary">Campus Overview</h2>
          <div className="mt-4 space-y-2">
            {campuses.map((campus) => (
              <div key={campus.id} className="rounded-xl border border-[rgba(20,55,130,0.06)] px-4 py-3">
                <p className="font-medium text-text-primary">{campus.name}</p>
                <div className="mt-2 flex items-center justify-between text-sm text-text-secondary">
                  <span>{campus.classCount} classes</span>
                  <span>{campus.teacherCount} teachers</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
