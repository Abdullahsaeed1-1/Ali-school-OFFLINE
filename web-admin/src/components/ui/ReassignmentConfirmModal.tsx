import { Modal } from './Modal'

export type ReassignmentPreview = {
  className: string
  subjectName: string
  periodsPerWeek: number
  toTeacherName: string
  toTeacherCurrentPeriods: number
  toTeacherTarget: number
  fromTeacherName: string
  fromTeacherCurrentPeriods: number
  fromTeacherTarget: number
  fromTeacherPairScheduled: number
}

/**
 * Shared "who gains, who loses" confirmation for a Capacity Advisor
 * reassignment — a literal move of one (class, subject) eligibility pair
 * from one teacher to another, never additive. Reused across every surface
 * that offers a reassignment (Edit Teacher drawer, Timetable page's
 * shortfall flags, Teacher Timetable page's blank-cell hint) so the impact
 * preview always reads identically no matter where it was triggered from.
 */
export function ReassignmentConfirmModal({
  target,
  applying,
  onConfirm,
  onClose,
}: {
  target: ReassignmentPreview | null
  applying: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      isOpen={target !== null}
      title={target ? `Reassign ${target.subjectName} in ${target.className}?` : ''}
      description="This moves the eligibility pair from the current holder — a real move, not an addition."
      confirmLabel="Confirm & Add"
      intent="danger"
      confirmLoading={applying}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      {target ? (
        <div className="space-y-2 text-sm">
          <div className="rounded-xl border border-[rgba(22,163,74,0.2)] bg-[#F0FDF4] p-3">
            <p className="font-medium text-[#166534]">{target.toTeacherName} (gains)</p>
            <p className="mt-1 text-text-secondary">
              {target.toTeacherCurrentPeriods}/{target.toTeacherTarget} → up to{' '}
              {Math.min(target.toTeacherTarget, target.toTeacherCurrentPeriods + target.periodsPerWeek)}/
              {target.toTeacherTarget} once regenerated.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="font-medium text-amber-800">{target.fromTeacherName} (loses)</p>
            <p className="mt-1 text-text-secondary">
              {target.fromTeacherCurrentPeriods}/{target.fromTeacherTarget} → down to{' '}
              {target.fromTeacherCurrentPeriods - target.fromTeacherPairScheduled}/{target.fromTeacherTarget}.
            </p>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
