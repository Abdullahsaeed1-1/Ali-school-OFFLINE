import { z } from 'zod'

// Mirrors parseDayOfWeek's exact tolerance (timetable.controller.ts) — see
// the identical note in schemas/teachers.schemas.ts for why this isn't
// narrowed to weekdays only.
const dayOfWeekSchema = z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])

export const teacherIdParamsSchema = z.object({
  teacherId: z.string().min(1, 'teacherId is required'),
})

// campusId/academicYear are both genuinely optional here (omitting campusId
// means "generate every campus" — see timetableGenerator.ts), so this
// schema's only job is closing a real latent crash: req.body.campusId?.trim()
// throws a TypeError if campusId is present but not a string (e.g. a
// number), which the old code had no guard against — that unhandled
// exception was silently becoming an opaque 500 instead of a clean 400.
export const generateTimetableBodySchema = z.object({
  campusId: z.string().min(1).optional(),
  academicYear: z.string().min(1).optional(),
})

export const putTimetableSlotBodySchema = z.object({
  classId: z.string().min(1, 'classId is required'),
  dayOfWeek: dayOfWeekSchema,
  periodId: z.string().min(1, 'periodId is required'),
  subjectId: z.string().min(1, 'subjectId is required'),
  teacherId: z.string().min(1, 'teacherId is required'),
  academicYear: z.string().min(1).optional(),
  confirmEligibilityOverride: z.boolean().optional(),
})

// Query-only — validated for rejection, not reassigned (see
// middleware/validate.ts). The controller keeps its own typeof-narrowing
// checks for classId/periodId/dayOfWeek, same reasoning as chunk 1/2's
// query-param cases.
export const clearTimetableSlotQuerySchema = z.object({
  classId: z.string().min(1, 'classId is required'),
  dayOfWeek: dayOfWeekSchema,
  periodId: z.string().min(1, 'periodId is required'),
  academicYear: z.string().min(1).optional(),
})

export const updateSlotLockBodySchema = z.object({
  classId: z.string().min(1, 'classId is required'),
  dayOfWeek: dayOfWeekSchema,
  periodId: z.string().min(1, 'periodId is required'),
  isLocked: z.boolean(),
  academicYear: z.string().min(1).optional(),
})
