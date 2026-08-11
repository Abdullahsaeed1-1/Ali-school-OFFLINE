// Prisma no longer generates these as native enums — SQLite has no enum
// column type, so schema.prisma models them as plain String columns and
// validation moves here, to the application layer. Shaped exactly like
// Prisma's generated enum objects (const object + derived union type) so
// call sites (e.g. `Role.ADMIN`, `TeacherStatus.ACTIVE`) are unchanged from
// before the SQLite conversion — only the import path moved.

export const CampusType = {
  JUNIOR: 'JUNIOR',
  GIRLS: 'GIRLS',
  BOYS: 'BOYS',
} as const
export type CampusType = (typeof CampusType)[keyof typeof CampusType]

export const Role = {
  ADMIN: 'ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
} as const
export type Role = (typeof Role)[keyof typeof Role]

// CORE_EARLY: Periods 1-4 (Group B classes) or 1-3 (Group A — Period 4 is
// reserved for Games instead). LIGHT_LATE: Periods 5-7. UNSET: subject's
// tier was never confirmed by the school (§8) — the generator leaves its
// placement unrestricted and flags it, rather than guessing a tier.
export const SubjectTier = {
  CORE_EARLY: 'CORE_EARLY',
  LIGHT_LATE: 'LIGHT_LATE',
  UNSET: 'UNSET',
} as const
export type SubjectTier = (typeof SubjectTier)[keyof typeof SubjectTier]

export const HiringStatus = {
  HIRED: 'HIRED',
  TO_BE_HIRED: 'TO_BE_HIRED',
} as const
export type HiringStatus = (typeof HiringStatus)[keyof typeof HiringStatus]

export const TeacherStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ON_LEAVE: 'ON_LEAVE',
} as const
export type TeacherStatus = (typeof TeacherStatus)[keyof typeof TeacherStatus]

export const DayOfWeek = {
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY',
  SATURDAY: 'SATURDAY',
  SUNDAY: 'SUNDAY',
} as const
export type DayOfWeek = (typeof DayOfWeek)[keyof typeof DayOfWeek]

export const LoadStatus = {
  FINE: 'FINE',
  SLACK: 'SLACK',
  ERROR: 'ERROR',
} as const
export type LoadStatus = (typeof LoadStatus)[keyof typeof LoadStatus]
