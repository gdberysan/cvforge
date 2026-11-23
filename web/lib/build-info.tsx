'use client'

/**
 * Which build this browser is running: the commit and the fingerprint from
 * the site's receipt (scripts/web-manifest.ts), with a link to that commit
 * when the build named its source. The receipt is the site's own word, so
 * the real check is outside the page: `npm run web:verify` and
 * `gh attestation verify` (docs/verify-web.md).
 */
import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { SettingsRow } from '@/components/settings/SettingsGroup'

type Receipt = { commit: string; dirty: boolean; source: string | null; fingerprint: string }

export function BuildInfo() {
  const t = useT()
  const [receipt, setReceipt] = useState<Receipt | null | undefined>(undefined)
  useEffect(() => {
    fetch('/build.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setReceipt)
      .catch(() => setReceipt(null))
  }, [])
  if (receipt === undefined) return null
  return (
    <SettingsRow label={t('web.build.title')} hint={t('web.build.hint')}>
      {receipt ? (
        // The fingerprints are for whoever checks the build; folded, they
        // never read as debug output to everyone else.
        <details className="build-fold">
          <summary>{t('web.build.details')}</summary>
          <div className="build-info">
            <dl className="details-rows">
              <div>
                <dt>{t('web.build.commit')}</dt>
                <dd>
                  <code>{receipt.commit.slice(0, 12)}</code>
                </dd>
              </div>
              <div>
                <dt>{t('web.build.fingerprint')}</dt>
                <dd>
                  <code>{receipt.fingerprint.slice(0, 16)}</code>
                </dd>
              </div>
            </dl>
            {receipt.dirty && <span className="tag">{t('web.build.dirty')}</span>}
            {receipt.source && !receipt.dirty && (
              <a
                href={`${receipt.source}/commit/${receipt.commit}`}
                target="_blank"
                rel="noreferrer noopener"
                className="action"
              >
                {t('web.build.see')}
              </a>
            )}
          </div>
        </details>
      ) : (
        <p className="build-info">{t('web.build.none')}</p>
      )}
    </SettingsRow>
  )
}
