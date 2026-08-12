import client from './client'

export const backupApi = {
  async download() {
    const response = await client.get<Blob>('/backup', { responseType: 'blob' })
    return response.data
  },
}
