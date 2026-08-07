import type { Request, Response } from 'express'
import { Prisma, SubjectTier } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { handleControllerError, sendError } from '../utils/apiError.js'
import { computeScheduledPeriodsByTeacher } from '../utils/teacherOccupancy.js'

const ACADEMIC_YEAR = '2026-2027'

/**
 * Capacity Advisor — related to Warnings but distinct in purpose: Warnings
 * reports problems, this suggests safe fixes for under-occupied teachers.
 *
 * For each teacher below target, matches their EXISTING subjects (never
 * suggests a brand-new subject — that's a staffing decision, not something
 * software should propose) against real curriculum need (ClassSubject rows
 * with periodsPerWeek > 0, excluding Games — it has its own duty model, not
 * this eligibility one) within their own campus:
 *   - SAFE FILL: nobody is currently eligible for that (class, subject) —
 *     pure gain, adding it affects no one else.
 *   - REASSIGNMENT: someone else already holds that pair AND is themselves
 *     under-occupied — a literal move (delete their row, create ours), so
 *     both sides of the impact must be shown before confirming. A pair
 *     held by a teacher already at/above target is left out of suggestions
 *     entirely (2026-07-27 decision) — not safe to touch, not this page's
 *     point.
 *   - BEYOND SOFTWARE: neither of the above exists for this teacher — no
 *     software suggestion is possible, stated plainly rather than forcing
 *     a bad one. Still shows two purely-informational, non-actionable
 *     pieces of guidance for a human to weigh (2026-07-28): which of the
 *     campus's genuinely uncovered gaps share a tier with a subject this
 *     teacher already teaches (a real, existing classification — not a
 *     guess at pedagogical fit), and which uncovered gaps are the largest
 *     school-wide regardless of this teacher. Neither has an action
 *     button — see docs/CLAUDE.md's ground-truth rule: this page never
 *     proposes a brand-new subject for a teacher, only surfaces facts.
 */

type SafeFillCandidate = {
  classId: string
  className: string
  subjectId: string
  subjectName: string
  periodsPerWeek: number
}

type ReassignmentCandidate = SafeFillCandidate & {
  fromTeacherId: string
  fromTeacherName: string
  fromTeacherCurrentPeriods: number
  fromTeacherTarget: number
  // How many of THIS specific pair's periods the current holder is actually
  // scheduled for right now — the one number in this preview that's a real
  // fact, not a projection (unlike periodsPerWeek gained, which assumes the
  // solver fully uses the new eligibility on the next regenerate).
  fromTeacherPairScheduled: number
}

// A (class, subject) requirement with zero eligible teacher anywhere —
// a genuine, uncovered curriculum gap. Used only for BEYOND SOFTWARE's
// informational guidance below, never for an action.
type UncoveredGap = SafeFillCandidate & { tier: SubjectTier }

export const getCapacityAdvisor = async (req: Request, res: Response) => {
  try {
    // Optional — scopes the whole computation to one teacher, for the
    // compact suggestion widget in the Edit Teacher drawer. Same logic as
    // the full page, just skipping every other under-occupied teacher's
    // classSubjects scan instead of computing everyone and filtering after.
    const onlyTeacherId = typeof req.query.teacherId === 'string' ? req.query.teacherId : undefined

    const gamesSubject = await prisma.subject.findFirst({ where: { name: 'Games' } })

    const teachers = await prisma.teacher.findMany({
      select: {
        id: true,
        name: true,
        campusId: true,
        targetPeriodsPerWeek: true,
        campus: { select: { name: true } },
        teacherSubjects: { select: { subjectId: true, subject: { select: { name: true, tier: true } } } },
      },
    })
    const teacherById = new Map(teachers.map((t) => [t.id, t]))
    const scheduledByTeacher = await computeScheduledPeriodsByTeacher(
      teachers.map((t) => t.id),
      ACADEMIC_YEAR,
    )

    const classSubjects = await prisma.classSubject.findMany({
      where: { periodsPerWeek: { gt: 0 } },
      select: {
        periodsPerWeek: true,
        subjectId: true,
        subject: { select: { name: true, tier: true } },
        classId: true,
        class: { select: { name: true, campusId: true } },
      },
    })

    const eligibilityRows = await prisma.teacherSubject.findMany({
      select: { teacherId: true, classId: true, subjectId: true },
    })
    const eligibleTeachersByPair = new Map<string, string[]>()
    for (const row of eligibilityRows) {
      const key = `${row.classId}:${row.subjectId}`
      const list = eligibleTeachersByPair.get(key) ?? []
      list.push(row.teacherId)
      eligibleTeachersByPair.set(key, list)
    }

    // Every genuinely uncovered (class, subject) requirement, campus-wide —
    // independent of any one teacher's own subjects. Only used for BEYOND
    // SOFTWARE's informational guidance below.
    const uncoveredGapsByCampus = new Map<string, UncoveredGap[]>()
    for (const cs of classSubjects) {
      if (gamesSubject && cs.subjectId === gamesSubject.id) continue
      const key = `${cs.classId}:${cs.subjectId}`
      if ((eligibleTeachersByPair.get(key) ?? []).length > 0) continue
      const list = uncoveredGapsByCampus.get(cs.class.campusId) ?? []
      list.push({
        classId: cs.classId,
        className: cs.class.name,
        subjectId: cs.subjectId,
        subjectName: cs.subject.name,
        periodsPerWeek: cs.periodsPerWeek,
        tier: cs.subject.tier,
      })
      uncoveredGapsByCampus.set(cs.class.campusId, list)
    }

    // Precomputed once — how many periods of THIS exact (class, subject,
    // teacher) triple are actually scheduled right now, so a reassignment
    // preview can show the current holder's real, exact contribution
    // instead of a guess.
    const entriesForCount = await prisma.timetableEntry.findMany({
      where: { academicYear: ACADEMIC_YEAR, subjectId: { not: null } },
      select: { classId: true, subjectId: true, teacherId: true },
    })
    const pairScheduledByTeacher = new Map<string, number>()
    for (const entry of entriesForCount) {
      if (!entry.teacherId || !entry.subjectId) continue
      const key = `${entry.classId}:${entry.subjectId}:${entry.teacherId}`
      pairScheduledByTeacher.set(key, (pairScheduledByTeacher.get(key) ?? 0) + 1)
    }

    const underOccupied = teachers.filter(
      (t) => (scheduledByTeacher.get(t.id) ?? 0) < t.targetPeriodsPerWeek && (!onlyTeacherId || t.id === onlyTeacherId),
    )

    const data = underOccupied.map((teacher) => {
      const currentPeriods = scheduledByTeacher.get(teacher.id) ?? 0
      const shortfall = teacher.targetPeriodsPerWeek - currentPeriods
      const mySubjectIds = new Set(teacher.teacherSubjects.map((ts) => ts.subjectId))

      const safeFills: SafeFillCandidate[] = []
      const reassignments: ReassignmentCandidate[] = []

      for (const cs of classSubjects) {
        if (gamesSubject && cs.subjectId === gamesSubject.id) continue
        if (cs.class.campusId !== teacher.campusId) continue
        if (!mySubjectIds.has(cs.subjectId)) continue

        const key = `${cs.classId}:${cs.subjectId}`
        const holders = eligibleTeachersByPair.get(key) ?? []
        if (holders.includes(teacher.id)) continue // already eligible for this pair

        if (holders.length === 0) {
          safeFills.push({
            classId: cs.classId,
            className: cs.class.name,
            subjectId: cs.subjectId,
            subjectName: cs.subject.name,
            periodsPerWeek: cs.periodsPerWeek,
          })
          continue
        }

        for (const holderId of holders) {
          const holder = teacherById.get(holderId)
          if (!holder) continue
          const holderScheduled = scheduledByTeacher.get(holderId) ?? 0
          if (holderScheduled >= holder.targetPeriodsPerWeek) continue // at/above target — left out entirely

          reassignments.push({
            classId: cs.classId,
            className: cs.class.name,
            subjectId: cs.subjectId,
            subjectName: cs.subject.name,
            periodsPerWeek: cs.periodsPerWeek,
            fromTeacherId: holder.id,
            fromTeacherName: holder.name,
            fromTeacherCurrentPeriods: holderScheduled,
            fromTeacherTarget: holder.targetPeriodsPerWeek,
            fromTeacherPairScheduled: pairScheduledByTeacher.get(`${cs.classId}:${cs.subjectId}:${holder.id}`) ?? 0,
          })
        }
      }

      const beyondSoftware = safeFills.length === 0 && reassignments.length === 0

      // Purely informational, never actionable — see module docstring.
      // Only computed for BEYOND SOFTWARE teachers, so everyone else's
      // payload stays as lean as it already was.
      let beyondSoftwareGuidance: {
        relatedGapSubjects: UncoveredGap[]
        topCampusGaps: UncoveredGap[]
      } | null = null
      if (beyondSoftware) {
        const campusGaps = uncoveredGapsByCampus.get(teacher.campusId) ?? []
        const myTiers = new Set(teacher.teacherSubjects.map((ts) => ts.subject.tier))
        const bySubject = new Map<string, UncoveredGap>()
        for (const gap of campusGaps) {
          if (!myTiers.has(gap.tier)) continue
          // One row per subject (not per class) — the point is "this
          // subject-family has real unmet need," not an exhaustive list of
          // every class that needs it.
          if (!bySubject.has(gap.subjectId)) bySubject.set(gap.subjectId, gap)
        }
        beyondSoftwareGuidance = {
          relatedGapSubjects: [...bySubject.values()].slice(0, 5),
          topCampusGaps: [...campusGaps].sort((a, b) => b.periodsPerWeek - a.periodsPerWeek).slice(0, 5),
        }
      }

      return {
        teacherId: teacher.id,
        teacherName: teacher.name,
        campusId: teacher.campusId,
        campusName: teacher.campus.name,
        currentPeriods,
        targetPeriodsPerWeek: teacher.targetPeriodsPerWeek,
        shortfall,
        subjectNames: [...new Set(teacher.teacherSubjects.map((ts) => ts.subject.name))],
        safeFills,
        reassignments,
        beyondSoftware,
        beyondSoftwareGuidance,
      }
    })

    // Worst gap first — the people who need the most help are the most
    // useful to see without scrolling.
    data.sort((a, b) => b.shortfall - a.shortfall)

    return res.status(200).json({ data })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

type ApplySafeFillBody = { teacherId?: string; classId?: string; subjectId?: string }

export const applySafeFill = async (req: Request<object, object, ApplySafeFillBody>, res: Response) => {
  try {
    const { teacherId, classId, subjectId } = req.body
    if (!teacherId || !classId || !subjectId) {
      return res.status(400).json({ error: 'teacherId, classId, and subjectId are required', code: 'VALIDATION_ERROR' })
    }

    // This writes to TeacherSubject directly, bypassing updateTeacher — so
    // Teacher Lock has to be checked here too, or a locked teacher's
    // eligibility could still be changed via this widget.
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { isLocked: true } })
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found', code: 'NOT_FOUND' })
    }
    if (teacher.isLocked) {
      return sendError(res, 423, 'TEACHER_LOCKED', 'This teacher is locked. Unlock them first before adding eligibility.')
    }

    // Genuinely surgical — creates exactly one row, never touches any
    // other eligibility this or any other teacher already has. Unlike
    // updateTeacher's full-replace semantics, this can't clobber anything.
    await prisma.teacherSubject.create({
      data: { teacherId, classId, subjectId, isPrimary: true },
    })

    return res.status(200).json({ data: { teacherId, classId, subjectId } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'This teacher is already eligible for that subject/class.', code: 'DUPLICATE_ENTRY' })
    }
    return handleControllerError(error, res)
  }
}

type ApplyReassignmentBody = {
  toTeacherId?: string
  fromTeacherId?: string
  classId?: string
  subjectId?: string
}

export const applyReassignment = async (req: Request<object, object, ApplyReassignmentBody>, res: Response) => {
  try {
    const { toTeacherId, fromTeacherId, classId, subjectId } = req.body
    if (!toTeacherId || !fromTeacherId || !classId || !subjectId) {
      return res
        .status(400)
        .json({ error: 'toTeacherId, fromTeacherId, classId, and subjectId are required', code: 'VALIDATION_ERROR' })
    }

    // This writes to TeacherSubject directly, bypassing updateTeacher — a
    // reassignment touches both sides (removes from one teacher, adds to
    // the other), so Teacher Lock has to be checked on whichever side is
    // locked, not just the receiving teacher.
    const [fromTeacher, toTeacher] = await Promise.all([
      prisma.teacher.findUnique({ where: { id: fromTeacherId }, select: { isLocked: true, name: true } }),
      prisma.teacher.findUnique({ where: { id: toTeacherId }, select: { isLocked: true, name: true } }),
    ])
    if (!fromTeacher || !toTeacher) {
      return res.status(404).json({ error: 'Teacher not found', code: 'NOT_FOUND' })
    }
    if (fromTeacher.isLocked || toTeacher.isLocked) {
      const lockedName = fromTeacher.isLocked ? fromTeacher.name : toTeacher.name
      return sendError(
        res,
        423,
        'TEACHER_LOCKED',
        `${lockedName} is locked, so this reassignment can't proceed. Unlock them first.`,
      )
    }

    // A real move — the previous holder's eligibility for this EXACT pair
    // is deleted, not just left to compete. Scoped precisely (teacherId +
    // classId + subjectId together), so it can never touch any of the
    // "from" teacher's other subject/class pairs.
    const staleRace = await prisma.$transaction(async (tx) => {
      const deleted = await tx.teacherSubject.deleteMany({ where: { teacherId: fromTeacherId, classId, subjectId } })
      if (deleted.count === 0) return true
      await tx.teacherSubject.create({
        data: { teacherId: toTeacherId, classId, subjectId, isPrimary: true },
      })
      return false
    })
    if (staleRace) {
      return sendError(
        res,
        409,
        'STALE_STATE',
        'The current holder no longer has this pair — someone else may have already changed it. Refresh and try again.',
      )
    }

    return res.status(200).json({ data: { toTeacherId, fromTeacherId, classId, subjectId } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'The receiving teacher is already eligible for that subject/class.', code: 'DUPLICATE_ENTRY' })
    }
    return handleControllerError(error, res)
  }
}

type GapFixCandidate =
  | {
      kind: 'safeFill'
      teacherId: string
      teacherName: string
      teacherCurrentPeriods: number
      teacherTarget: number
    }
  | {
      kind: 'reassignment'
      toTeacherId: string
      toTeacherName: string
      toTeacherCurrentPeriods: number
      toTeacherTarget: number
      fromTeacherId: string
      fromTeacherName: string
      fromTeacherCurrentPeriods: number
      fromTeacherTarget: number
      fromTeacherPairScheduled: number
    }

// ---------------------------------------------------------------------------
// GET /api/capacity-advisor/gap?classId=&subjectId=  (ADMIN only)
// The mirror image of the main advisor: instead of "for this under-occupied
// teacher, which gaps could they fill," this answers "for this ONE flagged
// (class, subject) gap, which under-occupied teachers could fill it" — feeds
// the inline fix-suggestion shown directly under a shortfall flag on the
// Timetable page (item 5), so an admin never has to leave the page to see
// whether a flagged gap is actually fixable.
// ---------------------------------------------------------------------------
export const getClassSubjectGapFix = async (req: Request, res: Response) => {
  try {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined
    if (!classId || !subjectId) {
      return res.status(400).json({ error: 'classId and subjectId are required', code: 'VALIDATION_ERROR' })
    }

    const classSubject = await prisma.classSubject.findUnique({
      where: { classId_subjectId: { classId, subjectId } },
      include: { class: { select: { name: true, campusId: true } }, subject: { select: { name: true } } },
    })
    if (!classSubject) {
      return res.status(404).json({ error: 'This class/subject pairing was not found', code: 'NOT_FOUND' })
    }

    // Same-campus only — eligibility (and Capacity Advisor generally) never
    // crosses campuses.
    const teachers = await prisma.teacher.findMany({
      where: { campusId: classSubject.class.campusId },
      select: {
        id: true,
        name: true,
        targetPeriodsPerWeek: true,
        teacherSubjects: { select: { subjectId: true } },
      },
    })
    const scheduledByTeacher = await computeScheduledPeriodsByTeacher(
      teachers.map((t) => t.id),
      ACADEMIC_YEAR,
    )

    const holders = await prisma.teacherSubject.findMany({ where: { classId, subjectId }, select: { teacherId: true } })
    const holderIds = new Set(holders.map((h) => h.teacherId))

    const entriesForCount = holderIds.size
      ? await prisma.timetableEntry.findMany({
          where: { academicYear: ACADEMIC_YEAR, classId, subjectId, teacherId: { in: [...holderIds] } },
          select: { teacherId: true },
        })
      : []
    const pairScheduledByHolder = new Map<string, number>()
    for (const entry of entriesForCount) {
      if (!entry.teacherId) continue
      pairScheduledByHolder.set(entry.teacherId, (pairScheduledByHolder.get(entry.teacherId) ?? 0) + 1)
    }

    const candidates: GapFixCandidate[] = []
    for (const teacher of teachers) {
      if (holderIds.has(teacher.id)) continue // already eligible for this exact pair
      const currentPeriods = scheduledByTeacher.get(teacher.id) ?? 0
      if (currentPeriods >= teacher.targetPeriodsPerWeek) continue // not under-occupied — not a candidate
      const alreadyTeachesThisSubject = teacher.teacherSubjects.some((ts) => ts.subjectId === subjectId)
      if (!alreadyTeachesThisSubject) continue // never suggest a brand-new subject — same rule as the main advisor

      if (holderIds.size === 0) {
        candidates.push({
          kind: 'safeFill',
          teacherId: teacher.id,
          teacherName: teacher.name,
          teacherCurrentPeriods: currentPeriods,
          teacherTarget: teacher.targetPeriodsPerWeek,
        })
        continue
      }

      for (const holderId of holderIds) {
        const holder = teachers.find((t) => t.id === holderId)
        if (!holder) continue
        const holderScheduled = scheduledByTeacher.get(holderId) ?? 0
        if (holderScheduled >= holder.targetPeriodsPerWeek) continue // holder not under-occupied — leave them alone

        candidates.push({
          kind: 'reassignment',
          toTeacherId: teacher.id,
          toTeacherName: teacher.name,
          toTeacherCurrentPeriods: currentPeriods,
          toTeacherTarget: teacher.targetPeriodsPerWeek,
          fromTeacherId: holder.id,
          fromTeacherName: holder.name,
          fromTeacherCurrentPeriods: holderScheduled,
          fromTeacherTarget: holder.targetPeriodsPerWeek,
          fromTeacherPairScheduled: pairScheduledByHolder.get(holder.id) ?? 0,
        })
      }
    }

    // Phase 3 item 7 — root-cause breakdown for Gaps & Suggestions,
    // systematizing the same "is there physically enough spare capacity"
    // check done by hand for Boys 3A/4A/6A in the tier-fairness
    // investigation (PENDING_QUESTIONS.md item 32), applied here to actual
    // shortfalls rather than tier placement. `candidates` already answers
    // "who could fill this" when it's non-empty; when it's empty, the admin
    // still needs to know WHY — every eligible holder's real current/target,
    // not just their existence, so "beyond software" (zero holders) reads
    // differently from "capacity exhausted" (holders exist, all already at
    // or over target, same threshold the candidate loop above already uses).
    const holderDetails = [...holderIds]
      .map((id) => teachers.find((t) => t.id === id))
      .filter((t): t is (typeof teachers)[number] => Boolean(t))
      .map((t) => ({
        teacherId: t.id,
        teacherName: t.name,
        currentPeriods: scheduledByTeacher.get(t.id) ?? 0,
        targetPeriodsPerWeek: t.targetPeriodsPerWeek,
      }))

    return res.status(200).json({
      data: {
        classId,
        className: classSubject.class.name,
        subjectId,
        subjectName: classSubject.subject.name,
        periodsPerWeek: classSubject.periodsPerWeek,
        candidates,
        holders: holderDetails,
      },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}
