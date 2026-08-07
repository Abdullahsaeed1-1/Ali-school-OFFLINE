import { getInitials } from '../../utils/initials'
import { getSubjectColor } from '../../utils/subjectColors'

/** Circular initials avatar, colored by the person's primary subject. */
export function Avatar({
  name,
  subjectName,
  size = 36,
  className = '',
}: {
  name: string
  subjectName?: string | null
  size?: number
  className?: string
}) {
  const color = getSubjectColor(subjectName)
  return (
    <div
      className={['flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className].join(' ')}
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.36 }}
    >
      {getInitials(name)}
    </div>
  )
}
