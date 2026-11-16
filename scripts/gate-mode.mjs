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
  const named = (mode, what, rows = gateRows) => rows.filter(r => actionFor(mode, r) === what)
  const BROWSER_ROWS = [
    'render checks pass on both captures', 'grouping and date navigation pass', 'games on a panel are separated from each other',
    'tabs work and the pick score never renders', "pick'em grades only finished games", 'the sparkline shows the value, not a silhouette',
  ]
  const MUTATION_ROW = 'breaking each invariant makes a check fail'
  // THE PINNED DENOMINATORS (Rule 91: a visible denominator is the point, so they stay literal, here and nowhere else; the labels below are written from them). A row added to the gate or removed from it moves every one of
  // them, and a check that failed with only the names of the unchanged rows left a person to find which number moved and which file held it (round 6, O-new-2: a new 30-point row that needs no browser turned two checks red, and
  // nothing named this file as the third to edit beside docs/gate-rows.txt and scripts/gate-checks.mjs). The failing checks print what they READ beside what is PINNED, and say which three files change together.
  // browserlessNaPoints and the names in BROWSER_ROWS describe the rows that need a browser; the other five are what a row of any kind adds to or takes from.
  const PINNED = { rows: 23, quickSkip: 10, quickRun: 13, browserlessNaPoints: 180, browserlessRun: 17, browserlessRunPoints: 350 }
  const TO_CHANGE = 'A row added to the gate or removed from it moves these counts: change PINNED (the first lines of this self-test in scripts/gate-mode.mjs) in the same commit as docs/gate-rows.txt and scripts/gate-checks.mjs'
  const vs = (what, read, pinned) => `${what} ${read} (pinned ${pinned}${read === pinned ? '' : ', DIFFERS'})`
  const points = rs => rs.reduce((a, r) => a + r.weight, 0)
  /** The two checks that pin the table's size, over `rows` (the real table, or one with a row added in the fixture below): each is `[passed, detail]`. The shards variable is set for the one read that needs it and put back. */
  const pinsOf = rows => {
    const was = process.env.GATE_MUTATION_SHARDS
    process.env.GATE_MUTATION_SHARDS = '8'
    try {
      const na = named('browserless', 'na', rows), run = named('browserless', 'run', rows)
      const shards = [JSON.stringify(na.map(r => r.name).sort()) === JSON.stringify([...BROWSER_ROWS].sort()) && points(na) === PINNED.browserlessNaPoints && run.length === PINNED.browserlessRun && points(run) === PINNED.browserlessRunPoints,
        `not applicable: ${na.map(r => r.name).join(' | ')}. Read beside pinned: ${[vs('not applicable points', points(na), PINNED.browserlessNaPoints), vs('rows run', run.length, PINNED.browserlessRun), vs('points run', points(run), PINNED.browserlessRunPoints)].join('; ')}. ${TO_CHANGE}`]
      const skip = named('quick', 'skip', rows), quick = named('quick', 'run', rows), full = named('full', 'run', rows)
      const modes = [skip.length === PINNED.quickSkip && quick.length === PINNED.quickRun && rows.length === PINNED.rows && full.length === PINNED.rows && named('full', 'na', rows).length === 0 && named('full', 'skip', rows).length === 0,
        `Read beside pinned: ${[vs('rows', rows.length, PINNED.rows), vs('skipped in quick', skip.length, PINNED.quickSkip), vs('run in quick', quick.length, PINNED.quickRun), vs('run in full', full.length, PINNED.rows)].join('; ')}; not applicable in full ${named('full', 'na', rows).length}, skipped in full ${named('full', 'skip', rows).length} (both pinned 0). ${TO_CHANGE}`]
      return { shards, modes, read: { rows: rows.length, skip: skip.length, quick: quick.length, run: run.length, runPoints: points(run), naPoints: points(na) } }
    } finally {
      if (was === undefined) delete process.env.GATE_MUTATION_SHARDS
      else process.env.GATE_MUTATION_SHARDS = was
    }
  }
  const saved = process.env.GATE_MUTATION_SHARDS
  try {
    const pins = pinsOf(gateRows)
    check(`BROWSERLESS WITH THE SHARDS READ BACK: exactly the six rows that drive a browser are not applicable (${PINNED.browserlessNaPoints} points), and the other ${PINNED.browserlessRun} run (${PINNED.browserlessRunPoints})`, ...pins.shards)
    delete process.env.GATE_MUTATION_SHARDS
    const inProcess = named('browserless', 'na').map(r => r.name)
    check('...and when the mutation row runs the whole suite in this process (no shards), it drives every browser script and is not applicable too',
      inProcess.length === 7 && inProcess.includes(MUTATION_ROW), inProcess.join(' | '))
    // A ROW ADDED TO THE GATE (round 6, O-new-2): a 30-point row that needs no browser, written like the existing ones, is the edit that turned these checks red with nothing to say which number moved. Everything is read
    // RELATIVE to the real table's own counts (pins.read), so this check does not go red with the real ones when a row is added on purpose: it asserts what a ROW ADDED does, not what the table holds.
    const grown = pinsOf([...gateRows, { name: 'zz new row', weight: 30, run: () => true }]), was = pins.read, now = grown.read
    const printed = (what, read, pinned) => `${what} ${read} (pinned ${pinned}`
    check('A ROW ADDED TO THE GATE MOVES EVERY COUNT A PINNED CHECK READS (a 30-point row that needs no browser: +1 row, +1 run in quick, +1 and +30 points run in browserless, nothing else), and when the pins held, both checks are red and each says what it READ beside what is PINNED and names the three files that change together',
      now.rows === was.rows + 1 && now.quick === was.quick + 1 && now.skip === was.skip && now.run === was.run + 1 && now.runPoints === was.runPoints + 30 && now.naPoints === was.naPoints
        && (pins.shards[0] !== true || grown.shards[0] === false) && (pins.modes[0] !== true || grown.modes[0] === false)
        && grown.shards[1].includes(printed('rows run', now.run, PINNED.browserlessRun)) && grown.shards[1].includes(printed('points run', now.runPoints, PINNED.browserlessRunPoints)) && grown.shards[1].includes(printed('not applicable points', now.naPoints, PINNED.browserlessNaPoints))
        && grown.modes[1].includes(printed('rows', now.rows, PINNED.rows)) && grown.modes[1].includes(printed('skipped in quick', now.skip, PINNED.quickSkip)) && grown.modes[1].includes(printed('run in quick', now.quick, PINNED.quickRun)) && grown.modes[1].includes(printed('run in full', now.rows, PINNED.rows))
        && [grown.shards[1], grown.modes[1]].every(d => /scripts\/gate-mode\.mjs/.test(d) && /docs\/gate-rows\.txt/.test(d) && /scripts\/gate-checks\.mjs/.test(d) && /PINNED/.test(d)),
      JSON.stringify({ was, now, grown }))
    // THE FILE THAT SAYS WHAT TO EDIT says it: the paragraph of docs/gate-rows.txt that tells a person how to change the gate names this file and PINNED too, or the detail above is the only place that does.
    const gateRowsDoc = (await import('node:fs')).readFileSync(new URL('../docs/gate-rows.txt', import.meta.url), 'utf8')
    const toChange = /# TO CHANGE THE GATE:[^\n]*(?:\n#[^\n]*)*/.exec(gateRowsDoc)?.[0] ?? '', toChangeFlat = toChange.replace(/\n# ?/g, ' ')
    const toEdit = toChangeFlat.split(' together.')[0]
    check('docs/gate-rows.txt: the TO CHANGE THE GATE paragraph says in its first sentence to edit all three files (this file, scripts/gate-checks.mjs and scripts/gate-mode.mjs), and names the PINNED table, so the third file is not found by a red self-test',
      toChange !== '' && /this file/.test(toEdit) && /scripts\/gate-checks\.mjs/.test(toEdit) && /scripts\/gate-mode\.mjs/.test(toEdit) && /\bPINNED\b/.test(toChangeFlat), toChange || 'no TO CHANGE THE GATE paragraph in docs/gate-rows.txt')
  } finally {
    if (saved === undefined) delete process.env.GATE_MUTATION_SHARDS
    else process.env.GATE_MUTATION_SHARDS = saved
  }
  check('A BROWSER ROW IS ONE QUICK MODE SKIPS TOO: every row flagged `browser` is also `skipQuick`, so the two modes never disagree about what needs a browser',
    gateRows.filter(r => r.browser === true).every(r => r.skipQuick === true), gateRows.filter(r => r.browser === true && !r.skipQuick).map(r => r.name).join(' | '))
  check(`quick still skips exactly the ${PINNED.quickSkip} rows it did, and runs the rest; full runs all ${PINNED.rows}`, ...pinsOf(gateRows).modes)
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
      // THE MODULES confidence.mjs REACHES, each either a REAL COPY (it runs nothing and imports nothing that does) or a STAND-IN written below (it would run the real suite or git). The coverage of the stand-ins
      // is checked against what confidence.mjs imports, so a new import is a NAMED failure here, not a crash in every run below (round 4, finding 15; round 5, finding A15: gate-checks.mjs and mutation-check.mjs
      // were stood in for with no list at all, and a name added from either was an unnamed red with a JSON detail). The lists are LITERALS, and a check below ties each to the text of its stand-in.
      const COPIED = ['confidence.mjs', 'gate-mode.mjs', 'gate-inventory.mjs']
      for (const f of COPIED) fs.copyFileSync(join(here, f), join(scratch, 'scripts', f))
      const STANDIN_EXPORTS = { 'checks.mjs': ['runIdentity'], 'gate-checks.mjs': ['NOT_APPLICABLE', 'failures', 'ok', 'rows'], 'mutation-check.mjs': [] }
      /** The names a module's text exports, sorted (`export const|function|class NAME`, `export { a, b as c }`, `export default`). */
      const exportNames = text => [...new Set([
        ...[...text.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([\w$]+)/gm)].map(m => m[1]),
        ...[...text.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap(m => m[1].split(',').map(x => x.trim().split(/\s+as\s+/).pop()).filter(Boolean)),
        ...(/^export\s+default\b/m.test(text) ? ['default'] : []),
      ])].sort()
      /** Every relative import statement of a source: its module, and the names it takes (`{ a, b as c }` gives a and b; a default import gives `default`; `* as ns` gives `*`; a bare `import './x.mjs'` none). */
      const importsOf = src => [...src.matchAll(/^import\s+(?:([^'"]*?)\s+from\s+)?'\.\/([^']+)'/gm)].map(m => {
        const clause = m[1] ?? '', names = []
        const brace = /\{([^}]*)\}/.exec(clause)
        if (brace) names.push(...brace[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean))
        const rest = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim()
        if (rest.startsWith('*')) names.push('*')
        else if (rest) names.push('default')
        return { mod: m[2], names }
      })
      /** What of a source's reach the scratch directory does not cover, each as a sentence naming it: a module it imports that is neither a copy nor a stand-in, and a name it imports from a stand-in that the stand-in does
       *  not export. With `strings`, every `'./x.mjs'` the source names counts as reached too (a dynamic import, `new URL('./x.mjs', ...)`): that is for confidence.mjs, which runs; the other copies carry a self-test
       *  whose fixtures name modules as text, and it never runs in the scratch directory. */
      const uncovered = (src, copied, standIns, { strings = false } = {}) => {
        const imports = importsOf(src)
        const named = [...new Set([...imports.map(i => i.mod), ...(strings ? [...src.matchAll(/['"]\.\/([\w.-]+\.mjs)['"]/g)].map(m => m[1]) : [])])]
        return [
          ...named.filter(m => !copied.includes(m) && !(m in standIns)).map(m => `no stand-in or copy for module ${m}`),
          ...imports.flatMap(({ mod, names }) => (mod in standIns ? names.filter(n => !standIns[mod].includes(n)).map(n => `no stand-in for: ${n} from ${mod}`) : [])),
        ]
      }
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
        // The shape of the one real row whose `browser` is a FUNCTION (the mutation row: weight 20, skipQuick; it needs a browser only when the shards are not read back): `fb` is that shape, `fq` is the same
        // without skipQuick (so `--quick` runs it), and `q20` is a plain failing row of weight 20 that quick runs. The function reads the environment, so one stand-in answers both ways.
        fb: "  { name: 'fb', weight: 30, skipQuick: true, browser: () => process.env.STANDIN_FB_BROWSER === '1', run: ran('fb', false) },\n",
        fq: "  { name: 'fq', weight: 30, browser: () => process.env.STANDIN_FB_BROWSER === '1', run: ran('fq', false) },\n",
        q20: "  { name: 'q20', weight: 20, run: ran('q20', false) },\n",
      }
      // The inventory the real gate-inventory.mjs reads: `<weight> <name>` per row, by default the stand-in table itself (a gate that matches its inventory). A test that wants a mismatch passes the lines.
      const weightOf = n => Number(/weight: (\d+)/.exec(ROW[n])?.[1])
      const standIn = names => `import { appendFileSync } from 'node:fs'\nexport const NOT_APPLICABLE = Symbol('n/a')\nexport const failures = []\nexport const ok = c => { appendFileSync('ok.log', c + '\\n'); return true }\n`
        + `const ran = (n, v = true) => () => { appendFileSync('ran.log', n + '\\n'); return v }\nexport const rows = [\n${names.map(n => ROW[n]).join('')}]\n`
      const STANDIN_SRC = {
        'checks.mjs': `export const runIdentity = () => ({ sha: process.env.STANDIN_SHA ?? 'a'.repeat(40), dirty: process.env.STANDIN_DIRTY === '1', id: process.env.STANDIN_ID ?? 'standin' })\n`,
        'gate-checks.mjs': standIn(['good']), 'mutation-check.mjs': `process.exit(0)\n`,
      }
      for (const [f, text] of Object.entries(STANDIN_SRC)) if (f !== 'gate-checks.mjs') fs.writeFileSync(join(scratch, 'scripts', f), text)
      const J = JSON.stringify
      check('THE STAND-INS EXPORT WHAT THEIR LITERAL LIST SAYS: the text of each stand-in below exports exactly the names listed for it (checks.mjs, gate-checks.mjs, and none for mutation-check.mjs, which is run as a process), so a list cannot drift from what is written',
        J(Object.fromEntries(Object.entries(STANDIN_SRC).map(([f, t]) => [f, exportNames(t)]))) === J(STANDIN_EXPORTS), J(Object.fromEntries(Object.entries(STANDIN_SRC).map(([f, t]) => [f, exportNames(t)]))))
      const READS = { 'gate-checks.mjs': ['rows', 'ok', 'failures', 'NOT_APPLICABLE'], 'checks.mjs': ['runIdentity'] }
      const found = Object.fromEntries(Object.keys(READS).map(m => [m, importsOf(gateSource).filter(i => i.mod === m).flatMap(i => i.names)]))
      check('THE IMPORT READER FINDS what confidence.mjs imports from the stand-ins today (a literal list), so an empty result cannot read as full coverage',
        Object.entries(READS).every(([m, names]) => names.every(n => found[m].includes(n))), `not found: ${Object.entries(READS).flatMap(([m, names]) => names.filter(n => !found[m].includes(n)).map(n => `${n} from ${m}`)).join(', ')}`)
      // What the scratch directory must cover is what every REAL COPY reaches, not only confidence.mjs: gate-mode.mjs imports `rows`, `ok` and `failures` from gate-checks.mjs too, and runs, as a copy, against the stand-in.
      const reach = (sources, copied, standIns) => Object.entries(sources).flatMap(([f, src]) => uncovered(src, copied, standIns, { strings: f === 'confidence.mjs' }).map(m => `${f}: ${m}`))
      const copiedSources = Object.fromEntries(COPIED.map(f => [f, fs.readFileSync(join(here, f), 'utf8')]))
      check('THE STAND-INS COVER WHAT THE COPIED MODULES REACH (confidence.mjs, gate-mode.mjs, gate-inventory.mjs): every name any of them imports from checks.mjs, gate-checks.mjs and mutation-check.mjs is exported by that stand-in, and every module any names is a stand-in or a real copy; a new import is named here, not found as a crash in every run below',
        J(Object.keys(copiedSources)) === '["confidence.mjs","gate-mode.mjs","gate-inventory.mjs"]' && reach(copiedSources, COPIED, STANDIN_EXPORTS).length === 0, reach(copiedSources, COPIED, STANDIN_EXPORTS).join('; '))
      // The same function over LITERAL sources (not edits of confidence.mjs, whose own import lines are what a careless edit changes: a fixture that edited them would be a crash, not a named failure, on exactly
      // that edit). Each differs from the control in one import and has a literal expected list; the controls take a name from a REAL copy, which needs no stand-in.
      const SRC = "import { rows, ok, failures, NOT_APPLICABLE } from './gate-checks.mjs'\nimport { runIdentity } from './checks.mjs'\nimport { readInventory, diffAgainst } from './gate-inventory.mjs'\nconst spawned = new URL('./mutation-check.mjs', import.meta.url)\n"
      const GC = "import { rows, ok, failures, NOT_APPLICABLE } from './gate-checks.mjs'", CK = "import { runIdentity } from './checks.mjs'"
      const cases = [
        ['control: the imports as they are', SRC, []],
        ['a name added from gate-checks.mjs', SRC.replace(GC, GC.replace('NOT_APPLICABLE }', 'NOT_APPLICABLE, shardedSuite }')), ['confidence.mjs: no stand-in for: shardedSuite from gate-checks.mjs']],
        ['a name imported from mutation-check.mjs, whose stand-in is process.exit(0)', `${SRC}import { thing } from './mutation-check.mjs'\n`, ['confidence.mjs: no stand-in for: thing from mutation-check.mjs']],
        ['a name added from checks.mjs', SRC.replace(CK, "import { runIdentity, finish } from './checks.mjs'"), ['confidence.mjs: no stand-in for: finish from checks.mjs']],
        ['a module that is neither a copy nor a stand-in', `${SRC}import { x } from './brand-new.mjs'\n`, ['confidence.mjs: no stand-in or copy for module brand-new.mjs']],
        ['a module reached by `new URL`', `${SRC}const other = new URL('./other.mjs', import.meta.url)\n`, ['confidence.mjs: no stand-in or copy for module other.mjs']],
        ['a multi-line import with an alias: the name before `as` is the export', SRC.replace(GC, "import {\n  rows as r,\n  ok,\n  failures,\n  NOT_APPLICABLE,\n  shardedSuite as s,\n} from './gate-checks.mjs'"), ['confidence.mjs: no stand-in for: shardedSuite from gate-checks.mjs']],
        ['a namespace import of a stand-in cannot be compared with its list', SRC.replace(GC, "import * as gc from './gate-checks.mjs'"), ['confidence.mjs: no stand-in for: * from gate-checks.mjs']],
        ['a default import of a stand-in', SRC.replace(GC, "import gc from './gate-checks.mjs'"), ['confidence.mjs: no stand-in for: default from gate-checks.mjs']],
        ['control: a name added from gate-mode.mjs (a real copy)', `${SRC}import { MODES } from './gate-mode.mjs'\n`, []],
        ['a copied module other than confidence.mjs that imports a name the stand-in lacks', { 'confidence.mjs': SRC, 'gate-mode.mjs': "import { shardedSuite } from './gate-checks.mjs'\n" }, ['gate-mode.mjs: no stand-in for: shardedSuite from gate-checks.mjs']],
        ['a copied module other than confidence.mjs that imports a module that is neither a copy nor a stand-in', { 'confidence.mjs': SRC, 'gate-mode.mjs': "import { y } from './unknown.mjs'\n" }, ['gate-mode.mjs: no stand-in or copy for module unknown.mjs']],
        ['a copied module whose self-test names a module as TEXT (not an import) is not a reach', { 'confidence.mjs': SRC, 'gate-mode.mjs': "const SRC = \"import { x } from './in-a-string.mjs'\"\n" }, []],
      ]
      const LITERAL = { copied: ['confidence.mjs', 'gate-mode.mjs', 'gate-inventory.mjs'], standIns: { 'checks.mjs': ['runIdentity'], 'gate-checks.mjs': ['NOT_APPLICABLE', 'failures', 'ok', 'rows'], 'mutation-check.mjs': [] } }
      const results = cases.map(([what, src, want]) => [what, reach(typeof src === 'string' ? { 'confidence.mjs': src } : src, LITERAL.copied, LITERAL.standIns), want])
      check('...each way a new reach can go uncovered is a NAMED failure, and a name from a real copy is none: a name from gate-checks.mjs, from mutation-check.mjs and from checks.mjs, an unknown module (imported, or reached by `new URL`), a copy other than confidence.mjs, an aliased multi-line import, a namespace and a default import',
        J(LITERAL) === J({ copied: COPIED, standIns: STANDIN_EXPORTS }) && results.every(([, got, want]) => J(got) === J(want)), J(results.filter(([, got, want]) => J(got) !== J(want)).map(([what, got, want]) => ({ what, got, want }))))
      const go = (names, flags = [], env = {}, inventory = names.map(n => `${weightOf(n)} ${n}`)) => {
        fs.writeFileSync(join(scratch, 'scripts', 'gate-checks.mjs'), standIn(names)); fs.writeFileSync(join(scratch, 'docs', 'gate-rows.txt'), `${inventory.join('\n')}\n`)
        fs.rmSync(join(scratch, 'docs', 'confidence-log.jsonl'), { force: true }); fs.rmSync(join(scratch, 'ran.log'), { force: true }); fs.rmSync(join(scratch, 'ok.log'), { force: true })
        const r = spawnSync(process.execPath, ['scripts/confidence.mjs', ...flags], { cwd: scratch, encoding: 'utf8', timeout: 60000, env: { ...process.env, ...env } })
        let rec = null
        try { rec = JSON.parse(fs.readFileSync(join(scratch, 'docs', 'confidence-log.jsonl'), 'utf8').trim().split('\n').pop()) } catch { rec = null }
        let ran = []
        try { ran = fs.readFileSync(join(scratch, 'ran.log'), 'utf8').split('\n').filter(Boolean) } catch { ran = [] }
        let oks = []
        try { oks = fs.readFileSync(join(scratch, 'ok.log'), 'utf8').split('\n').filter(Boolean) } catch { oks = [] }
        return { status: r.status, out: `${r.stdout}${r.stderr}`, rec, ran, oks }
      }
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
      // A FAILING ROW IS RED WHATEVER SHAPE OR WEIGHT IT HAS (round 5, finding A9). The rows above fail with `browser` absent or `true`, and at weights 10 and 20; the one real row with a FUNCTION for `browser` (the
      // mutation row) and every real row of weight 30 were in no run, so a filter on `typeof r.browser` or on `r.weight` left the gate green over them. Each cell is one run of `good` and ONE failing row, as
      // [exit, failing, skipped, not applicable, score at or above the bar]: the last is true wherever a row failed, so only the conjunction of failing rows can be what keeps the run red.
      const cell = (name, flags = [], env = {}) => { const r = go(['good', name], flags, env); return [r.status, r.rec?.failing, r.rec?.skipped, r.rec?.notApplicable, r.rec?.total >= 95] }
      const SHAPES = ['bad', 'q20', 'sq', 'br', 'fb', 'fq'], FN_BROWSER = { STANDIN_FB_BROWSER: '1' }
      const matrix = {
        full: SHAPES.map(n => cell(n)), quick: SHAPES.map(n => cell(n, ['--quick'])), browserless: SHAPES.map(n => cell(n, ['--browserless'])),
        'browserless, function says a browser is needed': ['fb', 'fq'].map(n => cell(n, ['--browserless'], FN_BROWSER)),
      }
      const F = n => [1, [n], [], [], true], K = n => [0, [], [n], [], true], N = n => [0, [], [], [n], true]
      check('A FAILING ROW IS RED WHATEVER SHAPE OR WEIGHT IT HAS (bad 10, q20 20, sq 20, br 20, fb 30, fq 30; fb and fq have a FUNCTION for `browser`): in full each exits 1 and is named; in --quick the skipQuick ones (sq, br, fb) are skipped and bad, q20 and fq fail; in browserless sq, bad, q20 and the function rows fail, br is not applicable, and a function that says a browser is needed makes fb and fq not applicable, not failing',
        J(matrix) === J({
          full: SHAPES.map(F), quick: [F('bad'), F('q20'), K('sq'), K('br'), K('fb'), F('fq')], browserless: [F('bad'), F('q20'), F('sq'), N('br'), F('fb'), F('fq')],
          'browserless, function says a browser is needed': [N('fb'), N('fq')],
        }), J(matrix))
      // The weights the failing stand-ins carry are the weights the real table has (a literal list): a real row of another weight is a red here, asking for a stand-in of that weight.
      const realWeights = [...new Set(gateRows.map(r => r.weight))].sort((a, b) => a - b)
      check('THE FAILING STAND-INS COVER EVERY WEIGHT the real table has (10, 20, 30), in the rows every mode runs (bad, q20, fq) as well as in the full table (sq, fb)',
        J(realWeights) === '[10,20,30]' && J(['bad', 'q20', 'fq'].map(weightOf)) === J(realWeights) && J(['bad', 'q20', 'sq', 'fb'].map(weightOf).sort((a, b) => a - b)) === J([10, 20, 20, 30]),
        `real weights ${J(realWeights)} (pinned [10,20,30]); the stand-ins bad, q20 and fq weigh ${J(['bad', 'q20', 'fq'].map(weightOf))}. A row of a weight that is not on the list needs a failing stand-in of that weight in the ROW table of this self-test, and the list here changed with it`)
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
      // THE RENDER SERVER (round 5, finding A12). `ok` is stood in for by a function that logs the command and answers true, so the only call it gets is the gate's own probe of :8080 (`needsServer`): a full
      // run asks whether anything listens (and, here, hears yes, so nothing is spawned), a `--quick` run, which skips every browser row, does not ask. `needsServer = true` costs `--quick` a probe and, where
      // nothing listens, a spawned server and up to 20 s; `needsServer = false` leaves the render rows to fail for want of a server. A browserless run is left unpinned: it runs no browser row, and whether it
      // wants the server is a question about what else listens, not about this clause.
      const PROBE = 'curl -sf -o /dev/null http://localhost:8080/'
      check('THE RENDER SERVER IS PROBED WHEN ROWS THAT NEED IT WILL RUN, AND NOT IN --quick: a full run asks `ok` for one curl of localhost:8080, a --quick run asks for nothing',
        J(green.full.oks) === J([PROBE]) && J(green.quick.oks) === '[]', J({ full: green.full.oks, quick: green.quick.oks }))
      // THE RECORD NAMES THE TREE IT MEASURED IN EVERY MODE (round 5, finding A10): the full-mode run above pins `dirty` and `sha`; a clause that dropped them in `--quick` or `--browserless` left the self-test green.
      // Nothing reads them today (scripts/confidence-record-check.mjs refuses any citation of a run whose mode is not `full`), so this pins what a record SAYS, not what a verdict does.
      const IDENT = { STANDIN_SHA: 'b'.repeat(40), STANDIN_DIRTY: '1', STANDIN_ID: 'run-xyz' }
      const ident = { quick: go(['good', 'build', 'browser'], ['--quick'], IDENT), browserless: go(['good', 'build', 'browser'], ['--browserless'], IDENT) }
      check('THE RECORD NAMES THE TREE IT MEASURED IN EVERY MODE: on a dirty tree --quick and --browserless record `dirty: true`, the sha and the id the run had (browserless under its suffix) and say `(tree dirty)`; on a clean tree they record `dirty: false` and that sha',
        ['quick', 'browserless'].every(m => ident[m].rec?.dirty === true && ident[m].rec?.sha === 'b'.repeat(40) && /\(tree dirty\)/.test(ident[m].out) && green[m].rec?.dirty === false && green[m].rec?.sha === 'a'.repeat(40) && !/\(tree dirty\)/.test(green[m].out))
          && ident.quick.rec?.id === 'run-xyz' && ident.browserless.rec?.id === 'run-xyz-browserless',
        J(Object.fromEntries(['quick', 'browserless'].map(m => [m, [ident[m].rec?.dirty, ident[m].rec?.sha, ident[m].rec?.id, green[m].rec?.dirty, green[m].rec?.sha]]))))
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
