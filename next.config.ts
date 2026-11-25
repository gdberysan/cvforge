import { existsSync } from 'node:fs'
import type { NextConfig } from 'next'

// Discover is on only where the flag is set AND its real entry exists: in the
// open-source tree (no lib/discover/index.ts) the flag changes nothing.
const discover = process.env.CVFORGE_DISCOVER === '1' && existsSync('./lib/discover/index.ts')

const config: NextConfig = {
  // The release ships this build: a self-contained server plus the traced
  // node_modules, so a buyer machine never runs npm or a compiler.
  //
  // Never on Vercel, which builds its own serverless bundles and injects an
  // onBuildComplete hook that reads `.next/next-server.js.nft.json`. Standalone
  // output relocates that trace, so every demo deployment died with an ENOENT
  // for it — after a green `next build`, which is why it read as a platform
  // outage rather than a config problem. `vercel build` locally does not
  // reproduce it: the hooks are remote-only.
  //
  // The release never runs on Vercel, so it always takes the standalone path,
  // and scripts/release.ts aborts if `.next/standalone/server.js` is missing.
  output: process.env.VERCEL ? undefined : 'standalone',
  // better-sqlite3 is a native module and must not be bundled.
  serverExternalPackages: ['better-sqlite3'],
  // Migrations and the demo seed are read from disk at runtime — make sure
  // every server function's trace carries them (demo deploys to Vercel).
  // Only the demo's data: persona.ts is the seed BUILDER's input and shipped
  // TypeScript source to every buyer when the whole directory was traced.
  outputFileTracingIncludes: {
    '/*': ['./drizzle/**/*', './demo/seed.json', './demo/pdf/**/*'],
  },
  // The tracer's own analysis of `path.join(process.cwd(), 'demo', …)` still
  // stages the whole directory, so the one file that must not ship is named
  // exactly. Only ever an exact path here: a './dist/**' glob once pruned
  // node_modules/next/dist too and broke every API route in the standalone
  // build. The release keeps its runtime cache outside the project instead,
  // so the tracer never meets it.
  outputFileTracingExcludes: {
    '/*': ['./demo/persona.ts'],
  },
  typescript: { ignoreBuildErrors: false },
  // Each build gets its own service-worker version, so a new install on the
  // Mac replaces the phone's cached static files on the next launch.
  env: { NEXT_PUBLIC_BUILD_ID: process.env.CVFORGE_BUILD_ID ?? String(Date.now()) },
  // Discover (personal-only, spec 2026-08-26) is excluded from any build made
  // without the flag: '#discover' resolves to a stub with no scraper code.
  // The release builds without the flag and verifies the exclusion. This
  // alias binds Turbopack, this project's bundler for both dev and build;
  // the release gate's grep is the backstop for any other build path.
  turbopack: {
    resolveAlias: {
      '#discover': discover ? './lib/discover/index.ts' : './lib/discover/stub.ts',
      // The job agent (a personal satellite) is not in the open-source
      // edition: where its entry is absent, the screens get stubs that say
      // "no agent here" (lib/satellite/index.ts, components/satellite/).
      '#satellite': existsSync('./lib/satellite/index.ts')
        ? './lib/satellite/index.ts'
        : './lib/satellite-stub.ts',
      '#satellite-ui': existsSync('./components/satellite/index.ts')
        ? './components/satellite/index.ts'
        : './components/satellite-ui-stub.ts',
    },
  },
}

export default config
