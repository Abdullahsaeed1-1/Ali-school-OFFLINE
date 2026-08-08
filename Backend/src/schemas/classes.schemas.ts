import { z } from 'zod'

// Mirrors parseGamesProtectedLectures's exact tolerance (classes.controller.ts,
// pre-chunk-2): z.coerce.number() accepts numeric strings the same way the
// old `Number(v)` call did, integers 1-7 only (the real lecture indices),
// deduped + sorted the same way. Empty array is valid — "no protection
// needed" is a real, confirmed answer, not a placeholder.
const gamesProtectedLecturesSchema = z
  .array(z.coerce.number().int().min(1).max(7))
  .transform((arr) => [...new Set(arr)].sort((a, b) => a - b))

// gamesProtectionConfirmed must be the LITERAL boolean true — matches the
// existing `=== true` check exactly (a string "true", 1, or anything else
// still fails, same as before).
const gamesProtectionConfirmedRequired = z.literal(true, {
  message:
    'gamesProtectionConfirmed must be explicitly confirmed true — every class needs a real answer for which periods (if any) Games is protected in, not a default.',
})

export const createClassBodySchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  campusId: z.string().min(1, 'campusId is required'),
  section: z.string().trim().min(1, 'section is required'),
  // gradeLevel/stream: no min(1) — the controller's own `.trim() || null`
  // already treats "" the same as "not set", same reasoning as subjects'
  // `code` field in chunk 1.
  gradeLevel: z.string().nullish(),
  stream: z.string().nullish(),
  gamesProtectedLectures: gamesProtectedLecturesSchema,
  gamesProtectionConfirmed: gamesProtectionConfirmedRequired,
})

// isActive/isLocked are real JSON booleans on every real caller (confirmed
// against web-admin/src/api/classes.ts's updateClass payload type) — unlike
// listClasses' query-string isActive filter (which stays untouched, since
// query params are always strings there and parseIsActive's leniency is the
// correct behavior for a filter, not a mutation).
//
// The two cross-field rules below are the exact ones updateClass enforced
// by hand: (1) at least one of the three fields must be provided at all,
// (2) gamesProtectionConfirmed must be true IN THE SAME REQUEST whenever
// gamesProtectedLectures is being changed — you can't confirm it once and
// coast on that confirmation for a later, different change.
export const updateClassBodySchema = z
  .object({
    isActive: z.boolean().optional(),
    isLocked: z.boolean().optional(),
    gamesProtectedLectures: gamesProtectedLecturesSchema.optional(),
    gamesProtectionConfirmed: z.boolean().optional(),
  })
  .refine(
    (data) => data.isActive !== undefined || data.isLocked !== undefined || data.gamesProtectedLectures !== undefined,
    { message: 'Provide isActive, isLocked, and/or gamesProtectedLectures' },
  )
  .refine((data) => data.gamesProtectedLectures === undefined || data.gamesProtectionConfirmed === true, {
    message: 'gamesProtectionConfirmed must be explicitly confirmed true when changing gamesProtectedLectures',
    path: ['gamesProtectionConfirmed'],
  })

export const classIdParamsSchema = z.object({
  id: z.string().min(1, 'class id is required'),
})

// periodsPerWeek: non-negative integer — matches the existing
// Number.isInteger(item.periodsPerWeek) && periodsPerWeek >= 0 check
// exactly. Duplicate-subjectId detection stays in the controller (it needs
// to compare across array entries, not validate one entry's shape — a
// schema-level job zod can do too via .refine() on the whole array, done
// below to keep it in one place rather than splitting the same rule across
// two layers).
export const updateClassSubjectsBodySchema = z.object({
  subjects: z
    .array(
      z.object({
        subjectId: z.string().min(1, 'subjectId is required'),
        periodsPerWeek: z.number().int().min(0, 'periodsPerWeek must be a non-negative integer'),
      }),
    )
    .refine((rows) => new Set(rows.map((r) => r.subjectId)).size === rows.length, {
      message: 'Duplicate subjectId in the same request',
    })
    .default([]),
})
