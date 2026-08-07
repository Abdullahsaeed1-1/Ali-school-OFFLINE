import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Plus, X } from 'lucide-react'
import { Badge, campusBadgeColor } from '../../components/ui/Badge'
import { StatusDot } from '../../components/ui/StatusDot'
import { SubjectPill } from '../../components/ui/SubjectPill'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { Drawer } from '../../components/ui/Drawer'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorBanner } from '../../components/ui/ErrorBanner'
import { PillToggle } from '../../components/ui/PillToggle'
import { ProblemFlag } from '../../components/ui/ProblemFlag'
import { SelectInput } from '../../components/ui/SelectInput'
import { useToast } from '../../components/ui/Toast'
import { campusesApi } from '../../api/campuses'
import { classesApi, type ClassSummary, type ClassDetail } from '../../api/classes'
import { subjectsApi } from '../../api/subjects'
import { getApiErrorMessage } from '../../utils/apiError'

type Campus = Awaited<ReturnType<typeof campusesApi.getCampuses>>['data']['data'][number]
type Subject = Awaited<ReturnType<typeof subjectsApi.getSubjects>>['data']['data'][number]
type QuotaRow = { subjectId: string; periodsPerWeek: number }

/** Groups classes by grade level for the <optgroup>-based class selector,
 * e.g. { "1": [1A, 1B, 1C], "2": [2A, 2B] }, sorted numerically. */
function groupByGrade(classes: ClassSummary[]): Array<[string, ClassSummary[]]> {
  const groups = new Map<string, ClassSummary[]>()
  for (const cls of classes) {
    const grade = cls.gradeLevel ?? 'Other'
    const existing = groups.get(grade) ?? []
    existing.push(cls)
    groups.set(grade, existing)
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const numA = Number.parseInt(a, 10)
    const numB = Number.parseInt(b, 10)
    if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB
    return a.localeCompare(b)
  })
}

// Fixed display order — never alphabetical, so campuses don't reorder
// between renders as filters change.
const CAMPUS_DISPLAY_ORDER = ['Junior Campus', 'Girls Campus', 'Boys Campus']

/** Groups classes by campus, in a fixed Junior/Girls/Boys order — used so
 * e.g. a Boys "10A" and a Girls "10A" never sit in the same visual list
 * with only a small badge distinguishing them (§13). */
function groupByCampus(classes: ClassSummary[]): Array<[string, ClassSummary[]]> {
  const groups = new Map<string, ClassSummary[]>()
  for (const cls of classes) {
    const existing = groups.get(cls.campusName) ?? []
    existing.push(cls)
    groups.set(cls.campusName, existing)
  }
  const ordered = CAMPUS_DISPLAY_ORDER.filter((name) => groups.has(name)).map(
    (name) => [name, groups.get(name)!] as [string, ClassSummary[]],
  )
  // Any campus name outside the known three still shows up, just last.
  for (const [name, items] of groups) {
    if (!CAMPUS_DISPLAY_ORDER.includes(name)) ordered.push([name, items])
  }
  return ordered
}

const inputClass =
  'rounded-lg border border-[rgba(20,55,130,0.15)] bg-white px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-navy focus:ring-1 focus:ring-brand-navy/20'

const emptyCreateForm = {
  name: '',
  campusId: '',
  section: '',
  gradeLevel: '',
  stream: '',
  gamesProtectedLectures: [] as number[],
  gamesProtectionConfirmed: false,
}

// Only real lecture indices exist (§3's period model) — used for both the
// Add Class form's checkboxes and the existing-class editor below.
const LECTURE_NUMBERS = [1, 2, 3, 4, 5, 6, 7]

export default function ClassesPage() {
  const { pushToast } = useToast()
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [classes, setClasses] = useState<ClassSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [campusId, setCampusId] = useState('')
  const [classId, setClassId] = useState('')
  const [showActive, setShowActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState<ClassDetail | null>(null)
  const [quotaDraft, setQuotaDraft] = useState<QuotaRow[]>([])
  const [addSubjectId, setAddSubjectId] = useState('')
  const [addPeriods, setAddPeriods] = useState(5)
  const [saving, setSaving] = useState(false)
  const [savingQuotas, setSavingQuotas] = useState(false)
  const [gamesDraft, setGamesDraft] = useState<number[]>([])
  const [savingGames, setSavingGames] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creatingSubmit, setCreatingSubmit] = useState(false)

  const fetchClasses = () => {
    setLoading(true)
    setLoadError(null)
    classesApi
      .getClasses({ campusId: campusId || undefined, isActive: showActive === 'all' ? undefined : showActive === 'active' })
      .then((response) => setClasses(response.data.data))
      .catch((error) => setLoadError(getApiErrorMessage(error, 'Could not load classes. Please try again.')))
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
    fetchClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId, showActive])

  // The class-selector's own options depend on campus+active state but not
  // on the class selection itself — reset it whenever the underlying list
  // changes so a stale selection never silently filters to nothing.
  useEffect(() => {
    setClassId('')
  }, [campusId, showActive])

  const gradeGroups = useMemo(() => groupByGrade(classes), [classes])
  const visibleClasses = classId ? classes.filter((item) => item.id === classId) : classes
  // Only group into per-campus sections when campuses could actually be
  // mixed together (no campus filter active) — otherwise it's a single,
  // already-unambiguous list and the extra headers would just be noise.
  const campusGroups = useMemo(() => (campusId ? null : groupByCampus(visibleClasses)), [campusId, visibleClasses])
  const availableSubjectsToAdd = subjects.filter((s) => !quotaDraft.some((q) => q.subjectId === s.id))

  const openClass = async (id: string) => {
    setOpeningId(id)
    try {
      const response = await classesApi.getClassDetail(id)
      setCreating(false)
      setSelectedClass(response.data.data)
      setQuotaDraft(response.data.data.subjects.map((s) => ({ subjectId: s.id, periodsPerWeek: s.periodsPerWeek })))
      setGamesDraft(response.data.data.gamesProtectedLectures)
      setAddSubjectId('')
      setDrawerOpen(true)
    } catch (error) {
      pushToast({ kind: 'error', title: 'Could not open class', description: getApiErrorMessage(error, 'Could not load class details. Please try again.') })
    } finally {
      setOpeningId(null)
    }
  }

  const openCreateClass = () => {
    setSelectedClass(null)
    setCreateForm(emptyCreateForm)
    setCreateError(null)
    setCreating(true)
    setDrawerOpen(true)
  }

  const submitCreateClass = async () => {
    setCreatingSubmit(true)
    setCreateError(null)
    try {
      await classesApi.createClass({
        name: createForm.name.trim(),
        campusId: createForm.campusId,
        section: createForm.section.trim(),
        gradeLevel: createForm.gradeLevel.trim() || null,
        stream: createForm.stream.trim() || null,
        gamesProtectedLectures: createForm.gamesProtectedLectures,
        gamesProtectionConfirmed: true,
      })
      pushToast({ kind: 'success', title: 'Class created', description: `${createForm.name} was added. Add subject quotas and teacher eligibility next.` })
      setDrawerOpen(false)
      setCreating(false)
      fetchClasses()
    } catch (error) {
      // Shown inline (not just a toast) so a validation/duplicate-name
      // error stays visible next to the form while it's fixed.
      setCreateError(getApiErrorMessage(error, 'Could not create this class. Please try again.'))
    } finally {
      setCreatingSubmit(false)
    }
  }

  const toggleActive = async () => {
    if (!selectedClass) return
    setSaving(true)
    try {
      await classesApi.updateClass(selectedClass.id, { isActive: !selectedClass.isActive })
      pushToast({ kind: 'success', title: 'Class updated', description: 'The active state was saved.' })
      setDrawerOpen(false)
      fetchClasses()
    } catch (error) {
      pushToast({ kind: 'error', title: 'Update failed', description: getApiErrorMessage(error, 'Could not update this class. Please try again.') })
    } finally {
      setSaving(false)
    }
  }

  const saveGamesProtection = async () => {
    if (!selectedClass) return
    setSavingGames(true)
    try {
      await classesApi.updateClass(selectedClass.id, { gamesProtectedLectures: gamesDraft, gamesProtectionConfirmed: true })
      pushToast({ kind: 'success', title: 'Games protection saved', description: 'This class\'s protected periods were updated.' })
      setDrawerOpen(false)
      fetchClasses()
    } catch (error) {
      pushToast({ kind: 'error', title: 'Save failed', description: getApiErrorMessage(error, 'Could not save Games protection. Please try again.') })
    } finally {
      setSavingGames(false)
    }
  }

  const saveQuotas = async () => {
    if (!selectedClass) return
    setSavingQuotas(true)
    try {
      await classesApi.updateClassSubjects(selectedClass.id, { subjects: quotaDraft })
      pushToast({ kind: 'success', title: 'Subject quotas saved', description: 'The class-subject periods/week were updated.' })
      setDrawerOpen(false)
      fetchClasses()
    } catch (error) {
      pushToast({ kind: 'error', title: 'Save failed', description: getApiErrorMessage(error, 'Could not save these subject quotas. Please try again.') })
    } finally {
      setSavingQuotas(false)
    }
  }

  const columns = [
    { key: 'name', header: 'Class Name', render: (item: ClassSummary) => <span className="font-medium text-text-primary">{item.name}</span> },
    { key: 'campus', header: 'Campus', render: (item: ClassSummary) => <Badge color={campusBadgeColor(item.campusName)} label={item.campusName.replace(' Campus', '')} /> },
    { key: 'grade', header: 'Grade', render: (item: ClassSummary) => item.gradeLevel ?? '—' },
    { key: 'stream', header: 'Stream', render: (item: ClassSummary) => item.stream ?? '—' },
    {
      key: 'active',
      header: 'Active?',
      render: (item: ClassSummary) => <StatusDot color={item.isActive ? '#16A34A' : '#94A3B8'} label={item.isActive ? 'Active' : 'Inactive'} />,
    },
    {
      key: 'subjects',
      header: 'Subjects Count',
      render: (item: ClassSummary) => (
        <div className="flex items-center gap-1.5">
          <span className="tabular-nums text-text-primary">{item.subjectCount}</span>
          {/* Same reason logic as the Warnings page's "no subjects seeded"
              section (§13) — an admin browsing this table directly
              shouldn't have to visit a separate page to find out why a
              row shows 0. */}
          {item.subjectCount === 0 ? (
            <ProblemFlag
              tone="warning"
              reason={
                item.isActive
                  ? 'No quota data seeded yet for this class — add subject quotas from its Edit drawer.'
                  : "Section is marked inactive — inactive sections aren't expected to have quotas, so this is normal, not a bug. If this section should actually be teaching, open its Edit drawer and set it Active first, then add subject quotas."
              }
            />
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: ClassSummary) => (
        <Button variant="ghost" size="sm" loading={openingId === item.id} disabled={openingId !== null} onClick={() => openClass(item.id)}>
          Edit
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-text-primary">Classes</h2>
          <p className="mt-1 text-sm text-text-muted">Manage classes, their active state, and subject-quota periods/week.</p>
        </div>
        <Button onClick={openCreateClass} variant="primary" size="md">
          <Plus className="h-4 w-4" /> Add Class
        </Button>
      </div>

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <SelectInput value={campusId} onChange={(e) => setCampusId(e.target.value)}>
            <option value="">All campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </SelectInput>
          <SelectInput value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All Classes</option>
            {gradeGroups.map(([grade, items]) => (
              <optgroup key={grade} label={grade === 'Other' ? 'Other' : `Grade ${grade}`}>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {/* No campus filter active — a Boys "10A" and a Girls "10A" would
                        otherwise look identical in this list (§13). */}
                    {campusId ? item.name : `${item.name} — ${item.campusName.replace(' Campus', '')}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectInput>
        </div>
        <PillToggle
          value={showActive}
          onChange={setShowActive}
          options={[
            { value: 'all', label: 'All states' },
            { value: 'active', label: 'Active only' },
            { value: 'inactive', label: 'Inactive only' },
          ]}
        />
      </Card>

      {loadError ? (
        <ErrorBanner message={loadError} onRetry={fetchClasses} />
      ) : campusGroups ? (
        // Grouped by campus (Junior/Girls/Boys), each in its own labeled
        // section — a Boys "10A" and a Girls "10A" never sit in the same
        // visual list with only a small badge to tell them apart (§13).
        <div className="space-y-6">
          {campusGroups.map(([campusName, items]) => (
            <div key={campusName}>
              <div className="mb-2 flex items-center gap-2">
                <Badge color={campusBadgeColor(campusName)} label={campusName.replace(' Campus', '')} />
                <h3 className="font-display text-base text-text-primary">{campusName}</h3>
                <span className="text-xs text-text-muted">({items.length} classes)</span>
              </div>
              <DataTable columns={columns} data={items} isLoading={loading} emptyState={null} />
            </div>
          ))}
          {!campusGroups.length && !loading ? (
            <EmptyState icon={BookOpen} title="No classes found" description="No class records match the current filters." />
          ) : null}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={visibleClasses}
          isLoading={loading}
          emptyState={<EmptyState icon={BookOpen} title="No classes found" description="No class records match the current filters." />}
        />
      )}

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={creating ? 'Add Class' : selectedClass ? `Class ${selectedClass.name}` : 'Class'}
        footer={
          creating ? (
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Cancel</Button>
              <Button
                loading={creatingSubmit}
                disabled={!createForm.name || !createForm.campusId || !createForm.section || !createForm.gamesProtectionConfirmed}
                onClick={submitCreateClass}
              >
                Save
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              {selectedClass ? (
                <Button variant="ghost" loading={saving} onClick={toggleActive}>
                  {selectedClass.isActive ? 'Set Inactive' : 'Set Active'}
                </Button>
              ) : <div />}
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Cancel</Button>
                <Button variant="ghost" loading={savingGames} onClick={saveGamesProtection}>Save Games protection</Button>
                <Button loading={savingQuotas} onClick={saveQuotas}>Save subject quotas</Button>
              </div>
            </div>
          )
        }
      >
        {creating ? (
          <div className="space-y-4">
            {createError ? <ErrorBanner message={createError} /> : null}
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((current) => ({ ...current, name: e.target.value }))}
                placeholder="Name (e.g. 6A, KG-B, Nursery)"
                className={inputClass}
              />
              <SelectInput
                value={createForm.campusId}
                onChange={(e) => setCreateForm((current) => ({ ...current, campusId: e.target.value }))}
              >
                <option value="">Select campus</option>
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </SelectInput>
              <input
                value={createForm.section}
                onChange={(e) => setCreateForm((current) => ({ ...current, section: e.target.value }))}
                placeholder="Section (e.g. A, B)"
                className={inputClass}
              />
              <input
                value={createForm.gradeLevel}
                onChange={(e) => setCreateForm((current) => ({ ...current, gradeLevel: e.target.value }))}
                placeholder="Grade level (optional — e.g. 6, Nursery, KG)"
                className={inputClass}
              />
              <input
                value={createForm.stream}
                onChange={(e) => setCreateForm((current) => ({ ...current, stream: e.target.value }))}
                placeholder="Stream (optional — e.g. Science, Arts)"
                className={inputClass}
              />
            </div>
            <p className="text-xs text-text-muted">
              Grade level is free text — it doesn&apos;t need to be a number, Junior campus classes like
              &quot;Nursery&quot; or &quot;KG&quot; are expected. After saving, add subject quotas here and set up
              teacher eligibility on the Teachers page before generating a timetable.
            </p>
            <div className="rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Games protection (required)
              </p>
              <p className="mb-2 text-xs text-text-muted">
                Pick which lecture-period numbers below should always be reserved for Games for this class (e.g.
                period 6). When you tick a number, the timetable generator will never fill that period with an
                academic subject for this class — Games goes there instead. Leave all unchecked only if this
                class genuinely doesn&apos;t need a protected Games slot — that&apos;s a valid, confirmed answer,
                not a placeholder. You can&apos;t skip this step entirely: without a real answer here, a
                newly-added grade could silently end up with no Games period at all, which is exactly the bug
                this replaced.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {LECTURE_NUMBERS.map((n) => {
                  const checked = createForm.gamesProtectedLectures.includes(n)
                  return (
                    <label
                      key={n}
                      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition-colors duration-150 ${
                        checked
                          ? 'border-brand-navy bg-brand-navy text-white'
                          : 'border-[rgba(20,55,130,0.15)] bg-white text-text-secondary hover:bg-[rgba(20,55,130,0.04)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() =>
                          setCreateForm((current) => ({
                            ...current,
                            gamesProtectedLectures: checked
                              ? current.gamesProtectedLectures.filter((p) => p !== n)
                              : [...current.gamesProtectedLectures, n].sort((a, b) => a - b),
                          }))
                        }
                      />
                      {n}
                    </label>
                  )
                })}
              </div>
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={createForm.gamesProtectionConfirmed}
                  onChange={(e) => setCreateForm((current) => ({ ...current, gamesProtectionConfirmed: e.target.checked }))}
                />
                I&apos;ve confirmed Games protection for this class
              </label>
            </div>
          </div>
        ) : selectedClass ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3 text-sm text-text-secondary">
              Campus: {selectedClass.campusName}
            </div>
            <div className="rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3 text-sm text-text-secondary">
              Teacher eligibilities: {selectedClass.eligibleTeachers.length}
            </div>
            <div className="rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Games protection
              </p>
              <p className="mb-2 text-xs text-text-muted">
                Lecture-period numbers that are always reserved for Games for this class — the generator will
                never fill a ticked period with an academic subject. Empty means this class has no reserved
                Games slot; that&apos;s a valid, confirmed answer, not a gap.
              </p>
              <div className="flex flex-wrap gap-2">
                {LECTURE_NUMBERS.map((n) => {
                  const checked = gamesDraft.includes(n)
                  return (
                    <label
                      key={n}
                      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition-colors duration-150 ${
                        checked
                          ? 'border-brand-navy bg-brand-navy text-white'
                          : 'border-[rgba(20,55,130,0.15)] bg-white text-text-secondary hover:bg-[rgba(20,55,130,0.04)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() =>
                          setGamesDraft((current) =>
                            checked ? current.filter((p) => p !== n) : [...current, n].sort((a, b) => a - b),
                          )
                        }
                      />
                      {n}
                    </label>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Subject Quotas (periods/week)</p>
              <div className="mb-3 grid gap-2 md:grid-cols-[1fr_100px_auto]">
                <SelectInput value={addSubjectId} onChange={(e) => setAddSubjectId(e.target.value)}>
                  <option value="">Select subject to add</option>
                  {availableSubjectsToAdd.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </SelectInput>
                <input
                  type="number"
                  min={0}
                  value={addPeriods}
                  onChange={(e) => setAddPeriods(Number(e.target.value))}
                  className={inputClass}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!addSubjectId}
                  onClick={() => {
                    if (!addSubjectId) return
                    setQuotaDraft((current) => [...current, { subjectId: addSubjectId, periodsPerWeek: addPeriods }])
                    setAddSubjectId('')
                    setAddPeriods(5)
                  }}
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
              <div className="space-y-2 rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3">
                {quotaDraft.map((row) => {
                  const subject = subjects.find((s) => s.id === row.subjectId)
                  return (
                    <div key={row.subjectId} className="flex items-center justify-between gap-2 text-sm">
                      <SubjectPill name={subject?.name ?? 'Unknown subject'} />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={row.periodsPerWeek}
                          onChange={(e) =>
                            setQuotaDraft((current) =>
                              current.map((item) =>
                                item.subjectId === row.subjectId ? { ...item, periodsPerWeek: Number(e.target.value) } : item,
                              ),
                            )
                          }
                          className={`${inputClass} w-20 text-right tabular-nums`}
                        />
                        <span className="text-text-muted">/week</span>
                        <button
                          type="button"
                          onClick={() => setQuotaDraft((current) => current.filter((item) => item.subjectId !== row.subjectId))}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-brand-maroon/10 hover:text-brand-maroon"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {!quotaDraft.length ? <p className="text-sm text-text-muted">No subjects assigned yet.</p> : null}
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
