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
  }
}
