import type { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { Prisma, TeacherStatus, HiringStatus, DayOfWeek } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { handleControllerError, sendError } from '../utils/apiError.js'
import { computeScheduledPeriodsByTeacher } from '../utils/teacherOccupancy.js'

const SALT_ROUNDS = 12
// Matches the default used across the rest of the API (timetable
// controller's resolveYear) — there's only ever been one academic year's
// worth of data in this system so far.
const ACADEMIC_YEAR = '2026-2027'

type SubjectClassPair = { subjectId: string; classId: string }

// name/campusId required, everything else optional — guaranteed by
// createTeacherBodySchema (schemas/teachers.schemas.ts). Note: the schema
// rejects the WHOLE request if any eligibilities entry is malformed, where
// the old parseEligibilities() used to silently drop just the bad entries
// and keep the rest — a deliberate behavior change (an admin silently
// ending up with fewer eligibilities saved than they thought is worse than
// a clear rejection naming the problem).
type CreateTeacherPayload = {
  name: string
  email?: string | null
  phone?: string | null
  campusId: string
  targetPeriodsPerWeek?: number
  maxPeriodsPerWeek?: number
  eligibilities?: SubjectClassPair[]
  status?: TeacherStatus
  hiringStatus?: HiringStatus
}

// Same as CreateTeacherPayload, plus expectedUpdatedAt (optimistic
// concurrency, item 19) — the teacher's updatedAt as the client last saw
// it, from when the Edit drawer was opened, so a second admin's save can
// never silently overwrite a first admin's save with no warning. Required
// and date-format-checked by updateTeacherBodySchema.
type UpdateTeacherPayload = CreateTeacherPayload & { expectedUpdatedAt: string }

function parsePage(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseTeacherStatus(value: unknown): TeacherStatus | undefined {
  if (value === 'ACTIVE' || value === 'INACTIVE' || value === 'ON_LEAVE') {
    return value
  }
  return undefined
}

function parseHiringStatus(value: unknown): HiringStatus | undefined {
  if (value === 'HIRED' || value === 'TO_BE_HIRED') {
    return value
  }
  return undefined
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const normalized = email.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

type TeacherRecord = Prisma.TeacherGetPayload<{
  include: {
    campus: true
    teacherSubjects: {
      include: { subject: true; class: { include: { campus: true } } }
      orderBy: { subject: { name: 'asc' } }
    }
    loadSummaries: true
    _count: {
      select: {
        timetableEntries: true
        teacherSubjects: true
      }
    }
  }
}>

type TeacherDetailDto = {
  id: string
  name: string
  email: string | null
  phone: string | null
  campusId: string
  campusName: string
  currentPeriods: number
  targetPeriodsPerWeek: number
  maxPeriodsPerWeek: number
  status: TeacherStatus
  hiringStatus: HiringStatus
  // When true, the whole record (details + eligibility) is frozen — see
  // updateTeacher/deleteTeacher and PATCH /teachers/:id/lock.
  isLocked: boolean
  // Sent back on save as `expectedUpdatedAt` so the server can detect
  // whether someone else has saved a change since this record was loaded
  // (optimistic concurrency — see updateTeacher).
  updatedAt: string
  eligibilities: Array<{
    subjectId: string
    subjectName: string
    classId: string
    className: string
    campusName: string
    isPrimary: boolean
  }>
  loadSummary: TeacherRecord['loadSummaries'][number] | null
  counts: TeacherRecord['_count']
}

async function getTeacherDetail(id: string): Promise<TeacherDetailDto | null> {
  const teacher = (await prisma.teacher.findUnique({
    where: { id },
    include: {
      campus: true,
      teacherSubjects: {
        include: { subject: true, class: { include: { campus: true } } },
        orderBy: { subject: { name: 'asc' } },
      },
      loadSummaries: {
        orderBy: [{ weekStart: 'desc' }],
        take: 1,
      },
      _count: {
        select: {
          timetableEntries: true,
          teacherSubjects: true,
        },
      },
    },
  })) as TeacherRecord | null

  if (!teacher) return null

  // Live-computed from actual TimetableEntry rows, not the stored
  // `currentPeriods` column — nothing in this codebase ever writes that
  // column after a teacher is created, so it would otherwise always read 0
  // regardless of how many times a timetable's been generated since.
  const scheduledByTeacher = await computeScheduledPeriodsByTeacher([teacher.id], ACADEMIC_YEAR)

  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    phone: teacher.phone,
    campusId: teacher.campusId,
    campusName: teacher.campus.name,
    currentPeriods: scheduledByTeacher.get(teacher.id) ?? 0,
    targetPeriodsPerWeek: teacher.targetPeriodsPerWeek,
    maxPeriodsPerWeek: teacher.maxPeriodsPerWeek,
    status: teacher.status,
    hiringStatus: teacher.hiringStatus,
    isLocked: teacher.isLocked,
    updatedAt: teacher.updatedAt.toISOString(),
    eligibilities: teacher.teacherSubjects.map((item) => ({
      subjectId: item.subject.id,
      subjectName: item.subject.name,
      classId: item.class.id,
      className: item.class.name,
      campusName: item.class.campus.name,
      isPrimary: item.isPrimary,
    })),
    loadSummary: teacher.loadSummaries[0] ?? null,
    counts: teacher._count,
  }
}

export const listTeachers = async (req: Request, res: Response) => {
  try {
  const page = parsePage(req.query.page, 1)
  const limit = Math.min(parsePage(req.query.limit, 20), 100)
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const campusId = typeof req.query.campusId === 'string' ? req.query.campusId : undefined
  const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined
  const status = parseTeacherStatus(req.query.status)
  const skip = (page - 1) * limit

  const where: Prisma.TeacherWhereInput = {
    ...(campusId ? { campusId } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(subjectId
      ? {
          teacherSubjects: {
            some: { subjectId },
          },
        }
      : {}),
  }

  const dedupeSubjects = <T extends { id: string }>(subjects: T[]): T[] => {
    const seen = new Set<string>()
    return subjects.filter((subject) => (seen.has(subject.id) ? false : (seen.add(subject.id), true)))
  }

  const [total, teachers] = await prisma.$transaction([
    prisma.teacher.count({ where }),
    prisma.teacher.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
      skip,
      take: limit,
      include: {
        campus: true,
        teacherSubjects: {
          include: { subject: true, class: { select: { id: true, name: true } } },
          orderBy: { subject: { name: 'asc' } },
        },
        user: { select: { id: true } },
      },
    }),
  ])

  const dedupeClasses = (classes: Array<{ id: string; name: string }>): Array<{ id: string; name: string }> => {
    const seen = new Set<string>()
    return classes.filter((cls) => (seen.has(cls.id) ? false : (seen.add(cls.id), true)))
  }

  // Live-computed from actual TimetableEntry rows, not the stored
  // `currentPeriods` column — see getTeacherDetail's identical comment.
  const scheduledByTeacher = await computeScheduledPeriodsByTeacher(
    teachers.map((t) => t.id),
    ACADEMIC_YEAR,
  )

  return res.status(200).json({
    data: teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone,
      campusId: teacher.campusId,
      campusName: teacher.campus.name,
      status: teacher.status,
      hiringStatus: teacher.hiringStatus,
      isLocked: teacher.isLocked,
      currentPeriods: scheduledByTeacher.get(teacher.id) ?? 0,
      targetPeriodsPerWeek: teacher.targetPeriodsPerWeek,
      maxPeriodsPerWeek: teacher.maxPeriodsPerWeek,
      subjectNames: dedupeSubjects(teacher.teacherSubjects.map((item) => item.subject)).map((s) => s.name),
      subjects: dedupeSubjects(teacher.teacherSubjects.map((item) => item.subject)).map((s) => ({
        id: s.id,
        name: s.name,
        isCore: s.isCore,
      })),
      // Which classes this teacher is actually eligible for — surfaced in the
      // Timetable page's "Teacher view" dropdown so picking a teacher who
      // doesn't teach the currently-selected class isn't a guessing game.
      classNames: dedupeClasses(teacher.teacherSubjects.map((item) => item.class)).map((c) => c.name).sort(),
      hasAccount: teacher.user !== null,
    })),
    total,
    page,
    limit,
  })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

export const getTeacherStats = async (_req: Request, res: Response) => {
  try {
    const [total, campuses] = await prisma.$transaction([
      prisma.teacher.count(),
      prisma.campus.findMany({
        include: {
          _count: {
            select: { teachers: true },
          },
        },
      }),
    ])

    const getCampusCount = (type: 'JUNIOR' | 'GIRLS' | 'BOYS') => {
      const campus = campuses.find((item) => item.type === type)
      return campus?._count.teachers ?? 0
    }

    return res.status(200).json({
      total,
      byCampus: {
        junior: getCampusCount('JUNIOR'),
        girls: getCampusCount('GIRLS'),
        boys: getCampusCount('BOYS'),
      },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

export const getTeacherById = async (req: Request<{ id: string }>, res: Response) => {
  try {
    // ADMIN can look up any teacher. A TEACHER may only look up their own
    // record (used by the mobile app for the greeting name + profile screen).
    const isSelf = req.user?.role === 'TEACHER' && req.user.teacherId === req.params.id
    if (req.user?.role !== 'ADMIN' && !isSelf) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' })
    }

    const teacher = await getTeacherDetail(req.params.id)
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found', code: 'NOT_FOUND' })
    }
    return res.status(200).json({ data: teacher })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

// ---------------------------------------------------------------------------
// GET /api/teachers/:id/reallocation-risk  (ADMIN only)
// Preview before adding an eligibility pair to a teacher already at/over
// target (item 22's follow-up) — the same spirit as getClassLockImpact
// (classes.controller.ts): show the real, current numbers before an action
// happens, never surface the consequence only after the fact. This can only
// show the teacher's REAL CURRENT per-class breakdown, not a prediction of
// which specific periods a future regenerate will actually take away — that
// depends on the solver's own optimization and isn't knowable in advance.
// Framed accordingly: "here's what's currently on the line," not "here's
// exactly what will change."
// ---------------------------------------------------------------------------
export const getTeacherReallocationRisk = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, targetPeriodsPerWeek: true, maxPeriodsPerWeek: true },
    })
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found', code: 'NOT_FOUND' })
    }

    const scheduledByTeacher = await computeScheduledPeriodsByTeacher([teacher.id], ACADEMIC_YEAR)
    const currentPeriods = scheduledByTeacher.get(teacher.id) ?? 0
    const atOrOverTarget = currentPeriods >= teacher.targetPeriodsPerWeek

    // Per-class breakdown, counted the same way (distinct day+period slot,
    // not raw row count) so Games-duty-sharing can't inflate a class's
    // apparent share of this teacher's time.
    const entries = await prisma.timetableEntry.findMany({
      where: {
        academicYear: ACADEMIC_YEAR,
        OR: [{ teacherId: teacher.id }, { secondTeacherId: teacher.id }],
      },
      select: { classId: true, dayOfWeek: true, periodId: true, class: { select: { name: true } } },
    })
    const slotsByClass = new Map<string, { className: string; slots: Set<string> }>()
    for (const entry of entries) {
      const existing = slotsByClass.get(entry.classId) ?? { className: entry.class.name, slots: new Set<string>() }
      existing.slots.add(`${entry.dayOfWeek}:${entry.periodId}`)
      slotsByClass.set(entry.classId, existing)
    }
    const currentClasses = [...slotsByClass.entries()]
      .map(([classId, { className, slots }]) => ({ classId, className, periods: slots.size }))
      .sort((a, b) => b.periods - a.periods)

    return res.status(200).json({
      data: {
        teacherId: teacher.id,
        teacherName: teacher.name,
        currentPeriods,
        targetPeriodsPerWeek: teacher.targetPeriodsPerWeek,
        maxPeriodsPerWeek: teacher.maxPeriodsPerWeek,
        atOrOverTarget,
        currentClasses,
      },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

// Required — guaranteed by updateTeacherDayLockBodySchema (schemas/teachers.schemas.ts).
type LockDayPayload = { dayOfWeek: DayOfWeek; academicYear: string; isLocked: boolean }

// ---------------------------------------------------------------------------
// PATCH /api/teachers/:id/lock-day  (ADMIN only)
// §24 (Granular Lock) — a bulk convenience over the same row-level
// `TimetableEntry.isLocked` flag single-period locking uses (see
// timetable.controller.ts's updateSlotLock): freezes every one of this
// teacher's existing periods on one specific day (across whichever classes
// they're in that day), so a future regenerate leaves that day's real
// commitments alone while every other day stays fully open. Independent of
// Teacher Lock (§20), which only protects the profile, not the schedule.
// ---------------------------------------------------------------------------
export const updateTeacherDayLock = async (req: Request<{ id: string }, object, LockDayPayload>, res: Response) => {
  try {
    const { dayOfWeek, academicYear, isLocked } = req.body

    const teacher = await prisma.teacher.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } })
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found', code: 'NOT_FOUND' })
    }

    const result = await prisma.timetableEntry.updateMany({
      where: {
        academicYear,
        dayOfWeek,
        OR: [{ teacherId: teacher.id }, { secondTeacherId: teacher.id }],
      },
      data: { isLocked },
    })

    return res.status(200).json({
      data: { teacherId: teacher.id, teacherName: teacher.name, dayOfWeek, isLocked, affectedPeriods: result.count },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

export const createTeacher = async (req: Request<object, object, CreateTeacherPayload>, res: Response) => {
  try {
  const name = req.body.name.trim()
  const campusId = req.body.campusId
  const eligibilities = req.body.eligibilities ?? []
  const status = req.body.status ?? TeacherStatus.ACTIVE
  const hiringStatus = req.body.hiringStatus ?? HiringStatus.HIRED
  const targetPeriodsPerWeek = req.body.targetPeriodsPerWeek ?? 30
  const maxPeriodsPerWeek = req.body.maxPeriodsPerWeek ?? 35
  const email = normalizeEmail(req.body.email)
  const phone = req.body.phone?.trim() || null

  const campus = await prisma.campus.findUnique({ where: { id: campusId } })
  if (!campus) {
    return res.status(404).json({ error: 'Campus not found', code: 'NOT_FOUND' })
  }

  const subjectIds = [...new Set(eligibilities.map((item) => item.subjectId))]
  const classIds = [...new Set(eligibilities.map((item) => item.classId))]

  const subjects = subjectIds.length
    ? await prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true } })
    : []
  const classes = classIds.length
    ? await prisma.class.findMany({ where: { id: { in: classIds } }, select: { id: true } })
    : []

  if (subjects.length !== subjectIds.length || classes.length !== classIds.length) {
    return res
      .status(400)
      .json({ error: 'One or more subjectIds or classIds in eligibilities are invalid', code: 'VALIDATION_ERROR' })
  }

    const teacher = await prisma.$transaction(async (tx) => {
      const created = await tx.teacher.create({
        data: {
          name,
          email,
          phone,
          campusId,
          status,
          hiringStatus,
          targetPeriodsPerWeek,
          maxPeriodsPerWeek,
        },
      })

      if (eligibilities.length) {
        await tx.teacherSubject.createMany({
          data: eligibilities.map(({ subjectId, classId }) => ({
            teacherId: created.id,
            subjectId,
            classId,
            isPrimary: true,
          })),
        })
      }

      return created
    })

    const detail = await getTeacherDetail(teacher.id)
    return res.status(201).json({ data: detail })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Teacher email already exists', code: 'DUPLICATE_ENTRY' })
    }
    return handleControllerError(error, res)
  }
}

// Thrown inside the transaction when the optimistic-concurrency check
// fails, so it can be caught and turned into a specific 409 outside —
// distinct from any Prisma error, never confused with one.
class StaleTeacherError extends Error {}

export const updateTeacher = async (req: Request<{ id: string }, object, UpdateTeacherPayload>, res: Response) => {
  try {
  const name = req.body.name.trim()
  const campusId = req.body.campusId
  const eligibilities = req.body.eligibilities ?? []
  const status = req.body.status
  const hiringStatus = req.body.hiringStatus
  const targetPeriodsPerWeek = req.body.targetPeriodsPerWeek
  const maxPeriodsPerWeek = req.body.maxPeriodsPerWeek
  const email = req.body.email === undefined ? undefined : normalizeEmail(req.body.email)
  const phone = req.body.phone === undefined ? undefined : req.body.phone?.trim() || null
  const expectedUpdatedAtDate = new Date(req.body.expectedUpdatedAt)

  const campus = await prisma.campus.findUnique({ where: { id: campusId } })
  if (!campus) {
    return res.status(404).json({ error: 'Campus not found', code: 'NOT_FOUND' })
  }

  const existingTeacher = await prisma.teacher.findUnique({
    where: { id: req.params.id },
    select: { email: true, isLocked: true },
  })
  if (!existingTeacher) {
    return res.status(404).json({ error: 'Teacher not found', code: 'NOT_FOUND' })
  }
  if (existingTeacher.isLocked) {
    return sendError(
      res,
      423,
      'TEACHER_LOCKED',
      'This teacher is locked, so nothing about their record can be changed. Unlock them first.',
    )
  }

  // Check for email conflicts up front so we can tell the admin exactly
  // whose account is holding the email, instead of surfacing a raw P2002
  // from whichever unique constraint (Teacher.email or User.email) happens
  // to fire inside the transaction below.
  if (email !== undefined && email !== null && email !== existingTeacher.email) {
    const conflictingTeacher = await prisma.teacher.findFirst({
      where: { email, NOT: { id: req.params.id } },
      select: { id: true },
    })
    if (conflictingTeacher) {
      return res
        .status(409)
        .json({ error: 'This email is already used by another teacher.', code: 'DUPLICATE_ENTRY' })
    }

    const conflictingUser = await prisma.user.findUnique({
      where: { email },
      select: { teacherId: true },
    })
    if (conflictingUser && conflictingUser.teacherId !== req.params.id) {
      return res
        .status(409)
        .json({ error: 'This email is already used by another account.', code: 'DUPLICATE_ENTRY' })
    }
  }

  const subjectIds = [...new Set(eligibilities.map((item) => item.subjectId))]
  const classIds = [...new Set(eligibilities.map((item) => item.classId))]

  const subjects = subjectIds.length
    ? await prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true } })
    : []
  const classes = classIds.length
    ? await prisma.class.findMany({ where: { id: { in: classIds } }, select: { id: true } })
    : []

  if (subjects.length !== subjectIds.length || classes.length !== classIds.length) {
    return res
      .status(400)
      .json({ error: 'One or more subjectIds or classIds in eligibilities are invalid', code: 'VALIDATION_ERROR' })
  }

    await prisma.$transaction(async (tx) => {
      // Optimistic concurrency, atomic — the WHERE clause only matches if
      // updatedAt is still exactly what the client last saw, so the
      // compare-and-write happens as one indivisible statement. If someone
      // else saved a change in between, count is 0 and nothing here is
      // touched (this throw rolls back the whole transaction, including
      // the eligibility replace below — never a partial save).
      const result = await tx.teacher.updateMany({
        where: { id: req.params.id, updatedAt: expectedUpdatedAtDate },
        data: {
          name,
          ...(email !== undefined ? { email } : {}),
          ...(phone !== undefined ? { phone } : {}),
          campusId,
          ...(status ? { status } : {}),
          ...(hiringStatus ? { hiringStatus } : {}),
          ...(targetPeriodsPerWeek !== undefined ? { targetPeriodsPerWeek } : {}),
          ...(maxPeriodsPerWeek !== undefined ? { maxPeriodsPerWeek } : {}),
        },
      })
      if (result.count === 0) {
        throw new StaleTeacherError()
      }

      // Keep the linked login account's email in sync with the teacher's
      // email — the login is looked up by email, so a stale User.email
      // would silently lock the teacher out after an email change.
      // (User.email can't be null, so this only applies when the new email
      // is set to a real address, not cleared.)
      if (email !== undefined && email !== null && email !== existingTeacher.email) {
        await tx.user.updateMany({ where: { teacherId: req.params.id }, data: { email } })
      }

      await tx.teacherSubject.deleteMany({ where: { teacherId: req.params.id } })

      if (eligibilities.length) {
        await tx.teacherSubject.createMany({
          data: eligibilities.map(({ subjectId, classId }) => ({
            teacherId: req.params.id,
            subjectId,
            classId,
            isPrimary: true,
          })),
        })
      }
    })

    const detail = await getTeacherDetail(req.params.id)
    return res.status(200).json({ data: detail })
  } catch (error) {
    if (error instanceof StaleTeacherError) {
      return sendError(
        res,
        409,
        'STALE_TEACHER',
        'This teacher was changed by someone else since you opened this record. Reload to see the latest before saving your changes.',
      )
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res
        .status(409)
        .json({ error: 'This email is already used by another account.', code: 'DUPLICATE_ENTRY' })
    }
    return handleControllerError(error, res)
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/teachers/:id/lock  (ADMIN only)
// Toggles Teacher Lock — independent of Class Lock (§13). Freezes the whole
// teacher record (details + subject/class eligibility) from further edits or
// deletion, so a profile that's already correct can't be accidentally
// changed by anyone, including mid-way through a bulk edit of other
// teachers. Unlike Class Lock, this has no effect on the solver/generator —
// it's purely an edit-protection guard, not a scheduling constraint.
// ---------------------------------------------------------------------------
export const updateTeacherLock = async (req: Request<{ id: string }, object, { isLocked: boolean }>, res: Response) => {
  try {
    const { isLocked } = req.body

    const teacher = await prisma.teacher.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found', code: 'NOT_FOUND' })
    }

    const updated = await prisma.teacher.update({
      where: { id: req.params.id },
      data: { isLocked },
    })

    return res.status(200).json({
      data: { id: updated.id, isLocked: updated.isLocked, updatedAt: updated.updatedAt.toISOString() },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

export const deleteTeacher = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { timetableEntries: true } } },
    })

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found', code: 'NOT_FOUND' })
    }
    if (teacher.isLocked) {
      return sendError(
        res,
        423,
        'TEACHER_LOCKED',
        'This teacher is locked, so they can\'t be deleted. Unlock them first.',
      )
    }

    if (teacher._count.timetableEntries > 0) {
      await prisma.teacher.update({
        where: { id: teacher.id },
        data: { status: TeacherStatus.INACTIVE },
      })
      return res.status(200).json({ data: { id: teacher.id, status: TeacherStatus.INACTIVE } })
    }

    await prisma.teacher.delete({ where: { id: teacher.id } })
    return res.status(200).json({ data: { id: teacher.id, deleted: true } })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

// ============================================
// TEACHER MOBILE APP LOGIN ACCOUNT
// ============================================

// Complexity requirements (min 8, uppercase, digit, special char) enforced
// by setTeacherPasswordBodySchema (schemas/teachers.schemas.ts).
type SetPasswordPayload = {
  password: string
}

// ---------------------------------------------------------------------------
// POST /api/teachers/:id/set-password  (ADMIN only)
// Creates or resets the login account (User row) linked to a Teacher.
// ---------------------------------------------------------------------------
export const setTeacherPassword = async (req: Request<{ id: string }, object, SetPasswordPayload>, res: Response) => {
  try {
    // Never log req.body.password
    const { password } = req.body

    const teacher = await prisma.teacher.findUnique({ where: { id: req.params.id } })
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found', code: 'NOT_FOUND' })
    }

    if (!teacher.email) {
      return res
        .status(400)
        .json({ error: 'Teacher must have an email address before setting a password', code: 'VALIDATION_ERROR' })
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const lastPasswordSet = new Date()

    const existingUser = await prisma.user.findUnique({ where: { teacherId: teacher.id } })

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { passwordHash, lastPasswordSet },
      })
    } else {
      // Guard against the teacher's email already belonging to an unrelated
      // User row (e.g. an admin account) — email is unique per User, so
      // creating one here would otherwise throw a raw P2002.
      const emailInUse = await prisma.user.findUnique({ where: { email: teacher.email } })
      if (emailInUse) {
        return res
          .status(409)
          .json({ error: 'This email is already associated with another account', code: 'DUPLICATE_ENTRY' })
      }

      await prisma.user.create({
        data: {
          email: teacher.email,
          passwordHash,
          role: 'TEACHER',
          teacherId: teacher.id,
          lastPasswordSet,
        },
      })
    }

    return res.status(200).json({ success: true, message: 'Login credentials created successfully' })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

// ---------------------------------------------------------------------------
// GET /api/teachers/:id/account-status  (ADMIN only)
// ---------------------------------------------------------------------------
export const getTeacherAccountStatus = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id: req.params.id },
      select: {
        email: true,
        user: { select: { lastPasswordSet: true } },
      },
    })

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found', code: 'NOT_FOUND' })
    }

    return res.status(200).json({
      hasAccount: teacher.user !== null,
      email: teacher.email,
      lastPasswordSet: teacher.user?.lastPasswordSet ?? null,
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}