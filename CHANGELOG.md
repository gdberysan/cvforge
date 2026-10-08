# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.4.0] - 2026-10-07

### Added

- **Projects:** self-built work (a tool, freelance, open source) gets its own
  records on Experiencia and a "Projects" section on the CV; the checks refuse
  to place project work under an employer.
- **Hoy:** the home page says what needs you today, each item linking to the
  step where the move lives.
- **Five steps per application:** Decide → Gaps → Documents → Send →
  Follow-up. Skipping can be undone; logging an outcome has a one-click undo.
- **Experiencia as a work queue:** filters for records without a number, still
  only the CV's lines, or without tags; roles collapse to one line.
- **Light mode**, following the system, with a choice in Settings.
- Writing a CV shows its real stages as they happen.

### Changed

- Cover letters and answers can cite the credentials the analysis matched.
- The overstatement check sees recorded metrics and a project's stated stack;
  flags quote the line they are about.
- Every text meets WCAG AA contrast in both themes; no screen scrolls sideways
  on a phone; a skip link, and focus that follows the step.
- The launchers take the first free port from 3000 to 3009.
- The company-tone extraction, which nothing read, is gone.

### Fixed

- Undated degrees and projects import without an invented month.
- Re-import keeps records with the right role for repeat employers and
  legal-suffix variants of a company name.
- A backup from a newer CVForge is refused instead of being misread.
- PDF exports share one browser, one at a time.
- The release zip itself is scanned for personal data.

## [1.3.1] - 2026-09-17

### Security

- Next.js 16.3.0 → 16.3.5, fixing two critical remote-code-execution advisories
  (one in the image optimizer with AVIF files, one affecting servers running on
  Windows, which the Windows launcher is).
- sharp 0.35.3 → 0.35.4, fixing the libheif vulnerabilities it bundles.

## [1.3.0] - 2026-09-17

First public release. CVForge was developed privately through 1.2.x and is
now open source under the MIT license.

### Added

- Evidence base: import a CV (PDF or text), then a short interview per role to
  recover what the CV left out.
- Triage: paste a posting and get a verdict, with what you have, what you
  don't, and which requirement would be a guess. *Skip* is reserved for
  location, time-zone and work-permit requirements no rewriting can meet.
- Gap filling: a requirement you do meet but never recorded becomes permanent
  evidence, and the posting is re-scored.
- Kit: CV, cover letter, screening answers and recruiter message in Spanish or
  English, every claim citing evidence, numbers verified in code, an
  overstatement and tense check, and PDF / Word export.
- Outcomes and stats: record replies, interviews and rejections.
- Local-first app: SQLite database, API key stored beside it with `0600`
  permissions, server bound to `127.0.0.1`, backups and restore, spend
  recorded for every model call, Spanish and English UI.
- Packaged app for macOS and Windows with the Node runtime included; Linux
  through `start.sh`.

### Changed

- Importing a CV no longer fails, or forces an invented month, when an
  education entry or achievement has no date. Degrees may have only an end
  year; achievements inherit their role's dates; a role with no readable
  dates stops the import before the second paid call.
