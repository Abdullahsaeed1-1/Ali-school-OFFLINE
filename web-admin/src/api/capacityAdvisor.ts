import client from './client'

export type SafeFillSuggestion = {
  classId: string
  className: string
  subjectId: string
  subjectName: string
  periodsPerWeek: number
}

export type ReassignmentSuggestion = SafeFillSuggestion & {
  fromTeacherId: string
  fromTeacherName: string
  fromTeacherCurrentPeriods: number
  fromTeacherTarget: number
  // Real, current count — not a projection — of how many of this exact
  // pair's periods the current holder is actually scheduled for right now.
  fromTeacherPairScheduled: number
}

export type UncoveredGap = {
  classId: string
  className: string
  subjectId: string
  subjectName: string
  periodsPerWeek: number
  tier: 'CORE_EARLY' | 'LIGHT_LATE' | 'UNSET'
}

export type BeyondSoftwareGuidance = {
  // Uncovered campus-wide gaps sharing a tier with a subject this teacher
  // already teaches — a real, existing classification, not a guess at
  // pedagogical fit. Purely informational, for a human staffing decision.
  relatedGapSubjects: UncoveredGap[]
  // The campus's largest uncovered gaps overall, regardless of this
  // teacher — broader context on what's most urgent school-wide.
  topCampusGaps: UncoveredGap[]
}

export type UnderOccupiedTeacher = {
  teacherId: string
  teacherName: string
  campusId: string
  campusName: string
  currentPeriods: number
  targetPeriodsPerWeek: number
  shortfall: number
  subjectNames: string[]
  safeFills: SafeFillSuggestion[]
  reassignments: ReassignmentSuggestion[]
  // True when neither list has anything — no existing subject match can
  // close this teacher's gap; needs a human staffing decision.
  beyondSoftware: boolean
  // Only present when beyondSoftware is true.
  beyondSoftwareGuidance: BeyondSoftwareGuidance | null
}

export type GapFixCandidate =
  | {
      kind: 'safeFill'
      teacherId: string
      teacherName: string
      teacherCurrentPeriods: number
      teacherTarget: number
    }
  | {
      kind: 'reassignment'
      toTeacherId: string
      toTeacherName: string
      toTeacherCurrentPeriods: number
      toTeacherTarget: number
      fromTeacherId: string
      fromTeacherName: string
      fromTeacherCurrentPeriods: number
      fromTeacherTarget: number
      fromTeacherPairScheduled: number
    }

// Every teacher currently eligible for this exact (class, subject) pair,
// with their real current/target — present regardless of whether they're a
// `candidates` entry, so a "beyond software" or "capacity exhausted" gap can
// show WHY, not just that no fix exists (Phase 3 item 7).
export type GapHolder = {
  teacherId: string
  teacherName: string
  currentPeriods: number
  targetPeriodsPerWeek: number
}

export type ClassSubjectGapFix = {
  classId: string
  className: string
  subjectId: string
  subjectName: string
  periodsPerWeek: number
  candidates: GapFixCandidate[]
  holders: GapHolder[]
}

export const capacityAdvisorApi = {
  getAdvisor(params?: { teacherId?: string }) {
    const suffix = params?.teacherId ? `?teacherId=${encodeURIComponent(params.teacherId)}` : ''
    return client.get<{ data: UnderOccupiedTeacher[] }>(`/capacity-advisor${suffix}`)
  },
  // The mirror image of getAdvisor — given one flagged (class, subject) gap,
  // which under-occupied teachers could fill it. Backs the inline
  // fix-suggestion on the Timetable page's shortfall flags.
  getClassSubjectGapFix(params: { classId: string; subjectId: string }) {
    return client.get<{ data: ClassSubjectGapFix }>(
      `/capacity-advisor/gap?classId=${encodeURIComponent(params.classId)}&subjectId=${encodeURIComponent(params.subjectId)}`,
    )
  },
  applySafeFill(payload: { teacherId: string; classId: string; subjectId: string }) {
    return client.post<{ data: { teacherId: string; classId: string; subjectId: string } }>(
      '/capacity-advisor/apply-safe-fill',
      payload,
    )
  },
  applyReassignment(payload: { toTeacherId: string; fromTeacherId: string; classId: string; subjectId: string }) {
    return client.post<{ data: { toTeacherId: string; fromTeacherId: string; classId: string; subjectId: string } }>(
      '/capacity-advisor/apply-reassignment',
      payload,
    )
  },
}
