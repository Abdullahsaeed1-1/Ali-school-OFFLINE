import { getSubjectColor } from '../../utils/subjectColors'

/** A subject name pill — subject-color background at low opacity, subject-color text. */
export function SubjectPill({ name, className = '' }: { name: string; className?: string }) {
  const color = getSubjectColor(name)
  return (
    <span
      className={['inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', className].join(' ')}
      style={{ backgroundColor: `${color}1F`, color }}
    >
      {name}
    </span>
  )
}
