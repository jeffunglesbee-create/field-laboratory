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
 *  passed the self-test, which then only checked that the text `process.exit(0)` existed). `quick` skipped rows, so the bar is not asked of its score.
 *
 *  A RUN THAT MEASURED NOTHING IS A FAILURE IN EVERY MODE, quick included (round 5, finding A8). Every row skipped or not applicable leaves `possible` at 0, and `--quick` asked neither `total < bar` (it skipped
 *  rows) nor anything else, so it exited 0 over "0/0 points". The question is asked of `possible` as `!(possible > 0)`, so both degenerate values are one clause: 0 (nothing ran) and `NaN` (a row with no
 *  weight; `NaN > 0` is false). A call that forgets `possible` passes `undefined`, which reads as nothing measured too, so the mistake is a loud red (a passing run exits 1) and never a green. A `total` that is
 *  not a number stays a clause of its own (round 4, finding 8: `NaN < bar` is false, so the comparison alone read it as a pass): this function is pure, and a `total` is not always derived from its `possible`. */
export const exitFor = ({ mode, failed, possible, total, bar }) =>
  (failed > 0 || !(possible > 0) || !Number.isFinite(total) || (mode !== 'quick' && total < bar) ? 1 : 0)

/** The closing line of a browserless run. It counts the rows that were not run FOR WANT OF A BROWSER (`why: 'browser'`), not every not-applicable row: on the weekly schedule the outbox row has no subject and is
 *  not applicable too, and is no row that needs a browser (review 2026-11-15, finding 9: it said 7 rows / 190 points where 6 / 180 were not run). */
export const browserlessLine = results => {
  // The rows that RAN: those that passed, and the row that ran and found no subject (`why: 'no-subject'`, the outbox row on a scheduled run). A browserless run has no failing row when this is written.
  const ran = results.filter(r => r.state === 'PASS' || (r.state === 'N/A' && r.why === 'no-subject')).length
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
  // The last three columns are a run that measured nothing (round 5, finding A8): 0 points possible, a `possible` that is NaN (a row with no weight) beside a score that is finite, and both NaN. Each is 1 in
  // EVERY mode, quick too (a quick run is not held to the bar, so only `possible` can refuse it). The NaN column of round 4 (finding 8, a `total` that is not a number beside a possible that is) stays.
  const P = 530
  const exits = Object.fromEntries(MODES.map(m => [m, [
    exitFor({ mode: m, failed: 0, possible: P, total: 100, bar: 95 }), exitFor({ mode: m, failed: 1, possible: P, total: 97, bar: 95 }), exitFor({ mode: m, failed: 3, possible: P, total: 40, bar: 95 }),
    exitFor({ mode: m, failed: 0, possible: P, total: 94, bar: 95 }), exitFor({ mode: m, failed: 0, possible: P, total: NaN, bar: 95 }),
    exitFor({ mode: m, failed: 0, possible: 0, total: 0, bar: 95 }), exitFor({ mode: m, failed: 0, possible: NaN, total: 100, bar: 95 }), exitFor({ mode: m, failed: 0, possible: NaN, total: NaN, bar: 95 }),
  ]]))
  check('THE EXIT: a failing row exits 1 in every mode at any score, an unfailing run exits 0, a score under the bar exits 1 except in quick (which skipped rows), and a run that measured nothing (0 points possible, a `possible` that is NaN, a `total` that is NaN) exits 1 in every mode, quick included',
    JSON.stringify(exits) === JSON.stringify({ full: [0, 1, 1, 1, 1, 1, 1, 1], quick: [0, 1, 1, 0, 1, 1, 1, 1], browserless: [0, 1, 1, 1, 1, 1, 1, 1] }), JSON.stringify(exits))
  // A call that leaves `possible` out is read as nothing measured: a green run is then a red one, never the other way round.
  check('...and a call that does not pass `possible` exits 1 (an omission is a loud red, not a green)', MODES.every(m => exitFor({ mode: m, failed: 0, total: 100, bar: 95 }) === 1), 'a run whose caller forgot `possible` would exit 0')
  const sched = [{ state: 'PASS', weight: 20 }, { state: 'PASS', weight: 30 }, ...Array.from({ length: 6 }, () => ({ state: 'N/A', weight: 30, why: 'browser' })), { state: 'N/A', weight: 10, why: 'no-subject' }]
  check('THE CLOSING LINE of a browserless run counts the rows not run for want of a browser, and the rows that RAN: on a scheduled run the outbox row ran and found no subject, so it is one of the 3 that ran and is not one of the 6 (180 points) that were not run; without it, 2 ran',
    /among the 3 rows that ran\. 6 row\(s\) that need a browser were NOT run \(180 points\)\. This is NOT a pass\./.test(browserlessLine(sched)) && /among the 2 rows that ran\. 6 row\(s\)/.test(browserlessLine(sched.slice(0, 8))), browserlessLine(sched))
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
  check('confidence.mjs: every process.exit is a usage error (2) or exitFor(...), `possible` passed: seven of the latter, one per way a run can end', exitCalls.filter(c => c === '2').length === 3 && exitCalls.filter(c => /^exitFor\(\{ mode: MODE, failed: [^}]+, possible, total, bar: BAR \}\)$/.test(c)).length === 7 && exitCalls.length === 10,
    JSON.stringify(exitCalls))
  // THE REAL confidence.mjs, END TO END, over stand-in rows (review 2026-11-15, rounds 2 and 4). The wiring checks above pin where the exits are and that they go through exitFor, not what is
  // passed to it: `failed: failedRows.length` changed to `failed: 0`, a `&& !BROWSERLESS` on the filter or the guard of the failing-row block, an emptied `quickFailures`, each left the real gate exiting 0
  // over a failing row while those checks stayed green. So the file is COPIED to a scratch directory with stand-ins for everything that would run the real suite (the rows, the identity, the stranded-mutation
  // check) and run for real in each mode. The rows log their own calls (`ran.log`), so what a mode does NOT run is observable; the identity answers from the environment, so the record's identity fields are
  // observable too. THE INVENTORY IS NOT STOOD IN FOR (round 5, finding A13): gate-inventory.mjs reads one file and runs nothing, so a REAL copy compares the stand-in rows with a `docs/gate-rows.txt` this
  // test writes, and its export list is the real one by construction. A stand-in that ignored its arguments left `diffAgainst(readInventory(), rows)` free to become `diffAgainst(rows, rows)`. The real gate is never run here.
  {
    const fs = await import('node:fs'), { tmpdir } = await import('node:os'), { join } = await import('node:path'), { spawnSync } = await import('node:child_process')
    const scratch = fs.mkdtempSync(join(tmpdir(), 'confidence-e2e-'))
    try {
      fs.mkdirSync(join(scratch, 'scripts')); fs.mkdirSync(join(scratch, 'docs'))
      const here = fileURLToPath(new URL('.', import.meta.url))
      for (const f of ['confidence.mjs', 'gate-mode.mjs', 'gate-inventory.mjs']) fs.copyFileSync(join(here, f), join(scratch, 'scripts', f))
      // The names confidence.mjs imports from the module that is stood in for, against the names the stand-in exports (a LITERAL list): a new import in confidence.mjs is then a named failure here,
      // not a crash in every run below (round 4, finding 15). gate-inventory.mjs is a real copy now, so it has no list.
      const STANDIN_EXPORTS = { 'checks.mjs': ['runIdentity'] }
      const imported = mod => (new RegExp(`import \\{([^}]*)\\} from './${mod.replace('.', '\\.')}'`).exec(gateSource)?.[1] ?? '').split(',').map(x => x.trim()).filter(Boolean)
      const missing = Object.entries(STANDIN_EXPORTS).flatMap(([mod, have]) => imported(mod).filter(n => !have.includes(n)).map(n => `${n} from ${mod}`))
      check('THE STAND-INS COVER WHAT confidence.mjs IMPORTS from the module they replace (checks.mjs): a new import is named here, not found as a crash in every run below',
        missing.length === 0 && imported('checks.mjs').length === 1, `no stand-in for: ${missing.join(', ')}`)
      fs.writeFileSync(join(scratch, 'scripts', 'checks.mjs'), `export const runIdentity = () => ({ sha: process.env.STANDIN_SHA ?? 'a'.repeat(40), dirty: process.env.STANDIN_DIRTY === '1', id: process.env.STANDIN_ID ?? 'standin' })\n`)
      fs.writeFileSync(join(scratch, 'scripts', 'mutation-check.mjs'), `process.exit(0)\n`)
      const ROW = {
        good: "  { name: 'good', weight: 990, run: ran('good') },\n",
        bad: "  { name: 'bad', weight: 10, run: ran('bad', false) },\n",
        build: "  { name: 'build', weight: 5, skipQuick: true, run: ran('build') },\n",
        browser: "  { name: 'browser', weight: 5, skipQuick: true, browser: true, run: ran('browser') },\n",
        boom: "  { name: 'boom', weight: 10, run: () => { throw new Error('x') } },\n",
        na: "  { name: 'na', weight: 10, run: () => NOT_APPLICABLE },\n",
        na2: "  { name: 'na2', weight: 10, run: () => NOT_APPLICABLE },\n",
        sq: "  { name: 'sq', weight: 20, skipQuick: true, run: ran('sq', false) },\n",
        br: "  { name: 'br', weight: 20, skipQuick: true, browser: true, run: ran('br', false) },\n",
        async: "  { name: 'async', weight: 10, run: async () => false },\n",
        string: "  { name: 'string', weight: 10, run: () => 'yes' },\n",
        number: "  { name: 'number', weight: 10, run: () => 1 },\n",
        object: "  { name: 'object', weight: 10, run: () => ({}) },\n",
        undef: "  { name: 'undef', weight: 10, run: () => undefined },\n",
        noweight: "  { name: 'noweight', run: ran('noweight') },\n",
      }
      // The inventory the real gate-inventory.mjs reads: `<weight> <name>` per row, by default the stand-in table itself (a gate that matches its inventory). A test that wants a mismatch passes the lines.
      const weightOf = n => Number(/weight: (\d+)/.exec(ROW[n])?.[1])
      const standIn = names => `import { appendFileSync } from 'node:fs'\nexport const NOT_APPLICABLE = Symbol('n/a')\nexport const failures = []\nexport const ok = () => true\n`
        + `const ran = (n, v = true) => () => { appendFileSync('ran.log', n + '\\n'); return v }\nexport const rows = [\n${names.map(n => ROW[n]).join('')}]\n`
      const go = (names, flags = [], env = {}, inventory = names.map(n => `${weightOf(n)} ${n}`)) => {
        fs.writeFileSync(join(scratch, 'scripts', 'gate-checks.mjs'), standIn(names)); fs.writeFileSync(join(scratch, 'docs', 'gate-rows.txt'), `${inventory.join('\n')}\n`)
        fs.rmSync(join(scratch, 'docs', 'confidence-log.jsonl'), { force: true }); fs.rmSync(join(scratch, 'ran.log'), { force: true })
        const r = spawnSync(process.execPath, ['scripts/confidence.mjs', ...flags], { cwd: scratch, encoding: 'utf8', timeout: 60000, env: { ...process.env, ...env } })
        let rec = null
        try { rec = JSON.parse(fs.readFileSync(join(scratch, 'docs', 'confidence-log.jsonl'), 'utf8').trim().split('\n').pop()) } catch { rec = null }
        let ran = []
        try { ran = fs.readFileSync(join(scratch, 'ran.log'), 'utf8').split('\n').filter(Boolean) } catch { ran = [] }
        return { status: r.status, out: `${r.stdout}${r.stderr}`, rec, ran }
      }
      const J = JSON.stringify
      const FOUR = ['good', 'bad', 'build', 'browser']
      // A failing row whose weight leaves the score above the bar (a weight-10 row of 1010 points: 99): only the conjunction of failing rows can keep it red.
      const red = { full: go(FOUR), quick: go(FOUR, ['--quick']), browserless: go(FOUR, ['--browserless']) }
      check('THE REAL confidence.mjs OVER STAND-IN ROWS, with a failing row that leaves the score at 99 (above the bar): it exits 1 in every mode, names the row, and records it as failing, with the score of that mode (earned, possible, total)',
        ['full', 'quick', 'browserless'].every(m => red[m].status === 1 && /bad/.test(red[m].out) && J(red[m].rec?.failing) === '["bad"]')
          && J(['full', 'quick', 'browserless'].map(m => [red[m].rec?.earned, red[m].rec?.possible, red[m].rec?.total])) === '[[1000,1010,99],[990,1000,99],[995,1005,99]]',
        J(Object.fromEntries(Object.entries(red).map(([m, r]) => [m, [r.status, r.rec?.failing, r.rec?.earned, r.rec?.possible, r.rec?.total]]))))
      const thrown = go(['good', 'boom'])
      check('...a row that THROWS is a failing row, recorded and exited on like any other (the gate does not crash on it)', thrown.status === 1 && J(thrown.rec?.failing) === '["boom"]', `exit ${thrown.status}; ${thrown.out.slice(-300)}`)
      const na = go(['good', 'na'])
      check('...a row with no subject on this run (NOT_APPLICABLE) is out of the score, named in the record, and is no failure: 990 possible, exit 0', na.status === 0 && na.rec?.possible === 990 && J(na.rec?.notApplicable) === '["na"]' && J(na.rec?.failing) === '[]', `exit ${na.status}; ${J([na.rec?.possible, na.rec?.notApplicable])} ${na.out.slice(-300)}`)
      // A ROW PASSES ONLY BY RETURNING true (round 4, finding 11): an async row, a string, a number and an object are truthy and were scored as passes; undefined is falsy and always failed.
      const nonBool = Object.fromEntries(['async', 'string', 'number', 'object', 'undef'].map(n => [n, go(['good', n])]))
      check('A ROW THAT RETURNS A TRUTHY VALUE THAT IS NOT true IS A FAILING ROW: an async function (a Promise), a string, a number and an object each exit 1 and are recorded as failing, and the line says what was returned',
        Object.entries(nonBool).every(([n, r]) => r.status === 1 && J(r.rec?.failing) === J([n])) && /\(returned object, which is not true/.test(nonBool.async.out) && /\(returned string, which is not true/.test(nonBool.string.out) && /\(returned number, which is not true/.test(nonBool.number.out),
        J(Object.fromEntries(Object.entries(nonBool).map(([n, r]) => [n, [r.status, r.rec?.failing]]))))
      // A RUN THAT MEASURED NOTHING (0 points possible) is a failure in EVERY mode, says 0 and not NaN, and says why (round 4, finding 8; round 5, finding A8): the guard in confidence.mjs, the exit in exitFor and
      // the refusal's own line are each pinned. `--quick` is the mode that exited 0 over it: it skipped rows, so the bar is not asked of it, and every row here is skipped (`build`, `browser`) or not applicable (`na`).
      const nothing = { full: go(['na', 'na2']), browserless: go(['na', 'na2'], ['--browserless']), blBrowser: go(['browser'], ['--browserless']), quickSkipped: go(['build', 'browser'], ['--quick']), quickNa: go(['na', 'na2'], ['--quick']) }
      check('A RUN THAT MEASURED NOTHING (every row skipped or not applicable, 0 points possible) EXITS 1 in full, in browserless and in --quick, records a total of 0 (not NaN), prints `0/0 points = 0/100` and `Nothing was measured`, and never says the gate passed or that no row failed',
        Object.values(nothing).every(r => r.status === 1 && r.rec?.possible === 0 && r.rec?.total === 0 && /0\/0 points = 0\/100/.test(r.out) && /Nothing was measured: 0 points possible/.test(r.out) && !/Gate passed/.test(r.out) && !/No failures among/.test(r.out)),
        J(Object.fromEntries(Object.entries(nothing).map(([m, r]) => [m, [r.status, r.rec?.possible, r.rec?.total]]))))
      // A FAILING ROW IS RED WHATEVER FLAGS IT CARRIES (round 4, finding 9): `sq` is skipQuick without browser (the F# build and compiler-verified doc rows are such), `br` is skipQuick and browser.
      const sq = { full: go(['good', 'sq', 'browser']), browserless: go(['good', 'sq', 'browser'], ['--browserless']), quick: go(['good', 'sq', 'browser'], ['--quick']) }
      const br = { full: go(['good', 'br']), browserless: go(['good', 'br'], ['--browserless']), quick: go(['good', 'br'], ['--quick']) }
      check('A FAILING skipQuick ROW THAT IS NO BROWSER ROW (weight 20, the score stays 98) is red in full and in browserless, and is skipped, not failing, in quick; a failing BROWSER row is red in full, not applicable (not failing) in browserless, and skipped in quick',
        sq.full.status === 1 && J(sq.full.rec?.failing) === '["sq"]' && sq.browserless.status === 1 && J(sq.browserless.rec?.failing) === '["sq"]' && sq.quick.status === 0 && J(sq.quick.rec?.skipped) === '["sq","browser"]' && J(sq.quick.rec?.failing) === '[]'
          && br.full.status === 1 && J(br.full.rec?.failing) === '["br"]' && br.browserless.status === 0 && J(br.browserless.rec?.notApplicable) === '["br"]' && J(br.browserless.rec?.failing) === '[]' && br.quick.status === 0 && J(br.quick.rec?.skipped) === '["br"]',
        J({ sq: Object.fromEntries(Object.entries(sq).map(([m, r]) => [m, [r.status, r.rec?.failing, r.rec?.skipped]])), br: Object.fromEntries(Object.entries(br).map(([m, r]) => [m, [r.status, r.rec?.failing, r.rec?.notApplicable]])) }))
      const green = { full: go(['good', 'build', 'browser']), quick: go(['good', 'build', 'browser'], ['--quick']), browserless: go(['good', 'build', 'browser'], ['--browserless']) }
      check('...with every row passing it exits 0 in every mode; `--quick` and `--browserless` say it is NOT a pass, and the browserless record names the row it did not run',
        ['full', 'quick', 'browserless'].every(m => green[m].status === 0) && /Gate passed/.test(green.full.out) && /NOT a pass/.test(green.quick.out) && /NOT a pass/.test(green.browserless.out)
          && J(green.browserless.rec?.notApplicable) === '["browser"]' && green.browserless.rec?.mode === 'browserless' && /-browserless$/.test(green.browserless.rec?.id ?? '') && green.full.rec?.mode === 'full' && green.quick.rec?.mode === 'quick',
        J(Object.fromEntries(Object.entries(green).map(([m, r]) => [m, [r.status, r.rec?.mode, r.rec?.notApplicable]]))))
      // WHAT EACH MODE RUNS is observable, not only what it records (round 4, finding 12): a row that must not run is not called.
      check('WHAT A MODE RUNS: full calls all three rows, quick calls only the one that is neither browser nor build, browserless calls everything but the browser row (the build row included)',
        J(green.full.ran) === '["good","build","browser"]' && J(green.quick.ran) === '["good"]' && J(green.browserless.ran) === '["good","build"]', J({ full: green.full.ran, quick: green.quick.ran, browserless: green.browserless.ran }))
      // THE RECORD'S SCORE AND IDENTITY (round 4, finding 10): earned, possible, total and the identity the stand-in reports, dirty and clean.
      const dirty = go(['good', 'build', 'browser'], [], { STANDIN_SHA: 'b'.repeat(40), STANDIN_DIRTY: '1', STANDIN_ID: 'run-xyz' })
      const dirtyBl = go(['good', 'build', 'browser'], ['--browserless'], { STANDIN_ID: 'run-xyz' })
      check('THE RECORD CARRIES WHAT WAS MEASURED: score (earned, possible, total), the sha and id the run had, whether the tree was dirty (and the line says so), seconds and a per-row duration for every row that ran and none for a skipped one; a browserless run\'s id has its suffix',
        J([green.full.rec?.earned, green.full.rec?.possible, green.full.rec?.total]) === '[1000,1000,100]' && green.full.rec?.dirty === false && green.full.rec?.sha === 'a'.repeat(40) && green.full.rec?.id === 'standin'
          && dirty.rec?.dirty === true && dirty.rec?.sha === 'b'.repeat(40) && dirty.rec?.id === 'run-xyz' && /\(tree dirty\)/.test(dirty.out) && !/\(tree dirty\)/.test(green.full.out) && dirtyBl.rec?.id === 'run-xyz-browserless'
          && typeof green.full.rec?.seconds === 'number' && J(Object.keys(green.full.rec?.rowSeconds ?? {}).sort()) === '["browser","build","good"]' && J(Object.keys(green.quick.rec?.rowSeconds ?? {})) === '["good"]',
        J({ full: green.full.rec, dirty: dirty.rec?.dirty, sha: dirty.rec?.sha, id: dirty.rec?.id, bl: dirtyBl.rec?.id }))
      // THE INVENTORY REFUSAL, by the REAL comparison (round 4, finding 13; round 5, finding A13): a gate that does not match docs/gate-rows.txt is refused before anything is scored, with exit 2 and nothing
      // recorded or run. The inventory is read from a file this test writes and compared by the real `diffAgainst`, so each way the two can differ is its own run, and the arguments of the call are observable:
      // `diffAgainst(rows, rows)` finds nothing wrong anywhere, `diffAgainst(readInventory(), [])` refuses every gate, and swapped arguments name MISSING for UNDECLARED.
      const refusal = {
        lacks: go(['good', 'build'], [], {}, ['990 good', '5 build', '7 ghost']), extra: go(['good', 'build'], [], {}, ['990 good']), weight: go(['good', 'build'], [], {}, ['990 good', '6 build']),
        quick: go(['good', 'build'], ['--quick'], {}, ['990 good', '5 build', '7 ghost']), browserless: go(['good', 'build'], ['--browserless'], {}, ['990 good', '5 build', '7 ghost']),
        weightless: go(['good', 'noweight'], [], {}, ['990 good']),
      }
      const refused = (r, what) => r.status === 2 && /The gate does not match docs\/gate-rows\.txt/.test(r.out) && what.test(r.out) && /Refusing to score/.test(r.out) && r.rec === null && r.ran.length === 0
      check('A GATE THAT DOES NOT MATCH ITS INVENTORY IS REFUSED, by the real comparison: a row the inventory has and the gate lacks (MISSING), a row the gate has and the inventory lacks (UNDECLARED), a weight that differs (WEIGHT changed), in every mode: each exit 2, named, `Refusing to score`, no row run, nothing recorded',
        refused(refusal.lacks, /MISSING row "ghost" \(7 pts\)/) && refused(refusal.extra, /UNDECLARED row "build" \(5 pts\)/) && refused(refusal.weight, /WEIGHT changed for "build": declared 6, gate has 5/)
          && refused(refusal.quick, /MISSING row "ghost" \(7 pts\)/) && refused(refusal.browserless, /MISSING row "ghost" \(7 pts\)/),
        J(Object.fromEntries(Object.entries(refusal).map(([k, r]) => [k, [r.status, r.out.split('\n').filter(l => /ghost|build/.test(l)).map(l => l.trim()), r.rec === null, r.ran]]))))
      // A row with no weight is the NaN `possible` of finding A8: through the real gate it never reaches scoring, because the inventory cannot declare it (`undefined !== 5`), and the refusal is exit 2.
      const ordered = go(['good', 'build'], [], {}, ['5 build', '990 good'])
      check('...a row with no weight (the NaN `possible` of A8) is refused here as UNDECLARED, before anything is scored; and the same rows declared in another order are no mismatch (rows are compared by name)',
        refused(refusal.weightless, /UNDECLARED row "noweight" \(undefined pts\)/) && ordered.status === 0 && J(ordered.ran) === '["good","build"]', `weightless: ${refusal.weightless.status} ${refusal.weightless.out.slice(-200)}; reordered: ${ordered.status}`)
      const both = go(['good'], ['--quick', '--browserless'])
      check('...and `--quick --browserless` is a usage error: exit 2, nothing run, nothing recorded', both.status === 2 && both.rec === null && both.ran.length === 0, `exit ${both.status}; ${both.out.slice(-200)}`)
    } finally { fs.rmSync(scratch, { recursive: true, force: true }) }
  }
  finish(summarize())
}
