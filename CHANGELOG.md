# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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
