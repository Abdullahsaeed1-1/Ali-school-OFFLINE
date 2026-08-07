import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getInitials } from '../../utils/initials'

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/teachers': 'Teachers',
  '/dashboard/classes': 'Classes',
  '/dashboard/timetable': 'Timetable',
  '/dashboard/settings': 'Settings',
}

export function TopBar() {
  const location = useLocation()
  const { user } = useAuth()
  const title = titles[location.pathname] ?? 'Dashboard'

  return (
    <header className="fixed left-[260px] top-0 right-0 z-20 flex h-[60px] items-center justify-between border-b border-[rgba(20,55,130,0.08)] bg-[rgba(240,244,248,0.9)] px-6 backdrop-blur-md">
      <h1 className="font-display text-xl text-text-primary">{title}</h1>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-brand-navy px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-white">
          {user?.role ?? 'ADMIN'}
        </span>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
          {getInitials(user?.email?.split('@')[0])}
        </div>
      </div>
    </header>
  )
}
