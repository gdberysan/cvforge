# Política de seguridad

> English version below.

## Cómo reportar

**No abras un issue público** para un fallo de seguridad.

Usa el reporte privado de GitHub: pestaña *Security* → *Report a
vulnerability*. Llega solo a quien mantiene el repo.

Respuesta en **72 horas** para confirmar que se recibió, y una evaluación
inicial en **7 días**. Esto lo mantiene una sola persona y no hay programa de
recompensas: lo que sí hay es crédito en las notas de la versión que lo
corrija, salvo que prefieras lo contrario.

**No adjuntes tu CV ni datos reales** en el reporte. Un caso reproducible con
datos inventados basta.

## Qué versiones se atienden

La **última release** publicada. No se hacen parches retroactivos.

## Modelo de amenaza, en corto

CVForge es **una aplicación que corre en la máquina de quien la usa**, con su
propia clave de Anthropic. No hay cuentas, ni telemetría, ni servidor nuestro
en medio. La superficie:

- El **servidor local** (Next.js), que los lanzadores atan a `127.0.0.1`.
- Las rutas que escriben o apagan (`/api/shutdown`, restaurar un respaldo…),
  protegidas con una comprobación de mismo origen contra CSRF.
- La **clave de API**, guardada junto a la base de datos en `config.json` con
  permisos `0600`. El build falla si la clave llega a un chunk del cliente.
- **Entrada no confiable por definición:** el CV (PDF o texto), las vacantes
  que se pegan y los respaldos que se restauran. Los prompts tratan el CV y las
  vacantes como datos, no como instrucciones.
- La exportación a PDF, que imprime HTML generado con un navegador local.

## Dentro del alcance

- Que una página web ajena o algo en la red local llegue a la API local.
- Que la clave de API salga de la máquina hacia cualquier sitio que no sea la
  API de Anthropic, o que aparezca en el cliente.
- Inyección de HTML/JS en la interfaz o en el PDF exportado a partir de un CV,
  una vacante o un respaldo manipulados.
- Escritura de ficheros fuera del directorio de datos, o ejecución de código,
  a partir de un respaldo o un PDF manipulados.
- Fuga de datos hacia fuera: aparte de la API de Anthropic y la comprobación
  de actualizaciones opcional, el programa no debe enviar nada.

## Fuera del alcance

- Que el modelo redacte mal algo o no detecte una exageración. Eso es un
  fallo de calidad: abre un issue normal (sin datos reales).
- Inyección de prompt que solo afecta al texto que genera tu propia sesión
  con tu propio CV, sin cruzar ninguna de las fronteras de arriba.
- Ataques que requieran ya tener acceso físico o de administración a la
  máquina.
- Informes generados por escáneres sin una explicación de por qué eso es
  explotable aquí.

---

# Security policy

## Reporting a vulnerability

**Please don't open a public issue** for a security problem.

Use GitHub private reporting: *Security* tab → *Report a vulnerability*. It
reaches the maintainer only.

You'll get an acknowledgement within **72 hours** and an initial assessment
within **7 days**. This is maintained by one person and there's no bounty
programme — there is credit in the release notes that fix it, unless you'd
rather not be named.

**Don't attach your CV or any real personal data.** A reproducible case with
made-up data is enough.

## Supported versions

The **latest release**. Earlier versions don't get backported patches.

## Threat model, briefly

CVForge is **an app running on the user's own machine**, with their own
Anthropic key. No accounts, no telemetry, no server of ours in between. In
scope:

- The **local server** (Next.js), bound to `127.0.0.1` by the launchers.
- Routes that write or shut down (`/api/shutdown`, backup restore…), guarded
  by a same-origin check against CSRF.
- The **API key**, stored next to the database in `config.json` with `0600`
  permissions. The build fails if the key reaches a client chunk.
- **Untrusted input by definition:** the CV (PDF or text), pasted job
  postings, and restored backups. Prompts treat CVs and postings as data, not
  instructions.
- PDF export, which prints generated HTML through a local browser.

## In scope

- A foreign web page or something on the local network reaching the local API.
- The API key leaving the machine for anywhere but Anthropic's API, or
  appearing in the client.
- HTML/JS injection into the UI or the exported PDF from a crafted CV, posting
  or backup.
- Writing files outside the data directory, or executing code, from a crafted
  backup or PDF.
- Data leaving the machine: apart from Anthropic's API and the opt-in update
  check, the app must send nothing.

## Out of scope

- The model wording something badly or missing an exaggeration. That's a
  quality bug: open a normal issue (without real data).
- Prompt injection that only affects the text your own session generates from
  your own CV, without crossing any boundary above.
- Attacks requiring existing physical or administrative access to the machine.
- Scanner output without an explanation of why it's exploitable here.
