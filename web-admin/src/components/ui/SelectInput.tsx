export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        'w-full rounded-lg border border-[rgba(20,55,130,0.15)] bg-white px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-navy focus:ring-1 focus:ring-brand-navy/20 disabled:cursor-not-allowed disabled:opacity-60',
        props.className ?? '',
      ].join(' ')}
    />
  )
}
