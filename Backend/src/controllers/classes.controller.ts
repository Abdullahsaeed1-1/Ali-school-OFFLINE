import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/apiError.js'
import { computeScheduledPeriodsByTeacher } from '../utils/teacherOccupancy.js'

// Matches the default used across the rest of the API.
const ACADEMIC_YEAR = '2026-2027'

type ClassWithListRelations = Prisma.ClassGetPayload<{
  select: {
    id: true
    name: true
    gradeLevel: true
    section: true
    stream: true
    campusId: true
    isActive: true
    isLocked: true
    gamesProtectedLectures: true
    gamesProtectionConfirmed: true
    campus: { select: { name: true } }
    _count: {
      select: {
        classSubjects: true
        teacherSubjects: true
        timetableEntries: true
      }
    }
  }
}>

type ClassWithDetailRelations = Prisma.ClassGetPayload<{
  include: {
    campus: true
    classSubjects: {
      include: { subject: true }
      orderBy: { subject: { name: 'asc' } }
    }
    teacherSubjects: {
      include: { teacher: true; subject: true }
    }
    _count: {
      select: {
        timetableEntries: true
        teacherSubjects: true
        classSubjects: true
      }
    }
  }
}>

function parseIsActive(value: unknown): boolean | null {
  if (value === undefined) return null
  if (value === 'true' || value === true) return true
  if (value === 'false' || value === false) return false
  return null
}

export const listClasses = async (req: Request, res: Response) => {
  try {
    const campusId = typeof req.query.campusId === 'string' ? req.query.campusId : undefined
    const isActive = parseIsActive(req.query.isActive)

    const classes = (await prisma.class.findMany({
      where: {
        ...(campusId ? { campusId } : {}),
        ...(isActive === null ? {} : { isActive }),
      },
      // gradeLevel is a free-text String (Junior uses "Nursery"/"KG" etc,
      // not just numbers), so ordering by it directly in the DB sorts
      // lexicographically ("10" before "2").
      // Fetch by name only here and do a numeric-aware sort below instead.
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        gradeLevel: true,
        section: true,
        stream: true,
        campusId: true,
        isActive: true,
        isLocked: true,
        gamesProtectedLectures: true,
        gamesProtectionConfirmed: true,
        campus: { select: { name: true } },
        _count: {
          select: {
            classSubjects: true,
            teacherSubjects: true,
            timetableEntries: true,
          },
        },
      },
    })) as ClassWithListRelations[]

    // Numeric grades sort as numbers ("2" before "10"); non-numeric grades
    // (Junior's "Nursery"/"KG A" etc) fall back to plain string comparison
    // — same convention already used client-side in ClassesPage's grade
    // grouping, kept consistent here for the raw list order too.
    classes.sort((a, b) => {
      const gradeA = a.gradeLevel ?? ''
      const gradeB = b.gradeLevel ?? ''
      const numA = Number.parseInt(gradeA, 10)
      const numB = Number.parseInt(gradeB, 10)
      if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB
      const gradeCompare = gradeA.localeCompare(gradeB)
      return gradeCompare !== 0 ? gradeCompare : a.name.localeCompare(b.name)
    })

    return res.status(200).json({
      data: classes.map((cls) => ({
        id: cls.id,
        name: cls.name,
        gradeLevel: cls.gradeLevel,
        section: cls.section,
        stream: cls.stream,
        campusId: cls.campusId,
        campusName: cls.campus.name,
        isActive: cls.isActive,
        isLocked: cls.isLocked,
        gamesProtectedLectures: cls.gamesProtectedLectures,
        gamesProtectionConfirmed: cls.gamesProtectionConfirmed,
        subjectCount: cls._count.classSubjects,
        eligibilityCount: cls._count.teacherSubjects,
        timetableCount: cls._count.timetableEntries,
      })),
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

type CreateClassPayload = {
  name?: string
  campusId?: string
  section?: string
  gradeLevel?: string | null
  stream?: string | null
  gamesProtectedLectures?: unknown
  gamesProtectionConfirmed?: unknown
}

// Validates a games-protected-lectures payload: must be an array of
// integers, each within 1-7 (the only real lecture indices — see
// utils/school.ts's period model), deduped and sorted. Returns null if the
// input isn't a valid array at all (caller decides what that means — empty
// array vs "wasn't sent" are different, this only rejects the shape).
function parseGamesProtectedLectures(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const nums = value.map((v) => Number(v))
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) return null
  return [...new Set(nums)].sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------
// POST /api/classes  (ADMIN only)
// Previously this system had no way to add a class except editing
// prisma/seed.ts and reseeding — a real CRUD gap (there was no create path
// to run new-class-workflow validation against at all). name+campusId+
// section are the only required fields; a brand-new class starts with zero
// subject quotas and zero teacher eligibility — both are added afterward
// through the existing "Edit Class" drawer (subject quotas) and the
// Teachers page (eligibility), exactly like any other class.
//
// gamesProtectionConfirmed must be explicitly true — this is deliberately
// enforced server-side, not just nudged in the UI, so a class can never be
// created with an un-thought-about Games answer the way "11 Arts" silently
// was under the old gradeLevel-inference approach (item 27 audit,
// PENDING_QUESTIONS.md item 30). gamesProtectedLectures may legitimately be
// an empty array — that's a real, confirmed answer ("no protection needed
// for this class"), not a placeholder.
// ---------------------------------------------------------------------------
export const createClass = async (req: Request<object, object, CreateClassPayload>, res: Response) => {
  try {
    const name = req.body.name?.trim()
    const campusId = req.body.campusId
    const section = req.body.section?.trim()
    const gradeLevel = req.body.gradeLevel?.trim() || null
    const stream = req.body.stream?.trim() || null
    const gamesProtectionConfirmed = req.body.gamesProtectionConfirmed === true
    const gamesProtectedLectures = parseGamesProtectedLectures(req.body.gamesProtectedLectures)

    if (!name || !campusId || !section) {
      return res.status(400).json({ error: 'name, campusId, and section are required', code: 'VALIDATION_ERROR' })
    }
    if (gamesProtectedLectures === null) {
      return res
        .status(400)
        .json({ error: 'gamesProtectedLectures must be an array of lecture numbers 1-7 (can be empty)', code: 'VALIDATION_ERROR' })
    }
    if (!gamesProtectionConfirmed) {
      return res.status(400).json({
        error:
          'gamesProtectionConfirmed must be explicitly confirmed true — every class needs a real answer for which periods (if any) Games is protected in, not a default.',
        code: 'VALIDATION_ERROR',
      })
    }

    const campus = await prisma.campus.findUnique({ where: { id: campusId } })
    if (!campus) {
      return res.status(404).json({ error: 'Campus not found', code: 'NOT_FOUND' })
    }

    const created = await prisma.class.create({
      data: { name, campusId, section, gradeLevel, stream, gamesProtectedLectures, gamesProtectionConfirmed },
    })

    return res.status(201).json({
      data: {
        id: created.id,
        name: created.name,
        gradeLevel: created.gradeLevel,
        section: created.section,
        stream: created.stream,
        campusId: created.campusId,
        campusName: campus.name,
        isActive: created.isActive,
        isLocked: created.isLocked,
        gamesProtectedLectures: created.gamesProtectedLectures,
        gamesProtectionConfirmed: created.gamesProtectionConfirmed,
        subjectCount: 0,
        eligibilityCount: 0,
        timetableCount: 0,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'A class with this name already exists on this campus.', code: 'DUPLICATE_ENTRY' })
    }
    return handleControllerError(error, res)
  }
}

export const getClassById = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const cls = (await prisma.class.findUnique({
      where: { id: req.params.id },
      include: {
        campus: true,
        classSubjects: {
          include: { subject: true },
          orderBy: { subject: { name: 'asc' } },
        },
        teacherSubjects: {
          include: { teacher: true, subject: true },
        },
        _count: {
          select: {
            timetableEntries: true,
            teacherSubjects: true,
            classSubjects: true,
          },
        },
      },
    })) as ClassWithDetailRelations | null

    if (!cls) {
      return res.status(404).json({ error: 'Class not found', code: 'NOT_FOUND' })
    }

    return res.status(200).json({
      data: {
        id: cls.id,
        name: cls.name,
        gradeLevel: cls.gradeLevel,
        section: cls.section,
        stream: cls.stream,
        campusId: cls.campusId,
        campusName: cls.campus.name,
        isActive: cls.isActive,
        isLocked: cls.isLocked,
        gamesProtectedLectures: cls.gamesProtectedLectures,
        gamesProtectionConfirmed: cls.gamesProtectionConfirmed,
        subjectCount: cls._count.classSubjects,
        eligibilityCount: cls._count.teacherSubjects,
        timetableCount: cls._count.timetableEntries,
        subjects: cls.classSubjects.map((item) => ({
          id: item.subject.id,
          name: item.subject.name,
          periodsPerWeek: item.periodsPerWeek,
        })),
        eligibleTeachers: cls.teacherSubjects.map((item) => ({
          teacherId: item.teacher.id,
          teacherName: item.teacher.name,
          subjectId: item.subject.id,
          subjectName: item.subject.name,
        })),
      },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

export const updateClass = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const isActive = parseIsActive(req.body?.isActive)
    const isLocked = parseIsActive(req.body?.isLocked)
    // Games protection is editable here too (not just at creation) — the
    // school's answer for a class can change (e.g. a grade's timing shifts),
    // and this is the same "required, explicit, never a silent default"
    // rule as createClass: if the caller sends gamesProtectedLectures at
    // all, it must be confirmed alongside it in the same request.
    const gamesProtectedLecturesProvided = req.body?.gamesProtectedLectures !== undefined
    const gamesProtectedLectures = gamesProtectedLecturesProvided
      ? parseGamesProtectedLectures(req.body.gamesProtectedLectures)
      : undefined

    if (isActive === null && isLocked === null && !gamesProtectedLecturesProvided) {
      return res
        .status(400)
        .json({ error: 'Provide isActive, isLocked, and/or gamesProtectedLectures', code: 'VALIDATION_ERROR' })
    }
    if (gamesProtectedLecturesProvided) {
      if (gamesProtectedLectures === null) {
        return res
          .status(400)
          .json({ error: 'gamesProtectedLectures must be an array of lecture numbers 1-7 (can be empty)', code: 'VALIDATION_ERROR' })
      }
      if (req.body.gamesProtectionConfirmed !== true) {
        return res.status(400).json({
          error: 'gamesProtectionConfirmed must be explicitly confirmed true when changing gamesProtectedLectures',
          code: 'VALIDATION_ERROR',
        })
      }
    }

    const data: Prisma.ClassUpdateInput = {}
    if (isActive !== null) data.isActive = isActive
    if (isLocked !== null) data.isLocked = isLocked
    if (gamesProtectedLectures !== undefined && gamesProtectedLectures !== null) {
      data.gamesProtectedLectures = gamesProtectedLectures
      data.gamesProtectionConfirmed = true
    }

    const updated = (await prisma.class.update({
      where: { id: req.params.id },
      data,
      include: { campus: true },
    })) as Prisma.ClassGetPayload<{ include: { campus: true } }>

    return res.status(200).json({
      data: {
        id: updated.id,
        isActive: updated.isActive,
        isLocked: updated.isLocked,
        gamesProtectedLectures: updated.gamesProtectedLectures,
        gamesProtectionConfirmed: updated.gamesProtectionConfirmed,
        campusName: updated.campus.name,
      },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

// Preview before locking (§13 manual lock) — who's actually got real
// periods in this class right now, and which of them are already below
// their campus-wide weekly target. Locking freezes this class out of every
// future regenerate, so a teacher tied to it who's currently under target
// has no way to close that gap except unlocking this class again.
export const getClassLockImpact = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const cls = await prisma.class.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, isLocked: true },
    })
    if (!cls) {
      return res.status(404).json({ error: 'Class not found', code: 'NOT_FOUND' })
    }

    const entries = await prisma.timetableEntry.findMany({
      where: { classId: cls.id, academicYear: ACADEMIC_YEAR },
      select: { teacherId: true, secondTeacherId: true },
    })
    const teacherIds = [
      ...new Set(entries.flatMap((e) => [e.teacherId, e.secondTeacherId]).filter((id): id is string => Boolean(id))),
    ]

    const teachers = teacherIds.length
      ? await prisma.teacher.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, name: true, targetPeriodsPerWeek: true },
          orderBy: { name: 'asc' },
        })
      : []
    const scheduledByTeacher = await computeScheduledPeriodsByTeacher(teacherIds, ACADEMIC_YEAR)

    const affectedTeachers = teachers.map((teacher) => {
      const currentPeriods = scheduledByTeacher.get(teacher.id) ?? 0
      return {
        teacherId: teacher.id,
        teacherName: teacher.name,
        currentPeriods,
        targetPeriodsPerWeek: teacher.targetPeriodsPerWeek,
        belowTarget: currentPeriods < teacher.targetPeriodsPerWeek,
      }
    })

    return res.status(200).json({
      data: {
        classId: cls.id,
        className: cls.name,
        isLocked: cls.isLocked,
        affectedTeachers,
        belowTargetCount: affectedTeachers.filter((t) => t.belowTarget).length,
      },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

type SubjectQuotaPayload = { subjectId?: string; periodsPerWeek?: number }

export const updateClassSubjects = async (
  req: Request<{ id: string }, object, { subjects?: SubjectQuotaPayload[] }>,
  res: Response,
) => {
  try {
    const cls = await prisma.class.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!cls) {
      return res.status(404).json({ error: 'Class not found', code: 'NOT_FOUND' })
    }

    const rows = Array.isArray(req.body.subjects) ? req.body.subjects : []
    const quotas = rows.filter(
      (item): item is Required<SubjectQuotaPayload> =>
        typeof item?.subjectId === 'string' && Number.isInteger(item.periodsPerWeek) && (item.periodsPerWeek ?? -1) >= 0,
    )
    if (quotas.length !== rows.length) {
      return res
        .status(400)
        .json({ error: 'Each subject entry needs a subjectId and a non-negative integer periodsPerWeek', code: 'VALIDATION_ERROR' })
    }

    const subjectIds = [...new Set(quotas.map((q) => q.subjectId))]
    if (subjectIds.length !== quotas.length) {
      return res.status(400).json({ error: 'Duplicate subjectId in the same request', code: 'VALIDATION_ERROR' })
    }
    const subjects = subjectIds.length
      ? await prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true } })
      : []
    if (subjects.length !== subjectIds.length) {
      return res.status(400).json({ error: 'One or more subjectIds are invalid', code: 'VALIDATION_ERROR' })
    }

    await prisma.$transaction(async (tx) => {
      await tx.classSubject.deleteMany({ where: { classId: req.params.id } })
      if (quotas.length) {
        await tx.classSubject.createMany({
          data: quotas.map((q) => ({
            classId: req.params.id,
            subjectId: q.subjectId,
            periodsPerWeek: q.periodsPerWeek,
            periodsPerDay: q.periodsPerWeek / 5,
          })),
        })
      }
    })

    const updated = (await prisma.class.findUnique({
      where: { id: req.params.id },
      include: {
        classSubjects: { include: { subject: true }, orderBy: { subject: { name: 'asc' } } },
      },
    })) as Prisma.ClassGetPayload<{ include: { classSubjects: { include: { subject: true } } } }>

    return res.status(200).json({
      data: {
        id: updated.id,
        subjects: updated.classSubjects.map((item) => ({
          id: item.subject.id,
          name: item.subject.name,
          periodsPerWeek: item.periodsPerWeek,
        })),
      },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}