@AGENTS.md

# CVForge

A local-first job-search assistant. It runs on the user's own machine with
their own Anthropic key, and its central promise is that it **never invents
anything about the user**. When a rule below trades data quality against
fabrication risk, fabrication risk wins.

Spanish is the product's first language; every user-visible string lives in
`lib/i18n/dictionary.ts` in **both** `en` and `es`. Never hardcode UI copy.

## Non-obvious invariants

These are cheap to violate and expensive to discover. Each cost real debugging.

**The API enforces far less of a Zod schema than Zod does.** `zodOutputFormat`
emits only `type`, `required` and `additionalProperties` as real grammar.
`minLength`, `pattern` and `enum` survive only as prose inside a `description`,
and `.refine()` is dropped entirely — yet `messages.parse` re-validates with
the full strict schema. So any constraint Zod has that the grammar lacks is
unenforceable pressure on the model and fatal when unmet, producing an
intermittent `invalid-output` that retrying cannot fix — and `callStructured`
does not retry it at all (only `overloaded` gets one backoff). `.transform()`
is worse: `zodOutputFormat` rejects it outright at request build. Before
adding a constraint to a model-facing schema, ask whether the model can
satisfy it every time. A field a CV may legitimately omit must tolerate
absence, and anything the code can resolve itself belongs in code after the
call — the in-tree patterns are `basics.email` / `Certification.issuer`
(default to ''), `deriveCurrency` (derive instead of demand), `clampWeight`
in extract-requirements (clamp instead of enum), and the optional period in
`InterviewResultSchema` (omit-and-fall-back instead of forcing an invented
month). All model-facing schemas were swept clean of unenforceable
constraints on 2026-09-01; keep them that way. `callStructured` deliberately
calls `messages.create` and parses locally rather than `messages.parse`: the
SDK's parse throws AFTER the billed response arrives and discards its usage,
so the exact intermittent failure above would also be the one call whose
spend is never recorded.

**Grounding compares numbers, not digit strings.** `lib/interview/ground.ts`
and `lib/verify/quantities.ts` both read a figure to a numeric value (decimal
comma aware, magnitude word applied — and `mil` is a thousand, not "M") and
compare values. The earlier digit-string rules let "1.8%" ground "18%", "18%"
ground "180%", and a "$12 mil" budget verify a "$12M" claim. Any new number
check goes through those readers; never compare stripped digits.

**Module-level singletons do not cross bundle boundaries.** Next builds route
handlers, pages and `instrumentation.ts` into *separate module registries*. A
module-scope `let` set from one is null in another, and importing a module for
its side effect from a page does not register anything for `/api/*`. Anything
one entry point sets and another reads belongs on `globalThis` — as
`lib/ai/client.ts` (SDK client) and `lib/ai/spend-hook.ts` (spend recorder)
both do. Registering from `instrumentation.ts` alone is **not** sufficient.

**Spend must be recorded for every model call.** A paid call that records
nothing is a bug even when the feature works — the user is watching that
number to decide whether to keep using the tool.

**The API key lives next to the database, not in the repo.** `settingsPath()`
returns `path.dirname(CVFORGE_DB_PATH)/config.json`, so pointing
`CVFORGE_DB_PATH` at a scratch copy — the safe way to exercise a real feature
without touching real data — silently orphans the key and every model call
fails as `unknown`. Set `CVFORGE_CONFIG_PATH` to the real install's
`datos/config.json` alongside it. `.env.local` is not the fallback: its
`ANTHROPIC_API_KEY` is commented out on purpose, because `lib/ai/client.ts`
prefers the environment and a dead key there shadows a working one from
Ajustes.

**`profile.projects` parses but has no product behind it.** Exactly one place
reads it — `buildEntityIndex` in `lib/ai/projection.ts`, feeding the soft
`unknownEntities` check. It is absent from the evidence projection, from
`citableIds`, from `cv-html.ts`, and from every query and screen. A project
therefore cannot be cited, and anything uncitable can never become a CV bullet
or a letter claim. Reading the schema and assuming projects work is the trap:
today the only way to record self-built work is to invent an employer, which is
the one lie this app cannot afford. Treat it as unimplemented until the surface
listed above exists.

**`skip` is a gate, not the bottom of a ranking.** Since v1.2.17 it means one
thing only: a location, timezone or work-authorization requirement that no
rewriting can meet. A shortfall — however large — bottoms out at `stretch`.
Three separate defects have come from treating it as a rank: `meetsFloor`
admitted a `skip` posting at a `skip` floor; the count-based path to `skip`
crossed a boundary the model does not reproduce (two runs over the same
posting and evidence disagreed by 4 vs 7 missing); and `hardBlockers` required
`r.mandatory`, so when extraction flagged nothing mandatory an unmet location
requirement fell into the desirable pool and could not gate at all. If you are
about to order the four verdicts, stop: `skip` is not below `stretch`, it is
outside the scale.

**A verdict resting on zero mandatory requirements is resting on nothing.**
`decideVerdict` used to short-circuit to `worth-it` whenever `mandatoryTotal`
was 0, reasoning that nothing could disqualify the user. Measured across six
real applications and six eval fixtures, every genuine posting marks 58-94% of
its requirements mandatory — so 0-of-24 is an extraction failure, not a
permissive employer, and the branch rewarded the failure with the second-best
verdict. It now judges the requirements that were found, gating kinds gate
regardless of the mandatory flag **when and only when** `mandatoryTotal === 0`,
and an extraction that produced nothing at all returns `stretch`. Any future
change here must be strictly stricter — never fix a verdict problem by
softening `decideVerdict`. Note the eval corpus cannot regression-test this
branch: all six fixtures have `mandatoryTotal` 7-19, so none reach it.

## Verification

Gates: `npm run typecheck`, `npm run lint` (Biome), `npm test` (Vitest),
`npm run build` (also fails if an API key reaches a client chunk).

Passing tests are not evidence a feature works — several bugs here lived
happily behind a green suite because the tests mocked the boundary that was
broken. For anything touching a real model call, a real bundle boundary or the
packaged app, run it and read the output. Prefer a deterministic tool over
asking a model to check something (use a PDF extractor to read a PDF, not a
model transcription), and prefer a free probe over a paid call: `validateApiKey`
hits the free Models endpoint, and a throwaway route can answer a
module-registry question for nothing.

## Releasing

`npm run release` needs a clean tree and `v<package.json version>` tagged at
HEAD — an untracked file anywhere in the repo fails the gate. Bump
`package.json`, `public/version.json` **and** the top `CHANGELOG.md` entry
together; the gate checks all three, and `public/version.json` is what the
opt-in update check reads. The scrub gate runs against a private denylist in
`evals/private/denylist.txt` (never committed). The boot gate runs before the
sha256 is printed and deletes the zip on failure, so a printed sha256 means
the gate passed.

The zip ships the compiled app, not the source tree. After building, verify by
unzipping and grepping rather than trusting the log. `LEEME.html` ships
*inside* the zip, so update it in the version-bump commit, before tagging — a
docs commit landing after the build never reaches the artifact.

**This repository is public.** Every pushed commit is permanent — GitHub keeps
PR refs forever. Never commit a real CV, real postings tied to a person, eval
fixtures, databases, `config.json`, or anything from `evals/private/`; tests
use fictional people and companies.

When a prompt, `lib/coverage.ts`, or the Anthropic SDK moved since the last
release, run `npm run eval` first (≈$0.13 per fixture, needs
`CVFORGE_DB_PATH` pointed at a real install so the key resolves beside it). It
re-runs live triage on snapshotted postings and is the only check in the repo
that exercises the model rather than a mock — the suite passes with the model
stubbed out, so it cannot see extraction getting worse. Judge the
**hard-mandatory** set; `reworded` lines are wording churn, not regression.
