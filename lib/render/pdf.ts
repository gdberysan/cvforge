/**
 * Playwright is loaded lazily: importing this module must never require a
 * browser runtime to be present. The export routes import `buildFilename`
 * from here, and a host with no usable engine (a serverless function, a
 * machine with no browser at all) must still serve DOCX, plain text, and
 * the print fallback.
 *
 * The engine ladder: the user's own Chrome, then their Edge (present on
 * every Windows machine), then Playwright's downloaded Chromium if one was
 * ever installed. Driving an installed browser means one-click PDF with no
 * 150MB download for nearly everyone — and the document is still printed
 * from the same HTML the studio previews, so preview and output cannot
 * drift.
 */
const ENGINE_LADDER: (string | undefined)[] = ['chrome', 'msedge', undefined]

/**
 * The channel that worked, probed once per process. null = none of them.
 * On globalThis, not module scope: the export route, the Ajustes page and
 * the settings action that resets this each live in their own module
 * registry, and a module-level cache reset from one is untouched in the
 * others — the user installs Chromium, the card hides, and the export
 * keeps answering 503 until a restart.
 */
const globalForPdf = globalThis as unknown as {
  __cvforgePdfEngine?: Promise<string | undefined | null> | null
}

/** Never longer than this for one document: a hung browser must not pin the request. */
const PDF_TIMEOUT_MS = 60_000

async function probeEngine(): Promise<string | undefined | null> {
  const { chromium } = await import('playwright')
  for (const channel of ENGINE_LADDER) {
    try {
      const browser = await chromium.launch(channel ? { channel } : {})
      await browser.close()
      return channel
    } catch {
      // This rung is missing; try the next one.
    }
  }
  return null
}

function resolvedEngine(): Promise<string | undefined | null> {
  globalForPdf.__cvforgePdfEngine ??= probeEngine().catch(() => null)
  return globalForPdf.__cvforgePdfEngine
}

export async function isPdfEngineAvailable(): Promise<boolean> {
  return (await resolvedEngine()) !== null
}

/** A fresh Chromium install becomes visible without restarting the server. */
export function resetEngineProbe(): void {
  globalForPdf.__cvforgePdfEngine = null
}

/**
 * Prints the same HTML the studio previews. When no engine exists the caller
 * falls back to the browser's own print dialog against that identical
 * template — different button, same document.
 */
export async function renderPdf(html: string): Promise<Buffer> {
  const channel = await resolvedEngine()
  if (channel === null) throw new Error('no PDF engine available')
  const { chromium } = await import('playwright')
  let browser: Awaited<ReturnType<typeof chromium.launch>>
  try {
    browser = await chromium.launch(channel ? { channel } : {})
  } catch (error) {
    // The engine that once answered the probe is gone (an update in
    // progress, an uninstall). Forget it, so the next request re-probes and
    // the route can fall back to the print dialog instead of a 500.
    resetEngineProbe()
    throw error
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('PDF render timed out')), PDF_TIMEOUT_MS)
    })
    return await Promise.race([
      page.pdf({
        format: 'A4',
        printBackground: false,
        margin: { top: '16mm', bottom: '16mm', left: '15mm', right: '15mm' },
      }),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
    await browser.close()
  }
}

/**
 * ASCII only. The name goes into a Content-Disposition header, which is a
 * byte string: a letter outside Latin-1 (Łukasz, Владимир, 田中) made the
 * header constructor throw and every export — and the studio preview, which
 * is the same route — answer 500. Diacritics fold; anything that does not
 * fold is dropped, and a name that folds to nothing falls back to "CV".
 */
export function buildFilename(fullName: string, company: string, ext = 'pdf'): string {
  const slug = (value: string) =>
    value
      .normalize('NFD')
      // Combining diacritical marks. MUST be written as unicode escapes —
      // literal combining marks are invisible in source and get mangled by
      // editors and copy-paste.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')

  const name = slug(fullName)
  const org = slug(company)
  return `${name ? `${name}-` : ''}CV${org ? `-${org}` : ''}.${ext}`
}
