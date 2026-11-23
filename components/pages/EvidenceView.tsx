import Link from 'next/link'
import { EvidenceEditor } from '@/components/evidence/EvidenceEditor'
import { StrengthCard } from '@/components/evidence/StrengthCard'
import { IconDocument, IconImport } from '@/components/ui/icons'
import type { Translate } from '@/lib/i18n'
import type { EvidenceData } from '@/lib/pages/evidence'

/** The Experiencia screen, from lib/pages/evidence.ts's data. */
export function EvidenceView({ data, t }: { data: EvidenceData; t: Translate }) {
  return (
    <main id="main" tabIndex={-1} className="page">
      {/* Mi experiencia (friendly redesign 2026-11-21): what this place is in
          one sentence, then the two things you reach from here — another CV
          to import, and the base CVs made from all of this. */}
      <header className="exp-head">
        <h1 className="exp-title">{t('nav.evidence')}</h1>
        <p className="exp-lede">{t('evidence.lede')}</p>
        {/* Secondary doors, so they read as links, not as the first thing
            to press: the strength card below is that. */}
        <p className="exp-links">
          <Link href="/cvs" className="action icon-label">
            <IconDocument />
            {t('evidence.cvsLink')}
          </Link>
          <Link href="/evidence/import" className="action icon-label">
            <IconImport />
            {t('evidence.importLink')}
          </Link>
        </p>
      </header>
      {/* One column, read top to bottom: how it stands and the one fix, who
          you are, then your jobs. The jobs are their own index. */}
      <div className="exp-body">
        <StrengthCard strength={data.strength} t={t} />
        <EvidenceEditor
          profile={data.profile}
          evidence={data.evidence}
          interviewSessions={data.interviewSessions}
        />
      </div>
    </main>
  )
}
