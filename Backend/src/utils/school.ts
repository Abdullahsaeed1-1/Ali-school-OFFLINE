import { CampusType, DayOfWeek } from '../constants/enums.js'

export const weekdayOrder: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
]

export function campusTypeLabel(type: CampusType): string {
  if (type === CampusType.JUNIOR) return 'Junior'
  if (type === CampusType.GIRLS) return 'Girls'
  return 'Boys'
}

// Period timings are uniform across every campus/level (confirmed school
// rule, §3): the only thing that varies is Mon-Thu vs Friday duration, never
// class age. Period.classGroup stores that day-type ('MON_THU' | 'FRIDAY').
export function periodDayType(day: DayOfWeek): 'MON_THU' | 'FRIDAY' {
  return day === DayOfWeek.FRIDAY ? 'FRIDAY' : 'MON_THU'
}

export function parseOptionalInt(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}