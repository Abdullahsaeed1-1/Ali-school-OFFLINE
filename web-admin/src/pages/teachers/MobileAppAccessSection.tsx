import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Button from '../../components/ui/Button'
import { ErrorBanner } from '../../components/ui/ErrorBanner'
import { teachersApi, type TeacherAccountStatus } from '../../api/teachers'
import { getApiErrorMessage } from '../../utils/apiError'

const REQUIREMENTS: Array<{ label: string; test: (password: string) => boolean }> = [
  { label: 'At least 8 characters', test: (password) => password.length >= 8 },
  { label: 'One uppercase letter', test: (password) => /[A-Z]/.test(password) },
  { label: 'One number', test: (password) => /[0-9]/.test(password) },
  { label: 'One special character (!@#$%^&*)', test: (password) => /[!@#$%^&*]/.test(password) },
]

const passwordInputClass =
  'w-full rounded-lg border border-[rgba(20,55,130,0.15)] bg-white px-3 py-2 pr-10 text-sm text-text-primary outline-none focus:border-brand-navy focus:ring-1 focus:ring-brand-navy/20'

export function MobileAppAccessSection({ teacherId, formEmail }: { teacherId: string; formEmail: string }) {
  const [status, setStatus] = useState<TeacherAccountStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadStatus = () => {
    let cancelled = false
    setStatusLoading(true)
    setStatusError(null)
    teachersApi
      .getAccountStatus(teacherId)
      .then((response) => {
        if (!cancelled) setStatus(response.data)
      })
      .catch((err) => {
        if (!cancelled) setStatusError(getApiErrorMessage(err, 'Could not load mobile access status.'))
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false)
      })
    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    return loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId])

  // Gate on the email currently typed in the form above, not just the
  // last-saved value from the account-status fetch — otherwise this
  // section stays stuck on "add an email first" while the admin is mid-edit
  // typing one in, and only catches up after the next full page reload.
  const typedEmail = formEmail.trim()
  const hasTypedEmail = typedEmail.length > 0
  const savedEmail = status?.email ?? null
  const emailIsSaved = hasTypedEmail && savedEmail !== null && savedEmail.toLowerCase() === typedEmail.toLowerCase()
  const hasAccount = status?.hasAccount ?? false

  const closeForm = () => {
    setShowForm(false)
    setPassword('')
    setConfirmPassword('')
    setError(null)
  }

  const submit = async () => {
    setError(null)
    setSuccess(null)

    if (!REQUIREMENTS.every((requirement) => requirement.test(password))) {
      setError('Password does not meet the requirements.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await teachersApi.setPassword(teacherId, password)
      const refreshed = await teachersApi.getAccountStatus(teacherId)
      setStatus(refreshed.data)
      setSuccess('Done — this teacher can now log in to the mobile app.')
      setPassword('')
      setConfirmPassword('')
      setShowForm(false)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Password does not meet the requirements.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 border-t border-[rgba(20,55,130,0.08)] pt-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Mobile App Access</p>

      {statusLoading ? (
        <p className="text-sm text-text-muted">Checking account status…</p>
      ) : statusError ? (
        <ErrorBanner message={statusError} onRetry={loadStatus} />
      ) : (
        <div className="space-y-3">
          {!hasTypedEmail ? (
            <div className="rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3">
              <p className="text-sm text-text-muted">Add an email address first, then you can set up mobile access.</p>
            </div>
          ) : !emailIsSaved ? (
            <div className="rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3">
              <p className="text-sm text-text-muted">Save your changes to add this email, then you can set up mobile access.</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3">
              <span className={`h-2.5 w-2.5 rounded-full ${hasAccount ? 'bg-[#16A34A]' : 'bg-brand-maroon'}`} />
              <p className="text-sm text-text-primary">
                {hasAccount
                  ? 'This teacher can log in to the mobile app.'
                  : 'This teacher cannot log in to the mobile app yet.'}
              </p>
            </div>
          )}

          {!showForm ? (
            <Button
              variant={hasAccount ? 'ghost' : 'primary'}
              size="sm"
              disabled={!emailIsSaved}
              onClick={() => {
                setShowForm(true)
                setSuccess(null)
              }}
            >
              {hasAccount ? 'Change Password' : 'Set Up Mobile Access'}
            </Button>
          ) : (
            <div className="space-y-3 rounded-xl border border-[rgba(20,55,130,0.08)] bg-[#F8FAFC] p-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-text-muted">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={passwordInputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition hover:text-text-primary"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-text-muted">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className={passwordInputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition hover:text-text-primary"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <ul className="space-y-1">
                {REQUIREMENTS.map((requirement) => {
                  const met = requirement.test(password)
                  return (
                    <li key={requirement.label} className={`text-xs ${met ? 'text-[#16A34A]' : 'text-brand-maroon'}`}>
                      {met ? '✓' : '✗'} {requirement.label}
                    </li>
                  )
                })}
              </ul>

              {error ? <ErrorBanner message={error} /> : null}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={closeForm} disabled={submitting}>
                  Cancel
                </Button>
                <Button size="sm" loading={submitting} disabled={!password || !confirmPassword} onClick={submit}>
                  Set Password
                </Button>
              </div>
            </div>
          )}

          {success ? (
            <p className="rounded-xl border border-[#16A34A]/20 bg-[#16A34A]/10 px-3 py-2 text-sm text-[#16A34A]">
              {success}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
