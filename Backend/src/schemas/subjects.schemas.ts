import { z } from 'zod'

// Mirrors parseTier()'s exact allow-list (subjects.controller.ts) — same
// three values the schema/DB already accept, not a new invented rule.
const subjectTierSchema = z.enum(['CORE_EARLY', 'LIGHT_LATE', 'UNSET'])

// code is intentionally just z.string() (no min(1)) — the controller's own
// `.trim() || null` already treats "" the same as "not set", so rejecting
// "" here would be a new, stricter behavior the controller never had.
export const createSubjectBodySchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  code: z.string().nullish(),
  isCore: z.boolean().optional(),
  tier: subjectTierSchema.optional(),
})

// All fields optional on update — matches the existing partial-update
// semantics (only provided fields are changed).
export const updateSubjectBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  code: z.string().nullish(),
  isCore: z.boolean().optional(),
  tier: subjectTierSchema.optional(),
})

export const subjectIdParamsSchema = z.object({
  id: z.string().min(1, 'subject id is required'),
})
