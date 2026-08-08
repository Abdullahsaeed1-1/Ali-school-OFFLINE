import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { changePassword, login, logout, me, refresh } from '../controllers/auth.controller.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

// Rate limit login to 10 attempts per 15 minutes per IP.
// Applied to /login only — not to /refresh or /me.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please wait 15 minutes before trying again.',
  },
})

// Rate limit changing your own password to 5 attempts per 15 minutes per
// IP — same limiter shape as teachers.routes.ts's setPasswordRateLimiter,
// since this also creates/rotates a credential (§6 calls out
// credential-creating/resetting endpoints specifically, not just login).
const changePasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many attempts. Please wait 15 minutes and try again.',
  },
})

router.post('/login', loginRateLimiter, login)
router.post('/refresh', refresh)
router.post('/logout', logout)
router.get('/me', authMiddleware, me)
router.patch('/password', authMiddleware, changePasswordRateLimiter, changePassword)

export default router
