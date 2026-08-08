import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.js'
import { listCampuses, listCampusPeriods } from '../controllers/campuses.controller.js'
import { listCampusPeriodsParamsSchema, listCampusPeriodsQuerySchema } from '../schemas/campuses.schemas.js'

const router = Router()

router.get('/', authMiddleware, requireRole('ADMIN'), listCampuses)
router.get(
  '/:id/periods',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ params: listCampusPeriodsParamsSchema, query: listCampusPeriodsQuerySchema }),
  listCampusPeriods,
)

export default router