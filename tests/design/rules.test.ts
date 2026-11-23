// tests/design/rules.test.ts
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Rule, scanRepo } from './scan'

const baseline: Record<string, Partial<Record<Rule, number>>> = JSON.parse(
  readFileSync('tests/design/baseline.json', 'utf8'),
)
const now = scanRepo(process.cwd())

/** Files the redesign has finished: they must be clean of every rule, forever. */
const CLEAN: string[] = [
  'components/application/VerdictPanel.tsx',
  'components/application/RequirementChips.tsx',
  'components/application/DecideActions.tsx',
  'app/(app)/page.tsx',
  'components/today/TodayInbox.tsx',
  'app/(app)/evidence/page.tsx',
  'components/evidence/EvidenceEditor.tsx',
  'components/evidence/EvidenceRecord.tsx',
  'components/evidence/RoleHeader.tsx',
  'components/evidence/Rail.tsx',
  'components/studio/Studio.tsx',
  'components/studio/Workspace.tsx',
  'components/studio/GroundingFlags.tsx',
  'components/studio/PdfPager.tsx',
  'app/(app)/pipeline/page.tsx',
  'components/pipeline/OutcomeButtons.tsx',
  'components/pipeline/OutcomeChip.tsx',
  'components/application/Timeline.tsx',
  'components/ui/Nav.tsx',
  'components/ui/NavLink.tsx',
  'components/ui/LocaleSwitch.tsx',
  'components/ui/BottomNav.tsx',
  'app/(app)/share/page.tsx',
  'app/(app)/settings/page.tsx',
  'components/settings/AgentCard.tsx',
  'components/settings/ApiKeyForm.tsx',
  'components/settings/BackupCard.tsx',
  'components/settings/KeyGuide.tsx',
  'components/settings/PdfEngineSetup.tsx',
  'components/settings/PushCard.tsx',
  'components/settings/RestoreCard.tsx',
  'components/settings/SettingsGroup.tsx',
  'components/settings/UpdateToggle.tsx',
  'components/ui/Switch.tsx',
  'components/application/PostingSheet.tsx',
  'components/application/KitProgress.tsx',
  'components/today/AgentFinds.tsx',
]

describe('design rules', () => {
  it('no file gets worse than its baseline', () => {
    const worse: string[] = []
    for (const [file, hits] of Object.entries(now)) {
      for (const [rule, n] of Object.entries(hits) as [Rule, number][]) {
        const allowed = baseline[file]?.[rule] ?? 0
        if (n > allowed) worse.push(`${file}: ${rule} ${allowed} → ${n}`)
      }
    }
    expect(worse).toEqual([])
  })
  it('the baseline is not stale (fixed files must be lowered with npm run design:baseline)', () => {
    const stale: string[] = []
    for (const [file, hits] of Object.entries(baseline)) {
      // The public copy leaves the personal-only pages out (.gitattributes);
      // a file that is not in this tree has nothing to be stale about.
      if (!existsSync(file)) continue
      for (const [rule, n] of Object.entries(hits) as [Rule, number][]) {
        if ((now[file]?.[rule] ?? 0) < n) stale.push(`${file}: ${rule}`)
      }
    }
    expect(stale).toEqual([])
  })
  it('finished files stay clean', () => {
    expect(CLEAN.filter((f) => now[f])).toEqual([])
  })
  it('the answer has no inline styles', () => {
    const src = readFileSync('components/pages/ApplicationView.tsx', 'utf8')
    const decide = src.slice(src.indexOf('id="s-decide"'), src.indexOf('id="s-gaps"'))
    expect(decide.length).toBeGreaterThan(0)
    expect(decide).not.toContain('style={{')
  })
})
