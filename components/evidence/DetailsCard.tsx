'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { saveDetailsAction } from '@/app/(app)/evidence/actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { IconClose } from '@/components/ui/icons'
import { MarketOptions } from '@/components/ui/MarketOptions'
import { Meta } from '@/components/ui/Meta'
import { errorText } from '@/lib/i18n'
import { type Market, marketLabel } from '@/lib/markets'
import type { MasterProfile } from '@/lib/schemas'
import { haptic } from '@/lib/ui/haptics'
import { EDIT_DETAILS_EVENT } from './ShowEvidenceButton'

type Auth = { country: string; status: string }

/** Every IANA zone the runtime knows; the current one first if it is not. */
function zones(current: string): string[] {
  const all = Intl.supportedValuesOf('timeZone')
  return all.includes(current) ? all : [current, ...all]
}

type SkillDraft = { category: string; items: string }
const list = (text: string) =>
  text
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

/**
 * Who the person is: the titles they aim at, their summary and skills (in
 * their own words — a CV draws on them as facts they stated), where they
 * are, the markets their CVs aim at, and where they may work. A posting's
 * location, timezone and work-authorization lines are judged against these,
 * so a wrong time zone can turn a fit into a blocker.
 */
export function DetailsCard({ profile }: { profile: MasterProfile }) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [location, setLocation] = useState(profile.basics.location)
  const [timezone, setTimezone] = useState(profile.basics.timezone)
  const [markets, setMarkets] = useState<Market[]>(profile.preferences.markets)
  const [auth, setAuth] = useState<Auth[]>(profile.workAuthorization)
  const [titles, setTitles] = useState(profile.preferences.targetTitles.join(', '))
  const [summary, setSummary] = useState(profile.summary)
  const [skills, setSkills] = useState<SkillDraft[]>(
    profile.skills.map((g) => ({ category: g.category, items: g.items.join(', ') })),
  )
  const [adding, setAdding] = useState<Market>('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  // The strength card's "complete your profile": open here, at that part.
  useEffect(() => {
    const on = (e: Event) => {
      const part = (e as CustomEvent<string>).detail
      setEditing(true)
      requestAnimationFrame(() => {
        const el = document.getElementById(`details-${part}`)
        el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
      })
    }
    window.addEventListener(EDIT_DETAILS_EVENT, on)
    return () => window.removeEventListener(EDIT_DETAILS_EVENT, on)
  }, [])

  const marketNames = profile.preferences.markets.map((m) => marketLabel(m, locale))
  const authLine = profile.workAuthorization.map((a) => a.country).join(', ')

  if (!editing) {
    // Who this is, in one line: where you are, your clock, where your CVs
    // aim, where you may work. The labels live in the form; read back, the
    // facts speak for themselves.
    return (
      <div className="details-card is-read">
        <div className="about-main">
          <h2 className="about-name">{profile.basics.fullName}</h2>
          <p className="about-facts">
            <Meta>
              {profile.basics.location || t('details.noLocation')}
              {zoneOffset(profile.basics.timezone, locale)}
              {marketNames.length
                ? t('details.marketsShort', { list: marketNames.join(', ') })
                : t('details.noMarkets')}
              {authLine ? t('details.authShort', { list: authLine }) : t('details.noAuth')}
            </Meta>
          </p>
          {/* Three titles say where you are headed; a list of twenty is a wall. */}
          {profile.preferences.targetTitles.length > 0 && (
            <p className="about-facts">
              {t('details.titlesLine', {
                list:
                  profile.preferences.targetTitles.length > 3
                    ? t('details.titlesMore', {
                        list: profile.preferences.targetTitles.slice(0, 3).join(', '),
                        n: profile.preferences.targetTitles.length - 3,
                      })
                    : profile.preferences.targetTitles.join(', '),
              })}
            </p>
          )}
        </div>
        <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>
          {t('details.edit')}
        </button>
      </div>
    )
  }

  const cancel = () => {
    setLocation(profile.basics.location)
    setTimezone(profile.basics.timezone)
    setMarkets(profile.preferences.markets)
    setAuth(profile.workAuthorization)
    setTitles(profile.preferences.targetTitles.join(', '))
    setSummary(profile.summary)
    setSkills(profile.skills.map((g) => ({ category: g.category, items: g.items.join(', ') })))
    setError(null)
    setEditing(false)
  }

  return (
    <div className="role-form details-card">
      <div className="stack details-fields">
        <div>
          <label htmlFor="details-titles" className="fact-label block">
            {t('details.titles')}
          </label>
          <AutoTextarea
            id="details-titles"
            value={titles}
            onChange={(e) => setTitles(e.target.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault()
            }}
            placeholder={t('details.titlesPlaceholder')}
            className="field field-gap"
          />
          <p className="fact-label is-muted">{t('details.titlesHint')}</p>
        </div>

        <div>
          <label htmlFor="details-summary" className="fact-label block">
            {t('details.summary')}
          </label>
          <AutoTextarea
            id="details-summary"
            value={summary}
            minRows={3}
            onChange={(e) => setSummary(e.target.value)}
            className="field field-gap"
          />
          <p className="fact-label is-muted">{t('details.summaryHint')}</p>
        </div>

        <fieldset className="details-group">
          <legend id="details-skills" tabIndex={-1} className="fact-label">
            {t('details.skills')}
          </legend>
          <p className="fact-label is-muted">{t('details.skillsHint')}</p>
          {skills.map((g, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own
            <div key={i} className="details-skill-row">
              <input
                aria-label={t('details.skillGroup')}
                value={g.category}
                placeholder={t('details.skillGroupPlaceholder')}
                onChange={(e) =>
                  setSkills(
                    skills.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)),
                  )
                }
                className="field"
              />
              <input
                aria-label={t('details.skillItems')}
                value={g.items}
                placeholder={t('details.skillItemsPlaceholder')}
                onChange={(e) =>
                  setSkills(skills.map((x, j) => (j === i ? { ...x, items: e.target.value } : x)))
                }
                className="field"
              />
              <button
                type="button"
                className="row-remove"
                aria-label={t('details.remove', { item: g.category || t('details.skillGroup') })}
                onClick={() => setSkills(skills.filter((_, j) => j !== i))}
              >
                <IconClose />
              </button>
            </div>
          ))}
          {skills.length < 20 && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setSkills([...skills, { category: '', items: '' }])}
            >
              {t('details.addSkillGroup')}
            </button>
          )}
        </fieldset>

        <div>
          <label htmlFor="details-location" className="fact-label block">
            {t('details.location')}
          </label>
          <input
            id="details-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t('details.locationPlaceholder')}
            className="field field-gap"
          />
        </div>

        <div>
          <label htmlFor="details-zone" className="fact-label block">
            {t('details.timezone')}
          </label>
          <select
            id="details-zone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="field field-gap"
          >
            {zones(timezone).map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <p className="fact-label is-muted">{t('details.timezoneHint')}</p>
        </div>

        <fieldset className="details-group">
          <legend className="fact-label">{t('details.markets')}</legend>
          <p className="fact-label is-muted">{t('details.marketsHint')}</p>
          <ul className="details-list">
            {markets.map((m, i) => (
              <li key={m}>
                {marketLabel(m, locale)}
                {i === 0 && <span className="fact-label is-muted"> · {t('details.primary')}</span>}{' '}
                <button
                  type="button"
                  className="row-remove"
                  aria-label={t('details.remove', { item: marketLabel(m, locale) })}
                  onClick={() => setMarkets(markets.filter((x) => x !== m))}
                >
                  <IconClose />
                </button>
              </li>
            ))}
          </ul>
          {markets.length < 8 && (
            <div className="details-add">
              <label htmlFor="details-add-market" className="sr-only">
                {t('details.addMarket')}
              </label>
              <select
                id="details-add-market"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                className="field"
              >
                <option value="">{t('details.addMarket')}</option>
                <MarketOptions own={[]} locale={locale} />
              </select>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={!adding || markets.includes(adding)}
                onClick={() => {
                  setMarkets([...markets, adding])
                  setAdding('')
                }}
              >
                {t('details.add')}
              </button>
            </div>
          )}
        </fieldset>

        <fieldset className="details-group">
          <legend className="fact-label">{t('details.auth')}</legend>
          <p className="fact-label is-muted">{t('details.authHint')}</p>
          {auth.map((a, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own
            <div key={i} className="details-auth-row">
              <input
                aria-label={t('details.authCountry')}
                value={a.country}
                placeholder={t('details.authCountry')}
                onChange={(e) =>
                  setAuth(auth.map((x, j) => (j === i ? { ...x, country: e.target.value } : x)))
                }
                className="field"
              />
              <input
                aria-label={t('details.authStatus')}
                value={a.status}
                placeholder={t('details.authStatusPlaceholder')}
                onChange={(e) =>
                  setAuth(auth.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)))
                }
                className="field"
              />
              <button
                type="button"
                className="row-remove"
                aria-label={t('details.remove', { item: a.country || t('details.authCountry') })}
                onClick={() => setAuth(auth.filter((_, j) => j !== i))}
              >
                <IconClose />
              </button>
            </div>
          ))}
          {auth.length < 10 && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setAuth([...auth, { country: '', status: '' }])}
            >
              {t('details.addAuth')}
            </button>
          )}
        </fieldset>
      </div>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <div className="role-form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={isSaving}
          onClick={() =>
            startSave(async () => {
              const result = await saveDetailsAction({
                location,
                timezone,
                markets,
                workAuthorization: auth.filter((a) => a.country.trim() !== ''),
                summary,
                targetTitles: list(titles),
                skills: skills
                  .map((g) => ({ category: g.category.trim(), items: list(g.items) }))
                  .filter((g) => g.items.length > 0),
              })
              if (!result.ok) {
                setError(errorText(t, result.code, result.error))
                return
              }
              haptic('confirm')
              setEditing(false)
              router.refresh()
            })
          }
        >
          {isSaving ? t('details.saving') : t('details.save')}
        </button>
        <button type="button" className="btn btn-quiet" onClick={cancel}>
          {t('addRole.cancel')}
        </button>
      </div>
    </div>
  )
}

/**
 * The zone in words — "Hora estándar central", "Colombia Standard Time" —
 * the way a posting's "overlap with CST" is written, never "GMT-6".
 */
function zoneOffset(zone: string, locale: string): string {
  if (!zone) return '—'
  try {
    const name = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
      timeZone: zone,
      timeZoneName: 'longGeneric',
    })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value
    return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : zone
  } catch {
    return zone
  }
}
