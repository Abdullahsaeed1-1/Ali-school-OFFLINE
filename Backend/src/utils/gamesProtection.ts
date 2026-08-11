// Class.gamesProtectedLectures is stored as a JSON-encoded string (SQLite
// has no array or Json column type) — every read/write of the column goes
// through these two functions so the rest of the app can keep working with
// plain number[], exactly as it did when this was a native Postgres array.

export function parseGamesProtectedLectures(value: string): number[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : []
  } catch {
    return []
  }
}

export function serializeGamesProtectedLectures(value: number[]): string {
  return JSON.stringify(value)
}
