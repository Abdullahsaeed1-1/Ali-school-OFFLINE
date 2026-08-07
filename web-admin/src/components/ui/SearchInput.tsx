import { Search } from 'lucide-react'

export function SearchInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <input
        {...props}
        className={[
          'w-full rounded-lg border border-[rgba(20,55,130,0.15)] bg-white py-2.5 pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-navy focus:ring-1 focus:ring-brand-navy/20',
          props.className ?? '',
        ].join(' ')}
      />
    </div>
  )
}
