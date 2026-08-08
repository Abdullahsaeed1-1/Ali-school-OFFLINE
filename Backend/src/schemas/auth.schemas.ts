import { z } from 'zod'

// login already had presence checks manually — this adds real format
// checking (a syntactically invalid email used to sail through to the DB
// lookup and just 401 as "wrong password", which was harmless but sloppy).
export const loginBodySchema = z.object({
  email: z.string().trim().min(1, 'email is required').email('email must be a valid email address'),
  password: z.string().min(1, 'password is required'),
})

// Mirrors the exact rules changePassword already enforced by hand (min 8,
// new === confirm) — now declared once instead of three separate manual
// if-checks, and still returns the same field-specific messages.
export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, 'currentPassword is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'confirmPassword is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New password and confirmation do not match',
    path: ['confirmPassword'],
  })
