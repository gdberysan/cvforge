/**
 * Builds the release zip: scrub gate → standalone build (CVFORGE_DISCOVER
 * stripped) → discover-exclusion gate → bundle Node runtimes → stage the
 * buyer layout → boot gate → sha256. Dry runs with `--ref HEAD`.
 *
 * `--personal` builds the maintainer's own copy instead: discover enabled,
 * the exclusion gate inverted to prove the scraper is present, the launchers
 * patched to export the flag, and a distinct `cvforge-personal-*` name. Never
 * sold. See the `personal` const below.
 *
 * Buyer layout — nothing to install, nothing to compile, no terminal:
 *
 *   cvforge-vX.Y.Z/
 *     LEEME.html               the product manual
 *     CVForge.app              macOS launcher (bundled runtime, no window)
 *     CVForge (Windows).vbs    Windows launcher (bundled runtime, hidden)
 *     programa/
 *       servidor/              prebuilt standalone server (+static, public)
 *       node/                  pinned Node runtimes: mac-arm64/x64, win-x64
 *       start.sh               Linux / terminal fallback (system Node)
 *       LICENSE
 *     codigo-fuente/           PERSONAL builds only — the maintainer's source
 *                              (scrubbed git archive). Buyers get compiled only.
 *
 * datos/ appears next to LEEME on first use (created by the launchers).
 * The zip ships the compiled app, not the source tree; the scrub gate still
 * scans the source archive, and the boot gate proves the exact zip serves
 * HTTP before a checksum is published.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanTreeForDenied } from '@/lib/release/scrub'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const refArg = process.argv.indexOf('--ref')
const ref = refArg !== -1 ? process.argv[refArg + 1] : `v${pkg.version}`
const dry = ref === 'HEAD'
/**
 * Personal build (`--personal`): the maintainer's own copy, WITH the LinkedIn
 * scraper enabled. It is never sold — a distinct artifact name, the exclusion
 * gate inverts to prove the scraper IS present, and the launchers export
 * CVFORGE_DISCOVER=1 so the page is live. The buyer path is unchanged when the
 * flag is absent.
 */
const personal = process.argv.includes('--personal')

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()

if (!dry) {
  // next-env.d.ts is generated and flip-flops between dev-server and build
  // runs; churn there is noise, not uncommitted work.
  const dirty = git('status', '--porcelain')
    .split('\n')
    .filter((l) => l && !l.endsWith(' next-env.d.ts'))
  if (dirty.length > 0) {
    console.error(`release: working tree is not clean:\n${dirty.join('\n')}`)
    process.exit(1)
  }
  try {
    git('rev-parse', '--verify', `refs/tags/${ref}`)
  } catch {
    console.error(`release: tag ${ref} does not exist. Create it: git tag -a ${ref} -m "${ref}"`)
    process.exit(1)
  }
  // The zip is built from the working tree, so the tag must BE the tree.
  if (git('rev-parse', `${ref}^{commit}`) !== git('rev-parse', 'HEAD')) {
    console.error(`release: tag ${ref} does not point at HEAD.`)
    process.exit(1)
  }
}

// Three files carry the version and all three ship: package.json (the
// artifact name), public/version.json (what the opt-in update check reads)
// and the CHANGELOG's top entry (packaged into the personal zip). A forgotten
// bump used to ship silently.
{
  const versionJson = JSON.parse(readFileSync('public/version.json', 'utf8')) as {
    version?: string
    lines?: Record<string, string>
  }
  const line = pkg.version.split('.').slice(0, 2).join('.')
  const changelogTop = readFileSync('CHANGELOG.md', 'utf8').match(/^## \[?v?(\d+\.\d+\.\d+)/m)?.[1]
  const mismatches = [
    versionJson.version !== pkg.version && `public/version.json says ${versionJson.version}`,
    versionJson.lines?.[line] !== pkg.version &&
      `public/version.json's lines["${line}"] is ${versionJson.lines?.[line] ?? 'missing'}`,
    changelogTop !== pkg.version && `CHANGELOG.md's top entry is ${changelogTop ?? 'missing'}`,
  ].filter(Boolean)
  if (mismatches.length > 0) {
    console.error(`release: package.json is ${pkg.version} but ${mismatches.join('; ')}.`)
    process.exit(1)
  }
}

execFileSync('npx', ['tsx', 'scripts/scrub-check.ts', ref], { stdio: 'inherit' })

// ---------------------------------------------------------------- build
console.log(
  `release: building standalone server${personal ? ' (personal — discover enabled)' : ''}…`,
)
// Discover (personal-only) must not ship in a buyer build: strip
// CVFORGE_DISCOVER so '#discover' resolves to the stub, regardless of the
// parent shell. A personal build sets it so the alias resolves to the real
// scraper module.
execFileSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, CVFORGE_DISCOVER: personal ? '1' : '' },
})
const standalone = path.join('.next', 'standalone')
if (!existsSync(path.join(standalone, 'server.js'))) {
  console.error('release: .next/standalone/server.js missing — is output "standalone" set?')
  process.exit(1)
}

// Trust, but verify — same philosophy as the API-key bundle scan. A buyer
// build must contain NO scraper (the alias resolved to the stub); a personal
// build must contain it (the alias resolved to the real module). The marker
// is the LinkedIn endpoint literal, which survives minification.
const serverChunks: string[] = []
const walkServer = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walkServer(full)
    else if (/\.(js|mjs)$/.test(name)) serverChunks.push(full)
  }
}
walkServer(path.join('.next', 'server'))
const offending = serverChunks.filter((f) => readFileSync(f, 'utf8').includes('jobs-guest'))
if (personal) {
  if (offending.length === 0) {
    console.error('personal: scraper missing from the build — did CVFORGE_DISCOVER=1 reach it?')
    process.exit(1)
  }
  console.log('release: personal build includes discover (verified).')
} else {
  console.log('release: verifying discover exclusion…')
  if (offending.length > 0) {
    console.error('release: scraper code compiled into the buyer build — was CVFORGE_DISCOVER set?')
    for (const f of offending) console.error(`  ${f}`)
    process.exit(1)
  }
}

// ------------------------------------------------------- node runtimes
// Pinned to the exact version this release was built and gated with.
const NODE_VERSION = process.version // e.g. v24.16.0
// `prebuild` is the better-sqlite3 native binary that node runtime needs
// (better-sqlite3/prebuilds/<prebuild>.node). npm only installs the build
// host's prebuild, so every other runtime we bundle would crash on any
// DB-backed route without an explicit copy — see stageAndZip / bootGate.
const RUNTIMES = [
  {
    dir: 'mac-arm64',
    file: `node-${NODE_VERSION}-darwin-arm64.tar.gz`,
    bin: 'node',
    prebuild: 'darwin-arm64',
  },
  {
    dir: 'mac-x64',
    file: `node-${NODE_VERSION}-darwin-x64.tar.gz`,
    bin: 'node',
    prebuild: 'darwin-x64',
  },
  {
    dir: 'win-x64',
    file: `node-${NODE_VERSION}-win-x64.zip`,
    bin: 'node.exe',
    prebuild: 'win32-x64',
  },
] as const

// Outside the project on purpose: a cache inside the tree once got traced
// into the standalone output (three runtimes, ~500MB) and tripled the zip.
const cacheDir = path.join(os.homedir(), '.cache', 'cvforge-release', NODE_VERSION)
mkdirSync(cacheDir, { recursive: true })

/**
 * The pinned version's checksum list, cached beside its runtimes: it never
 * changes, so a release with a warm cache needs no network — one that
 * fetched it on every run failed on a passing network drop.
 */
async function nodeShasums(base: string): Promise<string> {
  const cached = path.join(cacheDir, 'SHASUMS256.txt')
  if (existsSync(cached)) return readFileSync(cached, 'utf8')
  let res: Response
  try {
    res = await fetch(`${base}SHASUMS256.txt`)
  } catch (err) {
    throw new Error(`could not reach nodejs.org for ${NODE_VERSION} checksums`, { cause: err })
  }
  if (!res.ok) throw new Error(`nodejs.org checksums: HTTP ${res.status}`)
  const text = await res.text()
  writeFileSync(cached, text)
  return text
}

async function fetchRuntimes(): Promise<void> {
  const base = `https://nodejs.org/dist/${NODE_VERSION}/`
  const shasums = await nodeShasums(base)
  for (const rt of RUNTIMES) {
    const archive = path.join(cacheDir, rt.file)
    const expected = shasums
      .split('\n')
      .find((l) => l.endsWith(rt.file))
      ?.split(/\s+/)[0]
    if (!expected) throw new Error(`no SHASUMS entry for ${rt.file}`)
    if (!existsSync(archive)) {
      console.log(`release: downloading ${rt.file}…`)
      const res = await fetch(base + rt.file)
      if (!res.ok) throw new Error(`download failed: ${rt.file} (${res.status})`)
      writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
    }
    const sha = createHash('sha256').update(readFileSync(archive)).digest('hex')
    if (sha !== expected) {
      rmSync(archive, { force: true })
      throw new Error(`checksum mismatch for ${rt.file} — file deleted, re-run`)
    }
    const outDir = path.join(cacheDir, rt.dir)
    if (!existsSync(path.join(outDir, rt.bin))) {
      mkdirSync(outDir, { recursive: true })
      const inner = rt.file.replace(/\.(tar\.gz|zip)$/, '')
      if (rt.file.endsWith('.tar.gz')) {
        execFileSync('tar', [
          '-xzf',
          archive,
          '-C',
          outDir,
          '--strip-components',
          '2',
          `${inner}/bin/node`,
        ])
      } else {
        execFileSync('unzip', ['-qj', archive, `${inner}/node.exe`, '-d', outDir])
      }
    }
  }
}

// ---------------------------------------------------------------- stage
const name = `cvforge-${personal ? 'personal-' : ''}v${pkg.version}${dry ? '-dry' : ''}`
// publico/ = sellable buyer builds (no scraper); personal/ = the maintainer's
// own builds (with the scraper). Never mix them — a scraper/PII build must
// never land in the folder that gets uploaded for sale.
const outDir = path.join('dist', personal ? 'personal' : 'publico')
const zip = path.join(outDir, `${name}.zip`)

/** Replace `from` with `to` in a file, failing loudly if the anchor moved. */
function inject(file: string, from: string, to: string): void {
  const before = readFileSync(file, 'utf8')
  const after = before.replace(from, to)
  if (after === before) {
    throw new Error(`personal: could not inject the discover flag into ${path.basename(file)}`)
  }
  writeFileSync(file, after)
}

// The prebuilt native binaries better-sqlite3 ships. The source install holds
// every platform's; the copies the tracer stages hold only the build host's.
const PREBUILD_SRC = path.join('node_modules', 'better-sqlite3', 'prebuilds')
const REQUIRED_PREBUILDS = RUNTIMES.map((rt) => `${rt.prebuild}.node`)

/** Every better-sqlite3 module root under `dir` (each holds lib/binding.js). */
function betterSqliteDirs(dir: string): string[] {
  const found: string[] = []
  const walk = (d: string): void => {
    for (const n of readdirSync(d)) {
      const full = path.join(d, n)
      if (!statSync(full).isDirectory()) continue
      if (
        /^better-sqlite3(-[0-9a-f]+)?$/.test(n) &&
        existsSync(path.join(full, 'lib', 'binding.js'))
      ) {
        found.push(full)
      } else {
        walk(full)
      }
    }
  }
  walk(dir)
  return found
}

// playwright-core's registry needs this static manifest just to initialize —
// even to probe for a SYSTEM chrome/msedge channel, before ever touching a
// bundled browser. The tracer keeps playwright-core's JS (it's on the import
// graph) but drops this (it isn't), so every channel probe throws
// MODULE_NOT_FOUND before checking anything and the PDF engine looks absent
// no matter what the user actually has installed. Found by hand: the earlier
// "Chrome not detected" diagnosis was wrong — reproducing the exact failure
// with the packaged runtime surfaced this instead.
const PLAYWRIGHT_BROWSERS_JSON = path.join('node_modules', 'playwright-core', 'browsers.json')

/** Every playwright-core module root under `dir`. */
function playwrightCoreDirs(dir: string): string[] {
  const found: string[] = []
  const walk = (d: string): void => {
    for (const n of readdirSync(d)) {
      const full = path.join(d, n)
      if (!statSync(full).isDirectory()) continue
      if (n === 'playwright-core' && existsSync(path.join(full, 'lib', 'coreBundle.js'))) {
        found.push(full)
      } else {
        walk(full)
      }
    }
  }
  walk(dir)
  return found
}

// Buyers receive the compiled app only. The source (codigo-fuente/) is the
// maintainer's, so it ships in personal builds only — never for sale.
const TOP_LEVEL = [
  'LEEME.html',
  'CVForge.app',
  'CVForge (Windows).vbs',
  'programa',
  ...(personal ? ['codigo-fuente'] : []),
]

/**
 * The ONLY entries a Next standalone server needs at runtime. Next's tracer
 * over-includes the whole project tree into `.next/standalone` (source, tests,
 * docs, and — critically — data/, backups/, evals/private with real PII), and
 * `.gitignore` has no effect on the tracer. So we do not trust the tracer's
 * output: we copy it, then delete everything outside this allowlist, and the
 * boot gate re-asserts it on the extracted zip. `public` is added after the
 * prune. Anchored on exact top-level names — never globs (an earlier `dist`
 * glob also matched node_modules/next/dist and broke every route).
 */
const SERVIDOR_KEEP = new Set([
  '.next',
  'server.js',
  'package.json',
  'node_modules',
  'drizzle',
  'demo',
  'public',
])

/**
 * Next's build-time trace manifests (`*.nft.json`) under a server's `.next`.
 * The standalone server never reads them, yet each lists the project tree the
 * tracer saw — up to the maintainer's dist/ folder and its quarantined zips.
 * Paths only, no content, but a buyer has no business with any of it.
 */
function traceManifests(servidorDir: string): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const n of readdirSync(dir)) {
      const f = path.join(dir, n)
      if (statSync(f).isDirectory()) walk(f)
      else if (n.endsWith('.nft.json')) found.push(f)
    }
  }
  const next = path.join(servidorDir, '.next')
  if (existsSync(next)) walk(next)
  return found
}

/**
 * Files in a staged server that name the build machine's project folder.
 * Next writes it into the embedded config (outputFileTracingRoot,
 * turbopack.root, repoRoot) and appDir; the standalone server resolves its
 * own location from __dirname at run time and reads none of them, but every
 * zip through v1.2.58 carried the maintainer's home folder in them.
 */
const BUILD_ROOT_FILES = ['server.js', path.join('.next', 'required-server-files.json')]

/** Replaces the build root with "." in those files; returns how many changed. */
function scrubBuildRoot(servidorDir: string, buildRoot: string): number {
  let changed = 0
  for (const rel of BUILD_ROOT_FILES) {
    const f = path.join(servidorDir, rel)
    if (!existsSync(f)) continue
    const text = readFileSync(f, 'utf8')
    const next = text.split(buildRoot).join('.')
    if (next !== text) {
      writeFileSync(f, next)
      changed++
    }
  }
  return changed
}

/** Every file under `dir` whose text contains `needle`, binaries skipped. */
function filesContaining(dir: string, needle: string): string[] {
  const found: string[] = []
  const walk = (d: string): void => {
    for (const n of readdirSync(d)) {
      const f = path.join(d, n)
      const st = statSync(f)
      if (st.isDirectory()) walk(f)
      else if (st.size < 32 * 1024 * 1024) {
        const buf = readFileSync(f)
        if (buf.subarray(0, 8192).includes(0)) continue
        if (buf.includes(needle)) found.push(f)
      }
    }
  }
  walk(dir)
  return found
}

function stageAndZip(): void {
  const stage = mkdtempSync(path.join(os.tmpdir(), 'cvforge-stage-'))
  try {
    const root = path.join(stage, name)
    const servidor = path.join(root, 'programa', 'servidor')
    mkdirSync(servidor, { recursive: true })

    cpSync('LEEME.html', path.join(root, 'LEEME.html'))
    cpSync('packaging/CVForge (Windows).vbs', path.join(root, 'CVForge (Windows).vbs'))
    cpSync('packaging/CVForge.app', path.join(root, 'CVForge.app'), { recursive: true })
    // The bundle's version string follows the release, not the template.
    const plist = path.join(root, 'CVForge.app', 'Contents', 'Info.plist')
    writeFileSync(
      plist,
      readFileSync(plist, 'utf8').replace(
        /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/,
        `$1${pkg.version}$2`,
      ),
    )

    // The standalone server plus the two directories Next documents as the
    // deployer's job to place beside it.
    cpSync(standalone, servidor, { recursive: true })
    // Prune the tracer's over-inclusion down to what the server needs. Without
    // this the zip ships the entire repo — source, tests, and data/, backups/,
    // evals/private (real personal data). See SERVIDOR_KEEP.
    for (const entry of readdirSync(servidor)) {
      if (!SERVIDOR_KEEP.has(entry)) {
        rmSync(path.join(servidor, entry), { recursive: true, force: true })
      }
    }
    // Buyers get the demo's data, never its source: persona.ts is the seed
    // builder's input and shipped as TypeScript in every zip through v1.2.19.
    rmSync(path.join(servidor, 'demo', 'persona.ts'), { force: true })
    for (const f of traceManifests(servidor)) rmSync(f)
    scrubBuildRoot(servidor, process.cwd())
    cpSync(path.join('.next', 'static'), path.join(servidor, '.next', 'static'), {
      recursive: true,
    })
    cpSync('public', path.join(servidor, 'public'), { recursive: true })

    // We bundle three node runtimes (mac-arm64/x64, win-x64) but npm installs
    // only the build host's better-sqlite3 prebuild, so every copy the tracer
    // staged carries just one platform's .node. Backfill each copy with the
    // full set from the source install, or the app crashes on every DB-backed
    // route under any other runtime (Intel Mac, Rosetta, Windows). The boot
    // gate re-asserts coverage on the extracted zip.
    for (const bsql of betterSqliteDirs(servidor)) {
      cpSync(PREBUILD_SRC, path.join(bsql, 'prebuilds'), { recursive: true })
    }

    // Same class of gap, different package — see PLAYWRIGHT_BROWSERS_JSON.
    for (const pwCore of playwrightCoreDirs(servidor)) {
      cpSync(PLAYWRIGHT_BROWSERS_JSON, path.join(pwCore, 'browsers.json'))
    }

    cpSync('start.sh', path.join(root, 'programa', 'start.sh'))
    chmodSync(path.join(root, 'programa', 'start.sh'), 0o755)
    cpSync('LICENSE', path.join(root, 'programa', 'LICENSE'))

    if (personal) {
      // The alias baked the scraper into the build; the launchers must also
      // export CVFORGE_DISCOVER=1 so isDiscoverEnabled() is true at runtime
      // (nav shows discover, /discover serves instead of 404ing).
      inject(
        path.join(root, 'CVForge.app', 'Contents', 'MacOS', 'CVForge'),
        'HOSTNAME=127.0.0.1 PORT="$PORT" CVFORGE_DB_PATH="$ROOT/datos/cvforge.db"',
        'CVFORGE_DISCOVER=1 HOSTNAME=127.0.0.1 PORT="$PORT" CVFORGE_DB_PATH="$ROOT/datos/cvforge.db"',
      )
      inject(
        path.join(root, 'programa', 'start.sh'),
        'exec env HOSTNAME=127.0.0.1 PORT="$PORT" CVFORGE_DB_PATH="$ROOT/datos/cvforge.db" node server.js',
        'exec env CVFORGE_DISCOVER=1 HOSTNAME=127.0.0.1 PORT="$PORT" CVFORGE_DB_PATH="$ROOT/datos/cvforge.db" node server.js',
      )
      inject(
        path.join(root, 'CVForge (Windows).vbs'),
        'env("CVFORGE_DB_PATH") = root & "\\datos\\cvforge.db"',
        'env("CVFORGE_DB_PATH") = root & "\\datos\\cvforge.db"\nenv("CVFORGE_DISCOVER") = "1"',
      )
    }

    for (const rt of RUNTIMES) {
      const dest = path.join(root, 'programa', 'node', rt.dir)
      mkdirSync(dest, { recursive: true })
      cpSync(path.join(cacheDir, rt.dir, rt.bin), path.join(dest, rt.bin))
      if (rt.bin === 'node') chmodSync(path.join(dest, rt.bin), 0o755)
    }
    chmodSync(path.join(root, 'CVForge.app', 'Contents', 'MacOS', 'CVForge'), 0o755)

    // Source ships in the maintainer's PERSONAL build only — buyers get the
    // compiled app. A scrubbed git archive (tracked files minus export-ignored
    // scraper and gitignored data/backups/evals-private); builds from a clean
    // `npm ci && npm run build`.
    if (personal) {
      const fuente = path.join(root, 'codigo-fuente')
      mkdirSync(fuente, { recursive: true })
      const tarball = path.join(stage, 'fuente.tar')
      writeFileSync(
        tarball,
        execFileSync('git', ['archive', ref], { maxBuffer: 256 * 1024 * 1024 }),
      )
      execFileSync('tar', ['-xf', tarball, '-C', fuente])
      rmSync(tarball, { force: true })
    }

    mkdirSync(outDir, { recursive: true })
    rmSync(zip, { force: true })
    execFileSync('zip', ['-q', '-r', '-X', path.resolve(zip), name], { cwd: stage })
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

// ------------------------------------------------------------ boot gate
// The scrub gate proves the source doesn't leak; this proves the exact zip
// a buyer receives actually serves the app, using the bundled runtime.
async function bootGate(): Promise<void> {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'cvforge-release-'))
  const extracted = path.join(tmp, name)
  const port = 3891
  let child: ReturnType<typeof spawn> | null = null
  let serverLog = ''
  try {
    // No real CVForge.app is ever unpacked here: node deleting an app bundle
    // it did not create trips macOS App Management ("node was prevented from
    // modifying apps"), and the random temp path made each build a new
    // client in Privacy & Security (2026-11-25). The server run needs no app;
    // the app's files are checked from the zip itself and, for the
    // personal-data scan, unpacked flat (no .app folder) below.
    const appPrefix = `${name}/CVForge.app/`
    execFileSync('unzip', ['-q', path.resolve(zip), '-x', `${appPrefix}*`, '-d', tmp])
    const listing = execFileSync('zipinfo', [path.resolve(zip)], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .filter((cols) => cols.length >= 9 && /^[-dl]/.test(cols[0] ?? ''))
      .map((cols) => ({ mode: cols[0] ?? '', entry: cols.slice(8).join(' ') }))
    const appFiles = listing.filter((f) => f.entry.startsWith(appPrefix) && !f.entry.endsWith('/'))
    const appFlat = path.join(tmp, 'app-files')
    mkdirSync(appFlat)
    execFileSync('unzip', ['-q', '-j', path.resolve(zip), `${appPrefix}*`, '-d', appFlat])

    const top = [
      ...new Set(
        listing
          .map((f) => f.entry.slice(name.length + 1).split('/')[0] ?? '')
          .filter((e) => e !== ''),
      ),
    ].sort()
    const expected = [...TOP_LEVEL].sort()
    if (JSON.stringify(top) !== JSON.stringify(expected)) {
      throw new Error(`unexpected top level: ${top.join(', ')} (wanted: ${expected.join(', ')})`)
    }

    // Assert the shipped server carries nothing but the allowlist — the gate
    // that would have caught the whole-repo leak (data/, backups/, evals). Runs
    // on the EXTRACTED zip, so it proves what a buyer actually receives.
    const servidorRoot = path.join(extracted, 'programa', 'servidor')
    const demoSource = existsSync(path.join(servidorRoot, 'demo'))
      ? readdirSync(path.join(servidorRoot, 'demo')).filter((e) => /\.(ts|tsx|js|mjs)$/.test(e))
      : []
    if (demoSource.length > 0) {
      throw new Error(`source shipped under demo/: ${demoSource.join(', ')}`)
    }
    const traces = traceManifests(servidorRoot)
    if (traces.length > 0) {
      throw new Error(
        `trace manifests shipped (they list the project tree): ${traces.length}, e.g. ${path.relative(extracted, traces[0])}`,
      )
    }
    // The build machine's project folder (its user name with it) must not
    // ship anywhere in the server — whoever builds, whatever the denylist says.
    const rooted = filesContaining(servidorRoot, process.cwd())
    if (rooted.length > 0) {
      throw new Error(
        `the build folder ${process.cwd()} ships in: ${rooted.map((f) => path.relative(extracted, f)).join(', ')}`,
      )
    }
    const stray = readdirSync(servidorRoot).filter((e) => !SERVIDOR_KEEP.has(e))
    if (stray.length > 0) {
      throw new Error(`servidor/ leaked non-allowlisted entries: ${stray.join(', ')}`)
    }
    // Belt-and-suspenders across the WHOLE zip (server and codigo-fuente): no
    // database, backup, or personal file anywhere, node_modules aside
    // (third-party fixtures are not our PII).
    const sensitive: string[] = []
    const scan = (dir: string): void => {
      for (const n of readdirSync(dir)) {
        const f = path.join(dir, n)
        if (statSync(f).isDirectory()) {
          if (n !== 'node_modules') scan(f)
        } else if (/\.(db|db-wal|db-shm|bundle)$/.test(n) || n === 'denylist.txt') {
          sensitive.push(path.relative(extracted, f))
        }
      }
    }
    scan(extracted)
    if (sensitive.length > 0) {
      throw new Error(`zip leaked sensitive files: ${sensitive.join(', ')}`)
    }
    // The source gate scans `git archive`, but the zip is compiled from the
    // working tree — compiled demo and discover output never passed through
    // it. Same denylist, over every text file a buyer actually receives.
    const terms = readFileSync(path.join('evals', 'private', 'denylist.txt'), 'utf8').split('\n')
    const denied = scanTreeForDenied(extracted, terms, { skipDirs: ['node_modules'] })
    // The app's own files, checked from their flat copy (see above).
    denied.hits.push(...scanTreeForDenied(appFlat, terms).hits)
    if (denied.hits.length > 0) {
      throw new Error(
        `zip carries personal context: ${denied.hits.map((h) => `${h.file} ← "${h.term}"`).join(', ')}`,
      )
    }
    const launcher = appFiles.find((f) => f.entry === `${appPrefix}Contents/MacOS/CVForge`)
    if (!launcher?.mode.includes('x')) {
      throw new Error('CVForge.app/Contents/MacOS/CVForge lost its executable bit (or is missing)')
    }
    for (const f of [
      'programa/start.sh',
      'programa/node/mac-arm64/node',
      'programa/node/mac-x64/node',
    ]) {
      if (!(statSync(path.join(extracted, f)).mode & 0o111)) {
        throw new Error(`${f} lost its executable bit`)
      }
    }

    // Every bundled runtime needs its better-sqlite3 prebuild in every copy the
    // tracer staged, or DB-backed routes 500 under that runtime. This is the
    // gate that would have caught the missing darwin-x64/win32-x64 binaries —
    // the boot below only exercises the build host's arch, so it can't.
    for (const bsql of betterSqliteDirs(path.join(extracted, 'programa', 'servidor'))) {
      const missing = REQUIRED_PREBUILDS.filter((p) => !existsSync(path.join(bsql, 'prebuilds', p)))
      if (missing.length > 0) {
        const where = path.relative(extracted, bsql)
        throw new Error(`${where} is missing better-sqlite3 prebuilds: ${missing.join(', ')}`)
      }
    }
    // Best-effort: actually load better-sqlite3 under every mac runtime that can
    // execute here (the x64 one runs via Rosetta on Apple Silicon), proving the
    // .node really binds — not just that the file is present. Windows can't run,
    // so the static check above is its only guard.
    for (const rt of RUNTIMES.filter((r) => r.dir.startsWith('mac-'))) {
      const macNode = path.join(extracted, 'programa', 'node', rt.dir, rt.bin)
      try {
        const out = execFileSync(
          macNode,
          [
            '-e',
            "new (require('better-sqlite3'))(':memory:').prepare('select 1').get(); process.stdout.write('OK')",
          ],
          { cwd: path.join(extracted, 'programa', 'servidor'), encoding: 'utf8' },
        )
        if (out.trim() !== 'OK') throw new Error(`unexpected output: ${out}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // A runtime that can't launch at all (e.g. Rosetta absent) is a skip,
        // not a failure — the static prebuild check already covered it. A
        // module/binding error is a real failure.
        if (/better[_-]sqlite3|MODULE_NOT_FOUND|dlopen|not a valid Win32/i.test(msg)) {
          throw new Error(`${rt.dir}: better-sqlite3 failed to load — ${msg}`)
        }
      }
    }

    // Static: every playwright-core copy needs browsers.json or the PDF
    // engine looks absent regardless of what's installed — see
    // PLAYWRIGHT_BROWSERS_JSON. Dynamic (mac only, same reasoning as the
    // better-sqlite3 check above): actually requiring 'playwright' proves the
    // registry initializes past the exact MODULE_NOT_FOUND this fixes,
    // without depending on the build host having any browser installed —
    // this is the failure this file's own release once shipped silently.
    for (const pwCore of playwrightCoreDirs(path.join(extracted, 'programa', 'servidor'))) {
      if (!existsSync(path.join(pwCore, 'browsers.json'))) {
        throw new Error(`${path.relative(extracted, pwCore)} is missing browsers.json`)
      }
      // The Ajustes "Install PDF engine" card forks this to download Chromium.
      if (!existsSync(path.join(pwCore, 'lib', 'entry', 'oopBrowserDownload.js'))) {
        throw new Error(`${path.relative(extracted, pwCore)} is missing the browser installer`)
      }
    }
    for (const rt of RUNTIMES.filter((r) => r.dir.startsWith('mac-'))) {
      const macNode = path.join(extracted, 'programa', 'node', rt.dir, rt.bin)
      try {
        const out = execFileSync(
          macNode,
          [
            '-e',
            "require('playwright'); if (typeof require('playwright-core/lib/coreBundle').registry.installBrowsersForNpmInstall !== 'function') throw new Error('playwright installer missing'); process.stdout.write('OK')",
          ],
          {
            cwd: path.join(extracted, 'programa', 'servidor'),
            encoding: 'utf8',
          },
        )
        if (out.trim() !== 'OK') throw new Error(`unexpected output: ${out}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/browsers\.json|playwright/i.test(msg)) {
          throw new Error(`${rt.dir}: playwright failed to load — ${msg}`)
        }
      }
    }

    const arch = os.arch() === 'arm64' ? 'mac-arm64' : 'mac-x64'
    const node = path.join(extracted, 'programa', 'node', arch, 'node')
    const datos = path.join(tmp, 'datos')
    mkdirSync(datos, { recursive: true })
    child = spawn(node, ['server.js'], {
      cwd: path.join(extracted, 'programa', 'servidor'),
      env: {
        ...process.env,
        HOSTNAME: '127.0.0.1',
        PORT: String(port),
        CVFORGE_DB_PATH: path.join(datos, 'cvforge.db'),
        // Mirror what the personal launcher exports, so the boot gate exercises
        // the same runtime the maintainer will actually get.
        ...(personal ? { CVFORGE_DISCOVER: '1' } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // Keep the server's last output, so a failed check says why the server stopped.
    const onOutput = (chunk: Buffer) => {
      serverLog = (serverLog + chunk.toString()).slice(-4000)
    }
    child.stdout?.on('data', onOutput)
    child.stderr?.on('data', onOutput)

    let up = false
    for (let i = 0; i < 60 && !up; i++) {
      await new Promise((r) => setTimeout(r, 500))
      try {
        // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- 127.0.0.1 loopback al servidor local recién lanzado en el smoke-test del release; HTTPS no aplica a la propia máquina y no hay dato sensible.
        const res = await fetch(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(2000),
        })
        up = res.ok
      } catch {
        // still starting
      }
    }
    if (!up) throw new Error('packaged server never answered on HTTP')
    // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- 127.0.0.1 loopback al servidor local del smoke-test; HTTPS no aplica a la propia máquina.
    const icon = await (await fetch(`http://127.0.0.1:${port}/icon.svg`)).text()
    if (!icon.includes('CVForge')) throw new Error('icon route did not identify the app')
    // The component gallery is a development tool; no build anyone runs may serve it.
    // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- 127.0.0.1 loopback al servidor local del smoke-test; HTTPS no aplica a la propia máquina.
    const gallery = await fetch(`http://127.0.0.1:${port}/muestrario`, {
      signal: AbortSignal.timeout(2000),
    })
    if (gallery.status !== 404) {
      throw new Error(`/muestrario served in a production build (status ${gallery.status})`)
    }
    if (personal) {
      // The buyer build 404s here; the personal build must serve it.
      // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- 127.0.0.1 loopback al servidor local del smoke-test; HTTPS no aplica a la propia máquina.
      const disc = await fetch(`http://127.0.0.1:${port}/discover`, {
        signal: AbortSignal.timeout(2000),
      })
      if (disc.status !== 200) {
        throw new Error(`personal: /discover did not serve (status ${disc.status})`)
      }
    }
  } catch (err) {
    if (!serverLog) throw err
    throw new Error(
      `${err instanceof Error ? err.message : String(err)}\n--- packaged server output ---\n${serverLog.trim()}`,
      { cause: err },
    )
  } finally {
    child?.kill()
    rmSync(tmp, { recursive: true, force: true })
  }
}

// ----------------------------------------------------------------- run
async function main(): Promise<void> {
  await fetchRuntimes()
  stageAndZip()
  // A printed sha256 means the boot gate passed — CLAUDE.md promises exactly
  // that, so a build that skipped the gate gets no sha and says so.
  if (process.argv.includes('--skip-install-gate')) {
    console.log(`release: ${zip}\n         UNVERIFIED — boot gate skipped, no sha256 written.`)
    return
  }
  try {
    await bootGate()
  } catch (err) {
    rmSync(zip, { force: true })
    console.error(err instanceof Error ? err.message : err)
    console.error('release: boot gate failed — zip deleted.')
    process.exit(1)
  }
  const sha = createHash('sha256').update(readFileSync(zip)).digest('hex')
  writeFileSync(`${zip}.sha256`, `${sha}  ${path.basename(zip)}\n`)
  console.log(`release: ${zip}\n         sha256 ${sha}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
