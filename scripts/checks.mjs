import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// Shared check harness.
//
// This exists because of a specific, recorded complaint. The FIELD codex entry
// `field-unification-thesis-2026-07-23` observes that ambient-skeleton-probe.js
// and chip_overflow_probe.js are structurally near-identical verification
// scripts with no shared harness, and predicts that the next such script will
// be a third near-duplicate rather than a reuse.
//
// render-check.mjs was the third. drift-check.mjs would have been the fourth.
// They genuinely cannot be one script — one drives a headless browser, the other
// runs no browser at all — but the part they actually share is this: accumulate
// named pass/fail results, print them uniformly, exit non-zero if any failed.
// So that part is shared, and the probes stay separate.

export function createChecks() {
  const checks = []

  return {
    /** Record a named result. `detail` is printed only on failure. */
    check(name, pass, detail) {
      checks.push({ name, pass: Boolean(pass), detail })
    },

    /** Print all results and exit non-zero if any failed. */
    summarize() {
      for (const c of checks) {
        console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : `\n      → ${c.detail}`}`)
      }
      const failed = checks.filter(c => !c.pass)
      console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
      return failed.length
    },
  }
}

/**
 * Fable compiles F# lists to linked-list objects, not JS arrays — `.length` is
 * undefined on them. They are iterable, so Array.from converts. Wrapped here
 * because every consumer of the compiled decoders hits this.
 */
/**
 * What tree a measurement describes: HEAD, plus a digest of everything not in it.
 *
 * THE SHA IS NOT THE RUN. Extracted from `confidence.mjs` on 2026-09-05, where
 * it was written after two records both said `1264e6f` — one scoring 91 with
 * three failing rows, one scoring 100 — because HEAD was unchanged while the
 * WORKING TREE was fixed between them. `git rev-parse HEAD` says nothing about
 * uncommitted work, and a gate scores the tree, not the commit.
 *
 * Any file that writes a measurement to a ledger needs the same identity, or
 * the ledgers cannot be joined and a dirty local run is indistinguishable from
 * a clean CI one. `scale-check.mjs` is the second such file.
 *
 * A FUNCTION, not a module-level constant: `import-purity-check` requires that
 * importing a module runs nothing, and shelling out to git at import time is
 * exactly what that guard exists to catch.
 */
export const runIdentity = () => {
  const gitOut = cmd => {
    try { return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) } catch { return '' }
  }
  const sha = gitOut('git rev-parse HEAD').trim() || null
  // THE LEDGERS ARE OUTPUTS, NOT INPUTS, so they are excluded from the digest.
  //
  // Measured 2026-09-06 on verify-full run 16. `scale-check` runs before the
  // gate and appends to docs/scale-log.jsonl. That left the tree dirty, so
  // `confidence.mjs` hashed a tree containing the ledger's own append, and the
  // two records for one commit came out as:
  //
  //   scale       a4d059338685-e3b0c44298fc  dirty false
  //   confidence  a4d059338685-eda79be1db9b  dirty TRUE
  //
  // e3b0c44298fc is the SHA-256 of the empty string — a clean checkout. The
  // gate's record said dirty on a clean CI runner, purely because a measurement
  // written minutes earlier was still uncommitted.
  //
  // That breaks the property verify-full's own comment relies on: "CI scoring
  // commit X produces the SAME id as a local run of commit X", which is what
  // lets two independent measurements of one tree corroborate each other.
  //
  // A ledger append is a RECORD of a measurement, never part of what was
  // measured. Excluding it is the fix; ordering the steps differently would only
  // move which ledger poisons which.
  const LEDGERS = ":(exclude)docs/*-log.jsonl"
  const dirt = gitOut(`git status --porcelain -- . '${LEDGERS}'`)
    + gitOut(`git diff HEAD -- . '${LEDGERS}'`)
  const digest = createHash('sha256').update(dirt).digest('hex')
  return {
    sha,
    // Whether the measured tree was the committed one. A clean run is the only
    // kind whose sha alone describes what was measured.
    dirty: dirt.length > 0,
    id: `${(sha ?? 'nohead').slice(0, 12)}-${digest.slice(0, 12)}`,
  }
}

export const toArray = xs => (xs == null ? [] : Array.from(xs))

/**
 * Tag values of the `Nested<'T>` union from src/Desk.fs, in declaration order.
 * Anything reading decoder output needs these, and a bare `2` in a comparison
 * is unreadable.
 */
export const NESTED = { NotPresent: 0, Decoded: 1, Malformed: 2 }

/**
 * The FIELD-zone calendar day for an instant, as `YYYY-MM-DD`.
 *
 * The JS-side twin of `dayInFieldZone` in src/Desk.fs. It was written twice
 * already — once in zone-check.mjs as the independent oracle the F# side is
 * compared against, once in nav-check.mjs — and the gate then went and computed
 * "today" as `new Date().toISOString().slice(0, 10)`, which is UTC. Between
 * 20:00 ET and midnight, that gate was looking for tomorrow's outbox file.
 *
 * Kept as a genuinely separate implementation from the F# one on purpose:
 * zone-check compares the two at fixed instants with hardcoded expected days,
 * so one of them being wrong is a failure rather than an agreement.
 */
export const fieldDay = (date = new Date()) => {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const g = t => p.find(x => x.type === t).value
  return `${g('year')}-${g('month')}-${g('day')}`
}

/**
 * Is this module the one node was asked to run, rather than one it imported?
 *
 * Three scripts in this directory used to do their real work — and call
 * `process.exit` — at import time. On 2026-08-17 that silently swallowed a
 * probe: `await import('./confidence-record-check.mjs')` ran the whole check,
 * exited 0, and the code after the import never executed. The output looked
 * like a successful run of something it had not run, which is the failure mode
 * this whole project keeps circling.
 *
 * A module that exports functions is a module something will eventually import.
 * Guarding the executable half behind this makes "importable" and "runnable"
 * both true at once. `import-purity-check.mjs` enforces it.
 */
export const isMain = url => {
  const entry = process.argv[1]
  if (!entry) return false
  return url === pathToFileURL(entry).href
}
