'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import type { MessageKey } from '@/lib/i18n'
import type { PrepContent } from '@/lib/schemas/prep'

/**
 * Where everything is, and where he is, in the column that stays on screen
 * beside a long guide. Wide screens only: on a phone it would be a screen
 * of links before any preparation.
 */
export function PrepIndex({ content, exposed }: { content: PrepContent; exposed: boolean }) {
  const t = useT()
  const items = (
    [
      ['prep-exposed-h', 'prep.exposed.title', exposed],
      ['prep-q-h', 'prep.questions.title', true],
      ['prep-cv-h', 'prep.cv.title', true],
      ['prep-gap-h', 'prep.gaps.title', content.gapAnswers.length > 0],
      ['prep-ask-h', 'prep.ask.title', (content.askThem ?? []).length > 0],
    ] as [string, MessageKey, boolean][]
  ).filter(([, , shown]) => shown)
  const ids = items.map(([id]) => id).join(',')
  const [current, setCurrent] = useState<string | null>(null)

  // The section whose heading was last passed is the one being read.
  useEffect(() => {
    const headings = ids
      .split(',')
      .map((id) => document.getElementById(id))
      .filter((h): h is HTMLElement => h !== null)
    if (headings.length === 0 || typeof IntersectionObserver === 'undefined') return
    const onScroll = () => {
      const line = window.innerHeight * 0.3
      const passed = headings.filter((h) => h.getBoundingClientRect().top <= line)
      setCurrent(passed.at(-1)?.id ?? null)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ids])

  return (
    <nav className="prep-index" aria-labelledby="prep-index-h">
      <h2 id="prep-index-h" className="prep-index-title">
        {t('prep.index.title')}
      </h2>
      <ol className="prep-index-list">
        {items.map(([id, key]) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={current === id ? 'location' : undefined}>
              {t(key)}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
