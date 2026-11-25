'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { BEATS, type PrepContent } from '@/lib/schemas/prep'

/** One segment per question, by what answers it; then how many stories need his memory. */
export function Readiness({ content }: { content: PrepContent }) {
  const t = useT()
  const total = content.coverage.length
  const story = content.coverage.filter((c) => c.by === 'story').length
  const gap = content.coverage.filter((c) => c.by === 'gap').length
  const none = total - story - gap
  const open = content.stories.filter((s) => BEATS.some((b) => s[b].text === ''))
  const memory = open.length
  const order = [...content.coverage].sort(
    (a, b) => ['story', 'gap', 'none'].indexOf(a.by) - ['story', 'gap', 'none'].indexOf(b.by),
  )
  return (
    <section className="prep-ready" aria-labelledby="prep-ready-h">
      <h2 id="prep-ready-h" className="prep-h2">
        {t('prep.ready.title')}
      </h2>
      <div
        className="prep-bar"
        role="img"
        aria-label={t('prep.ready.aria', { total, story, gap, none })}
      >
        {order.map((c) => (
          <span key={c.questionId} className={`prep-seg is-${c.by}`} />
        ))}
      </div>
      <p className="prep-ready-text">{t('prep.ready.summary', { story, total, gap, none })}</p>
      {memory > 0 && (
        <p className="prep-memory">
          {t(memory === 1 ? 'prep.ready.memory.one' : 'prep.ready.memory.other', { n: memory })}{' '}
          <a href={`#story-${open[0]?.id}`}>{t('prep.ready.memoryLink')}</a>
        </p>
      )}
    </section>
  )
}
