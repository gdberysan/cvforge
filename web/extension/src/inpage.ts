/**
 * Injected by the toolbar icon (executeScript, activeTab) into the page the
 * person is on: reads the posting there and leaves it for the background to
 * collect. The extension's isolated world keeps it between the two calls.
 */
import { extractPosting } from './extract'

;(globalThis as unknown as { __cvforgeRead?: unknown }).__cvforgeRead = extractPosting(
  document,
  location.href,
  String(window.getSelection() ?? ''),
)
