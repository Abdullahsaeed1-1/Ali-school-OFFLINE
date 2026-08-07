import { motion } from 'framer-motion'
import { AlertTriangle, BookMarked, BookOpen, Calendar, Gauge, HelpCircle, LayoutDashboard, LogOut, Search, Settings, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getInitials } from '../../utils/initials'
import logo from '../../../logo/logo.jpeg'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dashboard/teachers', label: 'Teachers', icon: Users },
  { to: '/dashboard/classes', label: 'Classes', icon: BookOpen },
  { to: '/dashboard/subjects', label: 'Subjects', icon: BookMarked },
  { to: '/dashboard/timetable', label: 'Timetable', icon: Calendar },
  { to: '/dashboard/warnings', label: 'Warnings', icon: AlertTriangle },
  { to: '/dashboard/capacity-advisor', label: 'Capacity Advisor', icon: Gauge },
  { to: '/dashboard/gaps-and-suggestions', label: 'Gaps & Suggestions', icon: Search },
  { to: '/dashboard/guidelines', label: 'Guidelines', icon: HelpCircle },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-[260px] flex-col bg-brand-navy px-3 py-4 shadow-sidebar">
      <div className="flex flex-col items-center gap-2 px-2 py-4">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white/80">
          <img src={logo} alt="Ali Public School logo" className="h-full w-full object-cover" />
        </div>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white">Ali Public School</p>
          <p className="mt-0.5 text-[10px] text-white/50">WebAdmin</p>
        </div>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-1 px-1">
        {navItems.map(({ to, label, icon: Icon }, index) => (
          <motion.div
            key={to}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
          >
            <NavLink
              to={to}
              end={to === '/dashboard'}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors duration-150',
                  isActive ? 'bg-white text-brand-navy' : 'text-white/85 hover:bg-white/[0.12] hover:text-white',
                ].join(' ')
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          </motion.div>
        ))}
      </nav>

      <div className="space-y-3 px-1 pb-1">
        <div className="h-px bg-white/[0.12]" />
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
            {getInitials(user?.email?.split('@')[0])}
          </div>
          <p className="flex-1 truncate text-[11px] text-white/55">{user?.email ?? 'admin@example.com'}</p>
          <button
            type="button"
            onClick={logout}
            aria-label="Logout"
            className="text-white/55 transition-colors duration-150 hover:text-[#EF4444]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
