'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import type { LineMarks } from './types'

/** Under a spoken line: where it comes from, and anything to check before saying it. */
export function LineNotes({
  path,
  cited,
  labels,
  marks,
}: {
  path: string
  cited: string[]
  labels: Record<string, string>
  marks: LineMarks
}) {
  const t = useT()
  const sources = [
    ...new Set(
      cited.map((id) =>
        id.startsWith('answer:')
          ? t('prep.sourceAnswer')
          : t('prep.source', { label: labels[id] ?? id }),
      ),
    ),
  ]
  const flag = marks.flags.get(path)
  return (
    <>
      {sources.map((s) => (
        <p key={s} className="prep-src">
          {s}
        </p>
      ))}
      {flag && <p className="prep-flag">{t('prep.flag', { reason: flag })}</p>}
      {!flag && marks.tells.has(path) && <p className="prep-tell">{t('prep.tell')}</p>}
    </>
  )
}

/** The flag alone, for a line that cites nothing by design (an admission, a plan, a note). */
export function FlagNote({ path, marks }: { path: string; marks: LineMarks }) {
  const t = useT()
  const flag = marks.flags.get(path)
  return flag ? <p className="prep-flag">{t('prep.flag', { reason: flag })}</p> : null
}
