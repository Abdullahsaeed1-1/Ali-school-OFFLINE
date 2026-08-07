import { DayOfWeek, HiringStatus, TeacherStatus } from '@prisma/client'
import { periodDayType, weekdayOrder } from '../utils/school.js'

const SOLVER_SERVICE_URL = process.env.SOLVER_SERVICE_URL ?? 'http://localhost:8001'

/**
 * Games rotation-duty (§17, corrected 2026-07-25) — a fundamentally
 * different mechanism from every other subject. The school clarified:
 * duty is 2 teachers per (day, period), supervising the WHOLE ground at
 * once — not 2 teachers per class. If only 1 class has Games in a period,
 * 1 teacher covers it; if several classes share that period on the
 * ground, it's still just 1-2 teachers total for all of them combined,
 * never more. There is no dedicated PE teacher and no fixed
 * (teacher, subject, class) eligibility triple.
 *
 * This replaces the original (incorrect) per-class-section duty-pair
 * model, which assumed every class needed its OWN 2 teachers — that
 * produced a false capacity ceiling (11 Girls classes × 2 = 22
 * "simultaneous" teachers needed against only 12 hired staff). Under the
 * real shared-ground model, demand is only ever 1-2 teachers per period,
 * regardless of how many classes are on the ground — the ceiling doesn't
 * exist.
 *
 * Design (engineering call, §17 explicitly left this to us): still a
 * separate pass after the main CP-SAT solve (same reasoning as before —
 * Games doesn't need hard eligibility, and needs to know who's already
 * busy from academic assignments), but restructured into two phases:
 *   1. Placement — decide which (day, period) each class's Games periods
 *      land in, strictly within its LIGHT_LATE window (periods 5-7, plus
 *      whichever lecture(s) this class's gamesProtectedLectures explicitly
 *      reserves, e.g. period 4 — see candidatePeriodsFor). Unlike academic
 *      tier windows (item 6, a soft preference), this
 *      window is a HARD boundary for Games — it must never spill into
 *      CORE_EARLY periods, since that would undercut the whole
 *      priority-subjects-first principle the tier system exists for
 *      (correction, 2026-07-25, after an earlier version of this fix
 *      briefly widened the fallback to "any open period that day," which
 *      did reach into CORE_EARLY and was reverted). If nothing's open in
 *      the window that day, the class genuinely has no room for Games —
 *      reported as an honest shortfall (see `unplaced` below), never
 *      silently placed outside the window. Capped at 1 placement/day per
 *      class (mirrors solve.py constraint 8, item 11) so a class needing
 *      >5/week can't cluster 2+ Games periods on one day. This no longer
 *      needs to consider teacher availability at all, since duty demand is
 *      now tiny relative to the hired staff pool.
 *   2. Duty assignment — group placements by (day, period). Each group
 *      (however many classes share it) needs exactly 1 teacher if it's the
 *      only class there, or 2 if 2+ classes share it. WHO covers each group
 *      is decided by a small CP-SAT model in the solver service (§17 Phase
 *      2, see duty_solve.py) rather than a greedy first-fit — confirmed
 *      2026-07-27 that greedy left real, closable coverage on the table
 *      (8 of 44 needed Girls slots went uncovered even though a feasible
 *      assignment covering all of them existed for the exact same teacher
 *      capacities). Candidates are still only teachers whose remaining
 *      capacity (target minus real academic load, seeded from the
 *      freshly-written solve results) is above 0 — a teacher's target is a
 *      ceiling, never just a floor to reach, so someone already at or over
 *      it from academics alone is excluded from duty entirely (item 13,
 *      2026-07-27); the solver enforces this as a hard per-teacher capacity
 *      constraint, so it can only change WHICH slots get covered, never let
 *      anyone over their target.
 *
 * Only used for campuses where Games has no real TeacherSubject
 * eligibility (Girls/Boys) — Junior's whole-class homeroom teachers are
 * already eligible for Games in their own section like any other subject
 * (§6b), so Junior's Games periods go through the normal CP-SAT solve and
 * never reach this scheduler.
 */

type PrismaTx = any

export type GamesDutyAssignment = {
  classId: string
  day: DayOfWeek
  periodId: string
  teacherId: string | null
  secondTeacherId: string | null
}

export type GamesUnplacedShortfall = {
  classId: string
  className: string
  subjectId: string
  subjectName: string
  required: number
  scheduled: number
  shortfall: number
}

export type GamesDutyGap = {
  classId: string
  className: string
  day: DayOfWeek
  periodNumber: number
  teachersFound: number
  teachersNeeded: number
}

export type GamesDutyResult = {
  assignments: GamesDutyAssignment[]
  unplaced: GamesUnplacedShortfall[]
  understaffed: GamesDutyGap[]
}

type SlotRef = { day: DayOfWeek; periodId: string; periodNumber: number }
type Placement = { classId: string; className: string; day: DayOfWeek; periodId: string; periodNumber: number }

export async function scheduleGamesDuty(
  tx: PrismaTx,
  { campusId, academicYear }: { campusId: string; academicYear: string },
): Promise<GamesDutyResult> {
  const gamesSubject = await tx.subject.findFirst({ where: { name: 'Games' } })
  if (!gamesSubject) return { assignments: [], unplaced: [], understaffed: [] }

  const classesWithGames = await tx.class.findMany({
    where: {
      campusId,
      isActive: true,
      // Locked classes (§13) are fully frozen — their existing Games
      // periods (if any) stay exactly as they are, never re-evaluated here.
      isLocked: false,
      classSubjects: { some: { subjectId: gamesSubject.id, periodsPerWeek: { gt: 0 } } },
    },
    select: {
      id: true,
      name: true,
      gamesProtectedLectures: true,
      classSubjects: { where: { subjectId: gamesSubject.id }, select: { periodsPerWeek: true } },
    },
    orderBy: { name: 'asc' },
  })
  if (classesWithGames.length === 0) return { assignments: [], unplaced: [], understaffed: [] }

  const periods = await tx.period.findMany({
    where: { campusId, isBreak: false },
    select: { id: true, periodNumber: true, classGroup: true },
    orderBy: [{ classGroup: 'asc' }, { periodNumber: 'asc' }],
  })
  const periodsByDayType = new Map<string, typeof periods>()
  for (const period of periods) {
    const rows = periodsByDayType.get(period.classGroup) ?? []
    rows.push(period)
    periodsByDayType.set(period.classGroup, rows)
  }
  // slotsByDay[day][lectureIndex-1] = that day's period at that position
  const slotsByDay = new Map<DayOfWeek, SlotRef[]>()
  for (const day of weekdayOrder) {
    const dayPeriods = periodsByDayType.get(periodDayType(day)) ?? []
    slotsByDay.set(
      day,
      dayPeriods.map((p: { id: string; periodNumber: number }) => ({ day, periodId: p.id, periodNumber: p.periodNumber })),
    )
  }

  // Duty pool: real, active, HIRED teachers only — a TO_BE_HIRED row is a
  // placeholder for a vacancy, not a person who can stand and supervise.
  const dutyPool: Array<{ id: string; name: string; targetPeriodsPerWeek: number }> = await tx.teacher.findMany({
    where: { campusId, status: TeacherStatus.ACTIVE, hiringStatus: HiringStatus.HIRED },
    select: { id: true, name: true, targetPeriodsPerWeek: true },
    orderBy: { name: 'asc' },
  })
  const targetByTeacher = new Map(dutyPool.map((t) => [t.id, t.targetPeriodsPerWeek]))

  // Busy sets seeded from the main solve's academic assignments (already
  // written to DB before this runs) — keyed "day:periodId". This is also
  // the ONLY source of academic load at this point (Games itself hasn't
  // been written yet — this pass is what creates it), so counting distinct
  // slots per teacherId here gives each teacher's real pre-duty total.
  const existingEntries = await tx.timetableEntry.findMany({
    where: { campusId, academicYear },
    select: { classId: true, dayOfWeek: true, periodId: true, teacherId: true, subjectId: true, isLocked: true },
  })
  const classBusy = new Set<string>()
  // Seeds each teacher's running total at their real academic load, not 0 —
  // a teacher already at their target from academics alone must never be
  // handed duty on top (the whole point of this fix, see module docstring).
  const totalCount = new Map<string, number>()
  // §24 (Granular Lock) — a class can have an individually-locked Games
  // period surviving from before (the whole class isn't Locked, so it
  // wasn't filtered out of classesWithGames above). classBusy already
  // blocks that exact slot from being re-placed; this additionally shrinks
  // the remaining quota Phase 1 tries to fill, so a locked period counts
  // toward this week's total instead of being scheduled on top of it.
  const lockedGamesCountByClass = new Map<string, number>()
  const lockedGamesCountByClassDay = new Map<string, number>()
  for (const entry of existingEntries) {
    classBusy.add(`${entry.classId}:${entry.dayOfWeek}:${entry.periodId}`)
    if (entry.teacherId) {
      if (targetByTeacher.has(entry.teacherId)) {
        totalCount.set(entry.teacherId, (totalCount.get(entry.teacherId) ?? 0) + 1)
      }
    }
    if (entry.isLocked && entry.subjectId === gamesSubject.id) {
      lockedGamesCountByClass.set(entry.classId, (lockedGamesCountByClass.get(entry.classId) ?? 0) + 1)
      const dayKey = `${entry.classId}:${entry.dayOfWeek}`
      lockedGamesCountByClassDay.set(dayKey, (lockedGamesCountByClassDay.get(dayKey) ?? 0) + 1)
    }
  }

  // Always restricted to the LIGHT_LATE window (5-7) plus whichever
  // lectures this class's gamesProtectedLectures explicitly reserves —
  // never the whole day. Protected lectures are checked first (so e.g. a
  // class protecting period 4 tries that slot before spilling into 5-7),
  // but there is no more "I don't recognize this class, so use the whole
  // day" fallback — that was the actual root cause of the "11 Arts" bug
  // (item 27 audit, PENDING_QUESTIONS.md item 30): an unrecognized grade
  // used to fall through to `daySlots`, leaving Games completely
  // unprotected against CORE_EARLY periods. Every class now has an
  // explicit, admin-confirmed answer (possibly empty), so this always has
  // a safe, restricted window to fall back to.
  function candidatePeriodsFor(day: DayOfWeek, protectedLectures: number[]): SlotRef[] {
    const daySlots = slotsByDay.get(day) ?? []
    const indices = [...new Set([...protectedLectures, 5, 6, 7])]
    return indices.map((i) => daySlots[i - 1]).filter((s): s is SlotRef => Boolean(s))
  }

  // ---- Phase 1: placement — per class, ignoring teacher availability ----
  // (demand is now tiny relative to the staff pool, so availability is
  // resolved afterward, once we know how many classes actually share each slot)
  const placements: Placement[] = []
  const unplaced: GamesUnplacedShortfall[] = []

  for (const cls of classesWithGames) {
    const quota = Math.max(0, (cls.classSubjects[0]?.periodsPerWeek ?? 0) - (lockedGamesCountByClass.get(cls.id) ?? 0))
    if (quota <= 0) continue
    // Mirrors solve.py constraint 8's same-subject-same-day cap (item 11) —
    // 1/day for every currently-confirmed quota (all <= 5/week).
    const maxPerDay = Math.max(1, Math.ceil(quota / 5))

    let remaining = quota
    // Seeded from any already-locked Games period(s) that day, so the
    // same-day cap correctly counts a locked slot as part of that day's
    // total rather than leaving room for a second new one on top of it.
    const placedToday = new Map<DayOfWeek, number>(
      weekdayOrder
        .map((day): [DayOfWeek, number] => [day, lockedGamesCountByClassDay.get(`${cls.id}:${day}`) ?? 0])
        .filter(([, count]) => count > 0),
    )

    for (const day of weekdayOrder) {
      if (remaining <= 0) break
      // LIGHT_LATE window only — candidatePeriodsFor already returns every
      // LIGHT_LATE slot for this group (plus Period 4 for Group A), so
      // there's no further "other LIGHT_LATE period" to widen into. CORE_EARLY
      // periods (1-3 for Group A, 1-4 for Group B) must never be used as a
      // Games fallback — that would break the priority-subjects-first
      // principle the tier system exists for (unlike academic tier windows,
      // which are a soft preference, Games' window is a hard boundary it
      // must never cross). If nothing's open in this window, the class
      // genuinely has no room for Games today — reported as an honest
      // shortfall, not silently placed in a CORE_EARLY period.
      const candidates = candidatePeriodsFor(day, cls.gamesProtectedLectures)

      while (remaining > 0 && (placedToday.get(day) ?? 0) < maxPerDay) {
        const openSlot = candidates.find((slot) => !classBusy.has(`${cls.id}:${day}:${slot.periodId}`))
        if (!openSlot) break // no open LIGHT_LATE slot this day

        classBusy.add(`${cls.id}:${day}:${openSlot.periodId}`)
        placements.push({ classId: cls.id, className: cls.name, day, periodId: openSlot.periodId, periodNumber: openSlot.periodNumber })
        remaining -= 1
        placedToday.set(day, (placedToday.get(day) ?? 0) + 1)
      }
    }

    if (remaining > 0) {
      unplaced.push({
        classId: cls.id,
        className: cls.name,
        subjectId: gamesSubject.id,
        subjectName: gamesSubject.name,
        required: quota,
        scheduled: quota - remaining,
        shortfall: remaining,
      })
    }
  }

  // ---- Phase 2: group placements by (day, period) — shared ground duty ----
  const groups = new Map<string, Placement[]>()
  for (const p of placements) {
    const key = `${p.day}:${p.periodId}`
    const list = groups.get(key) ?? []
    list.push(p)
    groups.set(key, list)
  }
  const orderedKeys = [...groups.keys()]

  // Real academic busy-slots per teacher, as "day:periodId" strings — the
  // hard block the duty solver enforces. (`existingEntries` is purely
  // academic at this point; Games itself hasn't been written yet.)
  const academicBusyByTeacher = new Map<string, string[]>()
  for (const entry of existingEntries) {
    if (!entry.teacherId) continue
    const list = academicBusyByTeacher.get(entry.teacherId) ?? []
    list.push(`${entry.dayOfWeek}:${entry.periodId}`)
    academicBusyByTeacher.set(entry.teacherId, list)
  }

  const assignments: GamesDutyAssignment[] = []
  const understaffed: GamesDutyGap[] = []

  if (orderedKeys.length > 0) {
    const dutyGroupsForSolver = orderedKeys.map((key) => {
      const group = groups.get(key)!
      const { day, periodId } = group[0]
      return { day, periodId, teachersNeeded: group.length >= 2 ? 2 : 1 }
    })
    const dutyTeachersForSolver = dutyPool.map((t) => ({
      id: t.id,
      name: t.name,
      capacity: Math.max(0, t.targetPeriodsPerWeek - (totalCount.get(t.id) ?? 0)),
      busySlots: academicBusyByTeacher.get(t.id) ?? [],
    }))

    const response = await fetch(`${SOLVER_SERVICE_URL}/solve-duty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: dutyGroupsForSolver, teachers: dutyTeachersForSolver }),
    })
    if (!response.ok) {
      throw new Error(`Duty solver service returned ${response.status}: ${await response.text()}`)
    }
    const solved = (await response.json()) as { solved: boolean; assignments: Array<{ day: string; periodId: string; teacherIds: string[] }> }
    if (!solved.solved) {
      throw new Error('Duty solver could not find any solution — this should not happen (capacity/coverage is all soft via understaffed reporting)')
    }

    const resultByKey = new Map(solved.assignments.map((a) => [`${a.day}:${a.periodId}`, a.teacherIds]))

    for (const key of orderedKeys) {
      const group = groups.get(key)!
      const { day, periodId, periodNumber } = group[0]
      const teachersNeeded = group.length >= 2 ? 2 : 1
      const teacherIds = resultByKey.get(key) ?? []

      for (const placement of group) {
        assignments.push({
          classId: placement.classId,
          day: placement.day,
          periodId: placement.periodId,
          teacherId: teacherIds[0] ?? null,
          secondTeacherId: teacherIds[1] ?? null,
        })
      }
      if (teacherIds.length < teachersNeeded) {
        for (const placement of group) {
          understaffed.push({
            classId: placement.classId,
            className: placement.className,
            day,
            periodNumber,
            teachersFound: teacherIds.length,
            teachersNeeded,
          })
        }
      }
    }
  }

  return { assignments, unplaced, understaffed }
}
