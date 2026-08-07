import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import {
  createClass,
  getClassById,
  getClassLockImpact,
  listClasses,
  updateClass,
  updateClassSubjects,
} from '../controllers/classes.controller.js'

const router = Router()

router.get('/', authMiddleware, requireRole('ADMIN'), listClasses)
router.post('/', authMiddleware, requireRole('ADMIN'), createClass)
router.get('/:id', authMiddleware, requireRole('ADMIN'), getClassById)
router.get('/:id/lock-impact', authMiddleware, requireRole('ADMIN'), getClassLockImpact)
router.patch('/:id', authMiddleware, requireRole('ADMIN'), updateClass)
router.put('/:id/subjects', authMiddleware, requireRole('ADMIN'), updateClassSubjects)

export default router