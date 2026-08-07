import { HTMLAttributes } from 'react'

export default function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={[
        'rounded-2xl border border-[rgba(20,55,130,0.08)] bg-bg-surface text-text-primary shadow-card',
        className,
      ].join(' ')}
      {...props}
    />
  )
}
