import { useEffect, useState } from 'react'
import { useToast } from '../../components/ui/Toast'
import {
  capacityAdvisorApi,
  type ReassignmentSuggestion,
  type SafeFillSuggestion,
  type UnderOccupiedTeacher,
} from '../../api/capacityAdvisor'
import { getApiErrorMessage } from '../../utils/apiError'

export type FillSuggestion = (SafeFillSuggestion & { kind: 'safeFill' }) | (ReassignmentSuggestion & { kind: 'reassignment' })

/**
 * Capacity Advisor logic scoped to one teacher — the state and apply/
 * reassign handlers shared by every surface that offers this teacher's fill
 * suggestions: the compact widget in the Edit Teacher drawer, and the
 * hover hint on a teacher's own blank periods on the Teacher Timetable page.
 * Kept as a hook (not a component) so both surfaces share one fetch and one
 * set of handlers instead of duplicating the apply/error/toast logic.
 */
export function useTeacherFillSuggestions(teacherId: string, onApplied?: () => void) {
  const { pushToast } = useToast()
  const [teacher, setTeacher] = useState<UnderOccupiedTeacher | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [reassignTarget, setReassignTarget] = useState<ReassignmentSuggestion | null>(null)

  const load = () => {
    if (!teacherId) {
      setTeacher(null)
      setLoading(false)
      return
    }
    setLoading(true)
    capacityAdvisorApi
      .getAdvisor({ teacherId })
      .then((res) => setTeacher(res.data.data[0] ?? null))
      .catch(() => setTeacher(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId])

  const applySafeFill = async (s: SafeFillSuggestion) => {
    setApplying(true)
    try {
      await capacityAdvisorApi.applySafeFill({ teacherId, classId: s.classId, subjectId: s.subjectId })
      pushToast({
        kind: 'success',
        title: 'Eligibility added',
        description: `Added ${s.subjectName} in ${s.className}. Takes effect next time the timetable is generated.`,
      })
      load()
      onApplied?.()
    } catch (err) {
      pushToast({ kind: 'error', title: 'Could not add this pair', description: getApiErrorMessage(err, 'Please try again.') })
    } finally {
      setApplying(false)
    }
  }

  const confirmReassignment = async () => {
    if (!reassignTarget) return
    setApplying(true)
    try {
      await capacityAdvisorApi.applyReassignment({
        toTeacherId: teacherId,
        fromTeacherId: reassignTarget.fromTeacherId,
        classId: reassignTarget.classId,
        subjectId: reassignTarget.subjectId,
      })
      pushToast({
        kind: 'success',
        title: 'Reassigned',
        description: `${reassignTarget.subjectName} in ${reassignTarget.className} moved from ${reassignTarget.fromTeacherName}.`,
      })
      setReassignTarget(null)
      load()
      onApplied?.()
    } catch (err) {
      pushToast({ kind: 'error', title: 'Could not reassign this pair', description: getApiErrorMessage(err, 'Please try again.') })
    } finally {
      setApplying(false)
    }
  }

  return { teacher, loading, applying, reassignTarget, setReassignTarget, applySafeFill, confirmReassignment }
}
