// Importing a module must not run it.
//
// THE FAILURE, EXACTLY
//
// On 2026-08-17 I wrote this to probe the confidence-record checker against the
// real run log:
//
//     import { parseLog, verdictsFor } from './scripts/confidence-record-check.mjs'
//     … console.log(results)
//
// It printed the checker's own output and nothing of mine. The module did its
// real work at import time and called `process.exit(0)`, so every line after the
// import never ran. The command exited 0. The output was plausible. I nearly
// reported the results of a probe that had not executed.
//
// Three modules were like that — `confidence-record-check.mjs`,
// `exposed-secret-check.mjs` and `history-check.mjs` — each exporting functions
// for reuse while terminating any process that reused them.
//
// WHY THE TEST IS A SENTINEL AND NOT "PRODUCES NO OUTPUT"
//
// Silence is a proxy for the property and misses the worst case. A module that
// exits silently is indistinguishable from one that imported cleanly, and
// `process.exit(0)` is exactly that. So the probe imports the module and then
// prints a sentinel: if the sentinel is missing, the import terminated the
// process, whatever its exit code said. If anything ELSE appears, the module did
// work it should not have done. One command, both failures, and the missing
// sentinel is precisely the shape of the bug that prompted this.
//
// WHICH MODULES ARE SUBJECT TO IT
//
// Every file in scripts/ containing a top-level `export`. Exporting is the
// declaration that something else may import you; a script with no exports is
// only ever run, and guarding it would be ceremony.
//
// Usage:  node scripts/import-purity-check.mjs [--self-test]

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createChecks, isMain } from './checks.mjs'

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')
const SENTINEL = 'IMPORT_PURITY_SENTINEL'

/** Files in a directory that declare a top-level export. */
export const exportingModules = dir =>
  readdirSync(dir)
    .filter(f => f.endsWith('.mjs'))
    .filter(f => /^export /m.test(readFileSync(join(dir, f), 'utf8')))
    .map(f => join(dir, f))

/**
 * Import a module in a fresh process and report what happened.
 *
 * `ok` is true only when the sentinel is the entire output: the import neither
 * terminated the process nor produced anything of its own.
 */
export function probeImport(path, { cwd = process.cwd() } = {}) {
  const src = `await import(${JSON.stringify(path.startsWith('.') ? path : './' + path)});` +
    `console.log(${JSON.stringify(SENTINEL)});`
  let out = ''
  let code = 0
  try {
    out = execFileSync(process.execPath, ['--input-type=module', '-e', src],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`
    code = e.status ?? 1
  }
  const lines = out.split('\n').filter(l => l.trim() !== '')
  const reached = lines.includes(SENTINEL)
  const noise = lines.filter(l => l !== SENTINEL)
  return {
    ok: reached && noise.length === 0 && code === 0,
    reached,
    noise,
    code,
    why: !reached
      ? `the import terminated the process (exit ${code}) — code after the import never ran`
      : noise.length > 0
        ? `the import produced ${noise.length} line(s) of output: ${JSON.stringify(noise[0]).slice(0, 90)}`
        : '',
  }
}

// ── the self-test ───────────────────────────────────────────────────────────

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  const dir = join(tmpdir(), `import-purity-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  try {
    writeFileSync(join(dir, 'pure.mjs'), 'export const a = 1\n')
    writeFileSync(join(dir, 'exits.mjs'), 'export const a = 1\nprocess.exit(0)\n')
    writeFileSync(join(dir, 'exits-nonzero.mjs'), 'export const a = 1\nprocess.exit(1)\n')
    writeFileSync(join(dir, 'chatty.mjs'), 'export const a = 1\nconsole.log("side effect")\n')

    const p = f => probeImport(f, { cwd: dir })

    check('a pure module passes', p('pure.mjs').ok, JSON.stringify(p('pure.mjs')))

    // The exact bug: exits 0, looks like success, swallows the caller.
    const zero = p('exits.mjs')
    check('a module that exits ZERO on import is caught',
      !zero.ok && !zero.reached,
      `ok=${zero.ok} reached=${zero.reached} — this is the case a "did it exit non-zero" test misses`)

    const nonzero = p('exits-nonzero.mjs')
    check('a module that exits non-zero on import is caught',
      !nonzero.ok && !nonzero.reached, JSON.stringify(nonzero))

    const chatty = p('chatty.mjs')
    check('a module that merely PRINTS on import is caught',
      !chatty.ok && chatty.reached && chatty.noise.length === 1, JSON.stringify(chatty))

    check('the discovery step finds only files that export',
      (() => {
        writeFileSync(join(dir, 'no-exports.mjs'), 'console.log(1)\n')
        const found = exportingModules(dir).map(f => f.split('/').pop()).sort()
        return !found.includes('no-exports.mjs') && found.includes('pure.mjs')
      })(),
      'discovery picked the wrong set')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  process.exit(summarize() === 0 ? 0 : 1)
}

// ── the real scripts/ ───────────────────────────────────────────────────────

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const modules = exportingModules('scripts')

  // Non-vacuity. Every module being pure is free when none are discovered, and
  // a discovery regex that stopped matching would report exactly that.
  check('there are exporting modules to check',
    modules.length > 0,
    'no module in scripts/ declares an export — discovery has broken')

  const impure = modules
    .map(m => ({ m, r: probeImport(m) }))
    .filter(({ r }) => !r.ok)

  console.log(`\nProbed ${modules.length} exporting module(s) in scripts/\n`)

  check('importing a module never runs it or exits the process',
    impure.length === 0,
    impure.map(({ m, r }) => `${m}: ${r.why}`).join('\n      → '))

  process.exit(summarize() === 0 ? 0 : 1)
}
