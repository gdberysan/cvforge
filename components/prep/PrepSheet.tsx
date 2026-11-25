'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import type { PrepContent } from '@/lib/schemas/prep'
import type { SavedAnswer } from './AnswerBox'
import { exposedGaps } from './Exposed'
import type { BriefPerson } from './PrepBriefing'
import type { ReqChip } from './QuestionMap'

/**
 * The page he takes into the day of the interview: one sheet, printed or
 * saved as a PDF from the phone's own print dialog (the dependable path on
 * every phone browser, the LinkedIn one included). Shown only while
 * printing, under a body class, so the app's other print rules (the CV's)
 * are never touched.
 */
export function PrepSheet({
  content,
  people,
  requirements,
  company,
  answers,
}: {
  content: PrepContent
  people: BriefPerson[]
  requirements: ReqChip[]
  company: string
  answers: SavedAnswer[]
}) {
  const t = useT()
  const reqs = new Map(requirements.map((r) => [r.id, r]))
  const exposed = exposedGaps(content, requirements)
  return (
    <section className="prep-sheet" aria-hidden="true">
      <header className="prep-sheet-head">
        <p className="prep-sheet-kicker">{t('prep.sheet.kicker')}</p>
        <h2 className="prep-sheet-title">{company}</h2>
        {people.length > 0 && (
          <p className="prep-sheet-people">
            {people.map((p) => (p.role ? `${p.name}, ${p.role}` : p.name)).join(' · ')}
          </p>
        )}
      </header>
      {content.pitch?.text && (
        <div className="prep-sheet-block">
          <h3>{t('prep.pitch.title')}</h3>
          <p>{content.pitch.text}</p>
        </div>
      )}
      <div className="prep-sheet-block">
        <h3>{t('prep.sheet.stories')}</h3>
        {content.stories.map((s) => (
          <div key={s.id} className="prep-sheet-story">
            <p className="prep-sheet-story-title">{s.title}</p>
            <p>{s.short.slice(0, 2).join(' · ')}</p>
          </div>
        ))}
      </div>
      {answers.some((a) => a.part === 'Q') && (
        <div className="prep-sheet-block">
          <h3>{t('prep.sheet.yours')}</h3>
          {answers
            .filter((a) => a.part === 'Q')
            .slice(0, 3)
            .map((a) => (
              <p key={a.id}>
                <strong>{a.question}</strong> {a.answer}
              </p>
            ))}
        </div>
      )}
      {exposed.length > 0 && (
        <div className="prep-sheet-block">
          <h3>{t('prep.exposed.title')}</h3>
          {exposed.map((g) => (
            <p key={g.id}>
              <strong>{reqs.get(g.requirementId)?.keyword}:</strong> {g.admit} {g.plan}
            </p>
          ))}
        </div>
      )}
      {(content.askThem ?? []).length > 0 && (
        <div className="prep-sheet-block">
          <h3>{t('prep.ask.title')}</h3>
          <ul>
            {(content.askThem ?? []).slice(0, 3).map((a) => (
              <li key={a.text}>{a.text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/**
 * Opens the phone's or computer's print dialog for the sheet alone. The
 * sheet is copied to a container right under <body> and everything else is
 * taken out of the printout (hidden, not just invisible: invisible content
 * still takes its pages).
 */
export function printSheet() {
  const sheet = document.querySelector('.prep-sheet')
  if (!sheet) return
  const root = document.createElement('div')
  root.id = 'prep-print-root'
  root.appendChild(sheet.cloneNode(true))
  document.body.appendChild(root)
  document.body.classList.add('is-printing-prep')
  const done = () => {
    document.body.classList.remove('is-printing-prep')
    root.remove()
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}
