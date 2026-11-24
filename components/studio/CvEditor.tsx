'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { checkCvEditAction, saveCvEditAction } from '@/app/(app)/application/[id]/cv-actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { reportFlags } from '@/components/studio/GroundingFlags'
import type { CvPatch } from '@/lib/ai/edit-cv'
import { readSkills, skillsText } from '@/lib/cv-edit-text'
import type { CVContent, GroundingReport } from '@/lib/schemas'
import { haptic } from '@/lib/ui/haptics'

/**
 * The CV's words, editable in place: the summary, every bullet, the skills.
 * Facts stay where they are (employers, dates, titles, citations are not
 * offered). As you type, the code checks run again on the server (figures,
 * citations, claimed gaps, unsupported claims) and a problem shows under the
 * line it is about. A line you changed has no model verdict, and says so.
 */
/** Rows to show a line whole on a phone (browsers without field-sizing). */
const rowsFor = (text: string) => Math.max(2, Math.ceil(text.length / 34))

/** The longest line the server accepts; the field stops there instead of the save failing. */
const MAX_TEXT = 2000

export function CvEditor({
  applicationId,
  cv,
  onSaved,
  onCancel,
}: {
  applicationId: string
  cv: CVContent
  onSaved: (cv: CVContent, report: GroundingReport) => void
  onCancel: () => void
}) {
  const t = useT()
  const [summary, setSummary] = useState(cv.summary)
  const [bullets, setBullets] = useState<Record<string, string | null>>({})
  // One skill per line: a skill may hold a comma ("Google Ads (Search, Shopping)").
  const [skills, setSkills] = useState(cv.skills.map((s) => ({ ...s, text: skillsText(s.items) })))
  const [report, setReport] = useState<GroundingReport | null>(null)
  const [edited, setEdited] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const patch: CvPatch = useMemo(
    () => ({
      // Only what changed is sent; an untouched line is never rewritten.
      summary: summary === cv.summary ? undefined : summary,
      bullets,
      skills: skills.map((s) => ({
        category: s.category,
        items: readSkills(s.text),
      })),
    }),
    [summary, bullets, skills, cv.summary],
  )

  // Checked a moment after typing stops; an older answer never overwrites a newer one.
  const asked = useRef(0)
  useEffect(() => {
    const n = ++asked.current
    const timer = setTimeout(async () => {
      const out = await checkCvEditAction(applicationId, patch).catch(() => null)
      if (n !== asked.current || !out?.ok) return
      setReport(out.report)
      setEdited(new Set(out.edited))
    }, 500)
    return () => clearTimeout(timer)
  }, [applicationId, patch])

  const flags = useMemo(() => (report ? reportFlags(report, t) : []), [report, t])
  const flagsFor = (id: string) => flags.filter((f) => f.id === id)

  async function save() {
    setSaving(true)
    setError(false)
    const out = await saveCvEditAction(applicationId, patch).catch(() => null)
    setSaving(false)
    if (!out?.ok) {
      setError(true)
      haptic('failed')
      return
    }
    haptic('confirm')
    onSaved(out.cv, out.report)
  }

  const line = (id: string) => (
    <>
      {flagsFor(id).map((f) => (
        <p key={f.key} className="cv-edit-flag" role="status">
          {f.text}
        </p>
      ))}
      {edited.has(id) && flagsFor(id).length === 0 && (
        <p className="cv-edit-note">{t('cvEdit.yours')}</p>
      )}
    </>
  )

  return (
    <div className="cv-edit">
      <p className="cv-edit-lede">{t('cvEdit.lede')}</p>

      <label className="cv-edit-field">
        <span>{t('cvEdit.summary')}</span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={rowsFor(summary)}
          maxLength={MAX_TEXT}
        />
        {line('summary')}
      </label>

      {[...cv.experience, ...cv.projects].map((block) => {
        const key = 'experienceId' in block ? block.experienceId : block.projectId
        const heading = 'experienceId' in block ? `${block.title} · ${block.company}` : block.name
        return (
          <fieldset key={key} className="cv-edit-block">
            <legend>{heading}</legend>
            {block.bullets.map((b) =>
              bullets[b.id] === null ? null : (
                <div key={b.id} className="cv-edit-bullet">
                  <textarea
                    aria-label={t('cvEdit.bullet')}
                    value={bullets[b.id] ?? b.text}
                    onChange={(e) => setBullets((m) => ({ ...m, [b.id]: e.target.value }))}
                    rows={rowsFor(bullets[b.id] ?? b.text)}
                    maxLength={MAX_TEXT}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setBullets((m) => ({ ...m, [b.id]: null }))}
                  >
                    {t('cvEdit.remove')}
                  </button>
                  {line(b.id)}
                </div>
              ),
            )}
          </fieldset>
        )
      })}

      <fieldset className="cv-edit-block">
        <legend>{t('cvEdit.skills')}</legend>
        {skills.map((s, i) => (
          <label key={s.category} className="cv-edit-field">
            <span>{s.category}</span>
            <textarea
              value={s.text}
              rows={Math.max(2, s.text.split('\n').length)}
              onChange={(e) =>
                setSkills((all) =>
                  all.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                )
              }
            />
          </label>
        ))}
        {line('skills')}
      </fieldset>

      <div className="cv-edit-actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? t('cvEdit.saving') : t('cvEdit.save')}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={saving}>
          {t('cvEdit.cancel')}
        </button>
        {error && (
          <p role="alert" className="form-error">
            {t('cvEdit.failed')}
          </p>
        )}
      </div>
    </div>
  )
}
