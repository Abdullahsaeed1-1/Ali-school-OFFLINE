import { DayOfWeek, TeacherStatus } from '../constants/enums.js'
import { parseGamesProtectedLectures } from '../utils/gamesProtection.js'
import { prisma } from '../config/prisma.js'
import { periodDayType, weekdayOrder } from '../utils/school.js'
import { computeCommittedPeriodsByTeacher, computeScheduledPeriodsByTeacher } from '../utils/teacherOccupancy.js'
import { solveTimetable } from '../utils/solverClient.js'
import { scheduleGamesDuty, type GamesDutyGap } from './gamesDutyScheduler.js'

type GenerateInput = {
  campusId?: string
  academicYear: string
}

// Correct-by-construction scheduling (§12) lives in the CP-SAT solver
// service (Backend/solver/) — this file's only job is assembling its input
// from Prisma and writing its output back as TimetableEntry rows. Keep
// these types in sync with Backend/solver/schemas.py, the only other place
// this contract is defined.
type SolverSlot = { slotId: string; day: string; periodId: string; lectureIndex: number }
type SolverSubjectRequirement = { subjectId: string; subjectName: string; tier: string; periodsPerWeek: number }
type SolverClass = {
  id: string
  name: string
  // Which lecture indices (1-7) Games is reserved in for this class, if any
  // — explicit per-class data now (Class.gamesProtectedLectures), not
  // inferred from gradeLevel. Empty array means "confirmed, no protection
  // needed". Whether this is enforced as a hard wall (Junior, Games flows
  // through this same solve) or just narrows other subjects' soft windows
  // (Girls/Boys, Games is handled by the separate duty scheduler instead)
  // is decided by solve.py based on whether Games appears in requirements
  // at all — see gamesHasRealEligibility below.
  gamesProtectedLectures: number[]
  requirements: SolverSubjectRequirement[]
}
type SolverEligibility = { classId: string; subjectId: string }
type SolverTeacher = { id: string; name: string; targetPeriodsPerWeek: number; eligibility: SolverEligibility[] }
// §24 (Granular Lock) — a single already-decided (class, slot) from a
// row-level locked TimetableEntry, within a class that ISN'T itself Locked.
// teacherIds covers both a Games-duty pair, if any — every one of them must
// be excluded from every OTHER class's candidate variables at this exact
// slot, or the solver could double-book someone whose time is already spoken
// for by a row it will never touch.
type SolverLockedSlot = { classId: string; slotId: string; subjectId: string; teacherIds: string[] }
type SolveRequestBody = {
  academicYear: string
  campusId: string
  slots: SolverSlot[]
  classes: SolverClass[]
  teachers: SolverTeacher[]
  lockedSlots: SolverLockedSlot[]
}

type SolveAssignment = { classId: string; day: string; periodId: string; teacherId: string; subjectId: string }
export type ClassSubjectShortfall = {
  classId: string
  className: string
  subjectId: string
  subjectName: string
  required: number
  scheduled: number
  shortfall: number
}
export type TeacherShortfall = {
  teacherId: string
  teacherName: string
  target: number
  scheduled: number
  shortfall: number
}
type SolveResponseBody = {
  solved: boolean
  assignments: SolveAssignment[]
  classSubjectShortfalls: ClassSubjectShortfall[]
  teacherShortfalls: TeacherShortfall[]
  stats: { variableCount: number; solveTimeMs: number; solverStatus: string; tierWindowViolations: number }
}

// Transactions that touch every class of a full campus can run long — give
// this one more headroom than Prisma's 5s default so a big campus doesn't
// roll back on timeout alone.
const TRANSACTION_TIMEOUT_MS = 20_000

// Item 30 D.2 — thrown when a campus's timetableGenerationVersion has moved
// since this call captured its expected value, meaning a second,
// near-simultaneous Generate for the same campus already committed. Caught
// per-campus (not at the top level) so one campus losing this race doesn't
// abort a multi-campus call for every OTHER campus too.
class StaleGenerationError extends Error {
  constructor(campusName: string) {
    super(`Generate for ${campusName} conflicted with another Generate request that ran at the same time`)
    this.name = 'StaleGenerationError'
  }
}

export async function generateTimetable({ campusId, academicYear }: GenerateInput) {
  const start = Date.now()

  const campuses = campusId
    ? await prisma.campus.findMany({ where: { id: campusId } })
    : await prisma.campus.findMany()

  const gamesSubject = await prisma.subject.findFirst({ where: { name: 'Games' } })

  const campusStats: Record<
    string,
    { totalEntries: number; unassignedEntries: number; byClass: Record<string, number> }
  > = {}
  let totalEntries = 0
  let unassignedEntries = 0
  let classesCovered = 0
  let classesSkipped = 0
  let classesLocked = 0
  const classSubjectShortfalls: ClassSubjectShortfall[] = []
  const teacherShortfalls: TeacherShortfall[] = []
  const gamesDutyGaps: GamesDutyGap[] = []
  const solverDiagnostics: Record<
    string,
    { variableCount: number; solveTimeMs: number; solverStatus: string; tierWindowViolations: number }
  > = {}
  // Item 30 D.2 — campuses whose Generate lost a concurrency race against
  // another near-simultaneous Generate for the same campus. Reported
  // honestly instead of a false success; nothing from a conflicted campus
  // is counted in the totals/stats above.
  const conflicts: Array<{ campusId: string; campusName: string }> = []

  for (const campus of campuses) {
    try {
      // Captured now, before this campus's (slow) solver call — not
      // re-fetched right before the write below, or this would just always
      // match "current" and defeat the whole check. See StaleGenerationError.
      const expectedVersion = campus.timetableGenerationVersion

      const classesRaw = await prisma.class.findMany({
        where: { campusId: campus.id, isActive: true },
        select: {
          id: true,
          name: true,
          isLocked: true,
          gamesProtectedLectures: true,
          classSubjects: {
            select: { periodsPerWeek: true, subject: { select: { id: true, name: true, tier: true } } },
          },
        },
        orderBy: { name: 'asc' },
      })

      // Locked classes (manual-lock feature, §13) are fully frozen — excluded
      // from the solver entirely and never touched by the delete step below,
      // regardless of what else changes for the rest of this campus.
      const lockedClasses = classesRaw.filter((cls) => cls.isLocked)
      const lockedClassIds = lockedClasses.map((cls) => cls.id)
      const unlockedClassesRaw = classesRaw.filter((cls) => !cls.isLocked)
      classesLocked += lockedClasses.length

      const classes = unlockedClassesRaw.filter((cls) => cls.classSubjects.some((cs) => cs.periodsPerWeek > 0))
      classesSkipped += unlockedClassesRaw.length - classes.length
      classesCovered += classes.length

      if (classes.length === 0) {
        console.warn(`[timetable] ${campus.name}: no class has any ClassSubject rows — nothing to schedule`)
        campusStats[campus.id] = { totalEntries: 0, unassignedEntries: 0, byClass: {} }
        continue
      }

      const teachers = await prisma.teacher.findMany({
        where: { campusId: campus.id, status: TeacherStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          targetPeriodsPerWeek: true,
          teacherSubjects: { select: { subjectId: true, classId: true } },
        },
      })

      const periods = await prisma.period.findMany({
        where: { campusId: campus.id, isBreak: false },
        select: { id: true, periodNumber: true, classGroup: true },
        orderBy: [{ classGroup: 'asc' }, { periodNumber: 'asc' }],
      })

      // classGroup stores day-type ('MON_THU' | 'FRIDAY') — periods are
      // uniform across every class now (§3), so this is built once per campus.
      const periodsByDayType = new Map<string, typeof periods>()
      for (const period of periods) {
        const rows = periodsByDayType.get(period.classGroup) ?? []
        rows.push(period)
        periodsByDayType.set(period.classGroup, rows)
      }

      // A Period row is reused across all 4 Mon-Thu days (only day-TYPE is
      // stored on Period, not the specific day) — slotId disambiguates.
      const slots: SolverSlot[] = weekdayOrder.flatMap((day) =>
        (periodsByDayType.get(periodDayType(day)) ?? []).map((period, index) => ({
          slotId: `${day}:${period.id}`,
          day,
          periodId: period.id,
          lectureIndex: index + 1,
        })),
      )

      // Games (§17) has no fixed TeacherSubject eligibility on Girls/Boys —
      // existing teachers rotate duty instead, handled by a separate pass
      // after this solve (see gamesDutyScheduler.ts). Junior is different:
      // each homeroom teacher is already eligible for Games in their own
      // section (auto-generated alongside every other subject, §6b), so
      // Junior's Games stays in the normal solve. Detect which situation
      // this campus is in from real eligibility data, rather than hardcoding
      // campus type, so it self-adapts if that ever changes.
      const gamesHasRealEligibility =
        gamesSubject != null && teachers.some((t) => t.teacherSubjects.some((ts) => ts.subjectId === gamesSubject.id))

      // §24 (Granular Lock) — rows locked individually (single-period lock, or
      // a teacher-day bulk lock) inside a class that ISN'T itself Locked. These
      // survive the delete step below untouched; the solver must know about
      // them too, on both sides: reduce the remaining weekly requirement by
      // however many are already locked-filled, and forbid every OTHER
      // class's variables from using the same slot or the same teacher(s) at
      // that slot (built into lockedSlots below).
      const unlockedClassIds = classes.map((cls) => cls.id)
      const lockedRows = unlockedClassIds.length
        ? await prisma.timetableEntry.findMany({
            where: { campusId: campus.id, academicYear, classId: { in: unlockedClassIds }, isLocked: true },
            select: { classId: true, dayOfWeek: true, periodId: true, subjectId: true, teacherId: true, secondTeacherId: true },
          })
        : []

      const lockedPeriodsByClassSubject = new Map<string, number>()
      for (const row of lockedRows) {
        if (!row.subjectId) continue
        const key = `${row.classId}:${row.subjectId}`
        lockedPeriodsByClassSubject.set(key, (lockedPeriodsByClassSubject.get(key) ?? 0) + 1)
      }

      const lockedSlots: SolverLockedSlot[] = lockedRows
        .filter((row): row is typeof row & { subjectId: string } => Boolean(row.subjectId))
        .map((row) => ({
          classId: row.classId,
          slotId: `${row.dayOfWeek}:${row.periodId}`,
          subjectId: row.subjectId,
          teacherIds: [row.teacherId, row.secondTeacherId].filter((id): id is string => Boolean(id)),
        }))

      const solverClasses: SolverClass[] = classes.map((cls) => ({
        id: cls.id,
        name: cls.name,
        gamesProtectedLectures: parseGamesProtectedLectures(cls.gamesProtectedLectures),
        requirements: cls.classSubjects
          .filter((cs) => cs.periodsPerWeek > 0)
          .filter((cs) => gamesHasRealEligibility || cs.subject.id !== gamesSubject?.id)
          .map((cs) => ({
            subjectId: cs.subject.id,
            subjectName: cs.subject.name,
            tier: cs.subject.tier,
            periodsPerWeek: Math.max(
              0,
              cs.periodsPerWeek - (lockedPeriodsByClassSubject.get(`${cls.id}:${cs.subject.id}`) ?? 0),
            ),
          })),
      }))

      // Locked classes (§13) freeze their rows, but a teacher who appears
      // there (academic or Games duty) is still a real person with only 24
      // real hours — the solver must know about that commitment too, or it
      // happily hands them a full fresh target for the classes it IS
      // deciding, pushing their true total over the ceiling the moment they
      // touch a locked class (bug found 2026-07-27: Miss Sania showed 31/30
      // because her locked class's duty period wasn't discounted anywhere
      // upstream of the academic solve). §24 extends the same discount to
      // individually-locked rows, not just whole locked classes.
      const committedByTeacher = await computeCommittedPeriodsByTeacher(
        teachers.map((t) => t.id),
        academicYear,
        campus.id,
        lockedClassIds,
      )

      const solverTeachers: SolverTeacher[] = teachers.map((teacher) => ({
        id: teacher.id,
        name: teacher.name,
        targetPeriodsPerWeek: Math.max(0, teacher.targetPeriodsPerWeek - (committedByTeacher.get(teacher.id) ?? 0)),
        eligibility: teacher.teacherSubjects.map((ts) => ({ classId: ts.classId, subjectId: ts.subjectId })),
      }))

      const requestBody: SolveRequestBody = {
        academicYear,
        campusId: campus.id,
        slots,
        classes: solverClasses,
        teachers: solverTeachers,
        lockedSlots,
      }

      console.log(
        `[timetable] ${campus.name}: solving ${solverClasses.length} classes, ${solverTeachers.length} teachers...`,
      )
      const response = await solveTimetable(requestBody)
      if (!response.ok) {
        throw new Error(`Solver service returned ${response.status}: ${await response.text()}`)
      }
      const solved = (await response.json()) as SolveResponseBody
      if (!solved.solved) {
        throw new Error(`Solver could not find any solution for ${campus.name} — this should not happen (shortfalls should absorb infeasibility instead)`)
      }

      // Item 30 D.2 — the compare-and-swap sits in the SAME transaction as
      // the write it's guarding: if another Generate's own transaction has
      // already bumped this campus's version since we captured
      // expectedVersion above (i.e. it committed first), updateMany matches
      // zero rows and we throw to roll back this entire transaction —
      // delete+insert included — instead of writing over/alongside
      // whatever that other request already committed.
      await prisma.$transaction(
        async (tx) => {
          const versionUpdate = await tx.campus.updateMany({
            where: { id: campus.id, timetableGenerationVersion: expectedVersion },
            data: { timetableGenerationVersion: { increment: 1 } },
          })
          if (versionUpdate.count === 0) {
            throw new StaleGenerationError(campus.name)
          }

          // notIn: [] is a no-op filter when nothing's locked, so this is safe
          // even for campuses with no locked classes at all. isLocked: false
          // additionally protects individually-locked rows (§24) inside a
          // class that isn't itself Locked — the solver already excluded
          // competing variables for those exact slots above, so nothing new
          // will ever try to occupy them anyway.
          await tx.timetableEntry.deleteMany({
            where: { campusId: campus.id, academicYear, classId: { notIn: lockedClassIds }, isLocked: false },
          })
          if (solved.assignments.length) {
            await tx.timetableEntry.createMany({
              data: solved.assignments.map((a) => ({
                academicYear,
                dayOfWeek: a.day as DayOfWeek,
                campusId: campus.id,
                classId: a.classId,
                teacherId: a.teacherId,
                subjectId: a.subjectId,
                periodId: a.periodId,
                isActive: true,
              })),
            })
          }
        },
        { timeout: TRANSACTION_TIMEOUT_MS },
      )

      // Games rotation-duty (§17) — runs after the main solve, reading its
      // freshly-written entries to know who's already busy. Only for
      // campuses where Games has no real eligibility (see above).
      let dutyAssignments: Array<{ classId: string }> = []
      let dutyUnplaced: ClassSubjectShortfall[] = []
      let dutyUnderstaffed: GamesDutyGap[] = []
      if (!gamesHasRealEligibility && gamesSubject) {
        // Item 30 D.2 — this writes separately from the main transaction
        // above (it needs to read the entries that transaction just
        // committed, plus makes its own external call to the duty solver),
        // which is its own, later window for a THIRD Generate to have
        // already committed in between. Checked here (against the version
        // this call's own main transaction just set, expectedVersion + 1),
        // not bumped again — nothing downstream needs to distinguish beyond
        // "did my own main write survive to this point."
        const dutyResult = await prisma.$transaction(
          async (tx) => {
            const currentCampus = await tx.campus.findUnique({
              where: { id: campus.id },
              select: { timetableGenerationVersion: true },
            })
            if (currentCampus?.timetableGenerationVersion !== expectedVersion + 1) {
              throw new StaleGenerationError(campus.name)
            }
            return scheduleGamesDuty(tx, { campusId: campus.id, academicYear })
          },
          { timeout: TRANSACTION_TIMEOUT_MS },
        )
        if (dutyResult.assignments.length) {
          await prisma.timetableEntry.createMany({
            data: dutyResult.assignments.map((a) => ({
              academicYear,
              dayOfWeek: a.day,
              campusId: campus.id,
              classId: a.classId,
              teacherId: a.teacherId,
              secondTeacherId: a.secondTeacherId,
              subjectId: gamesSubject.id,
              periodId: a.periodId,
              isActive: true,
            })),
          })
        }
        dutyAssignments = dutyResult.assignments
        dutyUnplaced = dutyResult.unplaced
        dutyUnderstaffed = dutyResult.understaffed
        gamesDutyGaps.push(...dutyUnderstaffed)
        for (const gap of dutyUnderstaffed) {
          console.warn(
            `[timetable] ${campus.name}: Games duty for "${gap.className}" on ${gap.day} period ${gap.periodNumber} ` +
              `only found ${gap.teachersFound}/${gap.teachersNeeded} free teachers`,
          )
        }
        for (const shortfall of dutyUnplaced) {
          console.warn(
            `[timetable] ${campus.name}: Games duty for "${shortfall.className}" could not place ` +
              `${shortfall.shortfall} of its required ${shortfall.required} periods/week at all`,
          )
        }
      }

      const allCampusShortfalls = [...solved.classSubjectShortfalls, ...dutyUnplaced]

      const classNameById = new Map(classes.map((cls) => [cls.id, cls.name]))
      const byClass: Record<string, number> = {}
      for (const assignment of [...solved.assignments, ...dutyAssignments]) {
        const className = classNameById.get(assignment.classId)
        if (className) byClass[className] = (byClass[className] ?? 0) + 1
      }
      // §24 — locked rows are preserved untouched by this run (never re-sent
      // to the solver, whose own requirement counts were already reduced to
      // account for them), but they're still real periods on the class's real
      // schedule — count them too, or a class with any locked period would
      // otherwise be reported short of its true total.
      for (const row of lockedRows) {
        const className = classNameById.get(row.classId)
        if (className) byClass[className] = (byClass[className] ?? 0) + 1
      }

      // Recomputed from the real written rows (academic + games duty) rather
      // than trusting solve.py's academic-only numbers, so a teacher's
      // games-duty periods count toward their 30/35-week target too. See
      // computeScheduledPeriodsByTeacher's own docstring for why this counts
      // distinct (day, period) slots rather than raw rows (shared Games duty
      // — §17 — puts the same teacher on multiple rows at once slot).
      const scheduledByTeacher = await computeScheduledPeriodsByTeacher(
        teachers.map((t) => t.id),
        academicYear,
      )

      const campusTeacherShortfalls: TeacherShortfall[] = teachers
        .map((teacher) => {
          const scheduled = scheduledByTeacher.get(teacher.id) ?? 0
          const shortfall = Math.max(0, teacher.targetPeriodsPerWeek - scheduled)
          return { teacherId: teacher.id, teacherName: teacher.name, target: teacher.targetPeriodsPerWeek, scheduled, shortfall }
        })
        .filter((t) => t.shortfall > 0)

      const campusUnassigned = allCampusShortfalls.reduce((sum, s) => sum + s.shortfall, 0)
      const campusTotal = solved.assignments.length + dutyAssignments.length + campusUnassigned + lockedRows.length

      totalEntries += campusTotal
      unassignedEntries += campusUnassigned
      campusStats[campus.id] = { totalEntries: campusTotal, unassignedEntries: campusUnassigned, byClass }
      classSubjectShortfalls.push(...allCampusShortfalls)
      teacherShortfalls.push(...campusTeacherShortfalls)
      solverDiagnostics[campus.id] = solved.stats

      for (const shortfall of allCampusShortfalls) {
        console.warn(
          `[timetable] ${campus.name}: "${shortfall.subjectName}" in class "${shortfall.className}" is short ` +
            `${shortfall.shortfall} of its required ${shortfall.required} periods/week`,
        )
      }
    } catch (error) {
      if (error instanceof StaleGenerationError) {
        console.warn(`[timetable] ${error.message}`)
        conflicts.push({ campusId: campus.id, campusName: campus.name })
        continue
      }
      throw error
    }
  }

  const durationMs = Date.now() - start
  console.log(`Timetable generated in ${durationMs}ms`)

  return {
    success: true,
    stats: {
      totalEntries,
      unassignedEntries,
      assignedEntries: totalEntries - unassignedEntries,
      classesCovered,
      classesSkipped,
      classesLocked,
      byCampus: campusStats,
      classSubjectShortfalls,
      teacherShortfalls,
      gamesDutyGaps,
      solverDiagnostics,
    },
    conflicts,
    durationMs,
  }
}
