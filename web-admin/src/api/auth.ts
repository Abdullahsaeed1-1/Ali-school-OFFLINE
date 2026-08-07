import client from './client'

export type UserPayload = {
  id: string
  email: string
  role: string
}

export const authApi = {
  login(payload: { email: string; password: string }) {
    return client.post<{ user: UserPayload }>('/auth/login', payload)
  },
  getMe() {
    return client.get<{ user: UserPayload }>('/auth/me')
  },
  logout() {
    return client.post<{ ok: boolean }>('/auth/logout')
  },
  refresh() {
    return client.post<{ ok: boolean }>('/auth/refresh')
  },
  changePassword(payload: { currentPassword: string; newPassword: string; confirmPassword: string }) {
    return client.patch<{ ok: boolean }>('/auth/password', payload)
  },
}