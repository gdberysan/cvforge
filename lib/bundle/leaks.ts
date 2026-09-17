/**
 * Spec §12 gate 6: no API key in any built client chunk. Three signals —
 * the configured value verbatim, any Anthropic-shaped key, and a server-only
 * env access that reached the browser bundle (which means server code did).
 * The bare variable NAME is not a leak: the setup screen legitimately names it.
 */
export type Leak = {
  file: string
  kind: 'key-value' | 'key-prefix' | 'env-access'
  excerpt: string
}

const KEY_SHAPE = /sk-ant-[A-Za-z0-9_-]{8,}/
const ENV_ACCESS = /env\.ANTHROPIC_API_KEY|env\[["']ANTHROPIC_API_KEY/

/** Secrets shorter than this would match by coincidence. */
const MIN_SECRET_LENGTH = 8

export function findLeaks(
  files: { path: string; content: string }[],
  opts: { secrets: string[] },
): Leak[] {
  const secrets = opts.secrets.filter((s) => s.length >= MIN_SECRET_LENGTH)
  const leaks: Leak[] = []

  for (const file of files) {
    for (const secret of secrets) {
      const at = file.content.indexOf(secret)
      if (at !== -1)
        leaks.push({ file: file.path, kind: 'key-value', excerpt: excerpt(file.content, at) })
    }
    const shaped = KEY_SHAPE.exec(file.content)
    if (shaped)
      leaks.push({
        file: file.path,
        kind: 'key-prefix',
        excerpt: excerpt(file.content, shaped.index),
      })
    const access = ENV_ACCESS.exec(file.content)
    if (access)
      leaks.push({
        file: file.path,
        kind: 'env-access',
        excerpt: excerpt(file.content, access.index),
      })
  }

  return leaks
}

function excerpt(content: string, at: number): string {
  return content.slice(Math.max(0, at - 30), at + 50).replace(/\s+/g, ' ')
}
