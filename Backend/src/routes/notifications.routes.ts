import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import { registerFcmToken } from '../controllers/notifications.controller.js'

const router = Router()

router.post('/register', authMiddleware, requireRole('TEACHER'), registerFcmToken)

export default router
