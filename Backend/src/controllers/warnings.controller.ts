import type { Request, Response } from 'express'
import { HiringStatus } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/apiError.js'

// Backs the "To Be Hired / data-completeness warnings" dashboard (§13
// point 3) — the single most useful page for the school to act on hiring
// decisions and seeding gaps, in plain language rather than raw counts.
export const getWarnings = async (_req: Request, res: Response) => {
  try {
    const gamesSubject = await prisma.subject.findFirst({ where: { name: 'Games' } })

    const [toBeHiredTeachers, classSubjects, eligibilityPairs, classes] = await Promise.all([
      prisma.teacher.findMany({
        where: { hiringStatus: HiringStatus.TO_BE_HIRED },
        select: {
          id: true,
          name: true,
          campus: { select: { name: true } },
          teacherSubjects: {
            select: {
              subject: { select: { name: true } },
              class: { select: { name: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.classSubject.findMany({
        where: { periodsPerWeek: { gt: 0 } },
        select: {
          periodsPerWeek: true,
          class: { select: { id: true, name: true, campus: { select: { name: true } } } },
          subject: { select: { id: true, name: true } },
        },
      }),
      prisma.teacherSubject.findMany({ select: { classId: true, subjectId: true } }),
      prisma.class.findMany({
        select: {
          id: true,
          name: true,
          isActive: true,
          campus: { select: { name: true } },
          _count: { select: { classSubjects: true } },
        },
        orderBy: [{ campus: { name: 'asc' } }, { name: 'asc' }],
      }),
    ])

    const eligibleSet = new Set(eligibilityPairs.map((pair) => `${pair.classId}:${pair.subjectId}`))
    const noEligibleTeacher = classSubjects
      // Games (§17) is deliberately excluded here — it never has a fixed
      // TeacherSubject eligibility row by design (existing teachers rotate
      // duty instead), so this generic check would always flag it as if
      // nobody covers it at all. Its real, precise status has its own
      // section below instead.
      .filter((cs) => cs.subject.id !== gamesSubject?.id)
      .filter((cs) => !eligibleSet.has(`${cs.class.id}:${cs.subject.id}`))
      .map((cs) => ({
        classId: cs.class.id,
        className: cs.class.name,
        campusName: cs.class.campus.name,
        subjectId: cs.subject.id,
        subjectName: cs.subject.name,
        periodsPerWeek: cs.periodsPerWeek,
      }))

    // Games duty (§17) — read directly from the current generated
    // timetable (TimetableEntry), not a live re-solve, so this always
    // matches exactly what's actually scheduled right now. A class with
    // no timetable generated yet simply shows 0 scheduled.
    const gamesDuty: Array<{
      classId: string
      className: string
      campusName: string
      required: number
      scheduled: number
      unstaffed: number
      understaffed: number
    }> = []
    if (gamesSubject) {
      // Only classes where Games has NO real eligibility use the rotation-
      // duty system (Girls/Boys) — Junior's homeroom teachers are already
      // eligible for Games directly, same as any other subject, so a
      // single teacher there is correct staffing, not "1 of 2 needed".
      // Excluding those classes here (rather than just skipping the
      // understaffed count) avoids reporting Junior's real, separate issue
      // (item 9 — the 30/35 target question) as if it were a duty-capacity
      // problem, which it isn't.
      const gamesQuotas = classSubjects.filter(
        (cs) => cs.subject.id === gamesSubject.id && !eligibleSet.has(`${cs.class.id}:${gamesSubject.id}`),
      )
      for (const quota of gamesQuotas) {
        const [scheduled, understaffed] = await Promise.all([
          prisma.timetableEntry.count({
            where: { classId: quota.class.id, subjectId: gamesSubject.id, isActive: true },
          }),
          prisma.timetableEntry.count({
            where: {
              classId: quota.class.id,
              subjectId: gamesSubject.id,
              isActive: true,
              teacherId: { not: null },
              secondTeacherId: null,
            },
          }),
        ])
        const unstaffed = Math.max(0, quota.periodsPerWeek - scheduled)
        if (unstaffed > 0 || understaffed > 0) {
          gamesDuty.push({
            classId: quota.class.id,
            className: quota.class.name,
            campusName: quota.class.campus.name,
            required: quota.periodsPerWeek,
            scheduled,
            unstaffed,
            understaffed,
          })
        }
      }
    }

    const emptyClasses = classes
      .filter((cls) => cls._count.classSubjects === 0)
      .map((cls) => ({
        classId: cls.id,
        className: cls.name,
        campusName: cls.campus.name,
        isActive: cls.isActive,
        reason: cls.isActive
          ? 'No quota data seeded yet for this class.'
          : 'Section is marked inactive — inactive sections are not expected to have quotas.',
      }))

    return res.status(200).json({
      data: {
        toBeHiredTeachers: toBeHiredTeachers.map((teacher) => ({
          id: teacher.id,
          name: teacher.name,
          campusName: teacher.campus.name,
          dependents: teacher.teacherSubjects.map((ts) => ({
            subjectName: ts.subject.name,
            className: ts.class.name,
          })),
        })),
        noEligibleTeacher,
        gamesDuty,
        emptyClasses,
      },
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}
