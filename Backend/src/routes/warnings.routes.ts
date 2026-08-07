import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import { getWarnings } from '../controllers/warnings.controller.js'

const router = Router()

router.get('/', authMiddleware, requireRole('ADMIN'), getWarnings)

export default router
