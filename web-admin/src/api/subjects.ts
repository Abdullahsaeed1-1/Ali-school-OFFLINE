import client from './client'

export type SubjectTier = 'CORE_EARLY' | 'LIGHT_LATE' | 'UNSET'

export type Subject = {
  id: string
  name: string
  code: string | null
  isCore: boolean
  tier: SubjectTier
}

export type SubjectWritePayload = {
  // Required for createSubject (enforced server-side); updateSubject does a
  // true partial merge and never needs it re-sent for e.g. a tier-only
  // change (Phase 3 item 8's bulk tier assignment), so it's optional here.
  name?: string
  code?: string | null
  isCore?: boolean
  tier?: SubjectTier
}

export const subjectsApi = {
  getSubjects() {
    return client.get<{ data: Subject[] }>('/subjects')
  },
  createSubject(payload: SubjectWritePayload) {
    return client.post<{ data: Subject }>('/subjects', payload)
  },
  updateSubject(id: string, payload: SubjectWritePayload) {
    return client.patch<{ data: Subject }>(`/subjects/${id}`, payload)
  },
}
