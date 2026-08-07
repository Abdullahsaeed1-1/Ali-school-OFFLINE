import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, type UserPayload } from '../api/auth'

type AuthContextValue = {
  user: UserPayload | null
  isLoading: boolean
  isAuthenticated: boolean
  logout: () => Promise<void>
  setUser: (user: UserPayload | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await authApi.getMe()
        setUser(response.data.user)
        return
      } catch {
        try {
          await authApi.refresh()
          const response = await authApi.getMe()
          setUser(response.data.user)
          return
        } catch {
          setUser(null)
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadSession()
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Best-effort logout.
    }
    setUser(null)
    navigate('/login', { replace: true })
  }, [navigate])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
