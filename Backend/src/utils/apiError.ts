import type { Response } from 'express'
import { Prisma } from '@prisma/client'

/**
 * Every error response in this API follows the same shape:
 * { error: "human-readable message", code: "MACHINE_CODE" }
 * Never leak a stack trace or raw Prisma error to the client.
 */
export function sendError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: message, code })
}

/**
 * Call from a controller's catch block. Maps known Prisma errors to the
 * right HTTP status; anything unexpected becomes a generic 500 (logged
 * server-side, never exposed to the client).
 */
export function handleControllerError(error: unknown, res: Response) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return sendError(res, 409, 'DUPLICATE_ENTRY', 'A record with this value already exists.')
    }
    if (error.code === 'P2025') {
      return sendError(res, 404, 'NOT_FOUND', 'The requested record was not found.')
    }
    if (error.code === 'P2003') {
      return sendError(res, 400, 'INVALID_REFERENCE', 'One or more referenced records do not exist.')
    }
  }

  console.error('[unhandled controller error]', error)
  return sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
}
