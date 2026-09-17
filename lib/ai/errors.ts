export type AiErrorKind =
  | 'rate-limit'
  | 'overloaded'
  | 'auth'
  | 'billing'
  | 'timeout'
  | 'invalid-output'
  | 'network'
  | 'demo-miss'
  | 'unknown'

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AiError'
  }

  /** What happened, and what to do next. Never an apology, never vague. */
  get userMessage(): string {
    switch (this.kind) {
      case 'rate-limit':
        return 'Rate limited by the API. Wait about a minute and retry — your input is preserved.'
      case 'overloaded':
        return 'The API is busy. Retry in a moment.'
      case 'auth':
        return 'No Anthropic key yet. Add one in Settings (or set ANTHROPIC_API_KEY), then retry.'
      case 'billing':
        return 'Your Anthropic account is out of credits. Add some at console.anthropic.com → Plans & Billing, then retry — your input is preserved.'
      case 'timeout':
        return 'The request timed out. Retry — your input is preserved.'
      case 'invalid-output':
        return 'The model returned an unexpected shape. Retry; if it persists, the prompt needs fixing.'
      case 'network':
        return 'Could not reach the API. Check your connection and retry — your input is preserved.'
      default:
        return 'Something went wrong talking to the API.'
    }
  }
}

export function classify(error: unknown): AiErrorKind {
  const status = (error as { status?: number } | null)?.status
  if (status === 429) return 'rate-limit'
  if (status === 529) return 'overloaded'
  if (status === 401 || status === 403) return 'auth'
  if (status === 408) return 'timeout'
  // A 5xx is the API's problem, not the user's, and as transient as a 529:
  // it gets the same single backoff instead of "something went wrong".
  if (status !== undefined && status >= 500) return 'overloaded'

  // An exhausted credit balance arrives as a 400 invalid_request_error, so it
  // would otherwise be reported as a generic failure — hiding the one message
  // that tells the user exactly what to do.
  if (status === 400 && /credit balance/i.test(messageOf(error))) return 'billing'

  // Client-side timeouts are APIConnectionTimeoutError with NO status — the
  // 408 check above never sees them. Matched by class name and by the SDK's
  // fixed message, so a mocked SDK in tests classifies the same way.
  const ctor = (error as { constructor?: { name?: string } } | null)?.constructor?.name
  if (ctor === 'APIConnectionTimeoutError' || /request timed out/i.test(messageOf(error))) {
    return 'timeout'
  }
  // Offline, DNS down, a proxy refusing: the SDK's APIConnectionError, also
  // status-less. A local-first app meets this one more than any other.
  if (ctor === 'APIConnectionError' || /^connection error/i.test(messageOf(error))) {
    return 'network'
  }

  // messages.parse throws a status-less AnthropicError when the model output
  // cannot be parsed — including max_tokens truncation mid-JSON. Without this
  // the one retryable-with-a-reason failure reports as "something went wrong".
  if (/failed to parse structured output/i.test(messageOf(error))) return 'invalid-output'

  return 'unknown'
}

export function messageOf(error: unknown): string {
  const e = error as { message?: string; error?: { message?: string } } | null
  return e?.error?.message ?? e?.message ?? ''
}
