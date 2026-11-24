import { IconDocument } from '@/components/ui/icons'
import { companyName } from '@/lib/company-name'
import { type Locale, plural, type Translate } from '@/lib/i18n'
import { marketLabel } from '@/lib/markets'
import type { Market } from '@/lib/schemas'

/**
 * What the role is about, as a card a person scans before reading: the
 * summary's first sentence as its lead, the rest under it, and the facts the
 * analysis already holds (company, country, how many must-haves and
 * nice-to-haves) as chips. Nothing here is new information: no field is
 * guessed from the posting's prose.
 */
export function AboutRole({
  summary,
  lang,
  company,
  market,
  mandatory,
  desirable,
  t,
  locale,
}: {
  summary: string
  lang: string
  company: string
  market?: Market
  mandatory: number
  desirable: number
  t: Translate
  locale: Locale
}) {
  const split = summary.trim().match(/^(.+?[.!?])\s+(\S[\s\S]*)$/)
  const lead = split ? split[1] : summary.trim()
  const rest = split ? split[2] : ''
  const facts = [
    companyName(company),
    market ? marketLabel(market, locale) : '',
    mandatory > 0 ? plural(t, mandatory, 'about.mustHaves') : '',
    desirable > 0 ? plural(t, desirable, 'about.niceToHaves') : '',
  ].filter(Boolean)
  return (
    <div className="story-about">
      <h2 className="story-about-eyebrow">
        <IconDocument />
        {t('overview.about')}
      </h2>
      <p className="story-about-lead" lang={lang}>
        {lead}
      </p>
      {rest && (
        <p className="story-about-rest" lang={lang}>
          {rest}
        </p>
      )}
      {facts.length > 0 && (
        <ul className="story-about-facts">
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
