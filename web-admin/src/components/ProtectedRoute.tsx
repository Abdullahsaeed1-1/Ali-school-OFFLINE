import { Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

/**
 * Wraps protected routes. Behaviour:
 * - While the session check is in flight (isLoading): show a full-screen
 *   loading state — never flash the login page prematurely.
 * - Not authenticated: redirect to /login.
 * - Authenticated: render the child route via <Outlet />.
 */
export default function ProtectedRoute() {
  const { isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary text-text-primary">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" />
          <p className="text-xs uppercase tracking-[0.3em] text-text-muted">Verifying session</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
