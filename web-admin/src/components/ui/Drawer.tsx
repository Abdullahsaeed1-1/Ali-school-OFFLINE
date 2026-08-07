import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  footer,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-40">
          <motion.button
            type="button"
            aria-label="Close drawer"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-[#0D1B3E]/50"
          />
          <motion.aside
            initial={{ x: 520 }}
            animate={{ x: 0 }}
            exit={{ x: 520 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col bg-white shadow-drawer"
          >
            <div className="flex items-center justify-between border-b border-[rgba(20,55,130,0.08)] px-5 py-4">
              <h2 className="font-display text-lg text-text-primary">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[rgba(20,55,130,0.12)] p-2 text-text-muted transition hover:bg-[rgba(20,55,130,0.04)] hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer ? <div className="border-t border-[rgba(20,55,130,0.08)] px-5 py-4">{footer}</div> : null}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
