import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.js'
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
import {
  createTeacherBodySchema,
  setTeacherPasswordBodySchema,
  teacherIdParamsSchema,
  updateTeacherBodySchema,
  updateTeacherDayLockBodySchema,
  updateTeacherLockBodySchema,
} from '../schemas/teachers.schemas.js'

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
router.get('/:id', authMiddleware, validate({ params: teacherIdParamsSchema }), getTeacherById)
router.post('/', authMiddleware, requireRole('ADMIN'), validate({ body: createTeacherBodySchema }), createTeacher)
router.patch(
  '/:id',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ params: teacherIdParamsSchema, body: updateTeacherBodySchema }),
  updateTeacher,
)
router.patch(
  '/:id/lock',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ params: teacherIdParamsSchema, body: updateTeacherLockBodySchema }),
  updateTeacherLock,
)
router.patch(
  '/:id/lock-day',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ params: teacherIdParamsSchema, body: updateTeacherDayLockBodySchema }),
  updateTeacherDayLock,
)
router.delete('/:id', authMiddleware, requireRole('ADMIN'), validate({ params: teacherIdParamsSchema }), deleteTeacher)
router.get(
  '/:id/account-status',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ params: teacherIdParamsSchema }),
  getTeacherAccountStatus,
)
router.get(
  '/:id/reallocation-risk',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ params: teacherIdParamsSchema }),
  getTeacherReallocationRisk,
)
router.post(
  '/:id/set-password',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ params: teacherIdParamsSchema, body: setTeacherPasswordBodySchema }),
  setPasswordRateLimiter,
  setTeacherPassword,
)

export default router