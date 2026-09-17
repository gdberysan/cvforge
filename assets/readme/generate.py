"""Generates the README images: assets/readme/banner-{en,es}.svg (header) and
diagram-{en,es}.svg (how it works).

Text is converted to outlines with the brand typefaces, so the SVGs don't
depend on installed fonts and render the same on GitHub. Korven palette; the
CSS animation switches off under prefers-reduced-motion.

A maintenance tool, NOT a build dependency. The variable latin woff2 files of
Space Grotesk, Inter and JetBrains Mono go in the folder KORVEN_FONTS points
at (fontsource ships them as *-latin-wght-normal.woff2). To regenerate:

    python3 -m venv /tmp/banner && /tmp/banner/bin/pip install fonttools brotli
    KORVEN_FONTS=/path/to/fonts /tmp/banner/bin/python assets/readme/generate.py
"""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS = os.environ["KORVEN_FONTS"].rstrip(os.sep) + os.sep
_cache = {}


def font(name, wght):
    key = (name, wght)
    if key not in _cache:
        f = TTFont(FONTS + name)
        _cache[key] = instantiateVariableFont(f, {"wght": wght})
    return _cache[key]


def text(s, x, y, size, name, wght, tracking=0.0):
    """Returns (path d, advance width) for the text with its baseline at y."""
    f = font(name, wght)
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    upm = f["head"].unitsPerEm
    scale = size / upm
    pen = SVGPathPen(gs, ntos=lambda v: ("%.1f" % v).rstrip("0").rstrip("."))
    cx = 0.0
    for ch in s:
        g = cmap.get(ord(ch))
        if g is None:
            continue
        tp = TransformPen(pen, (scale, 0, 0, -scale, x + cx, y))
        gs[g].draw(tp)
        cx += gs[g].width * scale + tracking * size
    return pen.getCommands(), cx - tracking * size


def width(s, size, name, wght, tracking=0.0):
    return text(s, 0, 0, size, name, wght, tracking)[1]


SG = "space-grotesk-latin-wght-normal.woff2"
MONO = "jetbrains-mono-latin-wght-normal.woff2"
INTER = "inter-latin-wght-normal.woff2"


GRAPHITE, CARBON, AMBER, STEEL, BONE, LINE, OK, ERR = (
    "#0E131B", "#171E29", "#FF8A2B", "#97A3B2", "#EFF3F8", "#283142", "#4FB286", "#E5604D")

COPY = {
    "en": {
        "kicker": "JOB SEARCH, GROUNDED",
        "tag": "Tailored CVs and letters. Every claim cites what you did.",
        "chips": ["your own key", "no telemetry", "macOS · Windows · Linux"],
        "label": "CVForge — a job-search assistant that runs on your machine and never invents anything about you",
        "doc": "CV · Growth Marketing Lead",
        "lines": [
            ("Cut paid acquisition cost 31% in two quarters", "ev_4", True),
            ("Rebuilt the weekly revenue report in SQL", "ev_9", True),
            ("Grew organic traffic 300%", "no evidence", False),
        ],
        "verdict": "WORTH IT",
        "checks": "numbers verified in code",
    },
    "es": {
        "kicker": "BÚSQUEDA DE EMPLEO, CON EVIDENCIA",
        "tag": "CVs y cartas a la medida. Cada frase cita lo que hiciste.",
        "chips": ["tu propia clave", "sin telemetría", "macOS · Windows · Linux"],
        "label": "CVForge: un asistente de búsqueda de empleo que corre en tu computadora y nunca inventa nada sobre ti",
        "doc": "CV · Líder de Growth Marketing",
        "lines": [
            ("Bajé 31% el costo de adquisición en dos trimestres", "ev_4", True),
            ("Rehíce en SQL el reporte semanal de ingresos", "ev_9", True),
            ("Crecí el tráfico orgánico 300%", "sin evidencia", False),
        ],
        "verdict": "VALE LA PENA",
        "checks": "números verificados en código",
    },
}


def emblem(a, x, y, s):
    a(f'<g transform="translate({x} {y}) scale({s})">')
    a(f'<polygon points="64,12 110,38 110,90 64,116 18,90 18,38" fill="{CARBON}" stroke="{BONE}" stroke-width="3" stroke-linejoin="round"/>')
    a(f'<g stroke="{LINE}" stroke-width="2" stroke-linejoin="round" fill="none"><polyline points="64,12 64,64 110,38"/><polyline points="64,64 110,90"/><polyline points="64,64 18,90"/><polyline points="64,64 18,38"/><polyline points="64,64 64,116"/></g>')
    a(f'<circle class="ring" cx="64" cy="64" r="9" fill="none" stroke="{AMBER}" stroke-width="3"/>')
    a(f'<circle class="pulse" cx="64" cy="64" r="9" fill="{AMBER}"/>')
    a("</g>")


def check(a, x, y, color, cls=""):
    a(f'<path class="{cls}" d="M{x - 6} {y} l4 4 l8 -9" fill="none" stroke="{color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>')


def cross(a, x, y, color):
    a(f'<path d="M{x - 5} {y - 5} l10 10 M{x + 5} {y - 5} l-10 10" stroke="{color}" stroke-width="2.6" stroke-linecap="round"/>')


def build(lang):
    c = COPY[lang]
    W, H = 1280, 440
    out = []
    a = out.append
    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{c["label"]}">')
    a(f"<title>{c['label']}</title>")
    a("""<style>
.pulse{animation:pulse 2.4s ease-out infinite;transform-origin:center;transform-box:fill-box}
.ring{animation:ring 2.4s ease-out infinite;transform-origin:center;transform-box:fill-box}
.cite{animation:cite 3.6s ease-in-out infinite}
.strike{stroke-dasharray:320;stroke-dashoffset:320;animation:strike 3.6s ease-in-out infinite}
.caret{animation:blink 1.1s steps(2,start) infinite}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
@keyframes ring{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.4);opacity:0}}
@keyframes cite{0%,15%{opacity:.35}30%,100%{opacity:1}}
@keyframes strike{0%,45%{stroke-dashoffset:320}70%,100%{stroke-dashoffset:0}}
@keyframes blink{to{visibility:hidden}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.strike{stroke-dashoffset:0}}
</style>""")
    a(f"""<defs>
<radialGradient id="glow" cx="0.28" cy="0.5" r="0.55"><stop offset="0" stop-color="{AMBER}" stop-opacity=".16"/><stop offset="1" stop-color="{AMBER}" stop-opacity="0"/></radialGradient>
<radialGradient id="glow2" cx="0.85" cy="0.2" r="0.5"><stop offset="0" stop-color="#5E9BD6" stop-opacity=".10"/><stop offset="1" stop-color="#5E9BD6" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="{LINE}"/></pattern>
<linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".35" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".15"/></linearGradient>
<mask id="dotmask"><rect width="{W}" height="{H}" fill="url(#fade)"/></mask>
<clipPath id="card"><rect width="{W}" height="{H}" rx="24"/></clipPath>
</defs>""")
    a('<g clip-path="url(#card)">')
    a(f'<rect width="{W}" height="{H}" fill="{GRAPHITE}"/>')
    a(f'<rect width="{W}" height="{H}" fill="url(#dots)" mask="url(#dotmask)"/>')
    a(f'<rect width="{W}" height="{H}" fill="url(#glow)"/><rect width="{W}" height="{H}" fill="url(#glow2)"/>')

    emblem(a, 72, 78, 0.62)
    d, _ = text(c["kicker"], 170, 126, 16, MONO, 500, tracking=0.2)
    a(f'<path d="{d}" fill="{STEEL}"/>')

    d1, w1 = text("CV", 70, 244, 88, SG, 700, tracking=-0.02)
    a(f'<path d="{d1}" fill="{BONE}"/>')
    d2, _ = text("FORGE", 70 + w1 + 6, 244, 88, SG, 700, tracking=-0.02)
    a(f'<path d="{d2}" fill="{AMBER}"/>')

    d, _ = text(c["tag"], 73, 298, 23, INTER, 450)
    a(f'<path d="{d}" fill="{STEEL}"/>')

    x = 74
    for label in c["chips"]:
        tw = width(label, 15, MONO, 500)
        a(f'<rect x="{x}" y="340" width="{tw + 28:.1f}" height="34" rx="17" fill="{CARBON}" stroke="{LINE}"/>')
        d, _ = text(label, x + 14, 362, 15, MONO, 500)
        a(f'<path d="{d}" fill="{BONE}"/>')
        x += tw + 28 + 10

    # --- document card ---
    DX, DY, DW, DH = 760, 56, 460, 328
    a(f'<rect x="{DX}" y="{DY}" width="{DW}" height="{DH}" rx="18" fill="{CARBON}" stroke="{LINE}" stroke-width="2"/>')
    d, _ = text(c["doc"], DX + 26, DY + 42, 19, SG, 600)
    a(f'<path d="{d}" fill="{BONE}"/>')
    vw = width(c["verdict"], 12.5, MONO, 600)
    a(f'<rect x="{DX + DW - vw - 50:.1f}" y="{DY + 22}" width="{vw + 26:.1f}" height="28" rx="14" fill="{OK}" fill-opacity=".14" stroke="{OK}" stroke-opacity=".6"/>')
    d, _ = text(c["verdict"], DX + DW - vw - 37, DY + 41, 12.5, MONO, 600)
    a(f'<path d="{d}" fill="{OK}"/>')
    a(f'<rect x="{DX + 26}" y="{DY + 62}" width="{DW - 52}" height="2" fill="{LINE}"/>')

    y = DY + 100
    for i, (line, cite, ok) in enumerate(c["lines"]):
        a(f'<circle cx="{DX + 32}" cy="{y - 6}" r="3.5" fill="{STEEL if ok else ERR}"/>')
        d, lw = text(line, DX + 46, y, 15.5, INTER, 450)
        a(f'<path d="{d}" fill="{BONE if ok else STEEL}"/>')
        cw = width(cite, 12, MONO, 600)
        cy = y + 14
        col = AMBER if ok else ERR
        a(f'<g class="cite" style="animation-delay:{i * 0.5:.1f}s">')
        a(f'<rect x="{DX + 46}" y="{cy}" width="{cw + 36:.1f}" height="22" rx="11" fill="{col}" fill-opacity=".12" stroke="{col}" stroke-opacity=".55"/>')
        if ok:
            check(a, DX + 60, cy + 11, col)
        else:
            cross(a, DX + 60, cy + 11, col)
        d, _ = text(cite, DX + 72, cy + 15.5, 12, MONO, 600)
        a(f'<path d="{d}" fill="{col}"/>')
        a("</g>")
        if not ok:
            a(f'<path class="strike" d="M{DX + 44} {y - 5.5} h{lw + 6:.1f}" stroke="{ERR}" stroke-width="2"/>')
        y += 64

    # footer: code check
    fy = DY + DH - 30
    a(f'<rect x="{DX + 26}" y="{fy - 24}" width="{DW - 52}" height="2" fill="{LINE}"/>')
    check(a, DX + 36, fy, OK)
    d, _ = text(c["checks"], DX + 52, fy + 5, 13.5, MONO, 500)
    a(f'<path d="{d}" fill="{STEEL}"/>')
    a(f'<rect class="caret" x="{DX + DW - 40}" y="{fy - 10}" width="8" height="16" fill="{AMBER}"/>')

    a("</g>")
    a(f'<rect x="1" y="1" width="{W - 2}" height="{H - 2}" rx="23" fill="none" stroke="{LINE}" stroke-width="2"/>')
    a("</svg>")
    return "\n".join(out)


DIAGRAM = {
    "en": {
        "label": "How CVForge works: in your browser, the app on 127.0.0.1 turns your CV into evidence, triages postings against it, records the gaps you really have, composes the kit only from cited evidence and verifies it in code. Everything is stored in a local SQLite file. Outside traffic goes to Anthropic's API with your own key, plus an opt-in daily version check.",
        "local": "YOUR MACHINE", "net": "INTERNET",
        "browser": ("Your browser", "CVForge on localhost"),
        "app": ("cvforge", "listens on 127.0.0.1 only"),
        "db": ("SQLite", "evidence · applications · spend · key"),
        "api": ("Anthropic API", "the model · your own key"),
        "update": ("version.json", "opt-in · once a day"),
        "steps": ["CV", "evidence", "triage", "gaps", "kit"],
        "verify": "verified in code: citations · numbers · gaps · tense",
        "ui": "UI · your answers",
        "calls": "model calls", "check": "update check",
        "none": "no telemetry · no accounts",
    },
    "es": {
        "label": "Cómo funciona CVForge: en tu navegador, la app en 127.0.0.1 convierte tu CV en evidencia, evalúa vacantes contra ella, registra los huecos que sí tienes, compone el kit solo con evidencia citada y lo verifica en código. Todo se guarda en un SQLite local. El tráfico hacia fuera va a la API de Anthropic con tu propia clave, más una comprobación diaria opcional de versión.",
        "local": "TU COMPUTADORA", "net": "INTERNET",
        "browser": ("Tu navegador", "CVForge en localhost"),
        "app": ("cvforge", "escucha solo en 127.0.0.1"),
        "db": ("SQLite", "evidencia · postulaciones · gasto · clave"),
        "api": ("API de Anthropic", "el modelo · tu propia clave"),
        "update": ("version.json", "opcional · una vez al día"),
        "steps": ["CV", "evidencia", "triage", "huecos", "kit"],
        "verify": "verificado en código: citas · números · huecos · tiempo verbal",
        "ui": "interfaz · tus respuestas",
        "calls": "llamadas al modelo", "check": "buscar versión",
        "none": "sin telemetría · sin cuentas",
    },
}


def diagram(lang):
    c = DIAGRAM[lang]
    W, H = 1280, 600
    out = []
    a = out.append
    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{c["label"]}">')
    a(f"<title>{c['label']}</title>")
    a("""<style>
.flow{stroke-dasharray:10 8;animation:flow 1.2s linear infinite}
.flow-slow{stroke-dasharray:4 7;animation:flow 2.4s linear infinite}
.step{animation:step 5s ease-in-out infinite}
@keyframes flow{to{stroke-dashoffset:-36}}
@keyframes step{0%,100%{stroke-opacity:.35}20%{stroke-opacity:1}40%{stroke-opacity:.35}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>""")
    a(f"""<defs>
<marker id="pa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{AMBER}"/></marker>
<marker id="ps" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{STEEL}"/></marker>
<clipPath id="card"><rect width="{W}" height="{H}" rx="24"/></clipPath>
<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="{LINE}"/></pattern>
</defs>""")
    a('<g clip-path="url(#card)">')
    a(f'<rect width="{W}" height="{H}" fill="{GRAPHITE}"/>')
    a(f'<rect width="{W}" height="{H}" fill="url(#dots)" opacity=".5"/>')

    def panel(x, y, w, h, title):
        a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{CARBON}" fill-opacity=".55" stroke="{LINE}" stroke-width="2"/>')
        d, _ = text(title, x + 24, y + 34, 14, MONO, 600, tracking=0.2)
        a(f'<path d="{d}" fill="{STEEL}"/>')

    def box(cx, cy, w, h, t1, t2, strong=False, cylinder=False):
        x, y = cx - w / 2, cy - h / 2
        border = AMBER if strong else STEEL
        if cylinder:
            a(f'<path d="M{x} {y + 12} v{h - 24} a{w / 2} 12 0 0 0 {w} 0 v{-(h - 24)}" fill="{GRAPHITE}" stroke="{border}" stroke-width="2"/>')
            a(f'<ellipse cx="{cx}" cy="{y + 12}" rx="{w / 2}" ry="12" fill="{CARBON}" stroke="{border}" stroke-width="2"/>')
            ty = cy + 8
        else:
            a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{GRAPHITE}" stroke="{border}" stroke-width="{2.5 if strong else 1.5}"/>')
            ty = cy
        tw1 = width(t1, 21, SG, 600)
        d, _ = text(t1, cx - tw1 / 2, ty - 2, 21, SG, 600)
        a(f'<path d="{d}" fill="{BONE}"/>')
        tw2 = width(t2, 13.5, MONO, 400)
        d, _ = text(t2, cx - tw2 / 2, ty + 22, 13.5, MONO, 400)
        a(f'<path d="{d}" fill="{STEEL}"/>')

    def tag(s, cx, cy, color=BONE):
        w = width(s, 13.5, MONO, 500)
        a(f'<rect x="{cx - w / 2 - 10:.1f}" y="{cy - 14}" width="{w + 20:.1f}" height="26" rx="13" fill="{GRAPHITE}" stroke="{LINE}"/>')
        d, _ = text(s, cx - w / 2, cy + 4, 13.5, MONO, 500)
        a(f'<path d="{d}" fill="{color}"/>')

    panel(40, 40, 680, 520, c["local"])
    panel(840, 40, 400, 520, c["net"])

    BX, BY = 380, 130    # browser
    AX, AY = 380, 300    # app (wide, holds the pipeline)
    DX, DY = 380, 480    # sqlite
    PX, PY = 1040, 250   # anthropic
    UX, UY = 1040, 420   # version.json

    a(f'<path d="M{BX} {BY + 45} V{AY - 95}" stroke="{STEEL}" stroke-width="2" fill="none" marker-start="url(#ps)" marker-end="url(#ps)"/>')
    a(f'<path d="M{AX} {AY + 95} V{DY - 42}" stroke="{STEEL}" stroke-width="2" fill="none" marker-start="url(#ps)" marker-end="url(#ps)"/>')
    a(f'<path class="flow" d="M{AX + 300} {AY - 50} C {AX + 420} {AY - 50}, {PX - 260} {PY}, {PX - 170} {PY}" stroke="{AMBER}" stroke-width="4" fill="none" marker-start="url(#pa)" marker-end="url(#pa)"/>')
    a(f'<path class="flow-slow" d="M{AX + 300} {AY + 60} C {AX + 420} {AY + 60}, {UX - 260} {UY}, {UX - 170} {UY}" stroke="{STEEL}" stroke-width="2" fill="none" marker-end="url(#ps)"/>')

    box(BX, BY, 320, 90, *c["browser"])
    # app: a wide box with the pipeline inside
    ax, ay, aw, ah = AX - 300, AY - 95, 600, 190
    a(f'<rect x="{ax}" y="{ay}" width="{aw}" height="{ah}" rx="16" fill="{GRAPHITE}" stroke="{AMBER}" stroke-width="2.5"/>')
    tw = width(c["app"][0], 21, SG, 600)
    d, _ = text(c["app"][0], ax + 24, ay + 36, 21, SG, 600)
    a(f'<path d="{d}" fill="{BONE}"/>')
    d, _ = text(c["app"][1], ax + 24 + tw + 14, ay + 35, 13.5, MONO, 400)
    a(f'<path d="{d}" fill="{STEEL}"/>')
    steps = c["steps"]
    gap = 14
    sw = [width(s, 14, MONO, 600) + 28 for s in steps]
    total = sum(sw) + gap * (len(steps) - 1) + 18 * (len(steps) - 1)
    x = ax + (aw - total) / 2
    sy = ay + 74
    for i, s in enumerate(steps):
        a(f'<rect class="step" style="animation-delay:{i * 0.9:.1f}s" x="{x:.1f}" y="{sy}" width="{sw[i]:.1f}" height="34" rx="17" fill="{CARBON}" stroke="{AMBER}" stroke-width="2"/>')
        d, _ = text(s, x + 14, sy + 22, 14, MONO, 600)
        a(f'<path d="{d}" fill="{BONE}"/>')
        x += sw[i]
        if i < len(steps) - 1:
            a(f'<path d="M{x + 4:.1f} {sy + 17} h{gap + 10}" stroke="{STEEL}" stroke-width="2" marker-end="url(#ps)"/>')
            x += gap + 18
    vw = width(c["verify"], 13, MONO, 500)
    vy = ay + ah - 44
    a(f'<rect x="{ax + (aw - vw) / 2 - 36:.1f}" y="{vy}" width="{vw + 52:.1f}" height="28" rx="14" fill="{OK}" fill-opacity=".10" stroke="{OK}" stroke-opacity=".55"/>')
    check(a, ax + (aw - vw) / 2 - 16, vy + 14, OK)
    d, _ = text(c["verify"], ax + (aw - vw) / 2, vy + 19, 13, MONO, 500)
    a(f'<path d="{d}" fill="{OK}"/>')

    box(DX, DY, 360, 84, *c["db"], cylinder=True)
    box(PX, PY, 320, 90, *c["api"], strong=True)
    box(UX, UY, 320, 84, *c["update"])

    tag(c["ui"], BX + 150, (BY + AY - 95) / 2 + 22)
    tag(c["calls"], 760, AY - 72, AMBER)
    tag(c["check"], 760, AY + 108)
    tag(c["none"], 1040, 520, STEEL)

    a("</g>")
    a(f'<rect x="1" y="1" width="{W - 2}" height="{H - 2}" rx="23" fill="none" stroke="{LINE}" stroke-width="2"/>')
    a("</svg>")
    return "\n".join(out)


if __name__ == "__main__":
    dest = os.path.join(ROOT, "assets", "readme")
    for lang in ("en", "es"):
        with open(f"{dest}/banner-{lang}.svg", "w") as fh:
            fh.write(build(lang) + "\n")
        with open(f"{dest}/diagram-{lang}.svg", "w") as fh:
            fh.write(diagram(lang) + "\n")
