/**
 * A pasted posting, read into blocks for display: headings ("Requisitos:"),
 * bullet lists and paragraphs. Every character of the text is kept, in
 * order; only the presentation changes. Used by the "Ver vacante" sheet,
 * where the raw text used to be one monospace dump.
 */
export type PostingBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'para'; lines: string[] }

const BULLET = /^\s*(?:[•·▪◦●*–-]|\d{1,2}[.)])\s+/

export function postingBlocks(raw: string): PostingBlock[] {
  const out: PostingBlock[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: 'para', lines: para })
    para = []
  }
  const lines = raw.replace(/\r/g, '').split('\n')
  for (const [i, line] of lines.entries()) {
    const text = line.trim()
    const next = (lines[i + 1] ?? '').trim()
    if (!text) {
      flush()
      continue
    }
    if (BULLET.test(text)) {
      flush()
      const item = text.replace(BULLET, '')
      const last = out[out.length - 1]
      if (last?.kind === 'list') last.items.push(item)
      else out.push({ kind: 'list', items: [item] })
      continue
    }
    // A short line ending in a colon introduces what follows; so does a short
    // label with no sentence punctuation when a list starts right under it.
    const label =
      text.length <= 70 &&
      (/:$/.test(text) ||
        (para.length === 0 &&
          !/[.,;]$/.test(text) &&
          text.split(' ').length <= 6 &&
          BULLET.test(next)))
    if (label) {
      flush()
      out.push({ kind: 'heading', text })
      continue
    }
    para.push(text)
  }
  flush()
  return out
}
