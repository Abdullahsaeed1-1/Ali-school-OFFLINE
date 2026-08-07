import type { LucideIcon } from 'lucide-react'
import { CheckCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'
import Card from './Card'
import { CircularProgress } from './CircularProgress'
import { useCountUp } from '../../utils/useCountUp'

type StatCardRing = { kind: 'ring'; percent: number; color?: string } | { kind: 'check' } | { kind: 'none' }

export function StatCard({
  label,
  value,
  icon: Icon,
  note,
  ring = { kind: 'none' },
  delay = 0,
}: {
  label: string
  value: string | number
  icon: LucideIcon
  note?: string
  ring?: StatCardRing
  delay?: number
}) {
  const isNumeric = typeof value === 'number'
  const animatedValue = useCountUp(isNumeric ? value : 0, 1000)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
    >
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">{label}</p>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-navy/10 text-brand-navy">
            <Icon className="h-[22px] w-[22px]" />
          </div>
        </div>

        <p className="mt-3 text-4xl font-bold tabular-nums text-text-primary">
          {isNumeric ? animatedValue : value}
        </p>

        {ring.kind === 'ring' ? (
          <div className="mt-4">
            <CircularProgress percent={ring.percent} color={ring.color} />
          </div>
        ) : ring.kind === 'check' ? (
          <div className="mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#16A34A]/10 text-[#16A34A]">
            <CheckCircle2 className="h-7 w-7" />
          </div>
        ) : null}

        {note ? <p className="mt-3 text-xs text-text-muted">{note}</p> : null}
      </Card>
    </motion.div>
  )
}
