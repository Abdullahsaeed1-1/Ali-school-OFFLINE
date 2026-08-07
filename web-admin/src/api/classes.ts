import client from './client'

export type ClassSummary = {
  id: string
  name: string
  gradeLevel: string | null
  section: string
  stream: string | null
  campusId: string
  campusName: string
  isActive: boolean
  isLocked: boolean
  // Which of lecture periods 1-7 Games is reserved in for this class, if
  // any — explicit, admin-confirmed (§30), not inferred from gradeLevel.
  // Empty array is a real answer ("confirmed: no protection needed").
  gamesProtectedLectures: number[]
  gamesProtectionConfirmed: boolean
  subjectCount: number
  eligibilityCount: number
  timetableCount: number
}

export type ClassDetail = ClassSummary & {
  subjects: Array<{ id: string; name: string; periodsPerWeek: number }>
  eligibleTeachers: Array<{ teacherId: string; teacherName: string; subjectId: string; subjectName: string }>
}

export type ClassLockImpact = {
  classId: string
  className: string
  isLocked: boolean
  affectedTeachers: Array<{
    teacherId: string
    teacherName: string
    currentPeriods: number
    targetPeriodsPerWeek: number
    belowTarget: boolean
  }>
  belowTargetCount: number
}

export type CreateClassPayload = {
  name: string
  campusId: string
  section: string
  gradeLevel?: string | null
  stream?: string | null
  // Both required by the API — see ClassSummary's comment. gamesProtectedLectures
  // may legitimately be [] (confirmed: no protection needed), but
  // gamesProtectionConfirmed must be true, or the request is rejected.
  gamesProtectedLectures: number[]
  gamesProtectionConfirmed: true
}

export const classesApi = {
  createClass(payload: CreateClassPayload) {
    return client.post<{ data: ClassSummary }>('/classes', payload)
  },
  getClasses(params?: { campusId?: string; isActive?: boolean }) {
    const searchParams = new URLSearchParams()
    if (params?.campusId) searchParams.set('campusId', params.campusId)
    if (params?.isActive !== undefined) searchParams.set('isActive', String(params.isActive))
    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return client.get<{ data: ClassSummary[] }>(`/classes${suffix}`)
  },
  getClassDetail(id: string) {
    return client.get<{ data: ClassDetail }>(`/classes/${id}`)
  },
  getLockImpact(id: string) {
    return client.get<{ data: ClassLockImpact }>(`/classes/${id}/lock-impact`)
  },
  updateClass(
    id: string,
    payload: { isActive?: boolean; isLocked?: boolean; gamesProtectedLectures?: number[]; gamesProtectionConfirmed?: true },
  ) {
    return client.patch<{ data: ClassDetail }>(`/classes/${id}`, payload)
  },
  updateClassSubjects(id: string, payload: { subjects: Array<{ subjectId: string; periodsPerWeek: number }> }) {
    return client.put<{ data: { id: string; subjects: ClassDetail['subjects'] } }>(`/classes/${id}/subjects`, payload)
  },
}