import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, FileQuestion, RefreshCw, UserX } from 'lucide-react'
import { Badge, campusBadgeColor } from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import { ErrorBanner } from '../../components/ui/ErrorBanner'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { SubjectPill } from '../../components/ui/SubjectPill'
import {
  warningsApi,
  type EmptyClassWarning,
  type GamesDutyWarning,
  type NoEligibleTeacherWarning,
  type ToBeHiredTeacherWarning,
  type WarningsData,
} from '../../api/warnings'
import { getApiErrorMessage } from '../../utils/apiError'

function AllClear({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[rgba(22,163,74,0.2)] bg-[#F0FDF4] p-3 text-sm text-[#166534]">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      {text}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, count }: { icon: typeof AlertTriangle; title: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-5 w-5 text-brand-maroon" />
      <h3 className="font-display text-lg text-text-primary">{title}</h3>
      {count > 0 ? (
        <span className="rounded-full bg-brand-maroon/10 px-2 py-0.5 text-xs font-semibold text-brand-maroon">{count}</span>
      ) : null}
    </div>
  )
}

// Fixed display order — matches every other grouped page in this app
// (Classes, Teachers, Capacity Advisor), never alphabetical, so campuses
// don't reorder between renders.
const CAMPUS_DISPLAY_ORDER = ['Junior Campus', 'Girls Campus', 'Boys Campus']

/** Groups any warning row with a campusName field into Junior/Girls/Boys
 * order (§13's grouping convention, reused here for consistency). */
function groupByCampus<T extends { campusName: string }>(rows: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const existing = groups.get(row.campusName) ?? []
    existing.push(row)
    groups.set(row.campusName, existing)
  }
  const ordered = CAMPUS_DISPLAY_ORDER.filter((name) => groups.has(name)).map(
    (name) => [name, groups.get(name)!] as [string, T[]],
  )
  for (const [name, items] of groups) {
    if (!CAMPUS_DISPLAY_ORDER.includes(name)) ordered.push([name, items])
  }
  return ordered
}

/** Further groups a campus's rows by className, alphabetically — used for
 * the three warning types that are inherently class-scoped. */
function groupByClass<T extends { className: string }>(rows: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const existing = groups.get(row.className) ?? []
    existing.push(row)
    groups.set(row.className, existing)
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function CampusGroupHeading({ campusName, count }: { campusName: string; count: number }) {
  return (
    <div className="mb-2 mt-4 flex items-center gap-2 first:mt-0">
      <Badge color={campusBadgeColor(campusName)} label={campusName.replace(' Campus', '')} />
      <span className="text-xs text-text-muted">
        {count} {count === 1 ? 'item' : 'items'}
      </span>
    </div>
  )
}

export default function WarningsPage() {
  const [data, setData] = useState<WarningsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    warningsApi
      .getWarnings()
      .then((response) => setData(response.data.data))
      .catch((err) => setError(getApiErrorMessage(err, 'Could not load warnings. Please try again.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorBanner message={error} onRetry={load} />
  if (!data) return null

  const toBeHiredByCampus = groupByCampus<ToBeHiredTeacherWarning>(data.toBeHiredTeachers)
  const noEligibleByCampus = groupByCampus<NoEligibleTeacherWarning>(data.noEligibleTeacher)
  const gamesDutyByCampus = groupByCampus<GamesDutyWarning>(data.gamesDuty)
  const emptyClassesByCampus = groupByCampus<EmptyClassWarning>(data.emptyClasses)

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="font-display text-2xl text-text-primary">Warnings & Data Completeness</h2>
        <p className="mt-1 text-sm text-text-muted">
          What still needs a real answer before every class has a complete, fully-staffed timetable. Grouped by
          campus, then by class.
        </p>
      </motion.div>

      <Card className="p-4">
        <SectionHeader icon={UserX} title="To Be Hired — hiring gaps" count={data.toBeHiredTeachers.length} />
        {data.toBeHiredTeachers.length === 0 ? (
          <AllClear text="No open hiring gaps — every teacher row is a confirmed hire." />
        ) : (
          toBeHiredByCampus.map(([campusName, teachers]) => (
            <div key={campusName}>
              <CampusGroupHeading campusName={campusName} count={teachers.length} />
              <div className="space-y-3">
                {teachers.map((teacher) => (
                  <div key={teacher.id} className="rounded-xl border border-[rgba(180,83,9,0.2)] bg-amber-50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-medium text-text-primary">{teacher.name}</span>
                    </div>
                    <p className="mb-1.5 text-xs uppercase tracking-[0.1em] text-amber-800">Depends on this hire:</p>
                    <div className="flex flex-wrap gap-2">
                      {teacher.dependents.map((dep, index) => (
                        <div key={index} className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs">
                          <SubjectPill name={dep.subjectName} />
                          <span className="text-text-secondary">{dep.className}</span>
                        </div>
                      ))}
                      {!teacher.dependents.length ? <span className="text-xs text-text-muted">No subject/class assigned yet.</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader icon={AlertTriangle} title="Zero eligible teacher" count={data.noEligibleTeacher.length} />
        {data.noEligibleTeacher.length === 0 ? (
          <AllClear text="Every class-subject requirement has at least one eligible teacher (hired or to-be-hired)." />
        ) : (
          noEligibleByCampus.map(([campusName, rows]) => (
            <div key={campusName}>
              <CampusGroupHeading campusName={campusName} count={rows.length} />
              {groupByClass(rows).map(([className, classRows]) => (
                <div key={className} className="mb-3 overflow-hidden rounded-xl border border-[rgba(20,55,130,0.08)]">
                  <div className="border-b border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] px-3 py-2 text-sm font-medium text-text-primary">
                    {className}
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-[0.08em] text-text-muted">
                      <tr>
                        <th className="px-3 py-2">Subject</th>
                        <th className="px-3 py-2 text-right">Periods/week</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classRows.map((gap) => (
                        <tr key={`${gap.classId}-${gap.subjectId}`} className="border-t border-[rgba(20,55,130,0.06)]">
                          <td className="px-3 py-2"><SubjectPill name={gap.subjectName} /></td>
                          <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{gap.periodsPerWeek}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader icon={RefreshCw} title="Games duty — rotation capacity" count={data.gamesDuty.length} />
        <p className="mb-2 text-xs text-text-muted">
          Games has no fixed teacher — existing staff rotate duty in pairs instead. This table shows how that
          worked out in the most recently generated timetable, not a "no teacher at all" alarm.
        </p>
        <dl className="mb-3 grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs text-text-muted sm:grid-cols-2">
          <div className="flex gap-1">
            <dt className="font-semibold text-text-secondary">Required/week:</dt>
            <dd>how many Games periods this class needs per week.</dd>
          </div>
          <div className="flex gap-1">
            <dt className="font-semibold text-text-secondary">Scheduled:</dt>
            <dd>how many of those actually made it onto the timetable.</dd>
          </div>
          <div className="flex gap-1">
            <dt className="font-semibold text-brand-maroon">Unstaffed:</dt>
            <dd>Games period couldn&apos;t be placed on the timetable at all — it&apos;s simply missing.</dd>
          </div>
          <div className="flex gap-1">
            <dt className="font-semibold text-amber-700">Understaffed:</dt>
            <dd>Games period WAS placed, but only 1 of the 2 needed duty teachers was free — it still happens, just short-handed.</dd>
          </div>
        </dl>
        {data.gamesDuty.length === 0 ? (
          <AllClear text="Every generated Games period this week has its full 2-teacher duty pair." />
        ) : (
          gamesDutyByCampus.map(([campusName, rows]) => (
            <div key={campusName}>
              <CampusGroupHeading campusName={campusName} count={rows.length} />
              <div className="overflow-hidden rounded-xl border border-[rgba(20,55,130,0.08)]">
                <table className="w-full text-sm">
                  <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-[0.08em] text-text-muted">
                    <tr>
                      <th className="px-3 py-2">Class</th>
                      <th className="px-3 py-2 text-right">Required/week</th>
                      <th className="px-3 py-2 text-right">Scheduled</th>
                      <th className="px-3 py-2 text-right">Unstaffed</th>
                      <th className="px-3 py-2 text-right">Understaffed (1 of 2)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].sort((a, b) => a.className.localeCompare(b.className)).map((gap) => (
                      <tr key={gap.classId} className="border-t border-[rgba(20,55,130,0.06)]">
                        <td className="px-3 py-2 font-medium text-text-primary">{gap.className}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{gap.required}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{gap.scheduled}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-maroon">{gap.unstaffed || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700">{gap.understaffed || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader icon={FileQuestion} title="Classes with no subjects seeded" count={data.emptyClasses.length} />
        {data.emptyClasses.length === 0 ? (
          <AllClear text="Every class has at least one subject quota seeded." />
        ) : (
          emptyClassesByCampus.map(([campusName, rows]) => (
            <div key={campusName}>
              <CampusGroupHeading campusName={campusName} count={rows.length} />
              <div className="space-y-2">
                {[...rows].sort((a, b) => a.className.localeCompare(b.className)).map((cls) => (
                  <div key={cls.classId} className="flex items-center justify-between rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3 text-sm">
                    <span className="font-medium text-text-primary">{cls.className}</span>
                    <span className="text-text-muted">{cls.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
