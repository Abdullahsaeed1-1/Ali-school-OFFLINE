import { useState } from 'react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { ErrorBanner } from '../../components/ui/ErrorBanner'
import { useAuth } from '../../context/AuthContext'
import { authApi } from '../../api/auth'
import { backupApi } from '../../api/backup'
import { getApiErrorMessage } from '../../utils/apiError'
import { getInitials } from '../../utils/initials'
import { useToast } from '../../components/ui/Toast'

const inputClass =
  'rounded-lg border border-[rgba(20,55,130,0.15)] bg-white px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-navy focus:ring-1 focus:ring-brand-navy/20'

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const { pushToast } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backupLoading, setBackupLoading] = useState(false)

  const submit = async () => {
    setError(null)

    // Client-side check first so a simple mismatch doesn't need a round trip
    // to the server, and shows up right next to the fields, not as a toast.
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setLoading(true)
    try {
      await authApi.changePassword({ currentPassword, newPassword, confirmPassword })
      pushToast({ kind: 'success', title: 'Password updated', description: 'Use the new password next time you sign in.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      // Shown inline (not just a toast) since this is almost always a
      // validation error (wrong current password, weak new password, etc.)
      // that the admin needs to see while looking at the form.
      setError(getApiErrorMessage(err, 'Could not update password. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const downloadBackup = async () => {
    setBackupLoading(true)
    try {
      const blob = await backupApi.download()
      // No filesystem/download API on the server side to write to — the
      // browser's own download flow (Blob URL + a throwaway <a> click) is
      // the standard way to hand a fetched file to the user from the page.
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `ali-school-backup-${new Date().toISOString().slice(0, 10)}.db`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      pushToast({ kind: 'success', title: 'Backup downloaded', description: 'Saved to your Downloads folder.' })
    } catch (err) {
      pushToast({ kind: 'error', title: 'Backup failed', description: getApiErrorMessage(err, 'Could not download a backup. Please try again.') })
    } finally {
      setBackupLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-2xl text-text-primary">Settings</h2>
        <p className="mt-1 text-sm text-text-muted">Profile and password controls for the current admin session.</p>
      </div>

      <Card className="space-y-5 p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-full bg-brand-navy text-lg font-semibold text-white"
            style={{ height: 52, width: 52 }}
          >
            {getInitials(user?.email?.split('@')[0])}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Profile</p>
            <p className="mt-1 text-sm text-text-primary">{user?.email ?? 'Unknown account'}</p>
          </div>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        <div className="grid gap-3">
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" className={inputClass} />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className={inputClass} />
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className={inputClass} />
        </div>

        <div className="flex gap-3">
          <Button onClick={submit} loading={loading} disabled={!currentPassword || !newPassword || !confirmPassword}>Update Password</Button>
          <Button variant="ghost" onClick={logout} disabled={loading}>Logout</Button>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Data backup</p>
          <p className="mt-1 text-sm text-text-primary">Download a complete, up-to-date copy of the school's data.</p>
          <p className="mt-1 text-xs text-text-muted">
            This app runs offline with no automatic cloud backup — save this file somewhere safe
            periodically. It's also what to send if a future app update needs testing against your
            real data.
          </p>
        </div>
        <Button variant="ghost" onClick={downloadBackup} loading={backupLoading}>Download Backup</Button>
      </Card>
    </div>
  )
}
