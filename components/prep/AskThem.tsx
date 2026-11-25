'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import type { PrepContent } from '@/lib/schemas/prep'

/**
 * The end of every interview: "¿tienes alguna pregunta?". A few questions
 * fitted to this interviewer and this job, each with what its answer tells
 * him, so he picks two instead of improvising one.
 */
export function AskThem({ content }: { content: PrepContent }) {
  const t = useT()
  const asks = content.askThem ?? []
  if (asks.length === 0) return null
  return (
    <section className="prep-section" aria-labelledby="prep-ask-h">
      <h2 id="prep-ask-h" className="prep-h2">
        {t('prep.ask.title')}
      </h2>
      <p className="prep-muted">{t('prep.ask.hint')}</p>
      <article className="prep-qcard">
        <ul className="prep-qs">
          {asks.map((a) => (
            <li key={a.text} className="prep-q">
              <span>{a.text}</span>
              {a.why && <span className="prep-ask-why">{a.why}</span>}
            </li>
          ))}
        </ul>
      </article>
    </section>
  )
}
