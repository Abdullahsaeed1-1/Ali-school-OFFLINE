import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import {
  createTeacher,
  deleteTeacher,
  getTeacherAccountStatus,
  getTeacherById,
  getTeacherReallocationRisk,
  getTeacherStats,
  listTeachers,
  setTeacherPassword,
  updateTeacher,
  updateTeacherDayLock,
  updateTeacherLock,
} from '../controllers/teachers.controller.js'

const router = Router()

// Rate limit credential-setting to 5 attempts per 15 minutes per IP —
// separate (stricter) limiter than login, since this creates credentials
// rather than just checking them.
const setPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many attempts. Please wait 15 minutes and try again.',
  },
})

router.get('/', authMiddleware, requireRole('ADMIN'), listTeachers)
router.get('/stats', authMiddleware, requireRole('ADMIN'), getTeacherStats)
// No requireRole here — getTeacherById itself allows ADMIN or the teacher
// viewing their own record (used by the mobile app).
router.get('/:id', authMiddleware, getTeacherById)
router.post('/', authMiddleware, requireRole('ADMIN'), createTeacher)
router.patch('/:id', authMiddleware, requireRole('ADMIN'), updateTeacher)
router.patch('/:id/lock', authMiddleware, requireRole('ADMIN'), updateTeacherLock)
router.patch('/:id/lock-day', authMiddleware, requireRole('ADMIN'), updateTeacherDayLock)
router.delete('/:id', authMiddleware, requireRole('ADMIN'), deleteTeacher)
router.get('/:id/account-status', authMiddleware, requireRole('ADMIN'), getTeacherAccountStatus)
router.get('/:id/reallocation-risk', authMiddleware, requireRole('ADMIN'), getTeacherReallocationRisk)
router.post('/:id/set-password', authMiddleware, requireRole('ADMIN'), setPasswordRateLimiter, setTeacherPassword)

export default router