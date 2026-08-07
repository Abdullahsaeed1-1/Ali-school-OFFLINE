import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js'
import {
  clearTimetableSlot,
  generateTimetable,
  getTimetable,
  getTeacherTimetable,
  getTimetableStatus,
  putTimetableSlot,
  updateSlotLock,
} from '../controllers/timetable.controller.js'

const router = Router()

router.get('/', authMiddleware, requireRole('ADMIN'), getTimetable)
router.get('/status', authMiddleware, requireRole('ADMIN'), getTimetableStatus)
router.get('/teacher/:teacherId', authMiddleware, getTeacherTimetable)
router.post('/generate', authMiddleware, requireRole('ADMIN'), generateTimetable)
router.put('/slot', authMiddleware, requireRole('ADMIN'), putTimetableSlot)
router.delete('/slot', authMiddleware, requireRole('ADMIN'), clearTimetableSlot)
router.patch('/slot/lock', authMiddleware, requireRole('ADMIN'), updateSlotLock)

export default router