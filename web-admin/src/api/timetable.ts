import client from './client'

export type TimetablePeriod = {
  id: string
  periodNumber: number
  name: string
  startTime: string
  endTime: string
  classGroup: string
  isBreak: boolean
}

export type TimetableEntry = {
  id: string
  academicYear: string
  dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
  campusId: string
  campusName: string
  classId: string
  className: string
  teacherId: string | null
  teacherName: string | null
  // Games rotation-duty only (§17) — the second of the 2 teachers on duty
  // that period. Null for every other subject.
  secondTeacherId: string | null
  secondTeacherName: string | null
  subjectId: string | null
  subjectName: string | null
  isSubstitute: boolean
  isActive: boolean
  // Granular Lock (§24) — this one row survives a future regenerate
  // untouched, even though its class isn't itself Locked.
  isLocked: boolean
  period: TimetablePeriod
}

export const timetableApi = {
  getTimetable(params: { campusId?: string; classId?: string; academicYear?: string; teacherId?: string }) {
    const searchParams = new URLSearchParams()
    if (params.campusId) searchParams.set('campusId', params.campusId)
    if (params.classId) searchParams.set('classId', params.classId)
    if (params.academicYear) searchParams.set('academicYear', params.academicYear)
    if (params.teacherId) searchParams.set('teacherId', params.teacherId)
    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return client.get<{ data: TimetableEntry[] }>(`/timetable${suffix}`)
  },
  getTeacherTimetable(teacherId: string, academicYear?: string) {
    const suffix = academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : ''
    return client.get<{ data: TimetableEntry[] }>(`/timetable/teacher/${teacherId}${suffix}`)
  },
  getTimetableStatus(params: { campusId?: string; academicYear?: string }) {
    const searchParams = new URLSearchParams()
    if (params.campusId) searchParams.set('campusId', params.campusId)
    if (params.academicYear) searchParams.set('academicYear', params.academicYear)
    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return client.get<{ generated: boolean; totalEntries: number }>(`/timetable/status${suffix}`)
  },
  generateTimetable(payload: { campusId?: string; academicYear: string }) {
    return client.post<GenerateTimetableResponse>('/timetable/generate', payload)
  },
  // Manual single-slot override (§13 stability finding) — edit exactly one
  // (class, day, period) without a full regenerate. The backend enforces a
  // hard block (teacher already busy elsewhere at this exact time) and a
  // soft eligibility warning (confirmEligibilityOverride re-submits past
  // it) — never applied silently either way.
  putSlot(payload: {
    classId: string
    dayOfWeek: string
    periodId: string
    subjectId: string
    teacherId: string
    academicYear?: string
    confirmEligibilityOverride?: boolean
  }) {
    return client.put<{ data: { id: string; dayOfWeek: string; periodId: string; teacherName: string | null; subjectName: string | null } }>(
      '/timetable/slot',
      payload,
    )
  },
  clearSlot(params: { classId: string; dayOfWeek: string; periodId: string; academicYear?: string }) {
    const searchParams = new URLSearchParams()
    searchParams.set('classId', params.classId)
    searchParams.set('dayOfWeek', params.dayOfWeek)
    searchParams.set('periodId', params.periodId)
    if (params.academicYear) searchParams.set('academicYear', params.academicYear)
    return client.delete<{ data: { classId: string; dayOfWeek: string; periodId: string } }>(`/timetable/slot?${searchParams.toString()}`)
  },
  // Granular Lock, single-period level (§24) — freezes/unfreezes exactly one
  // already-filled period from a future regenerate; the rest of its class
  // stays fully open.
  lockSlot(payload: { classId: string; dayOfWeek: string; periodId: string; academicYear?: string; isLocked: boolean }) {
    return client.patch<{
      data: { id: string; dayOfWeek: string; periodId: string; isLocked: boolean; teacherName: string | null; subjectName: string | null }
    }>('/timetable/slot/lock', payload)
  },
}

export type ClassSubjectShortfall = {
  classId: string
  className: string
  subjectId: string
  subjectName: string
  required: number
  scheduled: number
  shortfall: number
}

export type TeacherShortfall = {
  teacherId: string
  teacherName: string
  target: number
  scheduled: number
  shortfall: number
}

// Games rotation-duty (§17) — a slot where a Games period was placed but
// fewer than 2 free teachers could be found to staff it. Distinct from
// ClassSubjectShortfall, which is for periods that couldn't be placed at all.
export type GamesDutyGap = {
  classId: string
  className: string
  day: string
  periodNumber: number
  teachersFound: number
  teachersNeeded: number
}

// One CP-SAT run's own self-report, per campus — was never surfaced in the
// UI before (2026-07-31 investigation into wildly inconsistent Girls
// results): the backend always computed and returned this, but no frontend
// type declared it, so it silently went unread. `solverStatus` is the one
// that matters most operationally: 'OPTIMAL' means the search proved no
// better assignment exists; 'FEASIBLE' means the 45s time limit was hit
// first — a real, valid, conflict-free schedule, but not provably the best
// one, and (per the same investigation) can vary noticeably run to run.
export type SolverDiagnostics = {
  variableCount: number
  solveTimeMs: number
  solverStatus: string
  tierWindowViolations: number
}

export type GenerateTimetableStats = {
  totalEntries: number
  unassignedEntries: number
  assignedEntries: number
  classesCovered: number
  classesSkipped: number
  classesLocked: number
  byCampus: Record<string, { totalEntries: number; unassignedEntries: number; byClass: Record<string, number> }>
  classSubjectShortfalls: ClassSubjectShortfall[]
  teacherShortfalls: TeacherShortfall[]
  gamesDutyGaps: GamesDutyGap[]
  solverDiagnostics: Record<string, SolverDiagnostics>
}

// Item 30 D.2 — campuses whose Generate lost a race against another
// near-simultaneous Generate for the same campus. Nothing from a
// conflicted campus is counted in `stats` above — this is the caller's
// only signal that this campus's result was NOT actually persisted, so it
// must always be checked and surfaced, never silently ignored just because
// `success` is true (this call can partially succeed: other campuses in
// the same request are unaffected).
export type GenerateConflict = { campusId: string; campusName: string }

export type GenerateTimetableResponse = {
  success: boolean
  stats: GenerateTimetableStats
  conflicts: GenerateConflict[]
  durationMs: number
}