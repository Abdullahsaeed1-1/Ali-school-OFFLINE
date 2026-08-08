import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.js'
import { registerFcmToken } from '../controllers/notifications.controller.js'
import { registerFcmTokenBodySchema } from '../schemas/notifications.schemas.js'

const router = Router()

router.post(
  '/register',
  authMiddleware,
  requireRole('TEACHER'),
  validate({ body: registerFcmTokenBodySchema }),
  registerFcmToken,
)

export default router
