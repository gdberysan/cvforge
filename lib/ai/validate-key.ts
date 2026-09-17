import Anthropic from '@anthropic-ai/sdk'
import { type AiErrorKind, classify } from './errors'

/**
 * "✓ conectado" must mean something: the key is tried against the Models
 * endpoint (free, no tokens) before it is saved. A throw-away client, never
 * the cached one — the cached one may still hold the old credentials.
 */
export async function validateApiKey(
  key: string,
): Promise<{ ok: true } | { ok: false; kind: AiErrorKind }> {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0 }).models.list({ limit: 1 })
    return { ok: true }
  } catch (error) {
    return { ok: false, kind: classify(error) }
  }
}
