import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import {
  clearTimetableSlot,
  generateTimetable,
  getTimetable,
  getTeacherTimetable,
  getTimetableStatus,
  putTimetableSlot,
  updateSlotLock,
} from '../controllers/timetable.controller.js'

const router = Router()

// Rate limit Generate to 20 attempts per 15 minutes per IP — expensive
// (up to ~25s of solver CPU per call, per solve.py's stage budgets), so a
// compromised/buggy ADMIN session shouldn't be able to hammer it without
// limit (§6). 20/15min is generous on purpose: a real admin session can
// legitimately re-run Generate several times per campus while reviewing
// results — this is only meant to catch actual hammering, not normal use.
const generateRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many Generate requests. Please wait a few minutes before trying again.',
  },
})

router.get('/', authMiddleware, requireRole('ADMIN'), getTimetable)
router.get('/status', authMiddleware, requireRole('ADMIN'), getTimetableStatus)
router.get('/teacher/:teacherId', authMiddleware, getTeacherTimetable)
router.post('/generate', authMiddleware, requireRole('ADMIN'), generateRateLimiter, generateTimetable)
router.put('/slot', authMiddleware, requireRole('ADMIN'), putTimetableSlot)
router.delete('/slot', authMiddleware, requireRole('ADMIN'), clearTimetableSlot)
router.patch('/slot/lock', authMiddleware, requireRole('ADMIN'), updateSlotLock)

export default router
