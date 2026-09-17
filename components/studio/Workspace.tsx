'use client'

import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import type {
  CompanionKind,
  CoverLetter,
  CVContent,
  EvidenceItem,
  GroundingReport,
  RecruiterMessage,
  ScreeningSet,
} from '@/lib/schemas'
import { CompanionPanel } from './CompanionPanel'
import { Studio } from './Studio'

type Tab = 'cv' | CompanionKind

export type CompanionState<T> = { document: T; report: GroundingReport } | null

/**
 * The whole application workspace: the CV and its companions as tabs over
 * one shared analysis, because they are one story told four ways — same
 * mappings, same evidence, same verification.
 */
export function Workspace({
  applicationId,
  company,
  documentLanguage,
  evidence,
  initialCv,
  initialCvReport,
  initialCoverLetter,
  initialScreening,
  initialRecruiterMessage,
}: {
  applicationId: string
  company: string
  documentLanguage: 'en' | 'es-MX'
  evidence: EvidenceItem[]
  initialCv: CVContent | null
  initialCvReport: GroundingReport | null
  initialCoverLetter: CompanionState<CoverLetter>
  initialScreening: CompanionState<ScreeningSet>
  initialRecruiterMessage: CompanionState<RecruiterMessage>
}) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('cv')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'cv', label: t('workspace.tab.cv') },
    { id: 'coverLetter', label: t('workspace.tab.coverLetter') },
    { id: 'screening', label: t('workspace.tab.screening') },
    { id: 'recruiterMessage', label: t('workspace.tab.recruiterMessage') },
  ]

  return (
    <div>
      <div
        role="tablist"
        aria-label={t('workspace.tabsAria')}
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: 'var(--space-6)',
        }}
      >
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="fact"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '10px 12px',
              color: tab === id ? 'var(--text-strong)' : 'var(--text-muted)',
              borderBottom: `2px solid ${tab === id ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Panels stay mounted and hide — unmounting them discarded freshly
          generated documents the moment you peeked at another tab. */}
      <div hidden={tab !== 'cv'}>
        <Studio
          applicationId={applicationId}
          company={company}
          documentLanguage={documentLanguage}
          evidence={evidence}
          initialCv={initialCv}
          initialReport={initialCvReport}
        />
      </div>
      <div hidden={tab !== 'coverLetter'}>
        <CompanionPanel
          kind="coverLetter"
          applicationId={applicationId}
          initialDocument={initialCoverLetter?.document ?? null}
          initialReport={initialCoverLetter?.report ?? null}
        />
      </div>
      <div hidden={tab !== 'screening'}>
        <CompanionPanel
          kind="screening"
          applicationId={applicationId}
          initialDocument={initialScreening?.document ?? null}
          initialReport={initialScreening?.report ?? null}
        />
      </div>
      <div hidden={tab !== 'recruiterMessage'}>
        <CompanionPanel
          kind="recruiterMessage"
          applicationId={applicationId}
          initialDocument={initialRecruiterMessage?.document ?? null}
          initialReport={initialRecruiterMessage?.report ?? null}
        />
      </div>
    </div>
  )
}
