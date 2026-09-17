# Cómo contribuir

> English version below.

Gracias por mirar el código. Esto lo mantiene una sola persona, así que
conviene decir de entrada qué encaja y qué no.

## Antes de escribir código

**Abre un issue primero** si el cambio es más que un arreglo pequeño. Hay
decisiones de diseño que no se ven desde fuera, y sería una lástima que
gastaras una tarde en algo que se va a rechazar por un motivo que no estaba
escrito en ninguna parte. Los arreglos evidentes —un typo, un error claro, un
caso límite— pueden llegar directos como pull request.

**Nunca pegues un CV real** (ni el tuyo) en un issue, un PR o un test. Usa
datos inventados.

## Lo que este proyecto NO va a aceptar

- **Cualquier cosa que deje al modelo afirmar algo que no está en la
  evidencia.** La promesa central es que CVForge nunca inventa nada sobre
  quien lo usa. Cuando la calidad del texto choca con el riesgo de inventar,
  gana no inventar.
- **Suavizar el veredicto** para que más vacantes salgan «vale la pena». Un
  cambio en `decideVerdict` solo puede hacerlo más estricto.
- **Cuentas, registro, telemetría** ni servidores nuestros de por medio. Los
  datos se quedan en la máquina.
- **Scraping de portales de empleo o postulación automática.** CVForge ayuda a
  decidir y a preparar; no postula por nadie ni automatiza cuentas ajenas.
- **Texto de interfaz en el código.** Todo va en `lib/i18n/dictionary.ts`, en
  español **y** en inglés.

## El listón técnico

Todo esto corre en CI y bloquea la fusión:

```sh
npm run typecheck
npm run lint        # Biome
npm test            # Vitest
npm run build       # también falla si la clave de API llega al cliente
```

Cosas que no son obvias (el detalle está en [`CLAUDE.md`](CLAUDE.md)):

- **Unos tests en verde no prueban que algo funcione con el modelo real.** Los
  tests simulan la API. Si tu cambio toca un prompt o un esquema que ve el
  modelo, dilo en el PR: quien mantiene el repo corre la evaluación contra
  vacantes reales antes de publicar.
- **La API no hace cumplir todo lo que dice un esquema de Zod.** `min`,
  `regex`, `enum` y `.refine()` en un esquema que ve el modelo son presión, no
  garantía, y fallan la llamada cuando no se cumplen. Resuélvelo en código
  después de la llamada.
- **Los números se comparan como valores, no como cadenas de dígitos.**
- **Cada llamada al modelo registra su gasto.** Una llamada que cobra y no
  registra es un bug aunque la función ande.

## Estilo

- Código, comentarios y commits en **inglés**; la interfaz en español e
  inglés, a la par.
- Los comentarios explican **por qué**, no qué.
- Nada de dependencias nuevas sin una razón de peso.

## Seguridad

Los fallos de seguridad **no** van en un issue público: ver
[`SECURITY.md`](SECURITY.md).

## Licencia

El código va con licencia MIT. La **marca** (los nombres «CVForge» y
«Korven», el wordmark, el emblema y el icono) tiene su propio aviso y no entra
en ella: si publicas un fork, ponle tu nombre.

---

# Contributing

Thanks for looking at the code. This is maintained by one person, so it's worth
saying up front what fits and what doesn't.

## Before writing code

**Open an issue first** for anything beyond a small fix. Some design decisions
aren't visible from outside, and it would be a shame to spend an afternoon on
something that gets turned down for a reason nobody wrote down. Obvious fixes —
a typo, a clear bug, an edge case — can come straight as a PR.

**Never paste a real CV** (yours included) into an issue, PR or test. Use
made-up data.

## What this project will NOT take

- **Anything that lets the model claim something the evidence doesn't
  support.** The core promise is that CVForge never invents anything about its
  user. When writing quality trades against fabrication risk, not inventing
  wins.
- **Softening the verdict** so more postings come out "worth it". A change to
  `decideVerdict` may only make it stricter.
- **Accounts, sign-up, telemetry**, or servers of ours in the path. Data stays
  on the machine.
- **Job-board scraping or automated applying.** CVForge helps you decide and
  prepare; it doesn't apply on anyone's behalf or automate third-party
  accounts.
- **UI copy in code.** Every string goes in `lib/i18n/dictionary.ts`, in
  Spanish **and** English.

## The technical bar

All of this runs in CI and blocks merging:

```sh
npm run typecheck
npm run lint        # Biome
npm test            # Vitest
npm run build       # also fails if the API key reaches a client chunk
```

Non-obvious things (details in [`CLAUDE.md`](CLAUDE.md)):

- **A green suite doesn't prove something works against the real model.** The
  tests mock the API. If your change touches a prompt or a model-facing
  schema, say so in the PR: the maintainer runs the evaluation against real
  postings before releasing.
- **The API enforces far less of a Zod schema than Zod does.** `min`, `regex`,
  `enum` and `.refine()` on a model-facing schema are pressure, not a
  guarantee, and fail the call when unmet. Resolve it in code after the call.
- **Numbers are compared as values, never as digit strings.**
- **Every model call records its spend.** A paid call that records nothing is
  a bug even when the feature works.

## Style

- Code, comments and commits in **English**; the UI ships Spanish and English
  at parity.
- Comments explain **why**, not what.
- No new dependencies without a strong reason.

## Security

Security bugs don't go in public issues — see [`SECURITY.md`](SECURITY.md).

## Licence

Code is MIT. The **brand** (the "CVForge" and "Korven" names, wordmark, emblem
and icon) has its own notice and isn't included: if you publish a fork, give it
your own name.
