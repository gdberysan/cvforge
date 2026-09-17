/**
 * The one switch behind the public demo (product spec §5). Everything the
 * demo changes is guarded by isDemo(); nothing else reads the variable.
 */
export function isDemo(): boolean {
  return process.env.CVFORGE_MODE === 'demo'
}

export class DemoReadOnlyError extends Error {
  readonly code = 'demo-read-only' as const
  constructor() {
    super('Demo mode is read-only')
    this.name = 'DemoReadOnlyError'
  }
}

/** First line of every server action. */
export function assertWritable(): void {
  if (isDemo()) throw new DemoReadOnlyError()
}

/** What a blocked action returns; the UI translates the code. */
export function demoBlock(): { ok: false; error: string; code: 'demo-read-only' } {
  return {
    ok: false,
    error: 'This is the demo — nothing is saved. The full version runs on your machine.',
    code: 'demo-read-only',
  }
}

export const DEMO_LINKS = {
  get: 'https://github.com/gdberysan/cvforge',
  how: 'https://korven.dev/cvforge/como-esta-hecho',
} as const
