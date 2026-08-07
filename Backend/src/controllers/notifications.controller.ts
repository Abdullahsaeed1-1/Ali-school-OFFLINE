import type { Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/apiError.js'

type RegisterBody = {
  fcmToken?: string
}

// ---------------------------------------------------------------------------
// POST /api/notifications/register  (protected — authMiddleware + requireRole('TEACHER'))
// Saves the device's FCM token against the logged-in teacher, so the backend
// can push class-reminder / timetable-published notifications to it later.
// ---------------------------------------------------------------------------
export const registerFcmToken = async (req: Request<object, object, RegisterBody>, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
    }

    const { fcmToken } = req.body
    if (!fcmToken) {
      return res.status(400).json({ error: 'fcmToken is required', code: 'VALIDATION_ERROR' })
    }

    if (!req.user.teacherId) {
      return res.status(404).json({ error: 'No teacher profile linked to this account', code: 'NOT_FOUND' })
    }

    await prisma.teacher.update({
      where: { id: req.user.teacherId },
      data: { fcmToken },
    })

    return res.status(200).json({ success: true })
  } catch (error) {
    return handleControllerError(error, res)
  }
}
