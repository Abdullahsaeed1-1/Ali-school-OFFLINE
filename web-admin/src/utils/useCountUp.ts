import { useEffect, useRef, useState } from 'react'

/**
 * Animates from 0 to `target` over `durationMs` using requestAnimationFrame,
 * restarting whenever `target` changes (e.g. once the real value arrives
 * after loading). Returns the target itself immediately if it's not a
 * finite number (so callers can pass loading placeholders through unchanged).
 */
export function useCountUp(target: number, durationMs = 1000): number {
  const [value, setValue] = useState(0)
  const frameRef = useRef<number>()

  useEffect(() => {
    if (!Number.isFinite(target)) return undefined

    const start = performance.now()
    const from = 0

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(1, elapsed / durationMs)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(from + (target - from) * eased))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [target, durationMs])

  return Number.isFinite(target) ? value : target
}
