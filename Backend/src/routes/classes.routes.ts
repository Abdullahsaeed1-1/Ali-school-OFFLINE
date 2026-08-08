import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.js'
import {
  createClass,
  getClassById,
  getClassLockImpact,
  listClasses,
  updateClass,
  updateClassSubjects,
} from '../controllers/classes.controller.js'
import {
  classIdParamsSchema,
  createClassBodySchema,
  updateClassBodySchema,
  updateClassSubjectsBodySchema,
} from '../schemas/classes.schemas.js'

const router = Router()

router.get('/', authMiddleware, requireRole('ADMIN'), listClasses)
router.post('/', authMiddleware, requireRole('ADMIN'), validate({ body: createClassBodySchema }), createClass)
router.get('/:id', authMiddleware, requireRole('ADMIN'), validate({ params: classIdParamsSchema }), getClassById)
router.get(
  '/:id/lock-impact',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ params: classIdParamsSchema }),
  getClassLockImpact,
)
router.patch(
  '/:id',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ params: classIdParamsSchema, body: updateClassBodySchema }),
  updateClass,
)
router.put(
  '/:id/subjects',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ params: classIdParamsSchema, body: updateClassSubjectsBodySchema }),
  updateClassSubjects,
)

export default router