import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.js'
import { createSubject, listSubjects, updateSubject } from '../controllers/subjects.controller.js'
import { createSubjectBodySchema, subjectIdParamsSchema, updateSubjectBodySchema } from '../schemas/subjects.schemas.js'

const router = Router()

router.get('/', authMiddleware, requireRole('ADMIN'), listSubjects)
router.post('/', authMiddleware, requireRole('ADMIN'), validate({ body: createSubjectBodySchema }), createSubject)
router.patch(
  '/:id',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ params: subjectIdParamsSchema, body: updateSubjectBodySchema }),
  updateSubject,
)

export default router