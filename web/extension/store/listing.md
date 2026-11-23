# Chrome Web Store listing: Rumbo

Upload: `web/extension/rumbo-extension.zip` (built for https://rumbo.korven.dev/app/).

## Store listing

**Name:** Rumbo
**Category:** Productivity → Tools · **Language:** Español (Latinoamérica), plus English

**Summary (≤132 characters)**
- es: ¿Vale la pena esta vacante? Rumbo la compara con tu experiencia real, al lado de LinkedIn. Gratis, sin cuenta.
- en: Is this job worth your time? Rumbo compares it with your real experience, right beside LinkedIn. Free, no account.

**Description (es)**
Pega una vacante, o pulsa "Analizar en Rumbo" en una vacante de LinkedIn, y Rumbo te dice en un minuto si vale tu tiempo: qué cumples, qué tienes a medias y qué te falta. Luego te ayuda a postularte sin inventar nada de ti.

• Un botón en la vacante abre Rumbo en el panel lateral, con la vacante ya lista.
• Si cambias de vacante, el panel te sigue.
• Te dice "no" cuando un requisito no lo arregla ningún CV, como vivir en otra ciudad.
• Escribe tu CV y tu carta solo con lo que de verdad hiciste.

Gratis. Usa Claude, la IA de Anthropic, con una clave tuya: pagas directo a Anthropic unos centavos por vacante, y Rumbo te muestra cuánto llevas.

Privacidad: Rumbo lee la vacante que estás viendo solo cuando pulsas el botón. Tu CV, tus postulaciones y tu clave viven solo en tu navegador. No hay cuenta ni servidor de Rumbo que vea tus datos.

**Description (en)**
Paste a job posting, or press "Analyse in Rumbo" on a LinkedIn job, and in a minute Rumbo tells you whether it's worth your time: what you meet, what you half meet and what you're missing. Then it helps you apply without inventing anything about you.

• A button on the job page opens Rumbo in the side panel, with the posting ready.
• Move to another job and the panel follows.
• It says "no" when a requirement is something no CV can fix, like living in another city.
• It writes your CV and cover letter only from what you actually did.

Free. It uses Claude, Anthropic's AI, with a key of your own: you pay Anthropic a few cents per posting, and Rumbo shows the running total.

Privacy: Rumbo reads the job you're looking at only when you press the button. Your CV, applications and key live only in your browser. There is no account and no Rumbo server that sees your data.

**Images:** `1-respuesta.png`, `2-no-aplica.png`, `3-panel.png` (1280×800); promo tile `promo-440x280.png`; icon comes from the zip (128×128).

**Website:** https://rumbo.korven.dev · **Support:** https://github.com/gdberysan/cvforge/issues

## Privacy practices tab

**Single purpose:** Opens Rumbo in the side panel with the job posting the person is looking at, so they can analyse it against their own experience.

**Permission justifications**
- `sidePanel`: Rumbo opens in Chrome's side panel next to the job page.
- `storage`: Holds the posting being handed to the side panel, per tab, for the session only.
- `activeTab`: When the person clicks the toolbar icon on any page, Rumbo reads that page's posting (or the selected text), only then.
- `scripting`: Runs that one-time read on the active tab after the click.
- Host permission `https://rumbo.korven.dev/*`: The side panel shows the Rumbo web app, whose data lives in the person's browser for that site.
- Content script on `https://*.linkedin.com/jobs/*`: Shows the "Analizar en Rumbo" button on job pages and reads the posting when it's pressed.

**Remote code:** No. All code is in the package.

**Data usage:** Collects "Website content" (the job posting text, only when the person asks). It is used only for the app's single purpose, shown to the person in the side panel, and stored only in their own browser. Not sold, not transferred to third parties except as needed for the feature (the posting is sent to Anthropic's API, with the person's own key, only when they press Analizar), not used for creditworthiness or lending.

**Privacy policy URL:** https://rumbo.korven.dev/app/privacidad/
