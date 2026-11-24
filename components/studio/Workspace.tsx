'use client'

import { type ReactNode, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconAnswers, IconDocument, IconLetter, IconMessage } from '@/components/ui/icons'
import type {
  CompanionKind,
  CoverLetter,
  CVContent,
  EvidenceItem,
  EvidenceMapping,
  GroundingReport,
  RecruiterMessage,
  Requirement,
  ScreeningSet,
} from '@/lib/schemas'
import { CompanionPanel } from './CompanionPanel'
import { DocumentsLocked, DocumentsSent } from './GroundingFlags'
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
  sourceLabels,
  initialCv,
  initialCvReport,
  initialCoverLetter,
  initialScreening,
  initialRecruiterMessage,
  variants,
  requirements,
  mappings,
  sent = false,
  locked = false,
}: {
  applicationId: string
  company: string
  documentLanguage: 'en' | 'es-MX'
  evidence: EvidenceItem[]
  /** Evidence id to where it came from, for labels instead of ids. */
  sourceLabels: Record<string, string>
  initialCv: CVContent | null
  initialCvReport: GroundingReport | null
  initialCoverLetter: CompanionState<CoverLetter>
  initialScreening: CompanionState<ScreeningSet>
  initialRecruiterMessage: CompanionState<RecruiterMessage>
  /** Composed base CVs in this application's document language. */
  variants: { id: string; label: string; stale: boolean }[]
  requirements?: Requirement[]
  mappings?: EvidenceMapping[]
  /** The application has been sent: verification flags speak in the past. */
  sent?: boolean
  /** Sent or settled: no paid moves on the documents. */
  locked?: boolean
}) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('cv')

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'cv', label: t('workspace.tab.cv'), icon: <IconDocument /> },
    { id: 'coverLetter', label: t('workspace.tab.coverLetter'), icon: <IconLetter /> },
    { id: 'screening', label: t('workspace.tab.screening'), icon: <IconAnswers /> },
    { id: 'recruiterMessage', label: t('workspace.tab.recruiterMessage'), icon: <IconMessage /> },
  ]

  return (
    <DocumentsSent.Provider value={sent}>
      <DocumentsLocked.Provider value={locked}>
        <div>
          {/* Words, not facts: the sans, like every other control. On a phone
          the bar scrolls sideways inside itself, never the page. */}
          <div role="tablist" aria-label={t('workspace.tabsAria')} className="doc-tabs">
            {tabs.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className="doc-tab"
              >
                {icon}
                <span>{label}</span>
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
              sourceLabels={sourceLabels}
              initialCv={initialCv}
              initialReport={initialCvReport}
              variants={variants}
              requirements={requirements}
              mappings={mappings}
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
      </DocumentsLocked.Provider>
    </DocumentsSent.Provider>
  )
}
