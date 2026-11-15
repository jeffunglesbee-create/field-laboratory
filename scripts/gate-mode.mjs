// The confidence gate's modes, as data, so they can be tested without running the gate.
//
//   full         every row. The only mode whose result can back a score.
//   quick        the rows that need a browser or the .NET build are SKIPPED (`skipQuick`). Never a pass.
//   browserless  the rows that need a browser are NOT APPLICABLE (`browser`); every other row runs, the .NET build included. Never a pass.
//
// WHY THE THIRD. The `full` job of verify-full.yml installs Chromium, and a failed install used to skip the whole gate: the 17 rows that need no browser (350 of 530
// points, among them the F# build, the decoders, the history rows, the mutation row that reads the shards back) were lost with the 6 that do. The job now carries the verify
// shape (scripts/check-browser-gate.py): the install may fail, the gate runs with `--browserless`, and the last step fails the job. What that run measures is every row that
// does not need a browser, named, with the rest named as not applicable. docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md, item 6.
//
// A BROWSERLESS RUN CANNOT BACK A SCORE. Its record has `mode: 'browserless'` and lists the rows it did not run (`notApplicable`), and scripts/confidence-record-check.mjs refuses
// a citation of any run that did not apply every row. Its id carries a suffix, so the ledger line of a browserless run and the line of a full run of the same tree never collide:
// the CI step that lands the ledger skips a record whose id is already in it, and a browserless line must not be the reason a full run's line is skipped.
//
// `browser` is on a row, true or a function. The function is for the one row whose need depends on how it is run: the mutation row reads the shard jobs' results when
// GATE_MUTATION_SHARDS is set (no browser here, they drive their own) and runs the whole suite in this process when it is not (it drives them all).
import { fileURLToPath } from 'node:url'
import { rows as gateRows, ok, failures } from './gate-checks.mjs'

export const MODES = ['full', 'quick', 'browserless']

/** The mode an argv asks for. Throws on a contradiction: `--quick` and `--browserless` each run fewer rows, and a run is one of them. */
export const modeOf = argv => {
  const quick = argv.includes('--quick'), browserless = argv.includes('--browserless')
  if (quick && browserless) throw new Error('--quick and --browserless each run fewer rows; give one of them.')
  return quick ? 'quick' : browserless ? 'browserless' : 'full'
}

export const needsBrowser = row => (typeof row.browser === 'function' ? row.browser() === true : row.browser === true)

/** What a mode does with a row: `run`, `skip` (quick) or `na` (browserless, the row needs a browser). */
export const actionFor = (mode, row) =>
  mode === 'quick' && row.skipQuick ? 'skip' : mode === 'browserless' && needsBrowser(row) ? 'na' : 'run'

/** How a finished gate run exits. Every exit of scripts/confidence.mjs after the record is written goes through this one function (the self-test reads its source for that), so a failing row exits 1 in
 *  every mode whatever the score: the browserless mode must not turn a failed row into a green step (review 2026-11-15, finding 8: three one-line regressions of the wiring, each exiting 0 with a failing row,
 *  passed the self-test, which then only checked that the text `process.exit(0)` existed). `quick` skipped rows, so the bar is not asked of its score. */
export const exitFor = ({ mode, failed, total, bar }) => (failed > 0 || (mode !== 'quick' && total < bar) ? 1 : 0)

/** The closing line of a browserless run. It counts the rows that were not run FOR WANT OF A BROWSER (`why: 'browser'`), not every not-applicable row: on the weekly schedule the outbox row has no subject and is
 *  not applicable too, and is no row that needs a browser (review 2026-11-15, finding 9: it said 7 rows / 190 points where 6 / 180 were not run). */
export const browserlessLine = results => {
  const ran = results.filter(r => r.state === 'PASS').length
  const missing = results.filter(r => r.state === 'N/A' && r.why === 'browser')
  return `--browserless: no failures among the ${ran} rows that ran. ${missing.length} row(s) that need a browser were NOT run (${missing.reduce((a, r) => a + r.weight, 0)} points). This is NOT a pass.`
}

/** The id a run is recorded under. A browserless run's line must never be the line a later full run of the same tree is skipped for. */
export const recordId = (mode, id) => (mode === 'browserless' ? `${id}-browserless` : id)

// --- self-test -----------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--self-test')) {
  const { createChecks, finish } = await import('./checks.mjs')
  const { check, summarize } = createChecks()
  const named = (mode, what) => gateRows.filter(r => actionFor(mode, r) === what)
  const BROWSER_ROWS = [
    'render checks pass on both captures', 'grouping and date navigation pass', 'games on a panel are separated from each other',
    'tabs work and the pick score never renders', "pick'em grades only finished games", 'the sparkline shows the value, not a silhouette',
  ]
  const MUTATION_ROW = 'breaking each invariant makes a check fail'
  const saved = process.env.GATE_MUTATION_SHARDS
  try {
    process.env.GATE_MUTATION_SHARDS = '8'
    const withShards = named('browserless', 'na').map(r => r.name)
    check('BROWSERLESS WITH THE SHARDS READ BACK: exactly the six rows that drive a browser are not applicable (180 points), and the other 17 run (350)',
      JSON.stringify([...withShards].sort()) === JSON.stringify([...BROWSER_ROWS].sort()) && named('browserless', 'na').reduce((a, r) => a + r.weight, 0) === 180
        && named('browserless', 'run').length === 17 && named('browserless', 'run').reduce((a, r) => a + r.weight, 0) === 350,
      `not applicable: ${withShards.join(' | ')}`)
    delete process.env.GATE_MUTATION_SHARDS
    const inProcess = named('browserless', 'na').map(r => r.name)
    check('...and when the mutation row runs the whole suite in this process (no shards), it drives every browser script and is not applicable too',
      inProcess.length === 7 && inProcess.includes(MUTATION_ROW), inProcess.join(' | '))
  } finally {
    if (saved === undefined) delete process.env.GATE_MUTATION_SHARDS
    else process.env.GATE_MUTATION_SHARDS = saved
  }
  check('A BROWSER ROW IS ONE QUICK MODE SKIPS TOO: every row flagged `browser` is also `skipQuick`, so the two modes never disagree about what needs a browser',
    gateRows.filter(r => r.browser === true).every(r => r.skipQuick === true), gateRows.filter(r => r.browser === true && !r.skipQuick).map(r => r.name).join(' | '))
  check('quick still skips exactly the ten rows it did, and runs the rest; full runs all 23',
    named('quick', 'skip').length === 10 && named('quick', 'run').length === 13 && gateRows.length === 23 && named('full', 'run').length === 23 && named('full', 'na').length === 0 && named('full', 'skip').length === 0,
    `skip ${named('quick', 'skip').length}, run ${named('quick', 'run').length}, rows ${gateRows.length}`)
  check('the modes: no flag is full, each flag is its own, and both together is refused by name',
    modeOf([]) === 'full' && modeOf(['--quick']) === 'quick' && modeOf(['--browserless']) === 'browserless'
      && (() => { try { modeOf(['--quick', '--browserless']); return false } catch (e) { return /give one of them/.test(e.message) } })(), 'a run with two modes would not say which rows it skipped')
  check('a browserless run is recorded under an id of its own; the other two are not',
    recordId('browserless', 'aaaaaaaaaaaa-bbbbbbbbbbbb') === 'aaaaaaaaaaaa-bbbbbbbbbbbb-browserless' && recordId('full', 'x') === 'x' && recordId('quick', 'x') === 'x', 'the CI step that lands a ledger line skips an id already in the ledger')
  check('the declared modes are the three the gate knows', MODES.join() === 'full,quick,browserless', MODES.join())
  // THE EXIT, as a truth table: a failing row exits 1 in every mode, at any score (a weight-10 row fails and leaves 97), and a run with no failing row exits 0 unless a whole-table score is below the bar.
  const exits = Object.fromEntries(MODES.map(m => [m, [exitFor({ mode: m, failed: 0, total: 100, bar: 95 }), exitFor({ mode: m, failed: 1, total: 97, bar: 95 }), exitFor({ mode: m, failed: 3, total: 40, bar: 95 }), exitFor({ mode: m, failed: 0, total: 94, bar: 95 })]]))
  check('THE EXIT: a failing row exits 1 in every mode at any score, an unfailing run exits 0, and a score under the bar exits 1 except in quick (which skipped rows)',
    JSON.stringify(exits) === JSON.stringify({ full: [0, 1, 1, 1], quick: [0, 1, 1, 0], browserless: [0, 1, 1, 1] }), JSON.stringify(exits))
  const sched = [{ state: 'PASS', weight: 20 }, { state: 'PASS', weight: 30 }, ...Array.from({ length: 6 }, () => ({ state: 'N/A', weight: 30, why: 'browser' })), { state: 'N/A', weight: 10, why: 'no-subject' }]
  check('THE CLOSING LINE of a browserless run counts the rows not run for want of a browser: on a scheduled run the outbox row is not applicable as well, and is not one of them (6 rows, 180 points, not 7 and 190)',
    /among the 2 rows that ran\. 6 row\(s\) that need a browser were NOT run \(180 points\)\. This is NOT a pass\./.test(browserlessLine(sched)), browserlessLine(sched))
  // The lines `ok` keeps for a failing command (what run-row.mjs prints and mutation-check.mjs --no-browser reads): a launch with no browser prints Playwright's message among lines that match the
  // salient filter for other reasons (`name: 'Error'`), and the message has to be one of the lines kept (probed 2026-11-15, PLAYWRIGHT_BROWSERS_PATH=/nonexistent: only `name: 'Error'` was).
  const before = failures.length
  ok(`printf '%s\\n' "browserType.launch: Executable doesn't exist at /p/chrome" "  name: 'Error'" 1>&2; exit 1`)
  const kept = failures.length === before + 1 ? failures[failures.length - 1].why : []
  failures.length = before
  check('ok() KEEPS PLAYWRIGHT\'S MISSING-BROWSER LINE among the lines it says a failing command printed, not only the lines that merely match `Error`', kept.some(l => /browserType\.launch: Executable doesn't exist at /.test(l)), JSON.stringify(kept))

  // THE WIRING OF confidence.mjs, which no test can run (the gate is the whole suite: the checks of this file read its source, as scripts/mutation-check.mjs's self-test reads its own for the
  // baseline's environment). The end-to-end proof is a run on a runner whose install failed (docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md, item 6).
  const gateSource = (await import('node:fs')).readFileSync(new URL('./confidence.mjs', import.meta.url), 'utf8')
  const wired = [
    ['the mode comes from modeOf(process.argv), and a contradiction exits 2', /MODE = modeOf\(process\.argv\)\s*\}\s*catch \(e\) \{[^}]*process\.exit\(2\)/],
    ['every row asks actionFor(MODE, row)', /const action = actionFor\(MODE, row\)/],
    ['a row that is `na` is recorded N/A and never run', /if \(action === 'na'\) \{\s*results\.push\(\{ \.\.\.row, state: 'N\/A', seconds: 0, why: 'browser' \}\)[\s\S]{0,200}?continue\s*\}/],
    ['the record carries the mode and the browserless id', /id: recordId\(MODE, runId\),[\s\S]{0,400}mode: MODE,/],
    ['a browserless run that failed no row says it is NOT a pass, naming the rows not run for want of a browser, and exits through exitFor', /if \(BROWSERLESS\) \{[\s\S]{0,600}browserlessLine\(results\)[\s\S]{0,120}process\.exit\(exitFor\(/],
    ['a row that needs a browser is marked as not run for want of one', /results\.push\(\{ \.\.\.row, state: 'N\/A', seconds: 0, why: 'browser' \}\)/],
    ['a row with no subject on this run is marked as that', /results\.push\(\{ \.\.\.row, state: 'N\/A', seconds, why: 'no-subject' \}\)/],
    ['--quick keeps its own exit', /if \(QUICK\) \{[\s\S]{0,900}--quick: browser and build rows skipped\. This is NOT a pass/],
  ]
  for (const [what, re] of wired) check(`confidence.mjs: ${what}`, re.test(gateSource), `no match for ${re}`)
  // THE FINAL STEP of the `full` job says the gate ran only when it did: the gate step is skipped by any earlier failure (an `if` with no status function is `success() && ...`), and the step that ends
  // the job red used to say `The gate ran with --browserless` whatever happened (review 2026-11-15, finding 10).
  const fullYml = (await import('node:fs')).readFileSync(new URL('../.github/workflows/verify-full.yml', import.meta.url), 'utf8')
  check('verify-full.yml: the browserless gate has an id, and the final step says the gate ran only when that step succeeded (and says it did not finish otherwise)',
    /- name: Confidence gate without a browser \(--browserless\)\n\s+id: browserless-gate\n/.test(fullYml) && /GATE_OUTCOME: \$\{\{ steps\.browserless-gate\.outcome \}\}/.test(fullYml)
      && /elif \[ "\$GATE_OUTCOME" = success \]; then\n\s+echo "::error::[^\n]*The gate ran with --browserless/.test(fullYml) && /the browserless gate did not finish \(its outcome: \$\{GATE_OUTCOME:-none\}\)/.test(fullYml), 'no match')
  // EVERY EXIT after the usage checks is exitFor's. A `process.exit(0)` or `process.exit(BROWSERLESS ? 0 : 1)` somewhere in the failing-row path is the regression this guards: the score it
  // leaves can be 97 with a row failing, and the step is then green over it.
  const exitCalls = [...gateSource.matchAll(/process\.exit\(([^)]*\)?)\)/g)].map(m => m[1])
  check('confidence.mjs: every process.exit is a usage error (2) or exitFor(...): six of the latter, one per way a run can end', exitCalls.filter(c => c === '2').length === 3 && exitCalls.filter(c => /^exitFor\(\{ mode: MODE, failed: [^}]+, total, bar: BAR \}\)$/.test(c)).length === 6 && exitCalls.length === 9,
    JSON.stringify(exitCalls))
  finish(summarize())
}
