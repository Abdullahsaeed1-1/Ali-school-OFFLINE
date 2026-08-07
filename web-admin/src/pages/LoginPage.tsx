import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import { ErrorBanner } from '../components/ui/ErrorBanner'
import { getApiErrorMessage } from '../utils/apiError'
import logo from '../../logo/logo.jpeg'

// The Login screen is the one deliberate exception to "WebAdmin never uses
// the building photo" — everywhere else in the admin app stays clean/light,
// but the sign-in screen gets the same glassmorphism-over-the-school-photo
// treatment as the Flutter app's login, per explicit request.
export default function LoginPage() {
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await authApi.login({ email, password })
      setUser(response.data.user)
      navigate('/dashboard', { replace: true })
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, 'Unable to sign in. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="absolute inset-0">
        <img src="/school-building.jpeg" alt="" aria-hidden className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0F28]/50 via-[#0A0F28]/75 to-[#0A0F28]/95" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white/80"
            style={{ boxShadow: '0 0 32px rgba(180,220,120,0.25)' }}
          >
            <img src={logo} alt="Ali Public School logo" className="h-full w-full object-cover" />
          </div>
          <p className="text-xs uppercase tracking-[0.24em] text-white/70">Ali Public School</p>
          <h1 className="mt-2 font-display text-3xl text-white">WebAdmin</h1>
        </div>

        <div className="rounded-2xl border border-white/20 bg-white/10 p-6 shadow-luxe backdrop-blur-xl">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/60">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-brand-green focus:ring-1 focus:ring-brand-green/40"
                placeholder="admin@alipublicschool.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/60">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 pr-10 text-sm text-white outline-none placeholder:text-white/40 focus:border-brand-green focus:ring-1 focus:ring-brand-green/40"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 transition hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? <ErrorBanner message={error} /> : null}

            <Button
              variant="primary"
              size="md"
              loading={loading}
              className="w-full border-brand-green/40"
              type="submit"
              disabled={!email || !password}
            >
              Sign in
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
