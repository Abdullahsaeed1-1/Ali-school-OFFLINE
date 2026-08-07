export function campusNameFromType(type: 'JUNIOR' | 'GIRLS' | 'BOYS') {
  if (type === 'JUNIOR') return 'Junior'
  if (type === 'GIRLS') return 'Girls'
  return 'Boys'
}

/** 'FRIDAY' periods are shorter than the rest of the week (§3) — everything
 * else uses the 'MON_THU' set. Matches Backend's periodDayType(). */
export function periodDayType(day: string): 'MON_THU' | 'FRIDAY' {
  return day === 'FRIDAY' ? 'FRIDAY' : 'MON_THU'
}