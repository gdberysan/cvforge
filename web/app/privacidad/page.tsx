'use client'

import { useLocale, useT } from '@/components/i18n/LocaleProvider'
/**
 * The web edition's privacy page: what stays on the device, what goes to
 * Anthropic, what nobody can see, and the limits — written as plainly as
 * the facts allow. Each claim is one the code keeps true: the Content
 * Security Policy (scripts/web-csp.ts), the build receipt
 * (scripts/web-manifest.ts), "Borrar todo" (web/lib/data-card.tsx), the
 * extension's session-only storage (web/extension/src/background.ts).
 * A change to any of those changes this page in the same piece of work.
 */
import { BackLink } from '@/components/ui/BackLink'
import { IconAnalyse, IconClose, IconDocument, IconSend } from '@/components/ui/icons'

/** When this page last changed what it says (bump with the text). */
const UPDATED = '2026-11-25'
const ANTHROPIC_POLICY =
  'https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data'

/** The facts, in three groups: what stays, what leaves, what you trust. */
const GROUPS = [
  { id: 'stays', sections: ['where', 'device', 'erase', 'extension'] },
  { id: 'leaves', sections: ['out', 'drive', 'trial', 'anthropic', 'shots'] },
  { id: 'trust', sections: ['none', 'host', 'trust'] },
] as const

export default function Page() {
  const t = useT()
  const locale = useLocale()
  const date = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${UPDATED}T12:00:00Z`))
  return (
    <main id="main" tabIndex={-1} className="page privacy">
      <BackLink href="/settings" label={t('nav.settings')} />
      <header className="page-head">
        <p className="eyebrow">{t('privacy.eyebrow')}</p>
        <h1 className="page-title">{t('privacy.title')}</h1>
        <p className="page-lede">{t('privacy.lede')}</p>
      </header>
      <DataFlow />
      {GROUPS.map((g) => (
        <section key={g.id} className="board privacy-group" aria-labelledby={`pg-${g.id}`}>
          <header className="board-head">
            <h2 id={`pg-${g.id}`}>{t(`privacy.group.${g.id}`)}</h2>
          </header>
          <div className="privacy-items">
            {g.sections.map((s) => (
              <div key={s} className="privacy-item">
                <h3>{t(`privacy.${s}.title`)}</h3>
                {/* The answer in one line; the exact wording, folded. */}
                <p className="privacy-short">{t(`privacy.${s}.short`)}</p>
                <details className="privacy-more">
                  <summary>{t('privacy.more')}</summary>
                  <p>{t(`privacy.${s}.body`)}</p>
                  {s === 'anthropic' && (
                    <a
                      href={ANTHROPIC_POLICY}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="action"
                    >
                      {t('privacy.anthropic.link')}
                    </a>
                  )}
                </details>
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="privacy-updated">{t('privacy.updated', { date })}</p>
    </main>
  )
}

/**
 * Where your data goes, drawn before it is told: your browser holds it,
 * Anthropic gets only what a call needs, CVForge gets nothing. The same
 * facts as the sections below (where, out, anthropic, none).
 */
function DataFlow() {
  const t = useT()
  return (
    <figure className="data-flow" aria-label={t('privacy.flow.aria')}>
      <div className="flow-node is-you">
        <span className="flow-icon" aria-hidden>
          <IconDocument />
        </span>
        <p className="flow-name">{t('privacy.flow.you')}</p>
        <p className="flow-body">{t('privacy.flow.youBody')}</p>
      </div>
      <div className="flow-link" aria-hidden>
        <span className="flow-line" />
        <span className="flow-label">
          <IconSend />
          {t('privacy.flow.toAnthropic')}
        </span>
      </div>
      <div className="flow-node">
        <span className="flow-icon is-light" aria-hidden>
          <IconAnalyse />
        </span>
        <p className="flow-name">{t('privacy.flow.anthropic')}</p>
        <p className="flow-body">{t('privacy.flow.anthropicBody')}</p>
      </div>
      <div className="flow-node is-none">
        <p className="flow-name">
          <span className="flow-x" aria-hidden>
            <IconClose />
          </span>
          {t('privacy.flow.us')}
        </p>
        <p className="flow-body">{t('privacy.flow.usBody')}</p>
      </div>
    </figure>
  )
}
