import client from './client'

export type Campus = {
  id: string
  name: string
  type: 'JUNIOR' | 'GIRLS' | 'BOYS'
  label: string
  classCount: number
  teacherCount: number
}

export type Period = {
  id: string
  periodNumber: number
  name: string
  startTime: string
  endTime: string
  duration: number
  isBreak: boolean
  isGames: boolean
  classGroup: string
}

export const campusesApi = {
  getCampuses() {
    return client.get<{ data: Campus[] }>('/campuses')
  },
  getCampusPeriods(campusId: string, classGroup?: string) {
    const params = new URLSearchParams()
    if (classGroup) params.set('classGroup', classGroup)
    return client.get<{ data: Period[] }>(`/campuses/${campusId}/periods${params.toString() ? `?${params.toString()}` : ''}`)
  },
}