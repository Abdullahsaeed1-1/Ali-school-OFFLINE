/** A segmented pill toggle — an alternative to a dropdown for a small, fixed set of options. */
export function PillToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-[rgba(20,55,130,0.12)] bg-[#F8FAFC] p-1">
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
              isActive ? 'bg-brand-navy text-white' : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
