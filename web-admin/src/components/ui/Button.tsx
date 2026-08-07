import { type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { motion, type HTMLMotionProps } from 'framer-motion'

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'gold'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-brand-navy bg-brand-navy text-white hover:bg-brand-navy-light',
  ghost: 'border-[rgba(20,55,130,0.15)] bg-transparent text-brand-navy hover:bg-[rgba(20,55,130,0.05)]',
  danger: 'border-brand-maroon/30 bg-transparent text-brand-maroon hover:bg-brand-maroon/10',
  gold: 'border-gold-cta bg-gold-cta text-text-primary hover:opacity-90',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2.5 text-sm',
}

export default function Button({
  className = '',
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled || loading ? undefined : { y: -1 }}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      <span>{children}</span>
    </motion.button>
  )
}
