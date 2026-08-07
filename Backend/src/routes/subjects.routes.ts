import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import { createSubject, listSubjects, updateSubject } from '../controllers/subjects.controller.js'

const router = Router()

router.get('/', authMiddleware, requireRole('ADMIN'), listSubjects)
router.post('/', authMiddleware, requireRole('ADMIN'), createSubject)
router.patch('/:id', authMiddleware, requireRole('ADMIN'), updateSubject)

export default router