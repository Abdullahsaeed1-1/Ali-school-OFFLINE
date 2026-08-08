import { z } from 'zod'

export const getCapacityAdvisorQuerySchema = z.object({
  teacherId: z.string().trim().min(1).optional(),
})

export const getClassSubjectGapFixQuerySchema = z.object({
  classId: z.string().trim().min(1, 'classId is required'),
  subjectId: z.string().trim().min(1, 'subjectId is required'),
})

export const applySafeFillBodySchema = z.object({
  teacherId: z.string().min(1, 'teacherId is required'),
  classId: z.string().min(1, 'classId is required'),
  subjectId: z.string().min(1, 'subjectId is required'),
})

export const applyReassignmentBodySchema = z.object({
  toTeacherId: z.string().min(1, 'toTeacherId is required'),
  fromTeacherId: z.string().min(1, 'fromTeacherId is required'),
  classId: z.string().min(1, 'classId is required'),
  subjectId: z.string().min(1, 'subjectId is required'),
})
