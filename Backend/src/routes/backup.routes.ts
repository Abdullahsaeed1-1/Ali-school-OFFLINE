import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import { downloadBackup } from '../controllers/backup.controller.js'

const router = Router()

router.get('/', authMiddleware, requireRole('ADMIN'), downloadBackup)

export default router
