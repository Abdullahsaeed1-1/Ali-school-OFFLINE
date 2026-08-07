import client from './client'

export type TeacherSummary = {
  id: string
  name: string
  email: string | null
  phone: string | null
  campusId: string
  campusName: string
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE'
  hiringStatus: 'HIRED' | 'TO_BE_HIRED'
  isLocked: boolean
  currentPeriods: number
  targetPeriodsPerWeek: number
  maxPeriodsPerWeek: number
  subjectNames: string[]
  subjects: Array<{ id: string; name: string; isCore: boolean }>
  classNames: string[]
  hasAccount: boolean
}

export type TeacherAccountStatus = {
  hasAccount: boolean
  email: string | null
  lastPasswordSet: string | null
}

export type TeacherEligibility = {
  subjectId: string
  subjectName: string
  classId: string
  className: string
  campusName: string
  isPrimary: boolean
}

export type TeacherDetail = {
  id: string
  name: string
  email: string | null
  phone: string | null
  campusId: string
  campusName: string
  currentPeriods: number
  targetPeriodsPerWeek: number
  maxPeriodsPerWeek: number
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE'
  hiringStatus: 'HIRED' | 'TO_BE_HIRED'
  isLocked: boolean
  updatedAt: string
  eligibilities: TeacherEligibility[]
  loadSummary: null | {
    id: string
    teacherId: string
    academicYear: string
    weekStart: string
    totalAssigned: number
    totalTarget: number
    totalMax: number
    delta: number
    status: 'FINE' | 'SLACK' | 'ERROR'
    createdAt: string
  }
  counts: {
    timetableEntries: number
    teacherSubjects: number
  }
}

export type TeacherStats = {
  total: number
  byCampus: { junior: number; girls: number; boys: number }
}

export type TeacherReallocationRisk = {
  teacherId: string
  teacherName: string
  currentPeriods: number
  targetPeriodsPerWeek: number
  maxPeriodsPerWeek: number
  atOrOverTarget: boolean
  currentClasses: Array<{ classId: string; className: string; periods: number }>
}

export type TeacherFilters = {
  campusId?: string
  subjectId?: string
  search?: string
  page?: number
  limit?: number
  status?: string
}

export type TeacherEligibilityInput = { subjectId: string; classId: string }

export type TeacherWritePayload = {
  name: string
  email?: string | null
  phone?: string | null
  campusId: string
  targetPeriodsPerWeek: number
  maxPeriodsPerWeek: number
  eligibilities: TeacherEligibilityInput[]
  status?: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE'
  hiringStatus?: 'HIRED' | 'TO_BE_HIRED'
}

export type TeacherUpdatePayload = TeacherWritePayload & {
  // The teacher's updatedAt as the client last saw it (from when the Edit
  // drawer was opened) — lets the server detect a concurrent edit by someone
  // else and refuse to silently overwrite it. See updateTeacher on the backend.
  expectedUpdatedAt: string
}

export const teachersApi = {
  getTeachers(params?: TeacherFilters) {
    const searchParams = new URLSearchParams()
    if (params?.campusId) searchParams.set('campusId', params.campusId)
    if (params?.subjectId) searchParams.set('subjectId', params.subjectId)
    if (params?.search) searchParams.set('search', params.search)
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.status) searchParams.set('status', params.status)
    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return client.get<{ data: TeacherSummary[]; total: number; page: number; limit: number }>(
      `/teachers${suffix}`,
    )
  },
  getTeacher(id: string) {
    return client.get<{ data: TeacherDetail }>(`/teachers/${id}`)
  },
  getStats() {
    return client.get<TeacherStats>('/teachers/stats')
  },
  createTeacher(payload: TeacherWritePayload) {
    return client.post<{ data: TeacherDetail }>('/teachers', payload)
  },
  updateTeacher(id: string, payload: TeacherUpdatePayload) {
    return client.patch<{ data: TeacherDetail }>(`/teachers/${id}`, payload)
  },
  updateTeacherLock(id: string, isLocked: boolean) {
    return client.patch<{ data: { id: string; isLocked: boolean; updatedAt: string } }>(`/teachers/${id}/lock`, { isLocked })
  },
  // Granular Lock, teacher-day level (§24) — bulk convenience over the same
  // row-level lock single-period locking uses: freezes every one of this
  // teacher's existing periods on one specific day from a future
  // regenerate, across whichever classes they're in that day.
  updateTeacherDayLock(id: string, payload: { dayOfWeek: string; academicYear: string; isLocked: boolean }) {
    return client.patch<{
      data: { teacherId: string; teacherName: string; dayOfWeek: string; isLocked: boolean; affectedPeriods: number }
    }>(`/teachers/${id}/lock-day`, payload)
  },
  deleteTeacher(id: string) {
    return client.delete<{ data: { id: string; deleted?: boolean; status?: string } }>(`/teachers/${id}`)
  },
  getAccountStatus(id: string) {
    return client.get<TeacherAccountStatus>(`/teachers/${id}/account-status`)
  },
  getReallocationRisk(id: string) {
    return client.get<{ data: TeacherReallocationRisk }>(`/teachers/${id}/reallocation-risk`)
  },
  setPassword(id: string, password: string) {
    return client.post<{ success: boolean; message: string }>(`/teachers/${id}/set-password`, { password })
  },
}
