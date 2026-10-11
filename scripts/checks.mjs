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

/**
 * A failure, restated as a GitHub Actions error annotation.
 *
 * WHY: a run's failure reason is printed to the log, and a log is not reachable
 * from every client that can reach the run. `runs/<id>/logs` answers with a
 * redirect to blob storage, and the GitHub client in this project's authoring
 * sandbox refuses it — so for six days in October 2026 the reasons behind red
 * `verify` steps were unreadable from the place the fixes were being written,
 * and each one cost a full CI round to discover. Annotations come back from
 * `check-runs/<id>/annotations`, which that same client CAN read; measured on
 * run 37874593207, where the only annotations present were the runner's own
 * ("Process completed with exit code 1") because nothing emitted any.
 *
 * It needs no `permissions:` grant and writes no file, which is why it is here
 * rather than in each script.
 *
 * ESCAPING IS NOT OPTIONAL. An annotation is one line; a `%`, a newline or a
 * carriage return in the detail silently truncates or corrupts it. `%` is
 * replaced FIRST, or the `%0A` introduced for a newline would itself be
 * re-escaped to `%250A`. A property value escapes `:` and `,` as well, since
 * both are separators in the command's own syntax.
 */
export const escapeAnnotationData = s =>
  String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

export const escapeAnnotationProp = s =>
  escapeAnnotationData(s).replace(/:/g, '%3A').replace(/,/g, '%2C')

/** How many failures are annotated. GitHub renders at most ten error
 *  annotations per step, so an eleventh would be silently dropped — the count
 *  of what was left out is annotated instead, where the reader can see it. */
export const ANNOTATION_CAP = 10

export const annotationsFor = (failed, cap = ANNOTATION_CAP) => {
  const out = failed.slice(0, cap).map(c =>
    `::error title=${escapeAnnotationProp(c.name)}::` +
    escapeAnnotationData(c.detail ?? 'no detail was given'))
  if (failed.length > cap) {
    out.push(`::error title=annotations truncated::${failed.length - cap} ` +
      `further failure(s) are in the log only; the cap is ${cap}`)
  }
  return out
}

/**
 * End a check script: set the status, do not kill the process.
 *
 * WHY THIS EXISTS. `process.exit()` terminates immediately and DROPS pending
 * asynchronous stdout writes. To a terminal or a file Node's stdout writes are
 * synchronous and nothing is lost; to a PIPE — `execSync`, or a CI log runner —
 * they are not. Setting `process.exitCode` instead lets Node drain stdout and
 * exit on its own with the same status.
 *
 * MEASURED 2026-10-11 by `scripts/exit-truncation-probe.mjs`, and the
 * measurement is narrower than the rule, which is worth knowing before anyone
 * widens either. Twenty runs of each real program, through a pipe, idle and
 * then with eight CPU burners on four cores:
 *
 *   build/VerifyMain.js        13146B   idle 0/20   loaded 5/20
 *   check-doc-citations.mjs     3021B   idle 0/20   loaded 0/20
 *   palette-check.mjs           1909B   idle 0/20   loaded 0/20
 *   design-tokens-check.mjs     1535B   idle 0/20   loaded 0/20
 *   typography-check.mjs        1310B   idle 0/20   loaded 0/20
 *   sport-registry-check.mjs     834B   idle 0/20   loaded 0/20
 *
 * So ONE program in this repository has ever been shown to lose its tail, at
 * 13 KB on a loaded machine. No `createChecks` script has — they print 0.8 to
 * 3 KB, and nothing at that size was lost in 240 piped runs. The document this
 * came from was filed on a figure from a 400-row synthetic script ("the error
 * annotation was LOST 5 times in 30 runs") and that figure does not describe
 * anything here.
 *
 * LOAD IS THE TRIGGER, NOT SIZE ALONE. The same 13 KB lost nothing idle. And a
 * bare loop printing 13 KB loses nothing even loaded — the program that lost
 * output also loads thirty modules and reads four fixtures off disk. The race
 * is between the last write draining and the process being told to die, and
 * the amount of other work in flight is a term in it.
 *
 * WHAT WAS TRIED AND REJECTED. Writing the tail with `fs.writeSync(1, ...)` so
 * nothing is ever pending: on a pipe it throws EAGAIN and takes the process
 * down with it — 21 of 30 runs under load, worse than the bug.
 *
 * `process.exitCode` ALSO FIXES A SECOND THING quietly. Four call sites wrote
 * `process.exit(summarize())`, which exits with the FAILURE COUNT as the status
 * — that is where a "Process completed with exit code 6" came from — and a
 * count above 255 wraps, so 256 failures would have reported success. This maps
 * every outcome to 0 or 1.
 *
 * IT DOES NOT STOP EXECUTION, which `process.exit()` does. Only use it where
 * the script is finished; an early exit that must prevent the live half from
 * running still needs to terminate.
 */
export const finish = (failures) => {
  process.exitCode = failures === 0 ? 0 : 1
}

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
      // ON A RUNNER, ALSO AS AN ANNOTATION — the only machine-readable channel a
      // failure reason survives into. See annotationsFor.
      if (failed.length && process.env.GITHUB_ACTIONS === 'true') {
        for (const line of annotationsFor(failed)) console.log(line)
      }
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

// THE HARNESS'S OWN SELF-TEST, under isMain so importing this module still runs
// nothing — the rule check:import-purity exists for, and which three scripts
// broke on 2026-10-09 by ending in a bare top-level process.exit().
//
// Usage:  node scripts/checks.mjs --self-test
if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('a failure becomes one ::error:: line',
    annotationsFor([{ name: 'n', detail: 'd' }]).length === 1)
  check('the check name is the annotation TITLE and the detail its message',
    annotationsFor([{ name: 'the axis interpolates', detail: 'widths [1,1,1,1]' }])[0] ===
      '::error title=the axis interpolates::widths [1,1,1,1]')
  check('A COLON IN THE NAME IS ESCAPED — it separates properties',
    annotationsFor([{ name: 'a:b', detail: 'd' }])[0] === '::error title=a%3Ab::d',
    'an unescaped colon in a property value truncates the annotation')
  check('a COMMA in the name is escaped too',
    annotationsFor([{ name: 'a,b', detail: 'd' }])[0] === '::error title=a%2Cb::d')
  check('a NEWLINE in the detail is escaped — an annotation is one line',
    annotationsFor([{ name: 'n', detail: 'one\ntwo' }])[0] === '::error title=n::one%0Atwo')
  check('a carriage return is escaped',
    annotationsFor([{ name: 'n', detail: 'one\rtwo' }])[0] === '::error title=n::one%0Dtwo')
  check('PERCENT IS ESCAPED FIRST, or the %0A it introduces is re-escaped',
    annotationsFor([{ name: 'n', detail: '50%\n' }])[0] === '::error title=n::50%25%0A',
    "replacing newlines before % yields %250A and the reader sees a literal '%0A'")
  check('a colon in the DETAIL is left alone — only properties need it escaped',
    annotationsFor([{ name: 'n', detail: 'a:b' }])[0] === '::error title=n::a:b')
  check('a missing detail says so rather than printing undefined',
    annotationsFor([{ name: 'n' }])[0] === '::error title=n::no detail was given')
  // Rule 91: the cap's own denominator is annotated, not swallowed.
  const many = Array.from({ length: ANNOTATION_CAP + 3 }, (_, i) => ({ name: `n${i}`, detail: 'd' }))
  const capped = annotationsFor(many)
  check(`past the cap of ${ANNOTATION_CAP}, the OVERFLOW IS ANNOTATED, not dropped silently`,
    capped.length === ANNOTATION_CAP + 1 && /3 further failure\(s\)/.test(capped[ANNOTATION_CAP]),
    `got ${capped.length} line(s): ${JSON.stringify(capped.slice(-1))}`)
  check('a clean run annotates nothing', annotationsFor([]).length === 0)

  finish(summarize())
}
