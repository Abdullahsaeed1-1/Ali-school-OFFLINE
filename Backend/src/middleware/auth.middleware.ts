import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { Role } from '@prisma/client'

export type AuthenticatedUser = {
  userId: string
  role: Role
  teacherId: string | null
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
    }
  }
}

// ---------------------------------------------------------------------------
// authMiddleware
// Reads the access token, verifies the JWT, and attaches
// req.user = { userId, role, teacherId }. Returns 401 if missing/invalid.
// WebAdmin (browser) sends the accessToken httpOnly cookie. Flutter (no
// cookies) sends `Authorization: Bearer <token>` instead — check both.
// ---------------------------------------------------------------------------
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    return res.status(500).json({ error: 'Server configuration error', code: 'SERVER_CONFIG_ERROR' })
  }

  const authHeader = req.headers.authorization
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
  const token: string | undefined = bearerToken ?? req.cookies?.accessToken
  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
  }

  try {
    const decoded = jwt.verify(token, secret) as AuthenticatedUser
    req.user = decoded
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session', code: 'INVALID_SESSION' })
  }
}

// Keep the old name as an alias so any other file that still imports
// authenticateToken doesn't break — we'll migrate them in a later pass.
export const authenticateToken = authMiddleware

// ---------------------------------------------------------------------------
// requireRole(...roles)
// Middleware factory — must be used AFTER authMiddleware.
// Returns 403 if req.user.role isn't in the allowed list.
// ---------------------------------------------------------------------------
export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' })
    }
    return next()
  }
}

// Keep the old name as an alias for any future callers.
export const authorizeRoles = requireRole
