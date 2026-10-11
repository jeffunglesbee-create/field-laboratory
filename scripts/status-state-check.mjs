// A failure must not be able to look like progress.
//
// WHAT WAS WRONG, AND WHY IT COULD NOT BE FIXED IN CSS ALONE
//
// `report` wrote textContent and nothing else, so these three lines
//
//   FETCH FAILED: …      DECODE FAILED: …      schedule unavailable — …
//
// rendered identically to "decoding…". And `.meta` carried `opacity: .65` on
// the CONTAINER, which composites the whole subtree: a child styled
// `color: var(--red)` would still have painted at 65%. The container was the
// reason an error could not be made to look like an error, so the dimming had
// to move from `opacity` to per-line `color` before any state class could bite.
//
// THE STATE IS SET ON EVERY WRITE, not only on failure. A line that recovers
// must LOSE its marker; otherwise the first error of a session paints that line
// red for the rest of it — a stale status wearing a live one's clothes, which
// is the exact failure class this page exists to catch.
//
// THIS CHECKS THE COMPILED OUTPUT, not the F#. `build/Program.js` is what the
// browser runs; the .fs is the source of it and not a substitute for it. Fable
// inlines and renames, and a routing that reads correctly in F# is not thereby
// present in the artifact.
//
// Usage:  node scripts/status-state-check.mjs [build/Program.js] [index.html]
//         node scripts/status-state-check.mjs --self-test

import { readFileSync } from 'node:fs'
import { createChecks, isMain, finish } from './checks.mjs'

/** Every failure string must sit inside a reportFailed call's neighbourhood. */
export const routedAs = (js, needle, fn, window = 260) => {
  const i = js.indexOf(needle)
  if (i < 0) return 'absent'
  return new RegExp(fn).test(js.slice(Math.max(0, i - window), i + needle.length + 40))
    ? 'routed' : 'unrouted'
}

/**
 * `opacity` on a container composites its subtree and cannot be raised by a
 * child. If `.meta` regains one, every state colour below silently goes back to
 * looking the same — the original bug, restored, with the classes still in place
 * and still passing a naive "is there a red rule" check.
 */
export const containerDimsBySubtree = (css) => {
  const m = css.match(/\.meta\s*\{([^}]*)\}/)
  return m ? /opacity:/.test(m[1]) : false
}

/**
 * Definition plus call sites. A reporter that exists but is never called reads
 * as 1; each use adds one.
 *
 * WHY NOT PROXIMITY, for this one. The failure strings sit at their call sites
 * and a text-window check finds them. The fallback note does NOT: it is built
 * inside the fallback promise and consumed much later, as
 * `(note === "" ? report : reportWarn)("decode-status")`. A window check called
 * that unrouted — correct code, wrong instrument — so the assertion is on the
 * count instead, which no distance can defeat and deletion still fails.
 */
export const timesUsed = (js, fn) =>
  (js.match(new RegExp(`\\b${fn}\\b`, 'g')) ?? []).length

export const stateColours = (css) => ({
  warn: /\[data-state="warn"\][^{]*\{[^}]*color:/.test(css),
  failed: /\[data-state="failed"\][^{]*\{[^}]*color:/.test(css),
  // The default must be dimmed by colour, not by the container.
  restDimmed: /\.meta div\s*\{[^}]*color:/.test(css),
})

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('a failure string beside its reporter is routed',
    routedAs('reportFailed(toText("FETCH FAILED: x"))', 'FETCH FAILED', 'reportFailed') === 'routed')
  check('THE SAME STRING BESIDE THE PLAIN REPORTER IS NOT',
    routedAs('report(toText("FETCH FAILED: x"))', 'FETCH FAILED', 'reportFailed') === 'unrouted',
    'this is the whole defect — the text was right and the state was missing')
  check('a string that is not there at all is its own state, not a pass',
    routedAs('nothing here', 'FETCH FAILED', 'reportFailed') === 'absent',
    'a renamed message must not read as a routed one')
  check('the window does not reach across an unrelated call',
    routedAs('reportFailed(a)' + 'x'.repeat(400) + 'FETCH FAILED', 'FETCH FAILED', 'reportFailed') === 'unrouted')

  check('a .meta with container opacity is flagged',
    containerDimsBySubtree('.meta { font-size: .85rem; opacity: .65; }') === true,
    'it composites the subtree, so no child can paint at full strength')
  check('a .meta without it is not',
    containerDimsBySubtree('.meta { font-size: .85rem; }') === false)

  check('a defined-but-never-called reporter counts 1',
    timesUsed('function reportWarn(i,t){reportAs("warn",i,t)}', 'reportWarn') === 1)
  check('DEFINITION PLUS ONE CALL COUNTS 2 — deletion is what this catches',
    timesUsed('function reportWarn(i,t){} ... reportWarn(a,b)', 'reportWarn') === 2)
  check('a longer name is not counted as this one',
    timesUsed('reportWarning(a)', 'reportWarn') === 0)

  const css = '.meta div { color: var(--dim-text); } .meta [data-state="warn"] { color: var(--caution); } .meta [data-state="failed"] { color: var(--red); }'
  const sc = stateColours(css)
  check('warn, failed and the dimmed rest all carry a colour',
    sc.warn && sc.failed && sc.restDimmed)
  check('A FAILED RULE WITH NO COLOUR DOES NOT COUNT',
    stateColours('.meta [data-state="failed"] { font-weight: 700 }').failed === false,
    'the class existing is not the same as the class doing anything')
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const js = readFileSync(process.argv[2] || 'build/Program.js', 'utf8')
  const html = readFileSync(process.argv[3] || 'index.html', 'utf8')
  const { check, summarize } = createChecks()

  for (const msg of ['FETCH FAILED', 'DECODE FAILED', 'schedule unavailable']) {
    const r = routedAs(js, msg, 'reportFailed')
    check(`"${msg}" reports as failed in the COMPILED output (${r})`, r === 'routed')
  }
  const warns = timesUsed(js, 'reportWarn')
  check(`serving a committed capture is reported as warn, not a normal load (${warns} uses)`,
    warns >= 2)
  const fails = timesUsed(js, 'reportFailed')
  check(`all three failure sites call reportFailed (${fails} uses, 1 def + 3)`, fails >= 4)

  check('every write sets the state, so a recovered line loses its marker',
    /setAttribute\("data-state"/.test(js))

  check('.meta does not dim by container opacity', !containerDimsBySubtree(html))
  const sc = stateColours(html)
  check('failed has a colour', sc.failed)
  check('warn has a colour', sc.warn)
  check('the ordinary lines are dimmed by colour instead', sc.restDimmed)
  check('the status line is announced', /id="decode-status"[^>]*role="status"/.test(html))

  finish(summarize())
}
