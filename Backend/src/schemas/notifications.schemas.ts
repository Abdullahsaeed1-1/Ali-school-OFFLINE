import { z } from 'zod'

export const registerFcmTokenBodySchema = z.object({
  fcmToken: z.string().min(1, 'fcmToken is required'),
})
