import type { Request, Response } from 'express'
import { DayOfWeek } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { generateTimetable as runGenerator } from '../services/timetableGenerator.js'
import { handleControllerError, sendError } from '../utils/apiError.js'

function parseDayOfWeek(value: unknown): DayOfWeek | null {
  return typeof value === 'string' && value in DayOfWeek ? (value as DayOfWeek) : null
}

type TimetableQuery = {
  campusId?: string
  classId?: string
  academicYear?: string
  teacherId?: string
}

function resolveYear(queryYear: unknown): string {
  return typeof queryYear === 'string' && queryYear.trim().length > 0 ? queryYear : '2026-2027'
}

export const getTimetable = async (req: Request<object, object, object, TimetableQuery>, res: Response) => {
  try {
    const academicYear = resolveYear(req.query.academicYear)
    const campusId = req.query.campusId
    const classId = req.query.classId
    const teacherId = req.query.teacherId

    const entries = await prisma.timetableEntry.findMany({
      where: {
        academicYear,
        ...(campusId ? { campusId } : {}),
        ...(classId ? { classId } : {}),
        // A teacher can appear as either the primary or the games-duty
        // second teacher on a row (§17) — match either so a duty partner
        // still sees that period in their own "teacher view".
        ...(teacherId ? { OR: [{ teacherId }, { secondTeacherId: teacherId }] } : {}),
        isActive: true,
      },
      select: {
        id: true,
        academicYear: true,
        dayOfWeek: true,
        campusId: true,
        classId: true,
        teacherId: true,
        secondTeacherId: true,
        subjectId: true,
        isSubstitute: true,
        isActive: true,
        isLocked: true,
        campus: { select: { name: true } },
        class: { select: { name: true } },
        teacher: { select: { name: true } },
        secondTeacher: { select: { name: true } },
        subject: { select: { name: true } },
        period: {
          select: {
            id: true,
            periodNumber: true,
            name: true,
            startTime: true,
            endTime: true,
            classGroup: true,
            isBreak: true,
          },
        },
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { period: { periodNumber: 'asc' } },
        { class: { name: 'asc' } },
      ],
    })

    return res.status(200).json({
      data: entries.map((entry) => ({
        id: entry.id,
        academicYear: entry.academicYear,
        dayOfWeek: entry.dayOfWeek,
        campusId: entry.campusId,
        campusName: entry.campus.name,
        classId: entry.classId,
        className: entry.class.name,
        teacherId: entry.teacherId,
        teacherName: entry.teacher?.name ?? null,
        secondTeacherId: entry.secondTeacherId,
        secondTeacherName: entry.secondTeacher?.name ?? null,
        subjectId: entry.subjectId,
        subjectName: entry.subject?.name ?? null,
        isSubstitute: entry.isSubstitute,
        isActive: entry.isActive,
        isLocked: entry.isLocked,
        period: {
          id: entry.period.id,
          periodNumber: entry.period.periodNumber,
          name: entry.period.name,
          startTime: entry.period.startTime,
          endTime: entry.period.endTime,
          classGroup: entry.period.classGroup,
          isBreak: entry.period.isBreak,
        },
      })),
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

export const getTeacherTimetable = async (req: Request, res: Response) => {
  try {
    const teacherId = typeof req.params.teacherId === 'string' ? req.params.teacherId : ''
    if (req.user?.role === 'TEACHER' && req.user.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' })
    }

    const academicYear = resolveYear(req.query.academicYear)
    const entries = await prisma.timetableEntry.findMany({
      // A teacher can appear as either the primary or the games-duty second
      // teacher on a row (§17) — match either.
      where: { academicYear, OR: [{ teacherId }, { secondTeacherId: teacherId }], isActive: true },
      select: {
        id: true,
        dayOfWeek: true,
        isSubstitute: true,
        isActive: true,
        class: { select: { name: true } },
        subject: { select: { name: true } },
        campus: { select: { name: true } },
        teacher: { select: { name: true } },
        secondTeacher: { select: { name: true } },
        period: {
          select: {
            id: true,
            periodNumber: true,
            name: true,
            startTime: true,
            endTime: true,
            isBreak: true,
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { period: { periodNumber: 'asc' } }],
    })

    return res.status(200).json({ data: entries })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

export const getTimetableStatus = async (req: Request<object, object, object, TimetableQuery>, res: Response) => {
  try {
    const academicYear = resolveYear(req.query.academicYear)
    const campusId = req.query.campusId

    const totalEntries = await prisma.timetableEntry.count({
      where: {
        academicYear,
        ...(campusId ? { campusId } : {}),
        isActive: true,
      },
    })

    return res.status(200).json({
      generated: totalEntries > 0,
      totalEntries,
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

export const generateTimetable = async (
  req: Request<object, object, { campusId?: string; academicYear?: string }>,
  res: Response,
) => {
  try {
    const academicYear = req.body.academicYear?.trim() || '2026-2027'
    const campusId = req.body.campusId?.trim()

    if (campusId) {
      const campus = await prisma.campus.findUnique({ where: { id: campusId }, select: { id: true } })
      if (!campus) {
        return res.status(404).json({ error: 'Campus not found', code: 'NOT_FOUND' })
      }
    }

    const result = await runGenerator({ campusId, academicYear })
    return res.status(200).json(result)
  } catch (error) {
    return handleControllerError(error, res)
  }
}

/**
 * Manual single-slot override — edit exactly one (class, day, period)
 * without touching anything else, so an admin who likes almost all of a
 * generated schedule can fix one cell instead of risking a full regenerate
 * reshuffling everyone else (§17 stability finding, PENDING_QUESTIONS.md
 * item 17). Two different validation strengths, by design:
 *   1. Teacher already teaching (or on Games duty) elsewhere at this exact
 *      (day, period) — HARD block, never overridable. A physical
 *      impossibility, not a policy choice.
 *   2. Teacher has no TeacherSubject eligibility row for this subject/class
 *      — SOFT warning, allowed only once the client explicitly confirms
 *      past it (`confirmEligibilityOverride: true`) — the real use case
 *      (a short-notice substitute) often means the covering teacher
 *      genuinely isn't the normal eligible one for that subject, which is
 *      exactly the point of this feature, not a mistake to silently block.
 */
type SlotOverrideBody = {
  classId?: string
  dayOfWeek?: string
  periodId?: string
  subjectId?: string
  teacherId?: string
  academicYear?: string
  confirmEligibilityOverride?: boolean
}

export const putTimetableSlot = async (req: Request<object, object, SlotOverrideBody>, res: Response) => {
  try {
    const academicYear = resolveYear(req.body.academicYear)
    const { classId, periodId, subjectId, teacherId, confirmEligibilityOverride } = req.body
    const dayOfWeek = parseDayOfWeek(req.body.dayOfWeek)

    if (!classId || !dayOfWeek || !periodId || !subjectId || !teacherId) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'classId, dayOfWeek, periodId, subjectId, and teacherId are required')
    }

    const [cls, period, subject, teacher] = await Promise.all([
      prisma.class.findUnique({ where: { id: classId }, select: { id: true, name: true, campusId: true } }),
      prisma.period.findUnique({ where: { id: periodId }, select: { id: true } }),
      prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true } }),
      prisma.teacher.findUnique({ where: { id: teacherId }, select: { id: true, name: true, campusId: true } }),
    ])
    if (!cls) return sendError(res, 404, 'NOT_FOUND', 'Class not found')
    if (!period) return sendError(res, 404, 'NOT_FOUND', 'Period not found')
    if (!subject) return sendError(res, 404, 'NOT_FOUND', 'Subject not found')
    if (!teacher) return sendError(res, 404, 'NOT_FOUND', 'Teacher not found')
    if (teacher.campusId !== cls.campusId) {
      return sendError(res, 400, 'CAMPUS_MISMATCH', 'This teacher belongs to a different campus than this class.')
    }

    // §24 (Granular Lock) — an individually-locked row can't be edited
    // through the normal slot editor until unlocked, same principle as
    // Class/Teacher Lock: never change something the admin explicitly froze
    // without an explicit unlock step first.
    const existingForLockCheck = await prisma.timetableEntry.findUnique({
      where: { unique_class_period: { academicYear, dayOfWeek, classId, periodId } },
      select: { isLocked: true },
    })
    if (existingForLockCheck?.isLocked) {
      return sendError(res, 423, 'SLOT_LOCKED', 'This period is locked. Unlock it first before making changes.')
    }

    // HARD BLOCK — excludes the one row we're allowed to overwrite (this
    // exact class+period+day), so re-saving the same slot never conflicts
    // with itself.
    const conflict = await prisma.timetableEntry.findFirst({
      where: {
        academicYear,
        dayOfWeek,
        periodId,
        OR: [{ teacherId }, { secondTeacherId: teacherId }],
        NOT: { classId },
      },
      select: { class: { select: { name: true } }, subject: { select: { name: true } } },
    })
    if (conflict) {
      return sendError(
        res,
        409,
        'TEACHER_BUSY',
        `${teacher.name} is already teaching ${conflict.subject?.name ?? 'another subject'} to ${conflict.class.name} at this exact time — a teacher can't be in two places at once.`,
      )
    }

    // SOFT WARNING — never applied silently.
    if (!confirmEligibilityOverride) {
      const eligible = await prisma.teacherSubject.findUnique({
        where: { teacherId_subjectId_classId: { teacherId, subjectId, classId } },
      })
      if (!eligible) {
        return sendError(
          res,
          409,
          'ELIGIBILITY_WARNING',
          `${teacher.name} doesn't normally teach ${subject.name} for ${cls.name} — confirm to proceed anyway.`,
        )
      }
    }

    const updated = await prisma.timetableEntry.upsert({
      where: { unique_class_period: { academicYear, dayOfWeek, classId, periodId } },
      update: { subjectId, teacherId, secondTeacherId: null },
      create: {
        academicYear,
        dayOfWeek,
        campusId: cls.campusId,
        classId,
        periodId,
        subjectId,
        teacherId,
        isActive: true,
      },
      select: {
        id: true,
        dayOfWeek: true,
        periodId: true,
        teacher: { select: { name: true } },
        subject: { select: { name: true } },
      },
    })

    return res.status(200).json({
      data: {
        id: updated.id,
        dayOfWeek: updated.dayOfWeek,
        periodId: updated.periodId,
        teacherName: updated.teacher?.name ?? null,
        subjectName: updated.subject?.name ?? null,
      },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

type SlotClearQuery = {
  classId?: string
  dayOfWeek?: string
  periodId?: string
  academicYear?: string
}

export const clearTimetableSlot = async (req: Request<object, object, object, SlotClearQuery>, res: Response) => {
  try {
    const academicYear = resolveYear(req.query.academicYear)
    const classId = req.query.classId
    const periodId = req.query.periodId
    const dayOfWeek = parseDayOfWeek(req.query.dayOfWeek)

    if (!classId || !dayOfWeek || !periodId) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'classId, dayOfWeek, and periodId are required')
    }

    const existingForLockCheck = await prisma.timetableEntry.findUnique({
      where: { unique_class_period: { academicYear, dayOfWeek, classId, periodId } },
      select: { isLocked: true },
    })
    if (existingForLockCheck?.isLocked) {
      return sendError(res, 423, 'SLOT_LOCKED', 'This period is locked. Unlock it first before clearing it.')
    }

    await prisma.timetableEntry.deleteMany({ where: { academicYear, classId, dayOfWeek, periodId } })
    return res.status(200).json({ data: { classId, dayOfWeek, periodId } })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

type SlotLockBody = {
  classId?: string
  dayOfWeek?: string
  periodId?: string
  academicYear?: string
  isLocked?: boolean
}

// ---------------------------------------------------------------------------
// PATCH /api/timetable/slot/lock  (ADMIN only)
// §24 (Granular Lock) — freezes ONE existing period so a future regenerate
// leaves it exactly as-is, while the rest of its class stays fully open.
// Can only lock a slot that already has something in it (locking an empty
// period doesn't mean anything) — use the normal slot editor to fill it
// first. See timetableGenerator.ts for how the solver respects this.
// ---------------------------------------------------------------------------
export const updateSlotLock = async (req: Request<object, object, SlotLockBody>, res: Response) => {
  try {
    const academicYear = resolveYear(req.body.academicYear)
    const { classId, periodId, isLocked } = req.body
    const dayOfWeek = parseDayOfWeek(req.body.dayOfWeek)

    if (!classId || !dayOfWeek || !periodId || typeof isLocked !== 'boolean') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'classId, dayOfWeek, periodId, and isLocked are required')
    }

    const existing = await prisma.timetableEntry.findUnique({
      where: { unique_class_period: { academicYear, dayOfWeek, classId, periodId } },
      select: { id: true },
    })
    if (!existing) {
      return sendError(res, 404, 'NOT_FOUND', 'This period is empty — there is nothing here to lock.')
    }

    const updated = await prisma.timetableEntry.update({
      where: { id: existing.id },
      data: { isLocked },
      select: {
        id: true,
        dayOfWeek: true,
        periodId: true,
        isLocked: true,
        teacher: { select: { name: true } },
        subject: { select: { name: true } },
      },
    })

    return res.status(200).json({
      data: {
        id: updated.id,
        dayOfWeek: updated.dayOfWeek,
        periodId: updated.periodId,
        isLocked: updated.isLocked,
        teacherName: updated.teacher?.name ?? null,
        subjectName: updated.subject?.name ?? null,
      },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}
