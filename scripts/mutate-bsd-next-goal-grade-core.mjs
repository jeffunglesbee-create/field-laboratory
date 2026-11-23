#!/usr/bin/env node
// Rule 90 for scripts/check-bsd-next-goal-grade-core.mjs. HALF 1 breaks a temp copy of the REAL scripts/bsd-next-goal-grade-core.mjs
// the ways a grade, a reason or a count can be wrong, and requires the check to go red on each. HALF 2 breaks the check itself:
// mutations that must leave it BLIND on a broken grader (so its red depends on that line), and mutations that tighten a gate and
// must turn it red on the real grader.
//
// Each anchor occurs exactly once and its replacement differs; a mutant that does not parse is NOT APPLIED (a SyntaxError would
// otherwise count as caught for the wrong reason); CAUGHT needs exit 1 and a FAIL line in the check's own output; the baseline
// runs first; the real files are hashed before and after and must not move.
//
// Left out as EQUIVALENT, each for a stated reason, so no reader counts them as missed:
//   `prev.home !== a || prev.away !== b` to `||` -> `&&` or to either half: the capture's total before the resolving goal is k and
//     a + b is k, so one side differs exactly when the other does.
//   `dh === 1 && da === 0` to `dh === 1` (and the away twin): the resolving goal's total is its predecessor's plus one, so
//     dh + da is 1 and dh is 1 exactly when da is 0.
//   `p.ok &&` in the two distinct-capture counters: an unreadable capture has no withoutScore, and `undefined > 0` and
//     `undefined === 0` are both false.
//   `{ home: 0, away: 0 }` -> `{ home: a, away: b }` for k === 0: k is a + b of two whole numbers that are 0 or more, so both are 0.
//   the parse cache: recomputing a capture's goals for every call changes the cost, not a count.
//
// Usage: node scripts/mutate-bsd-next-goal-grade-core.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'

const SRC = 'scripts/bsd-next-goal-grade-core.mjs'
const CHECK = 'scripts/check-bsd-next-goal-grade-core.mjs'
const FIX = 'scripts/fixtures/bsd-next-goal-grade-synthetic.mjs'
const REAL = [SRC, CHECK, FIX]
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const before = Object.fromEntries(REAL.map((f) => [f, sha(f)]))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-ngg-'))

// [name, anchor, replacement] or [name, [[anchor, replacement], ...]]
const SOURCE_MUTATIONS = [
  // ---- readGoals
  ['a non-array incidents is read', 'isObj(json) && Array.isArray(json.incidents) ? json.incidents : null', 'isObj(json) ? json.incidents : null'],
  ['a body with no incidents is readable', 'if (rows === null) return { ok: false }', ''],
  ['every row with scores is a goal', "if (!isObj(r) || r.type !== 'goal') continue", 'if (!isObj(r)) continue'],
  ['a row that is not an object is read', "if (!isObj(r) || r.type !== 'goal') continue", "if (r.type !== 'goal') continue"],
  ['half a score is a score', 'if (home === null || away === null) {', 'if (home === null && away === null) {'],
  ['a goal row without a score is not counted', '{ withoutScore++; continue }', '{ continue }'],
  ['a goal row without a score is kept as a goal', '{ withoutScore++; continue }', '{ withoutScore++ }'],
  ['the home score is read from the away field', 'const home = num(r.home_score)', 'const home = num(r.away_score)'],
  ['the away score is read from the home field', 'const away = num(r.away_score)', 'const away = num(r.home_score)'],
  ['a text minute is a minute', 'minute: num(r.minute),', 'minute: r.minute,'],
  ['the total is the home score', 'total: home + away,', 'total: home,'],
  ['the goal type is not read', "type: typeof r.goal_type === 'string' ? r.goal_type : '(none)',", "type: r.goal_type,"],
  ['a goal type that is not text is kept', "typeof r.goal_type === 'string' ? r.goal_type : '(none)'", "r.goal_type === undefined ? '(none)' : r.goal_type"],
  ['is_home is read as it comes', "isHome: typeof r.is_home === 'boolean' ? r.is_home : null,", 'isHome: r.is_home === undefined ? null : r.is_home,'],
  ['goals are not ordered', 'goals.sort((x, y) => x.total - y.total)', ''],
  ['goals are ordered newest first', 'goals.sort((x, y) => x.total - y.total)', 'goals.sort((x, y) => y.total - x.total)'],
  ['goals are ordered by minute', 'goals.sort((x, y) => x.total - y.total)', 'goals.sort((x, y) => x.minute - y.minute)'],
  ['a goal row without a score is sequential', 'const sequential = withoutScore === 0 && goals.every(', 'const sequential = goals.every('],
  ['totals start at zero', 'g.total === i + 1', 'g.total === i'],
  ['any increasing totals are sequential', 'g.total === i + 1', 'g.total >= i + 1'],
  ['sequential is always true', 'const sequential = withoutScore === 0 && goals.every((g, i) => g.total === i + 1)', 'const sequential = true'],
  // ---- gradeCall
  ['a call may be on no side', "if (side !== 'home' && side !== 'away') return", "if (false) return"],
  ['only home calls are sided', "if (side !== 'home' && side !== 'away') return", "if (side !== 'home') return"],
  ['any text is a side', "if (side !== 'home' && side !== 'away') return", "if (typeof side !== 'string') return"],
  ['the side of no call is read', 'const side = isObj(call) ? call.side : undefined', 'const side = call.side'],
  ['a fraction is a score', 'const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null)', 'const count = (v) => (num(v) !== null && v >= 0 ? v : null)'],
  ['a negative number is a score', 'Number.isInteger(v) && v >= 0 ? v : null', 'Number.isInteger(v) ? v : null'],
  ['NaN is a score', 'Number.isInteger(v) && v >= 0 ? v : null', "typeof v === 'number' && v >= 0 ? v : null"],
  ['the home score of the call is read from away', 'const a = isObj(sc) ? count(sc.home) : null', 'const a = isObj(sc) ? count(sc.away) : null'],
  ['one side of the score is enough', 'if (a === null || b === null) return', 'if (a === null && b === null) return'],
  ['the score is not required', 'if (a === null || b === null) return', 'if (false) return'],
  ['an open call is graded', "if (call.outcome !== 'hit' && call.outcome !== 'miss') return", 'if (false) return'],
  ['only hit is graded', "if (call.outcome !== 'hit' && call.outcome !== 'miss') return", "if (call.outcome !== 'hit') return"],
  ['an unreadable capture is read', 'if (!parsed || !parsed.ok) return', 'if (!parsed) return'],
  ['a missing capture is read', 'if (!parsed || !parsed.ok) return', 'if (!parsed.ok) return'],
  ['a goal row without a score is trusted', 'if (parsed.withoutScore > 0) return', 'if (false) return'],
  ['a gap in the totals is trusted', 'if (!parsed.sequential) return', 'if (false) return'],
  ['the score is the home score alone', 'const k = a + b', 'const k = a'],
  ['the resolving goal is the one after', 'const resolving = parsed.goals[k]', 'const resolving = parsed.goals[k + 1]'],
  ['the resolving goal is the one before', 'const resolving = parsed.goals[k]', 'const resolving = parsed.goals[k - 1]'],
  ['no resolving goal is an error elsewhere', 'if (resolving === undefined) return', 'if (false) return'],
    ['the state before the goal is the goal itself', 'parsed.goals[k - 1]', 'parsed.goals[k]'],
  ['the join is not checked', 'if (prev.home !== a || prev.away !== b) return', 'if (false) return'],
  ['a join mismatch is reported as a rise', "return { graded: false, reason: REASONS.join }", "return { graded: false, reason: REASONS.rise }"],
  ['the home side is the score-down side', 'if (dh === 1 && da === 0) fieldSide', 'if (dh === -1 && da === 0) fieldSide'],
  ['any rise on the home side is home', 'if (dh === 1 && da === 0) fieldSide', 'if (dh >= 1) fieldSide'],
  ['any rise on the away side is away', 'else if (dh === 0 && da === 1) fieldSide', 'else if (da >= 1) fieldSide'],
  ['the sides are swapped', "if (dh === 1 && da === 0) fieldSide = 'home'", "if (dh === 1 && da === 0) fieldSide = 'away'"],
  ['the away side is home', "fieldSide = 'away'\n", "fieldSide = 'home'\n"],
  ['no rise is a rise', 'if (fieldSide === null) return', 'if (false) return'],
  ['the verdict is inverted', "const verdict = fieldSide === side ? 'hit' : 'miss'", "const verdict = fieldSide === side ? 'miss' : 'hit'"],
  ['the verdict is always hit', "const verdict = fieldSide === side ? 'hit' : 'miss'", "const verdict = 'hit'"],
  ['agreement is disagreement', 'agree: verdict === call.outcome,', 'agree: verdict !== call.outcome,'],
  ['agreement is always true', 'agree: verdict === call.outcome,', 'agree: true,'],
  ['the goal type is lost', 'goalType: resolving.type,', 'goalType: undefined,'],
  ['is_home agreement is inverted', 'resolving.isHome === (fieldSide === \'home\')', 'resolving.isHome !== (fieldSide === \'home\')'],
  ['is_home absent counts as agreeing', 'resolving.isHome === null ? null :', 'resolving.isHome === null ? true :'],
  ['the distance has a sign', 'Math.abs(resolving.minute - rm)', '(resolving.minute - rm)'],
  ['a call with no resolved minute has a distance', 'rm === null || resolving.minute === null ? null', 'resolving.minute === null ? null'],
  ['a goal with no minute has a distance', 'rm === null || resolving.minute === null ? null', 'rm === null ? null'],
  ['the resolved minute is not read', 'const rm = num(call.resolved_minute)', 'const rm = call.resolved_minute'],
  // ---- the buckets
  ['no minute is bucket zero', "d === null ? 'no minute'", "d === null ? '0'"],
  ['three is its own bucket', "d >= 3 ? '3+'", "d > 3 ? '3+'"],
  ['two is far', "d >= 3 ? '3+'", "d >= 2 ? '3+'"],
  ['four is far', "d >= 3 ? '3+'", "d >= 4 ? '3+'"],
  // ---- gradeCalls
  ['a non-array is read as a list', 'const list = Array.isArray(items) ? items : []', 'const list = items'],
  ['every capture is the first one', 'if (!parsedByKey.has(it.key)) parsedByKey.set(it.key, readGoals(it.capture))\n    return parsedByKey.get(it.key)', 'if (!parsedByKey.has(0)) parsedByKey.set(0, readGoals(it.capture))\n    return parsedByKey.get(0)'],
  ['the population is not counted', 'population: list.length,', 'population: 0,'],
  ['a graded call is not counted', '    out.graded++\n', ''],
  ['agreement is not counted', '    if (r.agree) out.agree++\n', '    if (r.agree) out.graded += 0\n'],
  ['disagreement is counted as agreement', '    else out.disagree++\n    bump(out.confusion', '    else out.agree++\n    bump(out.confusion'],
  ['a not-applicable call is not counted', '      out.notApplicable.total++\n', ''],
  ['the reasons are not tallied', '      bump(out.notApplicable.byReason, r.reason)\n', ''],
  ['the not-applicable tags are not tallied', 'for (const name of Object.keys(tags)) cell(name, tags[name]).notApplicable++', ''],
  ['the graded tags are not tallied', "      const c = cell(name, tags[name])\n      c.graded++\n      c[r.agree ? 'agree' : 'disagree']++", ''],
  ['agreement by tag is always agree', "c[r.agree ? 'agree' : 'disagree']++", "c.agree++"],
  ['tags that are not an object are read', 'const tags = isObj(it.tags) ? it.tags : {}', 'const tags = it.tags'],
  ['the confusion matrix is not kept', 'bump(out.confusion, `ledger ${it.call.outcome}, FIELD ${r.verdict}`)', ''],
  ['the confusion swaps the sides', 'bump(out.confusion, `ledger ${it.call.outcome}, FIELD ${r.verdict}`)', 'bump(out.confusion, `ledger ${r.verdict}, FIELD ${it.call.outcome}`)'],
  ['by ledger outcome counts everything as agree', "out.byLedgerOutcome[it.call.outcome][r.agree ? 'agree' : 'disagree']++", 'out.byLedgerOutcome[it.call.outcome].agree++'],
  ['by ledger outcome does not count graded', '    out.byLedgerOutcome[it.call.outcome].graded++\n', ''],
  ['the goal types are not tallied', '    out.resolvingGoalType[r.goalType].graded++\n', ''],
  ['goal types count everything as agree', "out.resolvingGoalType[r.goalType][r.agree ? 'agree' : 'disagree']++", 'out.resolvingGoalType[r.goalType].agree++'],
  ['is_home absent counts as agrees', 'if (r.isHomeAgreesWithRise === null) out.isHomeVersusScoreRise.absent++', 'if (r.isHomeAgreesWithRise === null) out.isHomeVersusScoreRise.agrees++'],
  ['is_home disagreement is not counted', '    else out.isHomeVersusScoreRise.disagrees++\n', ''],
  ['the distance is not tallied', '    bump(out.resolvedMinuteDistance, bucket(r.distance))\n', ''],
  ['the side-or-score premise is not counted', 'if (r.reason === REASONS.side || r.reason === REASONS.score) out.premises.callsWithoutSideOrScore++', ''],
  ['the side premise ignores the score', 'if (r.reason === REASONS.side || r.reason === REASONS.score) out.premises', 'if (r.reason === REASONS.side) out.premises'],
  ['the score premise ignores the side', 'if (r.reason === REASONS.side || r.reason === REASONS.score) out.premises', 'if (r.reason === REASONS.score) out.premises'],
  ['the missing-score premise is not counted', 'if (r.reason === REASONS.noScore) out.premises.callsOnCapturesWithAGoalRowLackingAScore++', ''],
  ['the sequence premise is not counted', 'if (r.reason === REASONS.sequence) out.premises.callsOnCapturesWhoseTotalsAreNotOneToN++', ''],
  ['the join premise is not counted', 'if (r.reason === REASONS.join) out.premises.callsWhoseScoreAtCallDisagreesWithTheCapture++', ''],
  ['the join premise counts the rise', 'if (r.reason === REASONS.join) out.premises', 'if (r.reason === REASONS.rise) out.premises'],
  ['distinct captures are not counted', 'out.premises.distinctCaptures = parsedByKey.size', ''],
  ['a capture lacking a score is not counted', 'if (p.ok && p.withoutScore > 0) out.premises.distinctCapturesWithAGoalRowLackingAScore++', ''],
  ['a capture lacking a score counts when it has none', 'if (p.ok && p.withoutScore > 0)', 'if (p.ok && p.withoutScore >= 0)'],
  ['a capture with a gap is not counted', 'if (p.ok && p.withoutScore === 0 && !p.sequential) out.premises.distinctCapturesWhoseTotalsAreNotOneToN++', ''],
  ['a capture with no score is also a gap', 'if (p.ok && p.withoutScore === 0 && !p.sequential)', 'if (p.ok && !p.sequential)'],
  ['a sequential capture is a gap', 'if (p.ok && p.withoutScore === 0 && !p.sequential)', 'if (p.ok && p.withoutScore === 0 && p.sequential)'],
  // ---- the line
  ['the line has no denominator', '`graded ${grade.graded} of ${grade.population} gradeable calls', '`graded ${grade.graded} gradeable calls'],
  ['the line states agree as disagree', 'agree ${grade.agree}, disagree ${grade.disagree}', 'agree ${grade.disagree}, disagree ${grade.agree}'],
  ['the line omits the rule', ' | rule ${grade.ruleVersion}`', '`'],
  ['a missing census prints undefined', "c.gradeable === undefined ? 'n/a' : c.gradeable", 'c.gradeable'],
  ['a missing census block throws', 'const c = isObj(census) ? census : {}', 'const c = census'],
  ['the rule version has no date', "export const RULE_VERSION = '2026-11-23.1'", "export const RULE_VERSION = 'v1'"],
  // ---- the source may not reach out (each is asserted of the source text)
  ['the source imports something', 'export const RULE_VERSION', "import os from 'node:os'\nexport const RULE_VERSION"],
  ['the source reads the environment', 'const isObj = (v) =>', 'const _env = typeof process\nconst isObj = (v) =>'],
  ['the source calls the network', 'const isObj = (v) =>', 'const _net = typeof fetch\nconst isObj = (v) =>'],
  ['the source reads the clock', 'const isObj = (v) =>', 'const _clock = typeof Date\nconst isObj = (v) =>'],
  ['the source is random', 'const isObj = (v) =>', 'const _rnd = typeof Math.random\nconst isObj = (v) =>'],
]

// The check's own purity list, one broken grader per pattern: a source holding exactly that token must turn the real check red,
// and the check with that one pattern removed must stay green on it. `import` cannot be a bare identifier, so it is a statement.
const FORBIDDEN = [
  ['import', "import os from 'node:os'", '/\\bimport\\b/, '],
  ['require', 'typeof require', '/\\brequire\\b/, '],
  ['fetch', 'typeof fetch', '/\\bfetch\\b/, '],
  ['process', 'typeof process', '/\\bprocess\\b/, '],
  ['globalThis', 'typeof globalThis', '/\\bglobalThis\\b/, '],
  ['eval', 'typeof eval', '/\\beval\\b/, '],
  ['Function', 'typeof Function', '/\\bFunction\\b/, '],
  ['XMLHttpRequest', 'typeof XMLHttpRequest', '/\\bXMLHttpRequest\\b/, '],
  ['WebSocket', 'typeof WebSocket', '/\\bWebSocket\\b/, '],
  ['Deno', 'typeof Deno', '/\\bDeno\\b/, '],
  ['Bun', 'typeof Bun', '/\\bBun\\b/, '],
  ['Buffer', 'typeof Buffer', '/\\bBuffer\\b/, '],
  ['fs', 'typeof fs', '/\\bfs\\b/, '],
  ['child_process', 'typeof child_process', '/\\bchild_process\\b/, '],
  ['Date', 'typeof Date', '/\\bDate\\b/, '],
  ['Math.random', 'typeof Math.random', '/\\bMath\\.random\\b/, '],
  ['setTimeout', 'typeof setTimeout', ', /\\bsetTimeout\\b/'],
]

const BROKEN_FOR_ANALYSIS = ['const resolving = parsed.goals[k]', 'const resolving = parsed.goals[k + 1]']
const BROKEN_EXITS_AT_IMPORT = ['const isObj = (v) =>', 'process.exit(0)\nconst isObj = (v) =>']

const CHECK_MUTATIONS = [
  ['blind', 'eq never fails', 'if (stable(got) !== stable(want)) {', 'if (false) {', BROKEN_FOR_ANALYSIS],
  ['blind', 'the exit code ignores failures', 'finished = true\nprocess.exit(failed === 0 ? 0 : 1)', 'finished = true\nprocess.exit(0)', BROKEN_FOR_ANALYSIS],
  ['blind', 'an early exit is not noticed', "process.on('exit', (code) => {", "process.on('never', (code) => {", BROKEN_EXITS_AT_IMPORT],
  ['red', 'MIN_SCENARIOS is one above the real count', 'const MIN_SCENARIOS = 10', 'const MIN_SCENARIOS = 11'],
  ['red', 'MIN_ASSERTIONS is one above the real count', 'const MIN_ASSERTIONS = 57', 'const MIN_ASSERTIONS = 58'],
  ['red', 'the comment stripper is removed (the real source has forbidden words in its comments)', ".replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/(^|[^:])\\/\\/.*$/gm, '$1')", ''],
]

const applyEdits = (text, edits, label) => {
  let out = text
  for (const [anchor, replacement] of edits) {
    const n = out.split(anchor).length - 1
    if (n !== 1) return { error: `NOT APPLIED: anchor matched ${n} times, not 1 (${label}): ${JSON.stringify(anchor.slice(0, 70))}` }
    if (anchor === replacement) return { error: `NOT APPLIED: replacement equals anchor (${label})` }
    out = out.replace(anchor, () => replacement)
  }
  return { text: out }
}
const exec = (checkFile, srcFile) => new Promise((resolve) => {
  const c = spawn(process.execPath, [checkFile, '--source', srcFile])
  let stdout = ''
  c.stdout.on('data', (d) => { stdout += d })
  c.stderr.on('data', () => {})
  const timer = setTimeout(() => c.kill('SIGKILL'), 120000)
  c.on('close', (status, signal) => { clearTimeout(timer); resolve({ status, signal, stdout }) })
})
const red = (r) => r.status === 1 && /^FAIL/m.test(r.stdout)
const parses = (file) => spawnSync(process.execPath, ['--check', file]).status === 0
async function pool (items, n, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; results[i] = await fn(items[i], i) } }))
  return results
}

const srcText = fs.readFileSync(SRC, 'utf8')
let caught = 0
let notCaught = 0
let notApplied = 0

const b1 = await exec(CHECK, SRC)
console.log(`baseline: the check on the real grader exits ${b1.status}`)
if (b1.status !== 0) { console.log('FAIL  the check is already red; every mutation would be "caught" for the wrong reason'); process.exit(1) }

console.log(`\nHALF 1: the grader, broken (${SOURCE_MUTATIONS.length} mutations)`)
const lines = []
await pool(SOURCE_MUTATIONS, 4, async ([name, a, b], i) => {
  const r = applyEdits(srcText, Array.isArray(a) ? a : [[a, b]], name)
  if (r.error) { notApplied++; lines[i] = `  ${r.error}  [${name}]`; return }
  const f = path.join(tmp, `core-${i}.mjs`)
  fs.writeFileSync(f, r.text)
  if (!parses(f)) { notApplied++; lines[i] = `  NOT APPLIED: the mutant does not parse  [${name}]`; return }
  const x = await exec(CHECK, f)
  if (red(x)) { caught++; lines[i] = `  caught       ${name}` } else { notCaught++; lines[i] = `  NOT CAUGHT   ${name}  (exit ${x.status})` }
})
console.log(lines.join('\n'))

console.log('\nHALF 2: the check, broken')
const brokenFiles = new Map()
const brokenFile = (spec) => {
  const k = spec[0] + '\u0000' + spec[1]
  if (!brokenFiles.has(k)) {
    const r = applyEdits(srcText, [spec], 'broken grader')
    if (r.error) { console.log(`  ${r.error}`); process.exit(1) }
    const f = path.join(tmp, `broken-${brokenFiles.size}.mjs`)
    fs.writeFileSync(f, r.text)
    brokenFiles.set(k, f)
  }
  return brokenFiles.get(k)
}
const checkText = fs.readFileSync(CHECK, 'utf8')
const half2 = []
const purity = FORBIDDEN.map(([token, snippet, pattern]) => ['blind', `the purity list loses ${token}`, pattern, '', ['const isObj = (v) =>', `${snippet}\nconst isObj = (v) =>`]])
await pool([...CHECK_MUTATIONS, ...purity], 3, async ([kind, name, a, b, broken], i) => {
  const r = applyEdits(checkText, [[a, b]], name)
  if (r.error) { notApplied++; half2[i] = `  ${r.error}  [${name}]`; return }
  const f = path.join(tmp, `check-${i}.mjs`)
  fs.writeFileSync(f, r.text)
  if (!parses(f)) { notApplied++; half2[i] = `  NOT APPLIED: the mutant does not parse  [${name}]`; return }
  let ok
  let shown
  if (kind === 'blind') {
    const real = await exec(CHECK, brokenFile(broken))
    const mutated = await exec(f, brokenFile(broken))
    ok = red(real) && mutated.status === 0 && !red(mutated)
    shown = `real check exit ${real.status}, mutated check exit ${mutated.status} on the broken grader`
  } else {
    const mutated = await exec(f, SRC)
    ok = red(mutated)
    shown = `mutated check exit ${mutated.status} on the real grader`
  }
  if (ok) { caught++; half2[i] = `  caught       ${name}  (${kind}: ${shown})` } else { notCaught++; half2[i] = `  NOT CAUGHT   ${name}  (${kind}: ${shown})` }
})
console.log(half2.join('\n'))

const moved = REAL.filter((f) => sha(f) !== before[f])
fs.rmSync(tmp, { recursive: true, force: true })
const total = SOURCE_MUTATIONS.length + CHECK_MUTATIONS.length + purity.length
console.log(`\nmutations ${total}: caught ${caught}, NOT CAUGHT ${notCaught}, NOT APPLIED ${notApplied}; real files moved: ${moved.length}`)
if (moved.length) console.log(`FAIL  the real file(s) changed: ${moved.join(', ')}`)
process.exit(notCaught === 0 && notApplied === 0 && moved.length === 0 ? 0 : 1)
