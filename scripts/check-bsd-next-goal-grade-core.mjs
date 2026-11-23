#!/usr/bin/env node
// The grader's counts cannot be wrong without this going red (Rule 90). It runs scripts/bsd-next-goal-grade-core.mjs (or, with
// --source FILE, a mutant of it) on SYNTHETIC calls and captures whose right answers are derived by hand or by construction, never
// by running the grader. scripts/mutate-bsd-next-goal-grade-core.mjs breaks the grader on purpose and requires this to go red.
//
// Usage: node scripts/check-bsd-next-goal-grade-core.mjs [--source FILE] | --self-test
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// not exported: this file runs its scenarios when it is loaded, and this repository's import-purity check imports every file that
// exports (a check that exits on import must export nothing)
// pinned to the measured counts below: an edit that deletes a scenario or an assertion cannot leave this green
const MIN_SCENARIOS = 10
const MIN_ASSERTIONS = 57

const argv = process.argv.slice(2)
const srcIdx = argv.indexOf('--source')
const SOURCE = srcIdx >= 0 ? argv[srcIdx + 1] : 'scripts/bsd-next-goal-grade-core.mjs'

let scenarios = 0
let assertions = 0
let failed = 0
let finished = false
process.on('exit', (code) => {
  if (!finished) { console.log(`FAIL  the check did not run to its end (exit ${code}, ${scenarios} scenarios, ${assertions} assertions)`); process.exitCode = 1 }
})
const stable = (v) => JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val)
  ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : val))
const eq = (label, got, want) => {
  assertions++
  if (stable(got) !== stable(want)) { failed++; console.log(`FAIL  ${label}\n        got  ${stable(got)}\n        want ${stable(want)}`) }
}
const scenario = async (name, fn) => { scenarios++; try { await fn() } catch (e) { failed++; console.log(`FAIL  ${name} threw: ${e.message}`) } }

const sum = (o) => Object.values(o).reduce((x, y) => x + y, 0)
const SOURCE_TEXT = fs.readFileSync(SOURCE, 'utf8')

async function run () {
  const core = await import(pathToFileURL(path.resolve(SOURCE)).href)
  const { gradeCalls, gradeCall, readGoals, coverageLine, REASONS, RULE_VERSION } = core
  const { timeline, capture, callOf, item, T1 } = await import(pathToFileURL(path.resolve('scripts/fixtures/bsd-next-goal-grade-synthetic.mjs')).href)

  await scenario('1 one match, every disposition once', () => {
    const cap = capture(T1())
    // the goals: home 20 (1-0), away 55 (1-1), home 80 (2-1)
    const calls = [
      callOf({ side: 'home', outcome: 'hit', rm: 20 }), // c1 resolves on the home goal: hit, agree, distance 0
      callOf({ side: 'away', outcome: 'miss', rm: 20 }), // c2 FIELD home, the call was away: miss, agree, distance 0
      callOf({ side: 'home', outcome: 'miss', rm: 21 }), // c3 FIELD says hit, the ledger says miss: disagree, distance 1
      callOf({ side: 'home', outcome: 'hit', a: 1, b: 0, rm: 57 }), // c4 resolves on the away goal: FIELD miss, ledger hit: disagree, distance 2
      callOf({ side: 'away', outcome: 'hit', a: 1, b: 0, rm: 56 }), // c5 away called, away scored: hit, agree, distance 1
      callOf({ side: 'home', outcome: 'hit', a: 1, b: 1, rm: 83 }), // c6 home goal at 80: hit, agree, distance 3
      callOf({ side: 'home', outcome: 'hit', a: 2, b: 1 }), // c7 no fourth goal
      callOf({ side: 'home', outcome: 'hit', a: 0, b: 1 }), // c8 k=1 but the capture was 1-0 before the second goal
      callOf({ side: 'draw', outcome: 'hit' }), // c9 no side
      callOf({ side: 'home', outcome: 'hit', score: null }), // c10 no score_at_call
      callOf({ side: 'home', outcome: 'open' }), // c11 not hit or miss
      callOf({ side: 'home', outcome: 'hit', score: { home: '1', away: 0 } }), // c12 a score that is text
      callOf({ side: 'home', outcome: 'miss', rm: 21 }), // c13 a second 'ledger miss, FIELD hit', so the matrix is not symmetric
    ]
    const g = gradeCalls(calls.map((c) => item(c, cap)))
    eq('population, graded, agree, disagree', [g.population, g.graded, g.agree, g.disagree], [13, 7, 4, 3])
    eq('not applicable: the total and each reason once, score twice', [g.notApplicable.total, g.notApplicable.byReason], [6, {
      [REASONS.none]: 1, [REASONS.join]: 1, [REASONS.side]: 1, [REASONS.score]: 2, [REASONS.outcome]: 1,
    }])
    eq('the confusion matrix', g.confusion, { 'ledger hit, FIELD hit': 3, 'ledger miss, FIELD miss': 1, 'ledger miss, FIELD hit': 2, 'ledger hit, FIELD miss': 1 })
    eq('by ledger outcome', g.byLedgerOutcome, { hit: { graded: 4, agree: 3, disagree: 1 }, miss: { graded: 3, agree: 1, disagree: 2 } })
    eq('the resolving goals are all regular', g.resolvingGoalType, { regular: { graded: 7, agree: 4, disagree: 3 } })
    eq('is_home agrees with the score rise on all seven', g.isHomeVersusScoreRise, { agrees: 7, disagrees: 0, absent: 0 })
    eq('the distance from resolved_minute to the resolving goal', g.resolvedMinuteDistance, { 0: 2, 1: 3, 2: 1, '3+': 1 })
    eq('the premise counts: three rows without a side or score, one join mismatch, one capture', [g.premises.callsWithoutSideOrScore, g.premises.callsWhoseScoreAtCallDisagreesWithTheCapture, g.premises.callsOnCapturesWithAGoalRowLackingAScore, g.premises.callsOnCapturesWhoseTotalsAreNotOneToN, g.premises.distinctCaptures], [3, 1, 0, 0, 1])
    eq('the rule version is recorded', g.ruleVersion, RULE_VERSION)
    eq('every call is in exactly one place', [g.graded + g.notApplicable.total, g.agree + g.disagree, sum(g.notApplicable.byReason), sum(g.confusion), sum(g.resolvedMinuteDistance)], [13, 7, 6, 7, 7])
  })

  await scenario('2 order comes from the running total, not from position or minute', () => {
    const asc = timeline([['home', 30], ['away', 30]]) // two goals in one minute: 1-0 then 1-1
    const call0 = callOf({ side: 'home', outcome: 'hit', rm: 30 })
    const call1 = callOf({ side: 'away', outcome: 'hit', a: 1, b: 0, rm: 30 })
    for (const [name, cap] of [['newest first', capture(asc)], ['oldest first', capture(asc, { ascending: true })]]) {
      const g = gradeCalls([item(call0, cap, 'a'), item(call1, cap, 'b')])
      eq(`${name}: the first goal is home's, the second away's`, [g.graded, g.agree, g.confusion], [2, 2, { 'ledger hit, FIELD hit': 2 }])
    }
    const corrected = timeline([['home', 40], ['away', 38]]) // the second goal carries an earlier minute: a correction
    const g = gradeCalls([item(callOf({ side: 'away', outcome: 'hit', a: 1, b: 0, rm: 38 }), capture(corrected))])
    eq('a later total with an earlier minute is still the second goal', [g.graded, g.agree], [1, 1])
    const shuffled = capture(timeline([['home', 10], ['away', 20], ['home', 30]]).sort((x, y) => (x.minute === 20 ? -1 : y.minute === 20 ? 1 : 0)))
    const g2 = gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 10 }), shuffled)])
    eq('goal rows in any position order are ordered by total', [g2.graded, g2.agree], [1, 1])
  })

  await scenario('3 a capture that is not trusted grades nothing, and says why', () => {
    const c = (cap) => gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 10 }), cap)])
    const reason = (g) => g.notApplicable.byReason
    const lacking = { event_id: 0, incidents: [timeline([['home', 10]])[0], { type: 'goal', minute: 20, is_home: false }] }
    eq('a goal row with no running score: the capture is not trusted although the first goal would resolve', [c(lacking).graded, reason(c(lacking)), c(lacking).premises.distinctCapturesWithAGoalRowLackingAScore], [0, { [REASONS.noScore]: 1 }, 1])
    eq('half a score is no score', reason(c({ incidents: [{ type: 'goal', minute: 5, home_score: 1 }] })), { [REASONS.noScore]: 1 })
    eq('a gap in the totals (1, 3)', reason(c({ incidents: [timeline([['home', 10]])[0], { type: 'goal', minute: 50, home_score: 2, away_score: 1 }] })), { [REASONS.sequence]: 1 })
    eq('a duplicated total (1, 1)', reason(c({ incidents: [{ type: 'goal', minute: 10, home_score: 1, away_score: 0 }, { type: 'goal', minute: 12, home_score: 0, away_score: 1 }] })), { [REASONS.sequence]: 1 })
    eq('totals that start at 2', reason(c({ incidents: [{ type: 'goal', minute: 10, home_score: 1, away_score: 1 }] })), { [REASONS.sequence]: 1 })
    eq('a capture whose totals are not 1 to n is counted once as a capture and once per call', [c({ incidents: [{ type: 'goal', minute: 10, home_score: 1, away_score: 1 }] }).premises.distinctCapturesWhoseTotalsAreNotOneToN, c({ incidents: [{ type: 'goal', minute: 10, home_score: 1, away_score: 1 }] }).premises.callsOnCapturesWhoseTotalsAreNotOneToN], [1, 1])
    eq('no incidents array, not an object, null, an array', [{}, 'x', null, { incidents: 5 }, []].map((x) => Object.keys(reason(c(x)))[0]), Array(5).fill(REASONS.unreadable))
    eq('an empty incidents array is a capture with no goal: the call has nothing to resolve on', reason(c({ incidents: [] })), { [REASONS.none]: 1 })
    eq('a goal whose running score fell on one side and jumped on the other: total 2, but not a rise of one', [
      reason(gradeCalls([item(callOf({ side: 'home', outcome: 'hit', a: 1, b: 0, rm: 20 }), { incidents: [{ type: 'goal', minute: 10, home_score: 1, away_score: 0 }, { type: 'goal', minute: 20, home_score: 0, away_score: 2 }] })])),
    ], [{ [REASONS.rise]: 1 }])
    eq('a first goal from 0-0 that is not (1,0) or (0,1)', reason(c({ incidents: [{ type: 'goal', minute: 10, home_score: 2, away_score: -1 }] })), { [REASONS.rise]: 1 })
    eq('rows that are not objects are skipped, not fatal', [gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 10 }), { incidents: [null, 5, 'x', timeline([['home', 10]])[0]] })]).graded], [1])
    eq('non-goal rows with scores are not goals', gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 10 }), { incidents: [{ type: 'period', text: 'FT', home_score: 3, away_score: 3 }, timeline([['home', 10]])[0]] })]).graded, 1)
  })

  await scenario('4 the side comes from the score, not from is_home', () => {
    const own = timeline([['home', 25, { is_home: false, goal_type: 'own_goal' }]]) // home's score rose; the row says is_home false
    const absent = timeline([['away', 33, { is_home: undefined, goal_type: undefined }]])
    const g = gradeCalls([
      item(callOf({ side: 'home', outcome: 'hit', rm: 25 }), capture(own), 'o'),
      item(callOf({ side: 'away', outcome: 'hit', rm: 33 }), capture(absent), 'p'),
    ])
    eq('both agree on the score rise', [g.graded, g.agree], [2, 2])
    eq('is_home disagrees once and is absent once', g.isHomeVersusScoreRise, { agrees: 0, disagrees: 1, absent: 1 })
    eq('goal types are tallied, a missing one as (none)', g.resolvingGoalType, { own_goal: { graded: 1, agree: 1, disagree: 0 }, '(none)': { graded: 1, agree: 1, disagree: 0 } })
    eq('is_home that is not a boolean is absent', gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 5 }), capture(timeline([['home', 5, { is_home: 'true' }]])))]).isHomeVersusScoreRise, { agrees: 0, disagrees: 0, absent: 1 })
    eq('goal_type that is not text is (none)', gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 5 }), capture(timeline([['home', 5, { goal_type: 7 }]])))]).resolvingGoalType, { '(none)': { graded: 1, agree: 1, disagree: 0 } })
  })

  await scenario('5 the distance from resolved_minute is bucketed', () => {
    const cap = capture(timeline([['home', 50]]))
    const d = (rm) => gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm }), cap)]).resolvedMinuteDistance
    eq('0, 1 (either side), 2, 3 and far', [d(50), d(51), d(49), d(48), d(53), d(60)], [{ 0: 1 }, { 1: 1 }, { 1: 1 }, { 2: 1 }, { '3+': 1 }, { '3+': 1 }])
    eq('no resolved_minute, a text one, and a goal with no minute or a text one', [d(undefined), d('50'), gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 50 }), capture(timeline([['home', null]])))]).resolvedMinuteDistance, gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 50 }), capture(timeline([['home', '50']])))]).resolvedMinuteDistance], [{ 'no minute': 1 }, { 'no minute': 1 }, { 'no minute': 1 }, { 'no minute': 1 }])
  })

  await scenario('6 tags are tallied by label, for graded and not applicable calls', () => {
    const cap = capture(T1())
    const g = gradeCalls([
      item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), cap, 'a', { slug: 'epl', state: 'full-time' }), // agree
      item(callOf({ side: 'home', outcome: 'miss', rm: 20 }), cap, 'a', { slug: 'epl', state: 'full-time' }), // disagree
      item(callOf({ side: 'home', outcome: 'hit', a: 2, b: 1 }), cap, 'a', { slug: 'mls', state: 'in-play' }), // not applicable
      item(callOf({ side: 'away', outcome: 'miss', rm: 20 }), cap, 'a', { slug: 'mls', state: 'in-play' }), // agree
    ])
    eq('by slug', g.byTag.slug, { epl: { graded: 2, agree: 1, disagree: 1, notApplicable: 0 }, mls: { graded: 1, agree: 1, disagree: 0, notApplicable: 1 } })
    eq('by state', g.byTag.state, { 'full-time': { graded: 2, agree: 1, disagree: 1, notApplicable: 0 }, 'in-play': { graded: 1, agree: 1, disagree: 0, notApplicable: 1 } })
    eq('no tags, no tag block', gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), cap)]).byTag, {})
    eq('tags that are not an object are ignored', gradeCalls([{ call: callOf({ side: 'home', outcome: 'hit', rm: 20 }), capture: cap, key: 'z', tags: 'x' }]).byTag, {})
  })

  await scenario('7 captures are counted once however many calls sit on them', () => {
    const ok = capture(T1())
    const lacking = { incidents: [{ type: 'goal', minute: 1 }] }
    const gap = { incidents: [{ type: 'goal', minute: 1, home_score: 2, away_score: 0 }] }
    const c = (cap, key) => item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), cap, key)
    const g = gradeCalls([c(ok, 'e1'), c(ok, 'e1'), c(lacking, 'e2'), c(lacking, 'e2'), c(gap, 'e3')])
    eq('three captures for five calls', g.premises.distinctCaptures, 3)
    eq('one capture lacking a score, two calls on it; one capture with a gap, one call', [g.premises.distinctCapturesWithAGoalRowLackingAScore, g.premises.callsOnCapturesWithAGoalRowLackingAScore, g.premises.distinctCapturesWhoseTotalsAreNotOneToN, g.premises.callsOnCapturesWhoseTotalsAreNotOneToN], [1, 2, 1, 1])
    eq('an unreadable capture is neither of the two', gradeCalls([c({ incidents: 5 }, 'u')]).premises, { callsWithoutSideOrScore: 0, callsOnCapturesWithAGoalRowLackingAScore: 0, callsOnCapturesWhoseTotalsAreNotOneToN: 0, callsWhoseScoreAtCallDisagreesWithTheCapture: 0, distinctCaptures: 1, distinctCapturesWithAGoalRowLackingAScore: 0, distinctCapturesWhoseTotalsAreNotOneToN: 0 })
  })

  await scenario('8 the grader against a match it did not write: 600 generated calls with known answers', () => {
    // mulberry32, so the world is the same on every run
    let s = 20261123
    const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    const items = []
    const expect = { agree: 0, disagree: 0, none: 0, join: 0, side: 0 }
    for (let m = 0; m < 120; m++) {
      const n = Math.floor(rnd() * 6) // 0..5 goals
      const sides = Array.from({ length: n }, () => (rnd() < 0.5 ? 'home' : 'away'))
      const cap = capture(timeline(sides.map((sd, i) => [sd, 10 + i * 13])), { ascending: rnd() < 0.5 })
      for (let j = 0; j < 5; j++) {
        const k = Math.floor(rnd() * (n + 1)) // 0..n
        let a = sides.slice(0, k).filter((x) => x === 'home').length
        let b = k - a
        const side = rnd() < 0.5 ? 'home' : 'away'
        const outcome = rnd() < 0.5 ? 'hit' : 'miss'
        let wrongSplit = false
        if (rnd() < 0.1 && k > 0) { // same total, the wrong split
          if (a > 0) { a -= 1; b += 1 } else { b -= 1; a += 1 }
          wrongSplit = true
        }
        // the rule looks for the resolving goal first: with none to find, the split is never examined
        if (k === n) expect.none++
        else if (wrongSplit) expect.join++
        else {
          const truth = sides[k] === side ? 'hit' : 'miss'
          if (truth === outcome) expect.agree++
          else expect.disagree++
        }
        items.push(item(callOf({ side, outcome, a, b, rm: 10 + k * 13 }), cap, `m${m}`))
      }
    }
    const g = gradeCalls(items)
    eq('600 calls placed', g.population, 600)
    eq('agree, disagree and the two reasons equal the answers the generator knew', [g.agree, g.disagree, g.notApplicable.byReason[REASONS.none] === undefined ? 0 : g.notApplicable.byReason[REASONS.none], g.notApplicable.byReason[REASONS.join] === undefined ? 0 : g.notApplicable.byReason[REASONS.join]], [expect.agree, expect.disagree, expect.none, expect.join])
    eq('every graded call resolves on the goal it was generated to, so the distance is always 0', g.resolvedMinuteDistance, { 0: expect.agree + expect.disagree })
    eq('nothing is lost', [g.graded + g.notApplicable.total, sum(g.byLedgerOutcome.hit ? { x: g.byLedgerOutcome.hit.graded } : {}) + (g.byLedgerOutcome.miss ? g.byLedgerOutcome.miss.graded : 0)], [600, g.graded])
  })

  await scenario('9 gradeCall and readGoals directly; an empty or odd input', () => {
    eq('gradeCalls of nothing', [gradeCalls([]).population, gradeCalls(undefined).population, gradeCalls(null).graded], [0, 0, 0])
    eq('a valid call with no capture, or a null one, is unreadable and does not throw', [gradeCall({ side: 'home', outcome: 'hit', score_at_call: { home: 0, away: 0 } }, undefined).reason, gradeCall({ side: 'home', outcome: 'hit', score_at_call: { home: 0, away: 0 } }, null).reason], [REASONS.unreadable, REASONS.unreadable])
    eq('gradeCall on no call and no capture', [gradeCall(undefined, undefined).reason, gradeCall(null, null).reason], [REASONS.side, REASONS.side])
    eq('a whole-number score is required: 1.5, -1 and NaN are not scores', [1.5, -1, NaN, Infinity].map((x) => gradeCall({ side: 'home', outcome: 'hit', score_at_call: { home: x, away: 0 } }, readGoals(capture(T1()))).reason), Array(4).fill(REASONS.score))
    eq('a score object with only one side is no score', gradeCall({ side: 'home', outcome: 'hit', score_at_call: { home: 1 } }, readGoals(capture(T1()))).reason, REASONS.score)
    const rg = readGoals(capture(T1()))
    eq('readGoals orders by total and says it is sequential', [rg.ok, rg.sequential, rg.withoutScore, rg.goals.map((x) => x.total), rg.goals.map((x) => x.minute)], [true, true, 0, [1, 2, 3], [20, 55, 80]])
    eq('readGoals on a body with no incidents', readGoals({}), { ok: false })
    eq('readGoals with a goal row lacking a score is not sequential, and keeps the count', readGoals({ incidents: [{ type: 'goal', minute: 1, home_score: 1 }] }), { ok: true, goals: [], withoutScore: 1, sequential: false })
    eq('a graded call carries its verdict, type and distance', gradeCall({ side: 'away', outcome: 'miss', score_at_call: { home: 0, away: 0 }, resolved_minute: 22 }, rg), { graded: true, verdict: 'miss', agree: true, goalType: 'regular', isHomeAgreesWithRise: true, distance: 2 })
  })

  await scenario('10 the coverage line, and the source cannot reach out', () => {
    const g = gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), capture(T1()))])
    eq('the line carries every denominator', coverageLine(g, { gradeable: 370, uniqueCalls: 1746 }), `graded 1 of 1 gradeable calls (census: 370 gradeable of 1746) | agree 1, disagree 0, not applicable 0 | rule ${RULE_VERSION}`)
    eq('with no census block the line says n/a, not a number', coverageLine(g, undefined), `graded 1 of 1 gradeable calls (census: n/a gradeable of n/a) | agree 1, disagree 0, not applicable 0 | rule ${RULE_VERSION}`)
    // purity, asserted of the source text with comments removed: this file runs in the same process as the BSD token
    const code = SOURCE_TEXT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const forbidden = [/\bimport\b/, /\brequire\b/, /\bfetch\b/, /\bprocess\b/, /\bglobalThis\b/, /\beval\b/, /\bFunction\b/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bDeno\b/, /\bBun\b/, /\bBuffer\b/, /\bfs\b/, /\bchild_process\b/, /\bDate\b/, /\bMath\.random\b/, /\bsetTimeout\b/]
    eq('no import, no network, no process, no clock, no randomness in the source', forbidden.filter((re) => re.test(code)).map(String), [])
    eq('the source exports the rule it claims', [typeof RULE_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/.test(RULE_VERSION)], ['string', true])
  })
}

// ---------------------------------------------------------------- self-test of the check itself
// A check that has only ever passed proves nothing (Rule 90): run ITSELF against a copy of the real grader with one boundary
// broken and require a red exit. The anchor must match exactly once.
function selfTest () {
  const ANCHOR = 'const resolving = parsed.goals[k]'
  const real = fs.readFileSync(SOURCE, 'utf8')
  const n = real.split(ANCHOR).length - 1
  if (n !== 1) { console.log(`FAIL  self-test anchor matched ${n} times, not 1`); return 1 }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-self-'))
  const broken = path.join(dir, 'core-broken.mjs')
  fs.writeFileSync(broken, real.replace(ANCHOR, 'const resolving = parsed.goals[k + 1]'))
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--source', broken], { encoding: 'utf8' })
  const red = r.status === 1 && /^FAIL/m.test(r.stdout)
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(`${red ? 'ok  ' : 'FAIL'}  self-test: the check goes red (exit ${r.status}) on a grader that takes the wrong goal as the resolving one`)
  return red ? 0 : 1
}

if (argv.includes('--self-test')) {
  finished = true
  const code = selfTest()
  console.log(code === 0 ? 'OK: check self-test' : 'FAIL: check self-test')
  process.exit(code)
}

await run()
if (scenarios < MIN_SCENARIOS) { console.log(`FAIL  only ${scenarios} scenarios ran; MIN_SCENARIOS is ${MIN_SCENARIOS}`); failed++ }
if (assertions < MIN_ASSERTIONS) { console.log(`FAIL  only ${assertions} assertions ran; MIN_ASSERTIONS is ${MIN_ASSERTIONS}`); failed++ }
console.log(`\nscenarios ${scenarios}, assertions ${assertions}, failed ${failed}   (source: ${SOURCE})`)
finished = true
process.exit(failed === 0 ? 0 : 1)
