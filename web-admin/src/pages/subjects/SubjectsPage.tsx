import { useEffect, useState } from 'react'
import { BookMarked, Plus } from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { Drawer } from '../../components/ui/Drawer'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorBanner } from '../../components/ui/ErrorBanner'
import { ProblemFlag } from '../../components/ui/ProblemFlag'
import { SelectInput } from '../../components/ui/SelectInput'
import { StatusDot } from '../../components/ui/StatusDot'
import { useToast } from '../../components/ui/Toast'
import { subjectsApi, type Subject, type SubjectTier } from '../../api/subjects'
import { getApiErrorMessage } from '../../utils/apiError'

const inputClass =
  'rounded-lg border border-[rgba(20,55,130,0.15)] bg-white px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-navy focus:ring-1 focus:ring-brand-navy/20'

const TIER_LABEL: Record<SubjectTier, string> = {
  CORE_EARLY: 'Core — early periods',
  LIGHT_LATE: 'Light — later periods',
  UNSET: 'Unconfirmed',
}

function TierBadge({ tier }: { tier: SubjectTier }) {
  if (tier === 'UNSET') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
          Unconfirmed
        </span>
        <ProblemFlag
          tone="warning"
          reason="This subject's tier was never confirmed by the school. Until it is, the generator places its periods anywhere in the week rather than guessing whether it belongs early or late — this is exactly the gap that caused real placement bugs before (History, and several Junior-only subjects). Confirm with the school which it should be, then click Edit on this row and set Core-early or Light-later."
        />
      </span>
    )
  }
  return <span className="text-sm text-text-secondary">{TIER_LABEL[tier]}</span>
}

type SubjectForm = { name: string; code: string; isCore: boolean; tier: SubjectTier }
const emptyForm: SubjectForm = { name: '', code: '', isCore: true, tier: 'UNSET' }

export default function SubjectsPage() {
  const { pushToast } = useToast()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SubjectForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Phase 3 item 8 — bulk tier assignment: apply one tier to many selected
  // subjects at once instead of opening the Edit drawer per subject. Reuses
  // the exact same `PATCH /subjects/:id` endpoint (item 23) one call per
  // selected subject, not a new bulk endpoint — updateSubject already does a
  // true partial merge, so each call only ever touches `tier`.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTier, setBulkTier] = useState<Exclude<SubjectTier, 'UNSET'>>('CORE_EARLY')
  const [bulkApplying, setBulkApplying] = useState(false)

  const fetchSubjects = () => {
    setLoading(true)
    setLoadError(null)
    subjectsApi
      .getSubjects()
      .then((response) => setSubjects(response.data.data))
      .catch((error) => setLoadError(getApiErrorMessage(error, 'Could not load subjects. Please try again.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchSubjects()
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setDrawerOpen(true)
  }

  const openEdit = (subject: Subject) => {
    setEditingId(subject.id)
    setForm({ name: subject.name, code: subject.code ?? '', isCore: subject.isCore, tier: subject.tier })
    setFormError(null)
    setDrawerOpen(true)
  }

  const save = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        isCore: form.isCore,
        tier: form.tier,
      }
      if (editingId) {
        await subjectsApi.updateSubject(editingId, payload)
        pushToast({ kind: 'success', title: 'Subject updated', description: 'Changes were saved successfully.' })
      } else {
        await subjectsApi.createSubject(payload)
        pushToast({
          kind: 'success',
          title: 'Subject created',
          description:
            form.tier === 'UNSET'
              ? `${payload.name} was added with an unconfirmed tier — set it once the school confirms where it belongs.`
              : `${payload.name} was added.`,
        })
      }
      setDrawerOpen(false)
      fetchSubjects()
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'Could not save this subject. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = subjects.length > 0 && subjects.every((s) => selectedIds.has(s.id))
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(subjects.map((s) => s.id)))
  }

  const applyBulkTier = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    setBulkApplying(true)
    try {
      const results = await Promise.allSettled(ids.map((id) => subjectsApi.updateSubject(id, { tier: bulkTier })))
      const failed = results.filter((r) => r.status === 'rejected').length
      const succeeded = results.length - failed
      if (failed === 0) {
        pushToast({
          kind: 'success',
          title: 'Tier updated',
          description: `${TIER_LABEL[bulkTier]} applied to ${succeeded} subject${succeeded === 1 ? '' : 's'}.`,
        })
      } else {
        pushToast({
          kind: 'error',
          title: 'Some updates failed',
          description: `${succeeded} of ${ids.length} subjects updated. ${failed} failed — please retry those individually.`,
        })
      }
      setSelectedIds(new Set())
      fetchSubjects()
    } finally {
      setBulkApplying(false)
    }
  }

  const columns = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleSelectAll}
          aria-label="Select all subjects"
          className="h-4 w-4 rounded border-[rgba(20,55,130,0.3)] text-brand-navy focus:ring-brand-navy/30"
        />
      ),
      className: 'w-10',
      render: (s: Subject) => (
        <input
          type="checkbox"
          checked={selectedIds.has(s.id)}
          onChange={() => toggleSelected(s.id)}
          aria-label={`Select ${s.name}`}
          className="h-4 w-4 rounded border-[rgba(20,55,130,0.3)] text-brand-navy focus:ring-brand-navy/30"
        />
      ),
    },
    { key: 'name', header: 'Name', render: (s: Subject) => <span className="font-medium text-text-primary">{s.name}</span> },
    { key: 'code', header: 'Code', render: (s: Subject) => s.code ?? '—' },
    {
      key: 'core',
      header: 'Core?',
      render: (s: Subject) => <StatusDot color={s.isCore ? '#16A34A' : '#94A3B8'} label={s.isCore ? 'Core' : 'Elective'} />,
    },
    { key: 'tier', header: 'Tier', render: (s: Subject) => <TierBadge tier={s.tier} /> },
    {
      key: 'actions',
      header: 'Actions',
      render: (s: Subject) => (
        <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
          Edit
        </Button>
      ),
    },
  ]

  const unconfirmedCount = subjects.filter((s) => s.tier === 'UNSET').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-text-primary">Subjects</h2>
          <p className="mt-1 text-sm text-text-muted">
            Manage subjects and their scheduling tier — the tier controls whether the generator places a subject's
            periods early or late in the day.
          </p>
        </div>
        <Button onClick={openCreate} variant="primary" size="md">
          <Plus className="h-4 w-4" /> Add Subject
        </Button>
      </div>

      {unconfirmedCount > 0 ? (
        <Card className="flex items-center gap-2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span>
            {unconfirmedCount} subject{unconfirmedCount === 1 ? '' : 's'} {unconfirmedCount === 1 ? 'has' : 'have'} no
            confirmed tier — the generator won't guess where {unconfirmedCount === 1 ? 'it' : 'they'} belong
            {unconfirmedCount === 1 ? 's' : ''} in the day until this is set below.
          </span>
        </Card>
      ) : null}

      {selectedIds.size > 0 ? (
        <Card className="flex flex-wrap items-center gap-3 border border-brand-navy/20 bg-brand-navy/5 p-3">
          <span className="text-sm font-medium text-text-primary">
            {selectedIds.size} subject{selectedIds.size === 1 ? '' : 's'} selected
          </span>
          {/* SelectInput's own base classes always include w-full, which would
              stretch it across this flex row — constrained via a fixed-width
              wrapper instead of fighting that utility with a conflicting one. */}
          <div className="w-56">
            <SelectInput value={bulkTier} onChange={(e) => setBulkTier(e.target.value as Exclude<SubjectTier, 'UNSET'>)}>
              <option value="CORE_EARLY">Core — early periods</option>
              <option value="LIGHT_LATE">Light — later periods</option>
            </SelectInput>
          </div>
          <Button size="sm" loading={bulkApplying} onClick={applyBulkTier}>
            Apply to {selectedIds.size} subject{selectedIds.size === 1 ? '' : 's'}
          </Button>
          <Button size="sm" variant="ghost" disabled={bulkApplying} onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </Card>
      ) : null}

      {loadError ? (
        <ErrorBanner message={loadError} onRetry={fetchSubjects} />
      ) : (
        <DataTable
          columns={columns}
          data={subjects}
          isLoading={loading}
          emptyState={<EmptyState icon={BookMarked} title="No subjects found" description="Add the first subject to get started." action={{ label: 'Add Subject', onClick: openCreate }} />}
        />
      )}

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingId ? 'Edit Subject' : 'Add Subject'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={save}>{editingId ? 'Update' : 'Save'}</Button>
          </div>
        }
      >
        <div className="space-y-5">
          {formError ? <ErrorBanner message={formError} /> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              placeholder="Name (e.g. Maths, Islamiat/GK)"
              className={inputClass}
            />
            <input
              value={form.code}
              onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))}
              placeholder="Code (optional)"
              className={inputClass}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={form.isCore}
              onChange={(e) => setForm((current) => ({ ...current, isCore: e.target.checked }))}
              className="h-4 w-4 rounded border-[rgba(20,55,130,0.3)] text-brand-navy focus:ring-brand-navy/30"
            />
            Core subject
          </label>
          <div>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Scheduling tier
            </span>
            <SelectInput value={form.tier} onChange={(e) => setForm((current) => ({ ...current, tier: e.target.value as SubjectTier }))}>
              <option value="UNSET">Unconfirmed — don't guess, flag it</option>
              <option value="CORE_EARLY">Core — early periods</option>
              <option value="LIGHT_LATE">Light — later periods</option>
            </SelectInput>
            <p className="mt-1.5 text-xs text-text-muted">
              Leave this as &quot;Unconfirmed&quot; until the school actually confirms where this subject belongs —
              guessing a tier caused real scheduling bugs before. An unconfirmed subject is scheduled anywhere in the
              week and flagged, rather than silently placed wrong.
            </p>
          </div>
        </div>
      </Drawer>
    </div>
  )
}
