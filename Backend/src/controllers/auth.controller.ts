import type { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/apiError.js'

const SALT_ROUNDS = 12

// Access token: short-lived (30 min). Refresh token: longer-lived (7 days).
// WebAdmin (browser) uses httpOnly cookies. Flutter (no cookies) reads the
// same tokens from the JSON body and sends them back via Authorization
// header / request body instead — both paths issue from the same endpoints.
const ACCESS_TOKEN_EXPIRY = '30m'
const REFRESH_TOKEN_EXPIRY = '7d'
const ACCESS_COOKIE_MAX_AGE = 30 * 60 * 1000 // 30 minutes in ms
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days in ms

type LoginBody = {
  email?: string
  password?: string
}

type PasswordBody = {
  currentPassword?: string
  newPassword?: string
  confirmPassword?: string
}

type JwtPayload = {
  userId: string
  role: string
  teacherId: string | null
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET env var is not set')
  return secret
}

/** Sets both tokens as httpOnly, Secure, SameSite=Lax cookies on the response. */
function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const isProduction = process.env.NODE_ENV === 'production'

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: ACCESS_COOKIE_MAX_AGE,
  })

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: REFRESH_COOKIE_MAX_AGE,
    path: '/api/auth', // scope refresh cookie to auth routes only
  })
}

/** Clears both auth cookies from the browser. */
function clearAuthCookies(res: Response): void {
  res.clearCookie('accessToken')
  res.clearCookie('refreshToken', { path: '/api/auth' })
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
export const login = async (req: Request<object, object, LoginBody>, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required', code: 'VALIDATION_ERROR' })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Look up user — deliberately use the same error message whether the
    // email doesn't exist OR the password is wrong (don't reveal which failed).
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    const passwordValid = user ? await bcrypt.compare(password, user.passwordHash) : false

    if (!user || !passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' })
    }

    let secret: string
    try {
      secret = getJwtSecret()
    } catch {
      return res.status(500).json({ error: 'Server configuration error', code: 'SERVER_CONFIG_ERROR' })
    }

    const payload: JwtPayload = { userId: user.id, role: user.role, teacherId: user.teacherId }

    const accessToken = jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_EXPIRY })
    const refreshToken = jwt.sign({ userId: user.id }, secret, { expiresIn: REFRESH_TOKEN_EXPIRY })

    // Hash the refresh token before storing — a DB leak of plaintext refresh
    // tokens would let an attacker impersonate users for up to 7 days without
    // needing their password. Hashing closes that gap.
    const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS)
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash },
    })

    setAuthCookies(res, accessToken, refreshToken)

    return res.status(200).json({
      user: { id: user.id, email: user.email, role: user.role, teacherId: user.teacherId },
      accessToken,
      refreshToken,
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
export const refresh = async (req: Request<object, object, { refreshToken?: string }>, res: Response) => {
  try {
    // WebAdmin (browser) sends the refreshToken httpOnly cookie. Flutter (no
    // cookies) sends it in the request body instead.
    const incomingRefreshToken: string | undefined = req.cookies?.refreshToken ?? req.body?.refreshToken

    if (!incomingRefreshToken) {
      return res.status(401).json({ error: 'No refresh token provided', code: 'AUTH_REQUIRED' })
    }

    let secret: string
    try {
      secret = getJwtSecret()
    } catch {
      return res.status(500).json({ error: 'Server configuration error', code: 'SERVER_CONFIG_ERROR' })
    }

    // Verify the JWT signature and expiry first — fast fail before hitting the DB.
    let decoded: { userId: string }
    try {
      decoded = jwt.verify(incomingRefreshToken, secret) as { userId: string }
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token', code: 'INVALID_SESSION' })
    }

    // Load the user and compare the incoming token against the stored bcrypt hash.
    // This ensures a leaked DB row can't be used directly to forge new sessions.
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
    const hashMatches =
      user?.refreshToken ? await bcrypt.compare(incomingRefreshToken, user.refreshToken) : false

    if (!user || !hashMatches) {
      return res.status(401).json({ error: 'Refresh token mismatch', code: 'INVALID_SESSION' })
    }

    const newAccessToken = jwt.sign(
      { userId: user.id, role: user.role, teacherId: user.teacherId },
      secret,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    )

    const isProduction = process.env.NODE_ENV === 'production'
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: ACCESS_COOKIE_MAX_AGE,
    })

    return res.status(200).json({ ok: true, accessToken: newAccessToken })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
export const logout = async (req: Request<object, object, { refreshToken?: string }>, res: Response) => {
  try {
    const incomingRefreshToken: string | undefined = req.cookies?.refreshToken ?? req.body?.refreshToken

    // Best-effort: clear the DB token if we can identify the user.
    // If the cookie is already missing, still clear cookies and return 200.
    if (incomingRefreshToken) {
      try {
        const secret = getJwtSecret()
        const decoded = jwt.verify(incomingRefreshToken, secret) as { userId: string }
        await prisma.user.update({
          where: { id: decoded.userId },
          data: { refreshToken: null },
        })
      } catch {
        // Token invalid/expired — the cookies are being cleared anyway, nothing else to do.
      }
    }

    clearAuthCookies(res)
    return res.status(200).json({ ok: true })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

// ---------------------------------------------------------------------------
// GET /api/auth/me  (protected — authMiddleware runs before this)
// ---------------------------------------------------------------------------
export const me = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, role: true, teacherId: true },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' })
    }

    return res.status(200).json({ user })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/auth/password
// ---------------------------------------------------------------------------
export const changePassword = async (req: Request<object, object, PasswordBody>, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
    }

    const { currentPassword, newPassword, confirmPassword } = req.body

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All password fields are required', code: 'VALIDATION_ERROR' })
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: 'New password must be at least 8 characters', code: 'VALIDATION_ERROR' })
    }

    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ error: 'New password and confirmation do not match', code: 'VALIDATION_ERROR' })
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, passwordHash: true },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' })
    }

    const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!currentMatches) {
      return res.status(401).json({ error: 'Current password is incorrect', code: 'INVALID_CREDENTIALS' })
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    return res.status(200).json({ ok: true })
  } catch (error) {
    return handleControllerError(error, res)
  }
}
