/**
 * Fixed subject -> accent color mapping, mirrored exactly in
 * mobile-app/lib/core/constants/subject_colors.dart so a subject reads as
 * the same color in both apps. Subjects not in this list (Physics,
 * Chemistry, Biology, Reading/Writing, Activity, Diary, Arabic, WRA, ...)
 * fall back to the slate default rather than guessing a color for them.
 */
const SUBJECT_COLORS: Record<string, string> = {
  English: '#2563EB',
  Maths: '#7C3AED',
  Science: '#0891B2',
  Islamiat: '#D97706',
  Urdu: '#DC2626',
  Games: '#16A34A',
  'Geography/SS': '#9333EA',
  'Computer Science': '#0F766E',
  History: '#B45309',
}

const SUBJECT_DEFAULT_COLOR = '#475569'

export function getSubjectColor(subjectName: string | null | undefined): string {
  if (!subjectName) return SUBJECT_DEFAULT_COLOR
  return SUBJECT_COLORS[subjectName] ?? SUBJECT_DEFAULT_COLOR
}

/** Same color at ~10% opacity (hex alpha suffix), for pill/badge backgrounds. */
export function getSubjectBgColor(subjectName: string | null | undefined): string {
  return getSubjectColor(subjectName) + '1A'
}
