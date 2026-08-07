import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

export function Modal({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
  intent = 'primary',
  confirmLoading = false,
  children,
}: {
  isOpen: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  intent?: 'primary' | 'danger'
  onConfirm: () => void | Promise<void>
  onClose: () => void
  /** Disables both buttons and shows a spinner on confirm while an action from onConfirm is in flight. */
  confirmLoading?: boolean
  children?: ReactNode
}) {
  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-[#0D1B3E]/50"
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-md rounded-2xl border border-[rgba(20,55,130,0.08)] bg-white p-5 shadow-luxe"
          >
            <h3 className="font-display text-lg text-text-primary">{title}</h3>
            {description ? <p className="mt-2 text-sm text-text-secondary">{description}</p> : null}
            {children ? <div className="mt-4">{children}</div> : null}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={confirmLoading}
                className="rounded-lg border border-[rgba(20,55,130,0.15)] px-4 py-2 text-sm text-text-primary hover:bg-[rgba(20,55,130,0.04)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirmLoading}
                className={[
                  'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
                  intent === 'danger'
                    ? 'border-brand-maroon/30 bg-transparent text-brand-maroon hover:bg-brand-maroon/10'
                    : 'border-brand-navy bg-brand-navy text-white hover:bg-brand-navy-light',
                ].join(' ')}
              >
                {confirmLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
