import { z } from 'zod'

export const listCampusPeriodsParamsSchema = z.object({
  id: z.string().min(1, 'campus id is required'),
})

// classGroup is a plain String column (schema.prisma), not a Prisma enum —
// no fixed allow-list exists in the data itself, so this only checks shape
// (non-empty when present), not membership in an invented list of values.
export const listCampusPeriodsQuerySchema = z.object({
  classGroup: z.string().trim().min(1).optional(),
})
