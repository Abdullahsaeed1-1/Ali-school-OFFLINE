import client from './client'

export type ToBeHiredTeacherWarning = {
  id: string
  name: string
  campusName: string
  dependents: Array<{ subjectName: string; className: string }>
}

export type NoEligibleTeacherWarning = {
  classId: string
  className: string
  campusName: string
  subjectId: string
  subjectName: string
  periodsPerWeek: number
}

export type EmptyClassWarning = {
  classId: string
  className: string
  campusName: string
  isActive: boolean
  reason: string
}

// Games duty (§17) — read from the currently generated timetable, not a
// live re-solve. unstaffed = periods that couldn't be placed at all;
// understaffed = periods placed with only 1 of the 2 required duty teachers.
export type GamesDutyWarning = {
  classId: string
  className: string
  campusName: string
  required: number
  scheduled: number
  unstaffed: number
  understaffed: number
}

export type WarningsData = {
  toBeHiredTeachers: ToBeHiredTeacherWarning[]
  noEligibleTeacher: NoEligibleTeacherWarning[]
  gamesDuty: GamesDutyWarning[]
  emptyClasses: EmptyClassWarning[]
}

export const warningsApi = {
  getWarnings() {
    return client.get<{ data: WarningsData }>('/warnings')
  },
}
