import { prisma } from '../config/prisma.js'

/**
 * A teacher's real scheduled-periods count, counted by distinct (day,
 * period) SLOT, not by raw TimetableEntry row. Games duty (§17) puts the
 * same 1-2 teachers on multiple rows at the exact same slot when several
 * classes share the ground — that must count as ONE period of the
 * teacher's time, not once per class row, or occupancy numbers inflate
 * for anyone who does shared duty. Academic rows never share a slot per
 * teacher, so this gives the same answer as counting rows there — it's a
 * strict generalization, not a special case (mirrors the identical logic
 * in timetableGenerator.ts's own shortfall computation; kept here as the
 * one shared source so the two can't drift apart).
 */
export async function computeScheduledPeriodsByTeacher(
  teacherIds: string[],
  academicYear: string,
  // Optional — scope to only these classes' entries (e.g. §13 locked
  // classes, to find what a teacher is already committed to there before
  // the solver decides anything for the rest of the campus). Omitted means
  // every class, matching the original campus-wide occupancy behavior.
  classIds?: string[],
): Promise<Map<string, number>> {
  if (teacherIds.length === 0) return new Map()

  const entries = await prisma.timetableEntry.findMany({
    where: {
      academicYear,
      OR: [{ teacherId: { in: teacherIds } }, { secondTeacherId: { in: teacherIds } }],
      ...(classIds ? { classId: { in: classIds } } : {}),
    },
    select: { teacherId: true, secondTeacherId: true, dayOfWeek: true, periodId: true },
  })

  const slotsByTeacher = new Map<string, Set<string>>()
  for (const entry of entries) {
    const slotKey = `${entry.dayOfWeek}:${entry.periodId}`
    for (const teacherId of [entry.teacherId, entry.secondTeacherId]) {
      if (!teacherId) continue
      const slots = slotsByTeacher.get(teacherId) ?? new Set<string>()
      slots.add(slotKey)
      slotsByTeacher.set(teacherId, slots)
    }
  }

  const result = new Map<string, number>()
  for (const id of teacherIds) result.set(id, slotsByTeacher.get(id)?.size ?? 0)
  return result
}

/**
 * Same slot-dedup counting as computeScheduledPeriodsByTeacher, but scoped
 * to entries GUARANTEED to survive the next regenerate untouched — either
 * because their whole class is Locked (§13) or because the specific row is
 * Locked (§24, granular lock). Used to discount a teacher's target before a
 * solve, so someone with real locked commitments never gets handed a full
 * fresh target for the periods the solver IS deciding (the bug this guards
 * against — Miss Sania showing 31/30 — is documented in
 * timetableGenerator.ts, item 16; §24 extends the same discount to
 * row-level locks, not just whole-class ones).
 */
export async function computeCommittedPeriodsByTeacher(
  teacherIds: string[],
  academicYear: string,
  campusId: string,
  lockedClassIds: string[],
): Promise<Map<string, number>> {
  if (teacherIds.length === 0) return new Map()

  const entries = await prisma.timetableEntry.findMany({
    where: {
      campusId,
      academicYear,
      OR: [{ teacherId: { in: teacherIds } }, { secondTeacherId: { in: teacherIds } }],
      AND: [{ OR: [{ classId: { in: lockedClassIds } }, { isLocked: true }] }],
    },
    select: { teacherId: true, secondTeacherId: true, dayOfWeek: true, periodId: true },
  })

  const slotsByTeacher = new Map<string, Set<string>>()
  for (const entry of entries) {
    const slotKey = `${entry.dayOfWeek}:${entry.periodId}`
    for (const teacherId of [entry.teacherId, entry.secondTeacherId]) {
      if (!teacherId) continue
      const slots = slotsByTeacher.get(teacherId) ?? new Set<string>()
      slots.add(slotKey)
      slotsByTeacher.set(teacherId, slots)
    }
  }

  const result = new Map<string, number>()
  for (const id of teacherIds) result.set(id, slotsByTeacher.get(id)?.size ?? 0)
  return result
}
