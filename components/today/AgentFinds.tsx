'use client'

import { useRouter } from 'next/navigation'
import { type MouseEvent, useEffect, useId, useRef, useState, useTransition } from 'react'
import { chaseFindAction, dismissFindAction } from '@/app/(app)/agent/actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { Chip } from '@/components/ui/Chip'
import { IconChevron, IconExternal } from '@/components/ui/icons'
import { Meta } from '@/components/ui/Meta'
import { Sheet } from '@/components/ui/Sheet'
import type { Translate } from '@/lib/i18n'
import { type GroupTone, type ToneRow, toneOf, toneWord } from '@/lib/requirement-tone'
import type { Source, Verdict } from '@/lib/schemas'
import { ago } from '@/lib/ui/ago'
import { haptic } from '@/lib/ui/haptics'
import { showToast } from '@/lib/ui/toast'

export type FindCard = {
  postingId: string
  jobTitle: string
  company: string
  source: Source
  verdict: Verdict
  createdAt: string
  /** Mandatory requirements met, of how many. */
  strong: number
  total: number
  /** The posting's own paragraph (lib/role-summary); null leaves the block out. */
  summary: string | null
  /** The posting's language, for the verbatim summary's `lang`. */
  summaryLang: string
  /** The mandatory requirements' keywords, grouped by strength (lib/requirement-tone). */
  groups: { tone: GroupTone; rows: ToneRow[] }[]
  postingRaw: string
  /** Already checked http(s), or null. */
  sourceUrl: string | null
}

/** Sources with a name worth saying in "Abrir en LinkedIn"; the rest open "the listing". */
const NAMED_SOURCES = new Set<Source>(['linkedin', 'occ', 'computrabajo', 'indeed'])

/**
 * What the job agent found and is waiting on you for, newest first. A push
 * opens Hoy at `?find=<id>`, which is the card highlighted and scrolled to.
 * Perseguir creates the application and starts the kit in the background;
 * Descartar hides the posting for good, here and in Telegram. The card is a
 * glance; a tap opens the preview sheet with what you need to decide.
 */
export function AgentFinds({ finds, highlight }: { finds: FindCard[]; highlight: string | null }) {
  const t = useT()
  const [gone, setGone] = useState<Set<string>>(new Set())
  const visible = finds.filter((f) => !gone.has(f.postingId))

  useEffect(() => {
    if (highlight) document.getElementById(`find-${highlight}`)?.scrollIntoView({ block: 'center' })
  }, [highlight])

  if (visible.length === 0) return null
  const hide = (id: string) => setGone((g) => new Set(g).add(id))

  return (
    <section className="finds" aria-labelledby="finds-title">
      <h2 id="finds-title" className="eyebrow finds-title">
        {t('agent.findsTitle')}
      </h2>
      <ul className="finds-list">
        {visible.map((f) => (
          <li key={f.postingId}>
            <Find
              find={f}
              highlighted={f.postingId === highlight}
              onGone={() => hide(f.postingId)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Find({
  find: f,
  highlighted,
  onGone,
}: {
  find: FindCard
  highlighted: boolean
  onGone: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const details = useRef<HTMLButtonElement>(null)

  // The toast lives in the page, below a modal sheet's top layer: on a
  // failure the sheet closes first, so the message is always seen.
  const fail = (message: string) => {
    setOpen(false)
    showToast(message)
  }

  const chase = () =>
    start(async () => {
      const out = await chaseFindAction(f.postingId)
      if (!out.ok) {
        if (out.code === 'gone' || out.code === 'repost') {
          fail(t(out.code === 'gone' ? 'agent.findGone' : 'agent.findRepost'))
          onGone()
        } else {
          fail(t('agent.chaseFailed'))
        }
        return
      }
      haptic('confirm')
      if (out.kit === 'queued') showToast(t('agent.kitQueued'))
      else if (out.kit === 'cap') showToast(t('agent.kitCap'))
      router.push(`/application/${out.applicationId}?step=docs`)
    })

  const dismiss = () =>
    start(async () => {
      const out = await dismissFindAction(f.postingId)
      if (out.ok) {
        haptic('confirm')
        onGone()
      } else fail(t('agent.chaseFailed'))
    })

  // A tap anywhere on the card but its buttons opens the preview; the
  // keyboard path is "Ver detalles", a real button. Focusing it first makes
  // it the sheet's opener, so closing the sheet returns focus to the card.
  const openFromCard = (e: MouseEvent) => {
    if ((e.target as Element).closest('button, a')) return
    details.current?.focus()
    setOpen(true)
  }

  const pair = (
    <div className="find-pair">
      <button type="button" className="btn btn-quiet" onClick={dismiss} disabled={pending}>
        {t('agent.dismiss')}
      </button>
      <button type="button" className="btn btn-primary" onClick={chase} disabled={pending}>
        {t('agent.chase')}
      </button>
    </div>
  )

  return (
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: a pointer shortcut only; "Ver detalles" is the keyboard path to the same sheet */}
      <article
        id={`find-${f.postingId}`}
        className={`find-card is-find${highlighted ? ' is-highlighted' : ''}`}
        onClick={openFromCard}
      >
        <div className="find-head">
          <h3 className="find-title">{f.jobTitle}</h3>
          <p className="find-meta">
            {/* No market: the agent guesses it from the location ("Madrid"
                could read "México"), and a guess is not shown as a fact. */}
            <Meta>
              {f.company}
              {ago(f.createdAt, locale)}
            </Meta>
          </p>
        </div>
        <div className="find-fit">
          <FitWord t={t} find={f} />
          <button
            ref={details}
            type="button"
            className="action icon-label find-more"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            {t('agent.details')}
            <IconChevron />
          </button>
        </div>
        {pair}
      </article>
      {/* Outside the card: a click inside the sheet must not bubble into the
          card's own "open" handler. */}
      <Sheet open={open} onClose={() => setOpen(false)} title={f.jobTitle} className="find-sheet">
        <Preview t={t} find={f} />
        {pair}
      </Sheet>
    </>
  )
}

/** "Vale la pena · 7 de 11": the verdict word in its tone, the count muted. */
function FitWord({ t, find: f }: { t: Translate; find: FindCard }) {
  return (
    <p className="find-verdict">
      <span className={`verdict-text-${f.verdict}`}>{t(`verdict.${f.verdict}.label`)}</span>
      {/* total 0 is an extraction that found nothing, not "0 of 0": no count to show. */}
      {f.total > 0 && (
        <span className="find-count">
          {' · '}
          {t('fit.short', { n: f.strong, total: f.total })}
          <span className="sr-only"> {t('agent.fitMandatory')}</span>
        </span>
      )}
    </p>
  )
}

/**
 * The sheet's body: everything here is stored data — the posting's own
 * summary, the verdict, the mandatory requirements as the analysis judged
 * them, and the posting text itself.
 */
function Preview({ t, find: f }: { t: Translate; find: FindCard }) {
  const [full, setFull] = useState(false)
  const verdict = t(`verdict.${f.verdict}.label`)
  return (
    <>
      {f.company && <p className="find-sheet-meta">{f.company}</p>}
      {f.summary && (
        <div className="find-sheet-about">
          <h3 className="ov-label">{t('overview.about')}</h3>
          {/* Verbatim from the posting, so in the posting's language. */}
          <p lang={f.summaryLang}>{f.summary}</p>
        </div>
      )}
      <div className="find-sheet-fit">
        <p className="find-sheet-verdict">
          {f.total > 0 ? t('agent.sheetFit', { verdict, n: f.strong, total: f.total }) : verdict}
        </p>
        {f.groups.map((g) => (
          <ToneGroup key={g.tone} t={t} tone={g.tone} rows={g.rows} />
        ))}
      </div>
      <p className="find-sheet-links">
        <button
          type="button"
          className="action"
          aria-expanded={full}
          onClick={() => setFull((v) => !v)}
        >
          {t(full ? 'agent.hideFull' : 'agent.readFull')}
        </button>
        {f.sourceUrl && (
          // A third-party link the agent found: no referrer.
          <a
            href={f.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="action icon-label"
          >
            {NAMED_SOURCES.has(f.source)
              ? t('agent.openIn', { source: t(`source.${f.source}`) })
              : t('application.openListing')}
            <IconExternal />
          </a>
        )}
      </p>
      {full && <pre className="posting-text">{f.postingRaw}</pre>}
    </>
  )
}

/**
 * A group of more than FOLD_OVER chips shows FOLD_SHOW and "+N más" — so a
 * fold always hides at least three, never a fussy "+1". What is missing
 * never folds.
 */
const FOLD_OVER = 8
const FOLD_SHOW = 6

/**
 * One strength group of the sheet. Te falta always shows every chip — it is
 * the reason to discard — while a long Cubres or Parcial shows its first six
 * and a "+N más" that opens the rest in place (and folds them back).
 */
function ToneGroup({ t, tone, rows }: { t: Translate; tone: GroupTone; rows: ToneRow[] }) {
  const [all, setAll] = useState(false)
  const folds = tone !== 'missing' && rows.length > FOLD_OVER
  const shown = folds && !all ? rows.slice(0, FOLD_SHOW) : rows
  const listId = useId()
  return (
    <div className={`req-tone tone-${tone}`}>
      <h4 className="req-tone-label">
        <span className="req-swatch" aria-hidden="true" />
        {t(`requirements.group.${tone}`)}
      </h4>
      <ul className="chips" id={listId}>
        {shown.map((r, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: keywords may repeat; the list never reorders
          <li key={i}>
            <Chip tone={toneOf(r)} toneLabel={toneWord(t, r)}>
              {r.keyword}
            </Chip>
          </li>
        ))}
        {folds && (
          <li>
            <button
              type="button"
              className="chips-more"
              aria-expanded={all}
              aria-controls={listId}
              onClick={() => setAll((v) => !v)}
            >
              {all ? t('agent.chipsLess') : t('agent.chipsMore', { n: rows.length - FOLD_SHOW })}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
