<!-- markdownlint-disable MD033 MD041 -->
# Rumbo

**¿Vale la pena esta vacante? Pégala y en un minuto lo sabrás: qué cumples, qué te falta y si conviene postularte. Luego te ayuda a postularte sin inventar nada de ti.**

Gratis. Sin cuenta. Tus datos se quedan en tu navegador.

**[Abrir Rumbo → rumbo.korven.dev](https://rumbo.korven.dev)** · **[English](README.md)**

---

## Por qué existe

Las herramientas de IA te hacen sonar impresionante con gusto. Un reclutador lee eso como un hecho, y en la entrevista te lo preguntan. Un CV que presume una cifra que nunca lograste, o una herramienta que nunca usaste, es peor que uno sencillo.

Rumbo está hecho al revés. Parte de lo que de verdad hiciste, y cada línea que escribe tiene que poder respaldarse con eso. Las cifras se revisan con código, no preguntándole a un modelo. Y antes de que escribas nada, te dice con honestidad si una vacante vale la pena, incluido "no" cuando un requisito no lo arregla ningún CV, como vivir en otra ciudad.

## Qué hace

- **Analiza una vacante** contra tu experiencia real: un veredicto, qué cumples, qué tienes a medias, qué te falta.
- **Escribe la postulación** (CV, carta, respuestas, un mensaje al reclutador) solo con lo que hiciste, y revisa cada afirmación antes de que la veas.
- **Llena huecos reales con honestidad.** Si una vacante pide algo que sí hiciste pero nunca escribiste, lo cuentas una vez y cuenta desde entonces. Lo que dejas en blanco, se queda en blanco.
- **Junta tu búsqueda en un lugar:** a qué te postulaste, quién respondió, qué está esperando por ti.
- **Funciona desde LinkedIn** con la extensión: un botón en la vacante abre Rumbo al lado y te sigue cuando cambias de vacante.
- **Funciona desde tu teléfono:** instálalo y compártele capturas de una vacante.

## Lo que cuesta

Rumbo es gratis y lo seguirá siendo. Usa Claude, la IA de Anthropic, con una clave tuya: le pagas directo a Anthropic por lo que usas, y Rumbo te muestra cuánto llevas. Medido en uso real (noviembre de 2026):

| | Costo |
|---|---|
| Analizar una vacante | unos $0.04 USD (≈ 75 centavos) |
| Una postulación completa (CV, carta, respuestas) | unos $0.50 USD (≈ $9 MXN) |
| Una búsqueda completa | unos $3–6 USD (≈ $55–110 MXN) |

Sacar tu clave toma unos cinco minutos; Rumbo te guía.

## Privacidad

- Sin cuenta, sin registro, sin rastreo.
- Tu CV, tus postulaciones y tu clave viven solo en tu navegador, en tu dispositivo.
- La única conexión que hace la app es a la API de Anthropic, con tu clave, para hacer el análisis. Rumbo no tiene un servidor que vea tus datos.
- La extensión lee una vacante solo cuando pulsas su botón.

Todo el detalle, en palabras simples, está en la [página de privacidad](https://rumbo.korven.dev/app/privacidad/).

## Límites, con honestidad

- **Necesita una clave de Anthropic.** No hay modo sin conexión ni con modelos locales; las revisiones están ajustadas y evaluadas con Claude.
- **Un veredicto es un juicio, no una medición.** La misma vacante puede caer en un veredicto vecino en otra corrida; las razones debajo son lo que vale la pena leer.
- **No se postula por ti**, no recorre bolsas de trabajo ni toca tu cuenta de LinkedIn. Te ayuda a decidir y a prepararte; enviar es tuyo.

---

## Para desarrolladores

La edición web es un sitio estático: Next.js exportado a archivos, la base de datos en el navegador (SQLite en WebAssembly, en el almacenamiento privado del navegador) y las llamadas al modelo directo del navegador a Anthropic. Comparte código con la app de escritorio con la que empezó el proyecto (CVForge), que sigue existiendo para quien la compró.

```bash
git clone https://github.com/gdberysan/cvforge.git
cd cvforge
npm ci
npm run web:build          # arma web/site/: la portada en /, la app en /app/
node web/spike/serve-cli.mjs 4100
```

- Revisiones: `npm run typecheck`, `npm run lint` (Biome), `npm test` (Vitest), `npm run build`.
- La extensión: `CVFORGE_SITE=http://localhost:4100/app/ npm run web:extension`, y carga `web/extension/dist` sin empaquetar.
- [`CLAUDE.md`](CLAUDE.md) lista las reglas que no son obvias; léelo antes de tocar un prompt o un esquema que vea el modelo.
- Las pruebas simulan el modelo. `npm run eval` vuelve a correr el análisis real sobre vacantes que tú guardas (`npm run eval:snapshot`), con tu clave, y es la revisión que ve al modelo mismo.

Errores e ideas: [GitHub Issues](https://github.com/gdberysan/cvforge/issues). **Nunca pegues un CV real en un issue.** Código: lee primero [`CONTRIBUTING.md`](CONTRIBUTING.md). Seguridad: [`SECURITY.md`](SECURITY.md), no un issue público. [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) dice cómo nos tratamos aquí.

## Licencia y nombres

Código bajo la licencia **MIT**: ver [`LICENSE`](LICENSE) y [`NOTICE`](NOTICE). Los nombres "Rumbo", "CVForge" y "Korven", sus marcas e iconos **no** están cubiertos por ella ([`assets/brand/LICENSE`](assets/brand/LICENSE)): si publicas un fork, usa tu propio nombre y marca.

Hecho en México por Gerardo. Una obra de **[Korven](https://korven.dev)**.
