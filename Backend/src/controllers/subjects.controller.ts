import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { SubjectTier } from '../constants/enums.js'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/apiError.js'

export const listSubjects = async (_req: Request, res: Response) => {
  try {
    const subjects = await prisma.subject.findMany({
      orderBy: [{ isCore: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        code: true,
        isCore: true,
        tier: true,
      },
    })

    return res.status(200).json({ data: subjects })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

function parseTier(value: unknown): SubjectTier | undefined {
  if (value === 'CORE_EARLY' || value === 'LIGHT_LATE' || value === 'UNSET') {
    return value
  }
  return undefined
}

type SubjectPayload = {
  name?: string
  code?: string | null
  isCore?: boolean
  tier?: SubjectTier
}

// name is required here (unlike SubjectPayload above) — createSubjectBodySchema
// (schemas/subjects.schemas.ts) already guarantees this by the time this
// controller runs, via the validate() middleware on the route.
type CreateSubjectPayload = SubjectPayload & { name: string }

// ---------------------------------------------------------------------------
// POST /api/subjects  (ADMIN only)
// Previously there was no way to add a subject except hand-editing
// prisma/seed.ts and reseeding — the exact same CRUD gap Classes had (§22),
// and the direct cause of two real bugs: a subject sitting with an
// unconfirmed tier (item 2, "History") and several Junior-specific subjects
// showing up in early periods before their tier was set (item 2's "Junior
// subject tiers" fix) — both only fixable back then by editing seed.ts.
// `tier` defaults to UNSET, same as the schema default, so a brand-new
// subject is flagged (not guessed) exactly like an unconfirmed seed entry
// would be — see docs/ ground-truth rule.
// ---------------------------------------------------------------------------
export const createSubject = async (req: Request<object, object, CreateSubjectPayload>, res: Response) => {
  try {
    const name = req.body.name.trim()
    const code = req.body.code?.trim() || null
    const isCore = req.body.isCore ?? true
    const tier = parseTier(req.body.tier) ?? SubjectTier.UNSET

    const created = await prisma.subject.create({
      data: { name, code, isCore, tier },
    })

    return res.status(201).json({ data: created })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'A subject with this name already exists.', code: 'DUPLICATE_ENTRY' })
    }
    return handleControllerError(error, res)
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/subjects/:id  (ADMIN only)
// The only place tier (CORE_EARLY/LIGHT_LATE/UNSET) can be set today besides
// seed.ts — closing the gap that caused items 2's two tier-related bugs.
// ---------------------------------------------------------------------------
export const updateSubject = async (req: Request<{ id: string }, object, SubjectPayload>, res: Response) => {
  try {
    const name = req.body.name?.trim()
    const code = req.body.code === undefined ? undefined : req.body.code?.trim() || null
    const isCore = req.body.isCore
    const tier = parseTier(req.body.tier)

    const existing = await prisma.subject.findUnique({ where: { id: req.params.id } })
    if (!existing) {
      return res.status(404).json({ error: 'Subject not found', code: 'NOT_FOUND' })
    }

    const updated = await prisma.subject.update({
      where: { id: req.params.id },
      data: {
        ...(name ? { name } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(isCore !== undefined ? { isCore } : {}),
        ...(tier ? { tier } : {}),
      },
    })

    return res.status(200).json({ data: updated })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'A subject with this name already exists.', code: 'DUPLICATE_ENTRY' })
    }
    return handleControllerError(error, res)
  }
}
