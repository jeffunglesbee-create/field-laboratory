// No source file carries a harness's injected code.
//
// WHAT HAPPENED
//
// `proof-check.mjs` proves its claims by INJECTING code into a real source file
// and requiring the build to fail. It is careful about cleaning up: it keeps a
// backup, restores on `exit`, and traps SIGINT/SIGTERM/SIGHUP.
//
// On 2026-08-15 a foreground 2-minute timeout killed it mid-run anyway, leaving
//
//     let private __proof23 (g: Game) = ...
//
// in `src/Scoreboard.fs`. A later `git add -A` committed it, and it reached
// main in `217282b`.
//
// WHY NOTHING CAUGHT IT
//
// That injection COMPILED. It passed the build, it passed "fail on any F#
// compiler warning", and it passed fifteen further verify steps. The only thing
// that noticed was proof-check's own marker guard — at step 17, ninety seconds
// into a forty-minute job, and by then it could only refuse to run: its backup
// lives in `tmpdir()`, so on a fresh CI runner the backup can never exist and
// repair is impossible by construction.
//
// So the gap was never the signal handling. It was that a stranded injection is
// SILENT everywhere except the one place that cannot fix it.
//
// This check is the cheap, early, always-runnable half: no build, no browser,
// no network — a scan that fails in milliseconds and names the file. It runs
// first in `verify` so a mutated tree costs seconds instead of a job.
//
// It deliberately does NOT try to repair. Repair is proof-check's business and
// it needs the backup; this only has to make the state impossible to miss.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createChecks } from './checks.mjs'

const { check, summarize } = createChecks()

// The exact string proof-check writes. Imported by eye rather than by import,
// because this check must keep working if proof-check is the thing that broke.
// Asserted against proof-check's own source below so the two cannot drift.
const MARKER = 'let private __proof'

const SRC = 'src'
const sources = readdirSync(SRC).filter(f => f.endsWith('.fs'))

check('there are F# sources to scan',
  sources.length > 0,
  `${sources.length} file(s) in ${SRC}/`)

// If proof-check renames its injection, this check would silently scan for a
// string nobody writes and pass on every mutated tree — vacuously green, which
// is the failure shape this repo keeps finding. So the marker is verified
// against the harness that produces it.
const harness = readFileSync('scripts/proof-check.mjs', 'utf8')
check('the marker this scans for is the one proof-check injects',
  harness.includes(`const MARKER = '${MARKER}'`),
  `looking for ${JSON.stringify(MARKER)} in scripts/proof-check.mjs`)

const dirty = sources.filter(f => readFileSync(join(SRC, f), 'utf8').includes(MARKER))

check('no source file carries injected proof code',
  dirty.length === 0,
  dirty.length
    ? `${dirty.join(', ')} — restore with: git checkout -- ${dirty.map(f => join(SRC, f)).join(' ')}`
    : `${sources.length} file(s) clean`)

process.exit(summarize() === 0 ? 0 : 1)
