import type { NextFunction, Request, Response } from 'express'
import type { ZodError, ZodTypeAny } from 'zod'
import { sendError } from '../utils/apiError.js'

type ValidateTargets = {
  body?: ZodTypeAny
  query?: ZodTypeAny
  params?: ZodTypeAny
}

// Turns the first zod issue into one plain-English sentence — matches this
// API's existing single-message error shape (utils/apiError.ts) rather than
// returning a raw zod issue array, which would be exactly the kind of
// internal-detail leak §12 already guards against elsewhere.
function firstIssueMessage(error: ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid request'
  const field = issue.path.map(String).join('.')
  return field ? `${field}: ${issue.message}` : issue.message
}

// Validates req.body/query/params against zod schemas before a controller
// ever runs, returning the same { error, code } 400 shape as every other
// rejection in this API. This is a NEW layer in front of controllers, not a
// replacement for what they already do — DB-existence checks, lock-state
// rules, conflict detection, and optimistic-concurrency all stay exactly
// where they are; zod only rejects requests that are malformed before any
// of that business logic runs.
//
// req.body gets REPLACED with the parsed result (so defaults/coercion from
// the schema reach the controller) — that's safe, req.body is a plain
// writable property set by express.json(). req.query and req.params are
// validated for rejection only and are NOT reassigned: Express 5's req.query
// is a getter with no working setter (confirmed directly — assigning to it
// is a silent no-op, not even an error), and req.params has similar
// read-model quirks in some versions. Controllers keep reading req.query/
// req.params exactly as they already do; this middleware only adds a 400
// gate in front of them.
export function validate({ body, query, params }: ValidateTargets) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (body) {
      const result = body.safeParse(req.body)
      if (!result.success) {
        return sendError(res, 400, 'VALIDATION_ERROR', firstIssueMessage(result.error))
      }
      req.body = result.data
    }
    if (query) {
      const result = query.safeParse(req.query)
      if (!result.success) {
        return sendError(res, 400, 'VALIDATION_ERROR', firstIssueMessage(result.error))
      }
    }
    if (params) {
      const result = params.safeParse(req.params)
      if (!result.success) {
        return sendError(res, 400, 'VALIDATION_ERROR', firstIssueMessage(result.error))
      }
    }
    return next()
  }
}
