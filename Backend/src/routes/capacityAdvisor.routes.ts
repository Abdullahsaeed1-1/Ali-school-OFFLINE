import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.js'
import {
  applyReassignment,
  applySafeFill,
  getCapacityAdvisor,
  getClassSubjectGapFix,
} from '../controllers/capacityAdvisor.controller.js'
import {
  applyReassignmentBodySchema,
  applySafeFillBodySchema,
  getCapacityAdvisorQuerySchema,
  getClassSubjectGapFixQuerySchema,
} from '../schemas/capacityAdvisor.schemas.js'

const router = Router()

router.get(
  '/',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ query: getCapacityAdvisorQuerySchema }),
  getCapacityAdvisor,
)
router.get(
  '/gap',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ query: getClassSubjectGapFixQuerySchema }),
  getClassSubjectGapFix,
)
router.post(
  '/apply-safe-fill',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ body: applySafeFillBodySchema }),
  applySafeFill,
)
router.post(
  '/apply-reassignment',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ body: applyReassignmentBodySchema }),
  applyReassignment,
)

export default router
