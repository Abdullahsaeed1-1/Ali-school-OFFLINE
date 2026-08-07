type ApiErrorBody = { error?: string; code?: string }
type ApiErrorShape = { response?: { status?: number; data?: ApiErrorBody }; request?: unknown }

/**
 * Returns the machine-readable error code from a failed API call, e.g.
 * "VALIDATION_ERROR" or "AUTH_REQUIRED". Undefined if the server didn't
 * reach the point of returning the { error, code } shape (network failure).
 */
export function getApiErrorCode(error: unknown): string | undefined {
  const axiosError = error as ApiErrorShape
  return axiosError.response?.data?.code
}

/**
 * Turns any error thrown by an API call into a message safe to show a user.
 * Never surfaces a raw status code, error code, stack trace, or Prisma
 * error — only a friendly sentence.
 *
 * - No response at all (offline, DNS failure, backend down): a fixed
 *   "connection lost" message, since there's no server message to show.
 * - Too many requests: a fixed rate-limit message.
 * - A normal { error, code } response body: prefer the server's own
 *   message (the backend already returns curated, friendly text — see
 *   Backend/src/utils/apiError.ts) since it's usually more specific than a
 *   generic category message.
 * - If the server didn't supply a message for some reason, fall back to a
 *   friendly message keyed off the status code, then the caller-supplied
 *   fallback for anything else.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as ApiErrorShape

  if (!axiosError.response) {
    if (axiosError.request) {
      return 'Connection lost. Please check your internet and try again.'
    }
    return fallback
  }

  const status = axiosError.response.status
  const serverMessage = axiosError.response.data?.error
  if (serverMessage) return serverMessage

  if (status === 429) return 'Too many attempts. Please wait 15 minutes and try again.'
  if (status === 404) return 'Not found. It may have been deleted.'
  if (status === 409) return 'This already exists. Please use a different value.'
  if (status && status >= 500) return 'Something went wrong on our end. Please try again in a moment.'

  return fallback
}
