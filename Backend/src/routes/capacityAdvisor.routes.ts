import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import {
  applyReassignment,
  applySafeFill,
  getCapacityAdvisor,
  getClassSubjectGapFix,
} from '../controllers/capacityAdvisor.controller.js'

const router = Router()

router.get('/', authMiddleware, requireRole('ADMIN'), getCapacityAdvisor)
router.get('/gap', authMiddleware, requireRole('ADMIN'), getClassSubjectGapFix)
router.post('/apply-safe-fill', authMiddleware, requireRole('ADMIN'), applySafeFill)
router.post('/apply-reassignment', authMiddleware, requireRole('ADMIN'), applyReassignment)

export default router
