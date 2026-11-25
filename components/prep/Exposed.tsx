'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import type { PrepContent } from '@/lib/schemas/prep'
import type { ReqChip } from './QuestionMap'

/** How many must-haves the box names: the ones to have ready, not a second list of gaps. */
const MAX_EXPOSED = 3

/** The gap answers the box names: mandatory, and nothing in his experience covers them. */
export function exposedGaps(content: PrepContent, requirements: ReqChip[]) {
  const reqs = new Map(requirements.map((r) => [r.id, r]))
  return content.gapAnswers
    .filter((g) => {
      const r = reqs.get(g.requirementId)
      return r?.mandatory === true && (r.strength ?? 'none') === 'none'
    })
    .slice(0, MAX_EXPOSED)
}

/**
 * Where the interview will press hardest: mandatory requirements nothing in
 * his experience covers (a partly covered one has a story above, so naming
 * it here would contradict the list below). Each shows the first words of
 * its honest answer, and opens the whole answer.
 */
export function Exposed({
  content,
  requirements,
  placement = 'main',
}: {
  content: PrepContent
  requirements: ReqChip[]
  /** 'top': the phone copy, first on the screen; 'main': the wide-screen one. */
  placement?: 'top' | 'main'
}) {
  const t = useT()
  const reqs = new Map(requirements.map((r) => [r.id, r]))
  const exposed = exposedGaps(content, requirements)
  if (exposed.length === 0) return null
  return (
    <section
      className={`prep-section prep-exposed-at-${placement}`}
      aria-labelledby={placement === 'main' ? 'prep-exposed-h' : 'prep-exposed-top-h'}
    >
      <h2 id={placement === 'main' ? 'prep-exposed-h' : 'prep-exposed-top-h'} className="prep-h2">
        {t('prep.exposed.title')}
      </h2>
      <p className="prep-muted">{t('prep.exposed.hint')}</p>
      <ul className="prep-exposed">
        {exposed.map((g) => (
          <li key={g.id}>
            <a className="prep-exposed-link" href={`#gap-${g.id}`}>
              <span className="prep-exposed-text">
                <span className="prep-exposed-name">{reqs.get(g.requirementId)?.keyword}</span>
              </span>
              <span className="prep-exposed-see">{t('prep.exposed.see')}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
