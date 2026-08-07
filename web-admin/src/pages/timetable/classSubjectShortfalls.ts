import type { ClassDetail } from '../../api/classes'
import type { TimetableEntry } from '../../api/timetable'

export type SubjectShortfall = {
  subjectId: string
  subjectName: string
  required: number
  scheduled: number
}

/**
 * Per-subject shortfall for one class, computed from persisted data (the
 * class's own confirmed quota vs. what's actually scheduled) rather than
 * the last-generate response — so it's available fresh, not just right
 * after clicking Generate this session. Extracted from TimetablePage so
 * the Gaps & Suggestions page (and anywhere else that needs "which
 * subjects are short for this class") shares the exact same computation
 * instead of a second copy that could drift.
 */
export function computeClassSubjectShortfalls(
  classDetail: ClassDetail | null,
  entries: TimetableEntry[],
): SubjectShortfall[] {
  if (!classDetail) return []
  const scheduledCount = new Map<string, number>()
  for (const entry of entries) {
    if (!entry.subjectId) continue
    scheduledCount.set(entry.subjectId, (scheduledCount.get(entry.subjectId) ?? 0) + 1)
  }
  return classDetail.subjects
    .map((subject) => ({
      subjectId: subject.id,
      subjectName: subject.name,
      required: subject.periodsPerWeek,
      scheduled: scheduledCount.get(subject.id) ?? 0,
    }))
    .filter((s) => s.scheduled < s.required)
}
