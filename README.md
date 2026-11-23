<!-- markdownlint-disable MD033 MD041 -->
# Rumbo

**Is this job worth your time? Paste the posting and you'll know in a minute: what you meet, what you're missing, and whether to apply. Then it helps you apply without inventing anything about you.**

Free. No account. Your data stays in your browser.

**[Open Rumbo → rumbo.korven.dev](https://rumbo.korven.dev)** · **[Español](README.es.md)**

---

## Why it exists

AI writing tools are happy to make you sound impressive. A recruiter reads the result as fact, and an interviewer will ask about it. A CV that claims a number you never hit, or a tool you never used, is worse than a plain one.

Rumbo is built the other way round. It starts from what you actually did, and every line it writes has to point back to it. Numbers are checked in code, not by asking a model. And before you write anything, it tells you honestly whether a posting is worth it, including "no" when a requirement is something no CV can fix, like living in another city.

## What it does

- **Analyses a posting** against your real experience: a verdict, what you meet, what you only half meet, what you're missing.
- **Writes the application** (CV, cover letter, screening answers, a note to the recruiter) only from what you did, and checks every claim before you see it.
- **Fills real gaps honestly.** When a posting asks for something you did but never wrote down, you describe it once and it counts from then on. What you leave blank stays blank.
- **Keeps your search in one place:** what you applied to, who answered, what's waiting on you.
- **Works from LinkedIn** with the browser extension (coming to the Chrome Web Store; today you can load it from this repo): a button on the job page opens Rumbo beside it, and while that panel is open it follows you as you move between jobs.
- **Works from your phone:** install it and share screenshots of a posting to it.

## What it costs

Rumbo is free and always will be. It uses Claude, the AI made by Anthropic, with a key of your own, so you pay Anthropic directly for what you use, and Rumbo shows you the running total. Measured in real use (November 2026):

| | Cost |
|---|---|
| Analysing a posting | about $0.04 USD |
| A full application (CV, letter, answers) | about $0.50 USD |
| A whole job search | about $3–6 USD |

Your first try needs no key: a free trial, on Rumbo's key, lets you read your CV, analyse a posting and get a tailored CV. After that, getting a key takes about five minutes; Rumbo walks you through it.

## Privacy

- No account, no sign-up, no tracking.
- Your CV, applications and key live only in your browser, on your device.
- With your own key, the app's only outside connection is to Anthropic's API, to run the analysis: nothing passes through a server of ours.
- The free trial is the one exception: without a key of your own, your calls pass through Rumbo's server on their way to Anthropic, using our key. It checks each call and keeps only counts (what your trial has spent, and how often a network asks, under a one-way code), never your CV, the posting or the answers.
- The extension reads a job page when you press its button and, while its panel is open, the job you open next. It sends nothing to any server.

The full detail, in plain words, is on the [privacy page](https://rumbo.korven.dev/app/privacidad/).

## Limits, honestly

- **It needs an Anthropic key.** There's no offline or local-model mode; the checks are tuned and evaluated against Claude.
- **A verdict is a judgement, not a measurement.** The same posting can land on a neighbouring verdict on a second run; the reasons under it are the part worth reading.
- **It doesn't apply for you**, scrape job boards or touch your LinkedIn account. It helps you decide and prepare; sending is yours.

---

## For developers

The web edition is a static site: Next.js exported to plain files, the database in the browser (SQLite in WebAssembly, on the browser's private file storage), and model calls straight from the browser to Anthropic. It shares its code with the desktop app this project started as (CVForge), which still ships for people who bought it.

```bash
git clone https://github.com/gdberysan/cvforge.git
cd cvforge
npm ci
npm run web:build          # builds web/site/: the landing at /, the app at /app/
node web/spike/serve-cli.mjs 4100
```

- Gates: `npm run typecheck`, `npm run lint` (Biome), `npm test` (Vitest), `npm run build`.
- The extension: `CVFORGE_SITE=http://localhost:4100/app/ npm run web:extension`, then load `web/extension/dist` unpacked.
- [`CLAUDE.md`](CLAUDE.md) lists the non-obvious invariants; read it before touching a prompt or a model-facing schema.
- The tests mock the model. `npm run eval` re-runs live analysis on postings you snapshot (`npm run eval:snapshot`), on your key, and is the check that sees the model itself.

Bugs and ideas: [GitHub Issues](https://github.com/gdberysan/cvforge/issues). **Never paste a real CV into an issue.** Code: read [`CONTRIBUTING.md`](CONTRIBUTING.md) first. Security: [`SECURITY.md`](SECURITY.md), not a public issue. [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) covers how people are treated here.

## License and names

Code under the **MIT** license: see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). The names "Rumbo", "CVForge" and "Korven", their marks and icons are **not** covered by it ([`assets/brand/LICENSE`](assets/brand/LICENSE)): if you publish a fork, use your own name and mark.

Made in Mexico by Gerardo. A work by **[Korven](https://korven.dev)**.
