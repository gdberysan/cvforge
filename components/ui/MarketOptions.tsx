import { useT } from '@/components/i18n/LocaleProvider'
import type { Locale } from '@/lib/i18n'
import { countryCodes, type Market, marketLabel, REMOTE_MARKETS } from '@/lib/markets'

/**
 * The <option>s of a market picker: the person's own markets first, then the
 * remote ones, then every country by its name in the UI language. `current`
 * is always offered, so a stored value outside the lists still shows.
 * `withCode` prefixes the code ("co · Colombia") for the console's flag,
 * where the closed select shows the code.
 */
export function MarketOptions({
  own,
  current,
  locale,
  withCode = false,
}: {
  own: readonly Market[]
  current?: Market
  locale: Locale
  withCode?: boolean
}) {
  const t = useT()
  const label = (m: Market) =>
    withCode ? `${m} · ${marketLabel(m, locale)}` : marketLabel(m, locale)
  const first = [...new Set(current ? [current, ...own] : own)]
  const remote = REMOTE_MARKETS.filter((m) => !first.includes(m))
  const collator = new Intl.Collator(locale)
  const countries = countryCodes()
    .filter((c) => !first.includes(c))
    .map((c) => ({ c, name: marketLabel(c, locale) }))
    .sort((a, b) => collator.compare(a.name, b.name))
  return (
    <>
      {first.length > 0 && (
        <optgroup label={t('market.group.yours')}>
          {first.map((m) => (
            <option key={m} value={m}>
              {label(m)}
            </option>
          ))}
        </optgroup>
      )}
      {remote.length > 0 && (
        <optgroup label={t('market.group.remote')}>
          {remote.map((m) => (
            <option key={m} value={m}>
              {label(m)}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label={t('market.group.countries')}>
        {countries.map(({ c, name }) => (
          <option key={c} value={c}>
            {withCode ? `${c} · ${name}` : name}
          </option>
        ))}
      </optgroup>
    </>
  )
}
