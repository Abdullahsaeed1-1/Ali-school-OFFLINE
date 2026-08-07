import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import { listCampuses, listCampusPeriods } from '../controllers/campuses.controller.js'

const router = Router()

router.get('/', authMiddleware, requireRole('ADMIN'), listCampuses)
router.get('/:id/periods', authMiddleware, requireRole('ADMIN'), listCampusPeriods)

export default router