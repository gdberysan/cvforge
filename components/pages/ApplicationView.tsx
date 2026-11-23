import { AppMeta } from '@/components/application/AppMeta'
import { CompanyAliases } from '@/components/application/CompanyAliases'
import { DecideActions, RestoreButton } from '@/components/application/DecideActions'
import { DeleteApplication } from '@/components/application/DeleteApplication'
import { FocusOnStep } from '@/components/application/FocusOnStep'
import { FollowUpDraft } from '@/components/application/FollowUpDraft'
import { GapEntry } from '@/components/application/GapEntry'
import { GapFill } from '@/components/application/GapFill'
import { InterviewCard } from '@/components/application/InterviewCard'
import { KitProgress } from '@/components/application/KitProgress'
import { MailThread } from '@/components/application/MailThread'
import { MeetingPeople } from '@/components/application/MeetingPeople'
import { PostingSheet } from '@/components/application/PostingSheet'
import { Reanalyse } from '@/components/application/Reanalyse'
import { RequirementChips } from '@/components/application/RequirementChips'
import { Timeline } from '@/components/application/Timeline'
import { VerdictBand } from '@/components/application/VerdictBand'
import { VerdictPanel } from '@/components/application/VerdictPanel'
import { YouList } from '@/components/application/YouList'
import { ActionGrid } from '@/components/pipeline/ActionGrid'
import { OutcomeButtons } from '@/components/pipeline/OutcomeButtons'
import { StageTrack } from '@/components/pipeline/StageTrack'
import { PrepStep } from '@/components/prep/PrepStep'
import { Workspace } from '@/components/studio/Workspace'
import { BackLink } from '@/components/ui/BackLink'
import { IconCheck } from '@/components/ui/icons'
import { Meta } from '@/components/ui/Meta'
import type { Step } from '@/lib/application-steps'
import { trackAskKey } from '@/lib/call-line'
import { companyName } from '@/lib/company-name'
import type { Locale, Translate } from '@/lib/i18n'
import { marketLabel } from '@/lib/markets'
import type { ApplicationData } from '@/lib/pages/application'
import { latestOutcome, stageFacts, stagePosition } from '@/lib/stage'

/** One application's screen, from lib/pages/application.ts's data. */
export function ApplicationView({
  data,
  t,
  locale,
}: {
  data: ApplicationData
  t: Translate
  locale: Locale
}) {
  const {
    application,
    gapdelta,
    kit,
    mailAgent,
    postingUrl,
    profile,
    evidence,
    stale,
    coverLetter,
    screening,
    recruiterMessage,
    step,
    working,
    gapSelection,
    hasGaps,
    archived,
    labels,
    chipItems,
    sentence,
    track,
    prepView,
  } = data
  const nextHref = (target: Step | null) =>
    target ? `/application/${application.id}?step=${target}` : ''
  const { ended, end, statusLine } = data
  // Tone of the status chip: how it ended, or where it stands. A person
  // answering is good news in the same green the history gives it; sent and
  // still waiting is the warm tone.
  const statusTone =
    end === 'offer'
      ? 'ok'
      : end === 'rejected'
        ? 'missing'
        : ended
          ? 'quiet'
          : data.sent && stageFacts(application.outcomes).replied
            ? 'ok'
            : data.sent
              ? 'sent'
              : 'open'
  const showGaps = working && !data.sent && !ended && hasGaps && profile !== null
  const showSend = working && !data.sent
  // Once the verdict is no longer the first block, the band under the
  // stages says it, and the panel further down keeps only its details.
  const banded = ended || end === 'offer' || data.sent || data.savedCv !== null

  const decideBlock = (
    <>
      <section className="story-card" id="s-decide" tabIndex={-1} aria-label={t('steps.decide')}>
        {stale && !ended && !data.sent && (
          <Reanalyse postingRaw={application.postingRaw} market={application.market} />
        )}
        {/* The answer and what the role is about, side by side on a wide screen. */}
        <div className={data.summary ? 'decide-top has-about' : 'decide-top'}>
          <VerdictPanel coverage={application.coverage} sentence={sentence} headless={banded} />
          {data.summary && (
            <div className="story-about">
              <h2>{t('overview.about')}</h2>
              <p lang={application.documentLanguage}>{data.summary}</p>
            </div>
          )}
        </div>
        {chipItems.length > 0 && (
          <details className="story-why">
            <summary>{t('story.why')}</summary>
            <RequirementChips items={chipItems} />
          </details>
        )}
        {/* The decision only exists before you go for it. */}
        {!working && !archived && !data.sent && (
          <DecideActions
            applicationId={application.id}
            archived={archived}
            nextHref={nextHref(hasGaps ? 'gaps' : 'docs')}
            nextLabel={t('decide.pursue')}
          />
        )}
      </section>
    </>
  )
  const gapsBlock = (
    <>
      {showGaps && profile && (
        <section className="story-card" id="s-gaps" tabIndex={-1} aria-labelledby="h-gaps">
          <h2 id="h-gaps" className="story-h">
            {t('story.gaps')}
            <span className="count">{gapSelection.primary.length}</span>
          </h2>
          <p className="story-lede">{t('story.gapsLede')}</p>
          <GapEntry
            t={t}
            applicationId={application.id}
            coverage={application.coverage}
            requirements={application.requirements}
            mappings={application.mappings}
            gapdelta={gapdelta}
            showLink={false}
          />
          <GapFill
            applicationId={application.id}
            selection={gapSelection}
            roles={profile.experience}
            postingRaw={application.postingRaw}
            market={application.market}
          />
        </section>
      )}
    </>
  )
  const docsBlock = (
    <>
      {/* A discarded application with a CV keeps it reachable. */}
      {(working || (archived && data.savedCv !== null)) && !(ended && data.savedCv === null) && (
        <section className="story-card" id="s-docs" tabIndex={-1} aria-labelledby="h-docs">
          <h2 id="h-docs" className="story-h">
            {companyName(application.company)
              ? t('story.cv', { company: companyName(application.company) })
              : t('story.cvPlain')}
          </h2>
          {kit === 'working' ? (
            // The server is writing the kit a chase asked for; a second
            // "Generar" here would pay for the same documents twice.
            <KitProgress applicationId={application.id} />
          ) : (
            <>
              {(kit === 'retry' || kit === 'failed') && (
                <p className="story-lede">{t(kit === 'retry' ? 'kit.retry' : 'kit.failed')}</p>
              )}
              <Workspace
                applicationId={application.id}
                company={application.company}
                documentLanguage={application.documentLanguage}
                evidence={evidence}
                sourceLabels={labels}
                initialCv={data.savedCv}
                initialCvReport={data.savedReport}
                initialCoverLetter={coverLetter}
                initialScreening={screening}
                initialRecruiterMessage={recruiterMessage}
                variants={data.variants}
                sent={data.sent}
                locked={data.sent || ended}
              />
            </>
          )}
        </section>
      )}
    </>
  )
  const sendBlock = (
    <>
      {showSend && (
        <section className="story-card" id="s-send" tabIndex={-1} aria-labelledby="h-send">
          <h2 id="h-send" className="story-h">
            {t('story.send')}
          </h2>
          <ol className="checklist">
            <li className={data.savedCv !== null ? 'is-done' : ''}>
              {data.savedCv !== null ? (
                <>
                  {t('send.cvReady')}{' '}
                  <Meta>
                    <a
                      href={`/api/export/pdf?applicationId=${application.id}`}
                      className="action"
                      download
                    >
                      PDF
                    </a>
                    <a
                      href={`/api/export/docx?applicationId=${application.id}`}
                      className="action"
                      download
                    >
                      DOCX
                    </a>
                  </Meta>
                </>
              ) : (
                t('send.cvMissing')
              )}
            </li>
            <li className={coverLetter ? 'is-done' : ''}>
              {coverLetter ? t('send.letterReady') : t('send.letterOptional')}
            </li>
            <li>
              {postingUrl ? (
                <>
                  {t('send.applyAt')}{' '}
                  <a href={postingUrl} target="_blank" rel="noreferrer noopener" className="action">
                    {t('application.openPosting')}
                  </a>
                </>
              ) : (
                t('send.applyNoLink')
              )}
            </li>
          </ol>
          <OutcomeButtons applicationId={application.id} status={application.status} />
        </section>
      )}
    </>
  )
  const prepBlock = (
    <>
      {/* After an offer the interviews are behind you: no prep card. */}
      {prepView && end !== 'offer' && (
        <section className="story-card" id="s-prep" tabIndex={-1} aria-labelledby="h-prep">
          <h2 id="h-prep" className="story-h">
            {t('prep.title')}
          </h2>
          <PrepStep view={prepView} />
        </section>
      )}
    </>
  )
  const trackBlock = (
    <>
      {track && (
        <section
          className="story-card seguimiento"
          id="s-track"
          tabIndex={-1}
          aria-labelledby="h-track"
        >
          {/* Settled with nothing left to do: the card is the story, not a promise. */}
          <h2 id="h-track" className="story-h">
            {track.actions.length === 0 && !data.draft
              ? end === 'offer'
                ? t('track.titleOffer')
                : ended
                  ? t('track.titleEnded')
                  : t('track.title')
              : t('track.title')}
          </h2>
          {track.interview && (
            <InterviewCard applicationId={application.id} view={track.interview} />
          )}
          {track.interview && (
            <MeetingPeople
              applicationId={application.id}
              {...(data.meeting ?? { people: [], meetingUrl: null })}
            />
          )}
          {/* A drafted follow-up is the suggested next move: it comes before
              the outcome buttons. */}
          <FollowUpDraft applicationId={application.id} draft={data.draft} />
          <ActionGrid
            applicationId={application.id}
            actions={track.actions}
            prompt={t(
              track.late ? 'track.askLate' : trackAskKey(track.actions.length, track.interview),
            )}
            // Right under the card's title, a second heading only stacks two;
            // after a draft or an interview it starts a new part.
            heading={Boolean(data.draft || track.interview)}
          />
          {track.mail ? (
            <>
              <MailThread
                applicationId={application.id}
                cards={track.mail.cards}
                count={track.mail.count}
                empty={t(track.mail.connected ? 'thread.emptyConnected' : 'thread.emptyNever')}
              />
              <YouList items={track.mail.you} />
            </>
          ) : (
            // No agent (or the demo): the plain log is the whole story.
            <section className="seg-block" aria-labelledby="h-history">
              <h3 id="h-history" className="seg-heading">
                {t('track.history')}
              </h3>
              <Timeline outcomes={application.outcomes} locale={locale} />
            </section>
          )}
        </section>
      )}
    </>
  )

  return (
    <main id="main" tabIndex={-1} className="page story">
      <FocusOnStep step={step} />
      <BackLink href="/" label={t('nav.today')} />
      <header className="story-head">
        <h1 className="story-title">{application.jobTitle}</h1>
        <AppMeta
          facts={[
            companyName(application.company),
            marketLabel(application.market, locale),
            t(`overview.cvLang.${application.documentLanguage}`),
          ]}
          last={
            <PostingSheet
              postingRaw={application.postingRaw}
              postingUrl={postingUrl}
              analysedAt={application.createdAt}
            />
          }
        />
        <div className="status-row">
          <p className={`status-chip tone-${statusTone}${end === 'offer' ? ' is-offer' : ''}`}>
            {end === 'offer' && <IconCheck />}
            {statusLine}
          </p>
          {archived && <RestoreButton applicationId={application.id} />}
        </div>
        <StageTrack
          {...stagePosition(application.status, latestOutcome(application.outcomes), {
            ...stageFacts(application.outcomes),
            hasCv: data.savedCv !== null,
          })}
        />
        {/* Once the verdict is no longer the first block, its answer stays
            in sight here. */}
        {banded && (
          <VerdictBand
            coverage={application.coverage}
            sentence={sentence}
            href={nextHref('decide')}
            t={t}
          />
        )}
      </header>

      {/* Where the application stands decides the order: the next thing
          to do comes first (a CV ready to send, a follow-up, a call to
          prepare), the record after it, the verdict last once it is sent. */}
      {ended || end === 'offer' ? (
        // Settled (an offer, a no, withdrawn): what happened leads; the
        // interview prep is past.
        <>
          {trackBlock}
          {docsBlock}
          {prepBlock}
          {decideBlock}
        </>
      ) : data.sent ? (
        <>
          {prepBlock}
          {trackBlock}
          {docsBlock}
          {decideBlock}
        </>
      ) : data.savedCv !== null ? (
        <>
          {sendBlock}
          {docsBlock}
          {decideBlock}
          {gapsBlock}
        </>
      ) : (
        <>
          {decideBlock}
          {gapsBlock}
          {docsBlock}
          {sendBlock}
        </>
      )}

      {/* One quiet line at the end: the other company names (only the job
          agent's mail pass reads them) and, destructive, the delete. */}
      <div className="seg-foot story-foot">
        {mailAgent && data.sent && (
          <details className="seg-details" open={application.companyAliases.length > 0}>
            <summary>{t('aliases.section')}</summary>
            <CompanyAliases applicationId={application.id} aliases={application.companyAliases} />
          </details>
        )}
        <DeleteApplication applicationId={application.id} />
      </div>
    </main>
  )
}
