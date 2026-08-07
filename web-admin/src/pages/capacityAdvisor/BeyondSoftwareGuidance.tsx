import type { BeyondSoftwareGuidance } from '../../api/capacityAdvisor'

/**
 * Shown under a BEYOND SOFTWARE teacher — purely informational, never an
 * action button, since suggesting a brand-new subject for someone is a
 * staffing decision, not something this page executes (see
 * capacityAdvisor.controller.ts's module docstring). Two angles, both
 * grounded in real data rather than a guess at pedagogical fit:
 * - subjects sharing an existing tier classification with what this
 *   teacher already teaches, that the campus genuinely has no one for
 * - the campus's largest uncovered gaps overall, for context
 */
export function BeyondSoftwareGuidancePanel({ guidance }: { guidance: BeyondSoftwareGuidance }) {
  if (!guidance.relatedGapSubjects.length && !guidance.topCampusGaps.length) return null

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-[rgba(20,55,130,0.08)] bg-white p-3 text-xs text-text-secondary">
      {guidance.relatedGapSubjects.length ? (
        <div>
          <p className="mb-1.5 font-medium text-text-primary">
            Worth a look — same tier as subjects they already teach, and currently no one covers these:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {guidance.relatedGapSubjects.map((gap) => (
              <span
                key={gap.subjectId}
                className="rounded-full border border-[rgba(20,55,130,0.12)] bg-[#F8FAFC] px-2 py-0.5 text-text-secondary"
              >
                {gap.subjectName} <span className="text-text-muted">({gap.className}, {gap.periodsPerWeek}/wk)</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {guidance.topCampusGaps.length ? (
        <div>
          <p className="mb-1.5 font-medium text-text-primary">Most urgent uncovered gaps on this campus overall:</p>
          <div className="space-y-1">
            {guidance.topCampusGaps.map((gap) => (
              <div key={`${gap.classId}:${gap.subjectId}`} className="flex items-center justify-between">
                <span>
                  {gap.subjectName} — {gap.className}
                </span>
                <span className="tabular-nums text-text-muted">{gap.periodsPerWeek}/wk</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <p className="italic text-text-muted">
        Guidance for a staffing conversation — not a suggestion this page applies on its own.
      </p>
    </div>
  )
}
