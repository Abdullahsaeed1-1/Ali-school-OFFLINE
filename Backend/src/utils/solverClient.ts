// Shared HTTP client for Backend/solver/ — used by timetableGenerator.ts
// and gamesDutyScheduler.ts. Previously a bare `fetch()` with no timeout
// or retry, tolerable when the solver was an always-on hosted service.
// Once Electron spawns it as a local subprocess (offline conversion,
// docs/offline-conversion-plan.md Phase 3/4), solver startup becomes a
// real race the caller has to handle: the Node backend can come up and
// try to solve before the solver process has finished binding its port.

const SOLVER_SERVICE_URL = process.env.SOLVER_SERVICE_URL ?? 'http://localhost:8001'

// Generous: CP-SAT's own scaled time budget observed up to ~30s on the
// largest real campus (Boys, ~3000 variables) — this leaves headroom for
// a slower machine or a larger future campus without false-timing-out a
// solve that's still legitimately working.
const SOLVE_REQUEST_TIMEOUT_MS = 120_000
// duty_solve.py caps itself at 10s internally — 30s leaves margin without
// masking a real hang.
const DUTY_SOLVE_REQUEST_TIMEOUT_MS = 30_000

async function fetchWithTimeout(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Solver request to ${url} timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Polls GET /health until the solver responds or `timeoutMs` elapses.
 * Meant to be awaited once, right after spawning the solver subprocess
 * (Electron main process, Phase 4) and before the first /solve call — a
 * freshly-spawned process needs a moment to bind its port, and a plain
 * fetch() during that window fails with ECONNREFUSED, not a clean 503.
 */
export async function waitForSolverReady(timeoutMs = 15_000, pollIntervalMs = 250): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${SOLVER_SERVICE_URL}/health`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
  throw new Error(
    `Solver at ${SOLVER_SERVICE_URL} did not become ready within ${timeoutMs}ms` +
      (lastError instanceof Error ? `: ${lastError.message}` : ''),
  )
}

// One retry on connection-refused-style failures only (the startup race
// this module exists for) — never retries a real HTTP error response or a
// timeout, since retrying an already-slow/failing solve just doubles the
// wait for no benefit.
async function postWithOneRetry(path: string, body: unknown, timeoutMs: number): Promise<Response> {
  const url = `${SOLVER_SERVICE_URL}${path}`
  try {
    return await fetchWithTimeout(url, body, timeoutMs)
  } catch (error) {
    const isConnectionRefused =
      error instanceof Error && 'cause' in error && (error.cause as { code?: string } | undefined)?.code === 'ECONNREFUSED'
    if (!isConnectionRefused) throw error
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return fetchWithTimeout(url, body, timeoutMs)
  }
}

export async function solveTimetable(body: unknown): Promise<Response> {
  return postWithOneRetry('/solve', body, SOLVE_REQUEST_TIMEOUT_MS)
}

export async function solveDuty(body: unknown): Promise<Response> {
  return postWithOneRetry('/solve-duty', body, DUTY_SOLVE_REQUEST_TIMEOUT_MS)
}
