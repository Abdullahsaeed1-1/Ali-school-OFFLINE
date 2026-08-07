"""
Request/response contract between the Node backend and this solver service.
Keep in sync with Backend/src/services/timetableGenerator.ts, which is the
only caller.
"""
from typing import Literal
from pydantic import BaseModel

SubjectTier = Literal["CORE_EARLY", "LIGHT_LATE", "UNSET"]


class Slot(BaseModel):
    # slotId is a synthetic per-(day,period) identifier — a single Period
    # row is reused across all 4 Mon-Thu days (only day-TYPE varies on the
    # Period row, not the specific day), so periodId alone isn't unique.
    slotId: str
    day: str  # MONDAY..FRIDAY
    periodId: str  # written back as TimetableEntry.periodId
    lectureIndex: int  # 1-7, break already excluded


class SubjectRequirement(BaseModel):
    subjectId: str
    subjectName: str
    tier: SubjectTier
    periodsPerWeek: int


class ClassInput(BaseModel):
    id: str
    name: str
    # Which lecture indices (1-7) Games is reserved in for this class, if
    # any — explicit per-class data (Class.gamesProtectedLectures), not
    # inferred from gradeLevel. Empty list means "confirmed, no protection
    # needed". Only ever enforced as a hard wall here when Games itself
    # appears in requirements below (Junior) — for campuses where Games is
    # handled by the separate duty scheduler instead (Girls/Boys), Games is
    # never sent as a requirement at all, so this list only narrows other
    # subjects' CORE_EARLY soft window (see _preferred_lecture_indices).
    gamesProtectedLectures: list[int] = []
    requirements: list[SubjectRequirement]


class Eligibility(BaseModel):
    classId: str
    subjectId: str


class LockedSlot(BaseModel):
    # §24 (Granular Lock) — a single already-decided (class, slot) from a
    # row-level locked TimetableEntry, inside a class that isn't itself
    # Locked. teacherIds covers a Games-duty pair too, if any — every one of
    # them must be excluded from every OTHER class's candidate variables at
    # this exact slot, or the solver could double-book someone whose time
    # here is already spoken for by a row it will never touch.
    classId: str
    slotId: str
    subjectId: str
    teacherIds: list[str]


class TeacherInput(BaseModel):
    id: str
    name: str
    targetPeriodsPerWeek: int
    eligibility: list[Eligibility]


class SolveRequest(BaseModel):
    academicYear: str
    campusId: str
    slots: list[Slot]
    classes: list[ClassInput]
    teachers: list[TeacherInput]
    lockedSlots: list[LockedSlot] = []


class Assignment(BaseModel):
    classId: str
    day: str
    periodId: str
    teacherId: str
    subjectId: str


class ClassSubjectShortfall(BaseModel):
    classId: str
    className: str
    subjectId: str
    subjectName: str
    required: int
    scheduled: int
    shortfall: int


class TeacherShortfall(BaseModel):
    teacherId: str
    teacherName: str
    target: int
    scheduled: int
    shortfall: int


class SolveStats(BaseModel):
    variableCount: int
    solveTimeMs: int
    solverStatus: str
    tierWindowViolations: int


class SolveResponse(BaseModel):
    solved: bool
    assignments: list[Assignment]
    classSubjectShortfalls: list[ClassSubjectShortfall]
    teacherShortfalls: list[TeacherShortfall]
    stats: SolveStats


# ---- Games duty assignment (§17 Phase 2) ----
# A separate, much smaller problem from the main solve above: which
# teacher(s) supervise which already-decided (day, period) duty slot.
# Keep in sync with Backend/src/services/gamesDutyScheduler.ts, the only
# caller — Phase 1 (deciding which slots need duty at all) stays in that
# file; only the teacher-to-slot assignment itself is solved here, so a
# real optimum (not a greedy first-fit) is used instead.


class DutyGroup(BaseModel):
    day: str
    periodId: str
    teachersNeeded: int  # 1 if exactly one class is on the ground that period, 2 if 2+ share it


class DutyTeacher(BaseModel):
    id: str
    name: str
    # Periods still available before hitting their weekly target — already
    # net of real academic load, computed by the caller. A teacher's target
    # is a hard ceiling (2026-07-27 fix), never just a floor, so this can be 0.
    capacity: int
    # "day:periodId" strings where this teacher is academically busy —
    # a hard block, they physically can't also be on duty then.
    busySlots: list[str]


class DutySolveRequest(BaseModel):
    groups: list[DutyGroup]
    teachers: list[DutyTeacher]


class DutyAssignment(BaseModel):
    day: str
    periodId: str
    teacherIds: list[str]  # 0, 1, or 2 entries


class DutySolveResponse(BaseModel):
    solved: bool
    assignments: list[DutyAssignment]
    totalNeeded: int
    totalCovered: int
