/**
 * A failed API response, carrying the machine code alongside the server's
 * English fallback message. Client components translate the code via
 * `errorText` so a Spanish UI never shows an English error mid-screen.
 */
export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiFailure'
    // The free trial ran out (or cannot run this step): every screen that
    // shows a paid failure raises it here, and the web edition answers with
    // one sheet that leads to the person's own key (web/lib/trial-out.tsx).
    if (code?.startsWith('trial-') && typeof window !== 'undefined')
      queueMicrotask(() => window.dispatchEvent(new CustomEvent(TRIAL_OUT, { detail: code })))
  }
}

/** Event raised when a paid step failed because of the free trial's limits. */
export const TRIAL_OUT = 'rumbo:trial-out'
