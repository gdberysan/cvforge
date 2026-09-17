/**
 * Builds the release zip: scrub gate → standalone build → bundle Node
 * runtimes → stage the user layout → boot gate → sha256. Dry runs with
 * `--ref HEAD`.
 *
 * User layout — nothing to install, nothing to compile, no terminal:
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

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const refArg = process.argv.indexOf('--ref')
const ref = refArg !== -1 ? process.argv[refArg + 1] : `v${pkg.version}`
const dry = ref === 'HEAD'
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
// and the CHANGELOG's top entry (the release notes). A forgotten
// bump used to ship silently.
{
  const versionJson = JSON.parse(readFileSync('public/version.json', 'utf8')) as {
    version?: string
  }
  const changelogTop = readFileSync('CHANGELOG.md', 'utf8').match(/^## \[?v?(\d+\.\d+\.\d+)/m)?.[1]
  const mismatches = [
    versionJson.version !== pkg.version && `public/version.json says ${versionJson.version}`,
    changelogTop !== pkg.version && `CHANGELOG.md's top entry is ${changelogTop ?? 'missing'}`,
  ].filter(Boolean)
  if (mismatches.length > 0) {
    console.error(`release: package.json is ${pkg.version} but ${mismatches.join('; ')}.`)
    process.exit(1)
  }
}

execFileSync('npx', ['tsx', 'scripts/scrub-check.ts', ref], { stdio: 'inherit' })

// ---------------------------------------------------------------- build
console.log('release: building standalone server…')
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' })
const standalone = path.join('.next', 'standalone')
if (!existsSync(path.join(standalone, 'server.js'))) {
  console.error('release: .next/standalone/server.js missing — is output "standalone" set?')
  process.exit(1)
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

async function fetchRuntimes(): Promise<void> {
  const base = `https://nodejs.org/dist/${NODE_VERSION}/`
  const shasums = await (await fetch(`${base}SHASUMS256.txt`)).text()
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
const name = `cvforge-v${pkg.version}${dry ? '-dry' : ''}`
const outDir = path.join('dist', 'publico')
const zip = path.join(outDir, `${name}.zip`)

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

// The zip ships the compiled app only; the source lives in the repository.
const TOP_LEVEL = ['LEEME.html', 'CVForge.app', 'CVForge (Windows).vbs', 'programa']

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
    // Users get the demo's data, never its source: persona.ts is the seed
    // builder's input and shipped as TypeScript in every zip through v1.2.19.
    rmSync(path.join(servidor, 'demo', 'persona.ts'), { force: true })
    cpSync(path.join('.next', 'static'), path.join(servidor, '.next', 'static'), {
      recursive: true,
    })
    cpSync('public', path.join(servidor, 'public'), { recursive: true })

    // Next writes the build machine's absolute project path into the
    // standalone config (outputFileTracingRoot, turbopack root). It is build
    // metadata — the server resolves everything from its own directory — but
    // it would publish the builder's home folder in every zip.
    for (const file of ['server.js', path.join('.next', 'required-server-files.json')]) {
      const target = path.join(servidor, file)
      const text = readFileSync(target, 'utf8')
      writeFileSync(target, text.split(JSON.stringify(process.cwd()).slice(1, -1)).join('.'))
    }

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

    for (const rt of RUNTIMES) {
      const dest = path.join(root, 'programa', 'node', rt.dir)
      mkdirSync(dest, { recursive: true })
      cpSync(path.join(cacheDir, rt.dir, rt.bin), path.join(dest, rt.bin))
      if (rt.bin === 'node') chmodSync(path.join(dest, rt.bin), 0o755)
    }
    chmodSync(path.join(root, 'CVForge.app', 'Contents', 'MacOS', 'CVForge'), 0o755)

    mkdirSync(outDir, { recursive: true })
    rmSync(zip, { force: true })
    execFileSync('zip', ['-q', '-r', '-X', path.resolve(zip), name], { cwd: stage })
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

// ------------------------------------------------------------ boot gate
// The scrub gate proves the source doesn't leak; this proves the exact zip
// a user receives actually serves the app, using the bundled runtime.
async function bootGate(): Promise<void> {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'cvforge-release-'))
  const extracted = path.join(tmp, name)
  const port = 3891
  let child: ReturnType<typeof spawn> | null = null
  try {
    execFileSync('unzip', ['-q', path.resolve(zip), '-d', tmp])

    const top = readdirSync(extracted).sort()
    const expected = [...TOP_LEVEL].sort()
    if (JSON.stringify(top) !== JSON.stringify(expected)) {
      throw new Error(`unexpected top level: ${top.join(', ')} (wanted: ${expected.join(', ')})`)
    }

    // Assert the shipped server carries nothing but the allowlist — the gate
    // that would have caught the whole-repo leak (data/, backups/, evals). Runs
    // on the EXTRACTED zip, so it proves what a user actually receives.
    const servidorRoot = path.join(extracted, 'programa', 'servidor')
    const demoSource = existsSync(path.join(servidorRoot, 'demo'))
      ? readdirSync(path.join(servidorRoot, 'demo')).filter((e) => /\.(ts|tsx|js|mjs)$/.test(e))
      : []
    if (demoSource.length > 0) {
      throw new Error(`source shipped under demo/: ${demoSource.join(', ')}`)
    }
    const stray = readdirSync(servidorRoot).filter((e) => !SERVIDOR_KEEP.has(e))
    if (stray.length > 0) {
      throw new Error(`servidor/ leaked non-allowlisted entries: ${stray.join(', ')}`)
    }
    // Belt-and-suspenders across the WHOLE zip: no
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
    // No file of ours may carry the build machine's paths (see stageAndZip).
    for (const f of ['server.js', path.join('.next', 'required-server-files.json')]) {
      const text = readFileSync(path.join(servidorRoot, f), 'utf8')
      if (text.includes(process.cwd()) || text.includes(os.homedir())) {
        sensitive.push(`${path.join('programa', 'servidor', f)} (build machine path)`)
      }
    }
    if (sensitive.length > 0) {
      throw new Error(`zip leaked sensitive files: ${sensitive.join(', ')}`)
    }
    for (const f of [
      'CVForge.app/Contents/MacOS/CVForge',
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
    }
    for (const rt of RUNTIMES.filter((r) => r.dir.startsWith('mac-'))) {
      const macNode = path.join(extracted, 'programa', 'node', rt.dir, rt.bin)
      try {
        const out = execFileSync(
          macNode,
          ['-e', "require('playwright'); process.stdout.write('OK')"],
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
      },
      stdio: 'ignore',
    })

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
