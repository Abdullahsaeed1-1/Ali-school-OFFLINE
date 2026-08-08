import { z } from 'zod'

// Mirrors parseTeacherStatus/parseHiringStatus's exact allow-lists
// (teachers.controller.ts) — same enums the DB already accepts.
const teacherStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE'])
const hiringStatusSchema = z.enum(['HIRED', 'TO_BE_HIRED'])
// Mirrors parseDayOfWeek's exact tolerance — all 7 DayOfWeek enum values,
// not just weekdays. The school is confirmed closed Sat/Sun (see
// docs/excel-ground-truth.md), but that's a real-world fact this schema
// has no business enforcing on its own — parseDayOfWeek never restricted
// to weekdays either, and inventing that restriction now would be a new
// business rule, not a validation fix.
const dayOfWeekSchema = z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])

// 35 = 7 periods/day × 5 real teaching days (Mon-Fri; Sat/Sun confirmed
// fully off with zero exceptions — docs/excel-ground-truth.md) — the real
// physical ceiling on how many periods a week can contain, not a guessed
// number. Matches the schema's own maxPeriodsPerWeek default exactly.
// No target <= max cross-field rule here on purpose: nothing in the
// existing app (controller, frontend, or solver) currently enforces that
// relationship, so adding it now would be a new business rule beyond this
// pass's scope, not a validation fix — flagged separately, not silently
// added.
const periodsPerWeekSchema = z.number().int().min(0, 'must be 0 or more').max(35, 'cannot exceed 35 (7 periods x 5 real teaching days)')

const eligibilitySchema = z.object({
  subjectId: z.string().min(1),
  classId: z.string().min(1),
})

export const teacherIdParamsSchema = z.object({
  id: z.string().min(1, 'teacher id is required'),
})

export const createTeacherBodySchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  campusId: z.string().min(1, 'campusId is required'),
  // No format guessed for phone — no established convention in this data
  // to validate against (matches the ground-truth rule: don't invent a
  // format that isn't backed by real data).
  email: z.string().trim().email('email must be a valid email address').nullish(),
  phone: z.string().nullish(),
  targetPeriodsPerWeek: periodsPerWeekSchema.optional(),
  maxPeriodsPerWeek: periodsPerWeekSchema.optional(),
  eligibilities: z.array(eligibilitySchema).optional(),
  status: teacherStatusSchema.optional(),
  hiringStatus: hiringStatusSchema.optional(),
})

export const updateTeacherBodySchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  campusId: z.string().min(1, 'campusId is required'),
  email: z.string().trim().email('email must be a valid email address').nullish(),
  phone: z.string().nullish(),
  targetPeriodsPerWeek: periodsPerWeekSchema.optional(),
  maxPeriodsPerWeek: periodsPerWeekSchema.optional(),
  eligibilities: z.array(eligibilitySchema).optional(),
  status: teacherStatusSchema.optional(),
  hiringStatus: hiringStatusSchema.optional(),
  // Optimistic concurrency (item 19) — must be present and parse as a real
  // date, same as the controller's own Number.isNaN(new Date(x).getTime())
  // check.
  expectedUpdatedAt: z
    .string()
    .min(1, "expectedUpdatedAt is required — reload this teacher before saving if you don't have it.")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: 'expectedUpdatedAt is not a valid date.' }),
})

export const updateTeacherDayLockBodySchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  academicYear: z.string().min(1, 'academicYear is required'),
  isLocked: z.boolean(),
})

export const updateTeacherLockBodySchema = z.object({
  isLocked: z.boolean(),
})

// Mirrors isPasswordValid's exact rule (teachers.controller.ts) — min 8,
// at least one uppercase, one digit, one of !@#$%^&*. Same message too.
const PASSWORD_REQUIREMENTS_ERROR =
  'Password must be at least 8 characters and include uppercase, number, and special character'

export const setTeacherPasswordBodySchema = z.object({
  password: z
    .string()
    .min(8, PASSWORD_REQUIREMENTS_ERROR)
    .refine((v) => /[A-Z]/.test(v) && /[0-9]/.test(v) && /[!@#$%^&*]/.test(v), { message: PASSWORD_REQUIREMENTS_ERROR }),
})
