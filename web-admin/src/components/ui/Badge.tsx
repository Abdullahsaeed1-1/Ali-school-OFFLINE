type BadgeColor = 'navy' | 'purple' | 'teal' | 'gold'

const colorClasses: Record<BadgeColor, string> = {
  navy: 'bg-brand-navy text-white',
  purple: 'bg-[#9333EA] text-white',
  teal: 'bg-[#0F766E] text-white',
  gold: 'bg-gold-cta text-text-primary',
}

/** A campus/role pill — solid brand color background, white (or navy for gold) text. */
export function Badge({ color, label, className = '' }: { color: BadgeColor; label: string; className?: string }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em]',
        colorClasses[color],
        className,
      ].join(' ')}
    >
      {label}
    </span>
  )
}

/** Maps a campus name string to the Badge color used for it across the app. */
export function campusBadgeColor(campusName: string): BadgeColor {
  if (campusName.includes('Girls')) return 'purple'
  if (campusName.includes('Boys')) return 'teal'
  return 'navy'
}
