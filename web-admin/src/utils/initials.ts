/** First letters of up to the first two words of a name, e.g. "Ali Khan" → "AK". */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0] ?? ''
  const second = words.length > 1 ? words[1][0] ?? '' : ''
  return (first + second).toUpperCase()
}
