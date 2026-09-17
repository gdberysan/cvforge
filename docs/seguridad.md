# Seguridad

Este repo está sobre el [baseline de seguridad compartido de gdberysan](https://github.com/gdberysan/.github).
La lógica de los escáneres vive en `gdberysan/.github/.github/workflows/security.yml`
(un solo sitio, todos los repos la heredan); aquí solo está la config específica
de cvforge.

## Capas activas

| Capa | Herramienta | Dónde |
|---|---|---|
| Secretos, historial completo | gitleaks | CI (workflow compartido, job `Seguridad / gitleaks`) |
| Secretos, pre-commit | gitleaks | hook local vía `core.hooksPath` |
| SAST JS/TS | Semgrep CE (`p/javascript` + `p/typescript`) | CI (workflow compartido, job `Seguridad / semgrep`); independiente del linter — cvforge usa biome |
| Dependencias | Dependabot (`npm`, `github-actions`) | GitHub, `.github/dependabot.yml` |

Los jobs de Go del workflow compartido (`govulncheck`, `golangci-lint`) se
saltan automáticamente: este repo no tiene `go.mod`.

## Activar el hook de pre-commit (por clon)

```bash
git config core.hooksPath scripts/git-hooks
```

Si `gitleaks` no está instalado (`brew install gitleaks`), el hook avisa y
deja pasar el commit — no bloquea a nadie sin la herramienta, pero tampoco
protege sin ella.

## Checklist para hacerse público (o pasar a plan Pro)

En plan Free con repo privado, lo siguiente **no** está disponible y queda
pendiente:

- [ ] Ruleset `main-requiere-ci` con status checks obligatorios (403 en Free +
      privado; gratis en cuanto el repo sea público o el plan sea Pro)
- [ ] CodeQL (Settings → Security → Code scanning → default setup)
- [ ] Secret scanning nativo + push protection
- [ ] Barrido final de historial antes de publicar: `gitleaks git --redact`

## Excepciones documentadas

Un hallazgo se corrige o se excluye **con justificación**, nunca se silencia sin
motivo (principio del baseline).

- **Semgrep `react-insecure-request`** en `scripts/release.ts` (2 líneas):
  `fetch("http://127.0.0.1:${port}/…")` contra el servidor local que el propio
  smoke-test del release acaba de levantar. HTTPS no aplica a loopback (sin cert,
  proceso propio) y no viaja dato sensible → falso positivo. Excluido inline con
  `// nosemgrep: …react-insecure-request… -- motivo`.
- **Dependabot esbuild** (GHSA-67mh-4wv8-2f99, medium, `esbuild <= 0.24.2`):
  **dismissed** como `not_used` el 2026-08-26. Solo dev (drizzle-kit,
  migraciones); la vuln es el dev-server de esbuild, y `@esbuild-kit/esm-loader`
  solo usa `esbuild.transform` como loader de TS — nunca levanta `serve`, así que
  la ruta vulnerable es inalcanzable. `drizzle-kit@latest` aún fija
  `@esbuild-kit → esbuild~0.18.20` (sin fix upstream) y un `override` a `>=0.25`
  rompe la resolución. **Reabrir y actualizar cuando drizzle-kit suelte la cadena
  `@esbuild-kit`.**

## Nombres exactos de los checks

Confirmados en la primera ejecución del workflow (PR #1):

- `checks` — jobs de build/test existentes del repo
- `Seguridad / gitleaks`
- `Seguridad / semgrep`
- `Seguridad / detectar` (job interno del workflow compartido, no requerido)
- `Seguridad / govulncheck`, `Seguridad / golangci-lint` — `skipped`, no `go.mod`
