/**
 * The web edition forbids eval (scripts/web-csp.ts). Zod's fast path probes
 * `new Function` once and falls back when refused, but a strict CSP still
 * reports the refused probe as a violation; jitless skips the probe. Import
 * first, before anything parses.
 */
import { z } from 'zod'

z.config({ jitless: true })
