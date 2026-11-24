import { type SpendAction, withSpendContext } from './spend-context'

/**
 * A paid route as one action: every model call it makes is recorded with
 * that action, the application named in its JSON body (when it names one)
 * and one run id (./spend-context.ts). `action` may depend on the body (a
 * companion route writes a letter, answers or a message).
 */
export function spendRoute(
  action: SpendAction | ((body: Record<string, unknown> | null) => SpendAction),
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const body = await request
      .clone()
      .json()
      .then((b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : null))
      .catch(() => null)
    const applicationId = typeof body?.applicationId === 'string' ? body.applicationId : undefined
    return withSpendContext(
      { action: typeof action === 'function' ? action(body) : action, applicationId },
      () => handler(request),
    )
  }
}
