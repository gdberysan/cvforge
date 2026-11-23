import { isDemo } from '@/lib/demo/mode'

/**
 * Personal-only feature switch (spec: 2026-08-26-linkedin-discover-design).
 * The same variable drives two gates: at build time next.config resolves
 * '#discover' to the stub when it is unset, and at runtime every discover
 * surface 404s when this returns false. Demo always wins — the public demo
 * must never reach LinkedIn.
 */
export function isDiscoverEnabled(): boolean {
  return process.env.CVFORGE_DISCOVER === '1' && !isDemo()
}
