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

router.post('/login', loginRateLimiter, login)
router.post('/refresh', refresh)
router.post('/logout', logout)
router.get('/me', authMiddleware, me)
router.patch('/password', authMiddleware, changePassword)

export default router
