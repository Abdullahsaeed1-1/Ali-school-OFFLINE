import type { Request, Response } from 'express'
import { CampusType } from '../constants/enums.js'
import { prisma } from '../config/prisma.js'
import { campusTypeLabel } from '../utils/school.js'
import { handleControllerError } from '../utils/apiError.js'

export const listCampuses = async (_req: Request, res: Response) => {
  try {
    const campuses = await prisma.campus.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        _count: {
          select: {
            classes: true,
            teachers: true,
          },
        },
      },
    })

    return res.status(200).json({
      data: campuses.map((campus) => ({
        id: campus.id,
        name: campus.name,
        type: campus.type,
        label: campusTypeLabel(campus.type as CampusType),
        classCount: campus._count.classes,
        teacherCount: campus._count.teachers,
      })),
    })
  } catch (error) {
    return handleControllerError(error, res)
  }
}

export const listCampusPeriods = async (req: Request<{ id: string }, object, object, { classGroup?: string }>, res: Response) => {
  try {
    const classGroup = typeof req.query.classGroup === 'string' ? req.query.classGroup : undefined

    const periods = await prisma.period.findMany({
      where: {
        campusId: req.params.id,
        ...(classGroup ? { classGroup } : {}),
      },
      select: {
        id: true,
        periodNumber: true,
        name: true,
        startTime: true,
        endTime: true,
        duration: true,
        isBreak: true,
        isGames: true,
        classGroup: true,
      },
      orderBy: [{ classGroup: 'asc' }, { periodNumber: 'asc' }],
    })

    return res.status(200).json({ data: periods })
  } catch (error) {
    return handleControllerError(error, res)
  }
}
