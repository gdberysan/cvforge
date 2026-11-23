'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteVariantAction } from '@/app/(app)/cvs/actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { ComposeProgress } from '@/components/studio/ComposeProgress'
import { GroundingFlags } from '@/components/studio/GroundingFlags'
import { PdfPager } from '@/components/studio/PdfPager'
import { IconPlus } from '@/components/ui/icons'
import { MarketOptions } from '@/components/ui/MarketOptions'
import { Meta } from '@/components/ui/Meta'
import { Segmented } from '@/components/ui/Segmented'
import type { ComposeStage } from '@/lib/ai/compose'
import { ApiFailure } from '@/lib/api-failure'
import type { CVVariant, VariantBrief } from '@/lib/db/queries/cv-variants'
import { errorText } from '@/lib/i18n'
import { defaultMarket, marketLabel } from '@/lib/markets'
import type { DocumentLanguage, Market } from '@/lib/schemas'
import { readEventStream } from '@/lib/sse-client'
import { printHtml, saveResponse } from '@/lib/ui/download'
import { haptic } from '@/lib/ui/haptics'
import { otherLanguage, pairVariants } from '@/lib/variant-pairs'
import { cvLineText } from '@/lib/verify/line-text'

const LANGUAGES: DocumentLanguage[] = ['es-MX', 'en']

type Compose = { variantId: string | null; stage: ComposeStage | null; seen: ComposeStage[] }

/**
 * Base CVs: a few CVs written once for a kind of role, reused on any
 * application for free. Every one goes through the same compose and checks
 * as a posting's CV; only the target differs. A base CV comes in a language
 * pair (same name and market): one card, an EN | ES switch, and the other
 * language is a translation of this one — the same bullets and citations.
 */
export function VariantsManager({
  variants,
  currentEvidenceHash,
  ownMarkets,
}: {
  variants: CVVariant[]
  currentEvidenceHash: string
  /** The profile's markets: the first is a new base CV's default, all are offered first. */
  ownMarkets: readonly Market[]
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const blank: VariantBrief = {
    name: '',
    focus: '',
    language: locale === 'es' ? 'es-MX' : 'en',
    market: defaultMarket(ownMarkets),
  }
  /** One compose at a time: each is a paid run of a minute or two. */
  const [composing, setComposing] = useState<Compose | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(
    variants.length === 0 ? 'new' : null,
  )
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmRetranslate, setConfirmRetranslate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  /** Cuts a translation made to both sides of a pair, by pair key, to say so on the card. */
  const [trimmedPairs, setTrimmedPairs] = useState<Record<string, number>>({})
  /** The side each pair shows, by pair key; unset follows the interface language. */
  const [sides, setSides] = useState<Record<string, DocumentLanguage>>({})
  const preferred: DocumentLanguage = locale === 'es' ? 'es-MX' : 'en'

  /**
   * One paid run, streamed: a compose (no id = a new base CV) or a translation.
   * Resolves with the id of the row it saved, or null on a failure it has shown.
   */
  async function run(
    url: string,
    body: unknown,
    variantId: string | null,
    onTrimmedSource?: (cuts: number) => void,
  ): Promise<string | null> {
    setError(null)
    setComposing({ variantId, stage: null, seen: [] })
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new ApiFailure(data.error ?? t('studio.failed'), data.code)
      }
      let failure: ApiFailure | null = null
      let finished: string | null = null
      await readEventStream(res.body, (event) => {
        if (event.done) finished = typeof event.id === 'string' ? event.id : ''
        if (typeof event.id === 'string' && !event.done) {
          // The row exists from here on: show the run on its own card.
          setComposing((c) => c && { ...c, variantId: event.id as string })
          router.refresh()
        }
        if (typeof event.stage === 'string') {
          const next = event.stage as ComposeStage
          setComposing((c) => c && { ...c, stage: next, seen: [...new Set([...c.seen, next])] })
        }
        if (typeof event.trimmedSource === 'number') onTrimmedSource?.(event.trimmedSource)
        if (typeof event.error === 'string') {
          failure = new ApiFailure(event.error, event.code as string | undefined)
        }
      })
      if (failure) throw failure
      if (finished === null) throw new ApiFailure(t('studio.failed'), 'unexpected')
      setRefreshKey((k) => k + 1)
      haptic('done')
      return finished
    } catch (e) {
      haptic('failed')
      setError(e instanceof ApiFailure ? errorText(t, e.code, e.message) : t('studio.failed'))
      return null
    } finally {
      setComposing(null)
      router.refresh()
    }
  }

  async function compose(brief: VariantBrief, id?: string) {
    const saved = await run('/api/ai/variant', { ...brief, id }, id ?? null)
    // Only now: on any failure the form comes back holding what was typed.
    if (saved !== null) setEditing(null)
  }

  /**
   * Writes `source` in its other language: over `target` — the other side
   * shown in this pair, after a second click, since it replaces a CV — or,
   * with none, as a new row.
   */
  async function translate(pairKey: string, source: CVVariant, target?: CVVariant) {
    if (target && confirmRetranslate !== target.id) {
      setConfirmRetranslate(target.id)
      return
    }
    setConfirmRetranslate(null)
    setTrimmedPairs(({ [pairKey]: _, ...rest }) => rest)
    const saved = await run(
      '/api/ai/variant/translate',
      { sourceId: source.id, targetId: target?.id },
      source.id,
      (cuts) => setTrimmedPairs((p) => ({ ...p, [pairKey]: cuts })),
    )
    if (saved !== null) setSides((s) => ({ ...s, [pairKey]: otherLanguage(source.language) }))
  }

  async function remove(id: string) {
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      return
    }
    setConfirmDelete(null)
    const result = await deleteVariantAction(id)
    if (!result.ok) setError(errorText(t, result.code, result.error))
    router.refresh()
  }

  async function download(id: string, kind: 'pdf' | 'docx') {
    setError(null)
    try {
      const res = await fetch(`/api/export/${kind}?variantId=${id}`)
      if (kind === 'pdf' && res.status === 503) {
        printHtml((await res.json()).html)
        return
      }
      if (!res.ok) {
        setError(t('studio.downloadFailed'))
        return
      }
      await saveResponse(res, `CV.${kind}`)
    } catch {
      setError(t('studio.downloadFailed'))
    }
  }

  const busy = composing !== null

  return (
    <div className="variant-list">
      {/* Said once for the page, not on every card. */}
      {variants.some((x) => x.cv !== null && x.evidenceHash !== currentEvidenceHash) && (
        <p className="note">{t('variants.stale')}</p>
      )}
      {error && (
        <p role="alert" style={{ color: 'var(--signal-error)' }}>
          {error}
        </p>
      )}

      {pairVariants(variants).map((pair) => {
        const v = pair[sides[pair.key] ?? preferred] ?? pair['es-MX'] ?? pair.en
        if (!v) return null
        const partner = pair[otherLanguage(v.language)]
        const running =
          composing !== null &&
          composing.variantId !== null &&
          (composing.variantId === pair.en?.id || composing.variantId === pair['es-MX']?.id)
        const stale = v.cv !== null && v.evidenceHash !== currentEvidenceHash
        const textOf = cvLineText(v.cv)
        return (
          <article
            key={[pair['es-MX']?.id, pair.en?.id].join('|')}
            className={
              previewing === v.id ? 'board variant-card is-previewing' : 'board variant-card'
            }
          >
            <header className="variant-head">
              <h2 className="variant-name">{v.name}</h2>
              {partner && (
                <div className="variant-sides">
                  <Segmented
                    label={t('variants.pairLanguage')}
                    value={v.language}
                    onChange={(l) => setSides((s) => ({ ...s, [pair.key]: l }))}
                    options={LANGUAGES.filter((l) => pair[l]).map((l) => ({
                      value: l,
                      label: t(`variants.side.${l}`),
                    }))}
                  />
                </div>
              )}
              <p className="variant-meta">
                <Meta>
                  {partner ? '' : t(`variants.lang.${v.language}`)}
                  {marketLabel(v.market, locale)}
                  {v.composedAt
                    ? t('variants.composedOn', {
                        date: new Intl.DateTimeFormat(locale, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                          .format(new Date(v.composedAt))
                          .replace('.', ''),
                      })
                    : t('variants.notComposed')}
                </Meta>
              </p>
              {/* The brief that composes it: the person's own instructions,
                  folded so the card leads with the CV, not the prompt. */}
              <details className="variant-brief">
                <summary>{t('variants.briefLabel')}</summary>
                <p>{v.focus}</p>
              </details>
            </header>

            {trimmedPairs[pair.key] !== undefined && !running && (
              <p className="variant-trimmed-note">
                {t('variants.trimmedPair', { n: trimmedPairs[pair.key] })}
              </p>
            )}

            {running && <ComposeProgress stage={composing.stage} seen={composing.seen} />}

            {editing === v.id ? (
              // Hidden, not unmounted, while it runs: the typed brief survives a failure.
              <div hidden={running}>
                <BriefForm
                  ownMarkets={ownMarkets}
                  initial={v}
                  submitLabel={t('variants.saveRecompose')}
                  onSubmit={(brief) => compose(brief, v.id)}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              !running && (
                <div className="variant-actions">
                  {/* The main row: what this card needs now (recompose when out
                      of date), then looking and downloading. */}
                  <div className="variant-main">
                    {stale || !v.cv ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => compose(v, v.id)}
                      >
                        {v.cv ? t('variants.recompose') : t('variants.compose')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => download(v.id, 'pdf')}
                      >
                        {t('studio.downloadPdf')}
                      </button>
                    )}
                    {v.cv && (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        aria-expanded={previewing === v.id}
                        onClick={() => setPreviewing(previewing === v.id ? null : v.id)}
                      >
                        {previewing === v.id ? t('variants.hide') : t('variants.preview')}
                      </button>
                    )}
                  </div>
                  {/* Everything else, one tap away: the other format, changing
                      it, translating, and the delete set apart at the end. */}
                  <details className="variant-fold">
                    <summary>{t('variants.more')}</summary>
                    <div className="variant-more">
                      {v.cv && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => download(v.id, stale ? 'pdf' : 'docx')}
                        >
                          {t(stale ? 'studio.downloadPdf' : 'studio.downloadDocx')}
                        </button>
                      )}
                      {v.cv && stale && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => download(v.id, 'docx')}
                        >
                          {t('studio.downloadDocx')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => setEditing(v.id)}
                      >
                        {t('variants.edit')}
                      </button>
                      {v.cv && !stale && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => compose(v, v.id)}
                        >
                          {t('variants.recompose')}
                        </button>
                      )}
                      {partner
                        ? partner.cv && (
                            // Replaces this side with a translation of the other.
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={busy}
                              onClick={() => translate(pair.key, partner, v)}
                            >
                              {confirmRetranslate === v.id
                                ? t('variants.retranslateConfirm')
                                : t(`variants.retranslateFrom.${partner.language}`)}
                            </button>
                          )
                        : v.cv && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={busy}
                              onClick={() => translate(pair.key, v)}
                            >
                              {t(`variants.translateTo.${otherLanguage(v.language)}`)}
                            </button>
                          )}
                      <button
                        type="button"
                        className="btn btn-danger-outline variant-delete"
                        disabled={busy}
                        onClick={() => remove(v.id)}
                      >
                        {confirmDelete === v.id
                          ? t('variants.deleteConfirm')
                          : t('variants.delete')}
                      </button>
                    </div>
                  </details>
                </div>
              )
            )}

            {!partner && v.cv && !running && editing !== v.id && (
              <p className="variant-translate-hint">{t('variants.translateHint')}</p>
            )}

            {previewing === v.id && v.cv && !running && (
              <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                {v.report && <GroundingFlags report={v.report} textOf={textOf} />}
                <PdfPager query={`variantId=${v.id}`} refreshKey={refreshKey} />
              </div>
            )}
          </article>
        )
      })}

      {composing?.variantId === null && (
        <ComposeProgress stage={composing.stage} seen={composing.seen} />
      )}
      {editing === 'new' ? (
        <section className="panel" style={{ padding: 'var(--space-6)' }} hidden={busy}>
          <BriefForm
            ownMarkets={ownMarkets}
            initial={blank}
            submitLabel={t('variants.compose')}
            onSubmit={(brief) => compose(brief)}
            onCancel={variants.length > 0 ? () => setEditing(null) : undefined}
          />
        </section>
      ) : (
        // The next CV's place in the grid: it also fills an odd row's gap.
        <button
          type="button"
          className="add-tile variant-new"
          disabled={busy}
          onClick={() => setEditing('new')}
        >
          <IconPlus />
          {t('variants.new')}
        </button>
      )}
    </div>
  )
}

function BriefForm({
  initial,
  ownMarkets,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: VariantBrief
  ownMarkets: readonly Market[]
  submitLabel: string
  onSubmit: (brief: VariantBrief) => void
  onCancel?: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const [brief, setBrief] = useState<VariantBrief>({
    name: initial.name,
    focus: initial.focus,
    language: initial.language,
    market: initial.market,
  })
  const ready = brief.name.trim() !== '' && brief.focus.trim() !== ''

  return (
    <form
      style={{ display: 'grid', gap: 'var(--space-4)' }}
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) onSubmit(brief)
      }}
    >
      <div>
        <label htmlFor="variant-name" className="fact-label" style={{ display: 'block' }}>
          {t('variants.name')}
        </label>
        <input
          id="variant-name"
          className="field"
          maxLength={80}
          value={brief.name}
          placeholder={t('variants.namePlaceholder')}
          onChange={(e) => setBrief({ ...brief, name: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor="variant-focus" className="fact-label" style={{ display: 'block' }}>
          {t('variants.focus')}
        </label>
        <textarea
          id="variant-focus"
          className="field"
          rows={4}
          maxLength={1500}
          value={brief.focus}
          placeholder={t('variants.focusPlaceholder')}
          onChange={(e) => setBrief({ ...brief, focus: e.target.value })}
        />
        <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
          {t('variants.focusHint')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="variant-language" className="fact-label" style={{ display: 'block' }}>
            {t('variants.language')}
          </label>
          <select
            id="variant-language"
            className="flag-select"
            value={brief.language}
            onChange={(e) => setBrief({ ...brief, language: e.target.value as DocumentLanguage })}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {t(`variants.lang.${l}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="variant-market" className="fact-label" style={{ display: 'block' }}>
            {t('variants.market')}
          </label>
          <select
            id="variant-market"
            className="flag-select"
            value={brief.market}
            onChange={(e) => setBrief({ ...brief, market: e.target.value as Market })}
          >
            <MarketOptions own={ownMarkets} current={brief.market} locale={locale} />
          </select>
        </div>
      </div>
      <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
        {t('variants.costHint')}
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button type="submit" className="btn btn-primary" disabled={!ready}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            {t('variants.cancel')}
          </button>
        )}
      </div>
    </form>
  )
}
