#!/usr/bin/env node
// The grader's counts cannot be wrong without this going red (Rule 90). It runs scripts/bsd-next-goal-grade-core.mjs (or, with
// --source FILE, a mutant of it) on SYNTHETIC calls and captures whose right answers are derived by hand or by construction, never
// by running the grader, and on two REAL committed captures (data/bsd-flow-*-incidents.json, hash-pinned to data/PROVENANCE.md so
// that an edit of the file cannot change a hand-derived answer). scripts/mutate-bsd-next-goal-grade-core.mjs breaks the grader on
// purpose and requires this to go red.
//
// Usage: node scripts/check-bsd-next-goal-grade-core.mjs [--source FILE] | --self-test
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// not exported: this file runs its scenarios when it is loaded, and this repository's import-purity check imports every file that
// exports (a check that exits on import must export nothing)
// pinned to the measured counts below: an edit that deletes a scenario or an assertion cannot leave this green
const MIN_SCENARIOS = 22
const MIN_ASSERTIONS = 200

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
const stable = (v) => JSON.stringify(v, (k, val) => {
  if (val === undefined) return '<<undefined>>'
  if (typeof val === 'number' && !Number.isFinite(val)) return `<<${String(val)}>>`
  return val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : val
})
const eq = (label, got, want) => {
  assertions++
  if (stable(got) !== stable(want)) { failed++; console.log(`FAIL  ${label}\n        got  ${stable(got)}\n        want ${stable(want)}`) }
}
const scenario = async (name, fn) => { scenarios++; try { await fn() } catch (e) { failed++; console.log(`FAIL  ${name} threw: ${e.message}`) } }

const sum = (o) => Object.values(o).reduce((x, y) => x + y, 0)
const sumGraded = (o) => Object.values(o).reduce((x, y) => x + y.graded, 0)
const SOURCE_TEXT = fs.readFileSync(SOURCE, 'utf8')

async function run () {
  const core = await import(pathToFileURL(path.resolve(SOURCE)).href)
  const { gradeCalls, gradeCall, readGoals, finalAgreement, liveAgreement, coverageLine, REASONS, RULE_VERSION } = core
  const { timeline, capture, callOf, item, T1 } = await import(pathToFileURL(path.resolve('scripts/fixtures/bsd-next-goal-grade-synthetic.mjs')).href)
  const reasonOf = (call, cap) => gradeCall(call, readGoals(cap)).reason
  const home = (o = {}) => callOf({ side: 'home', outcome: 'hit', rm: 10, ...o })

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
    eq('agree and disagree BY the distance from resolved_minute to the resolving goal', g.resolvedMinuteDistance, {
      0: { graded: 2, agree: 2, disagree: 0 }, 1: { graded: 3, agree: 1, disagree: 2 }, 2: { graded: 1, agree: 0, disagree: 1 }, '3+': { graded: 1, agree: 1, disagree: 0 },
    })
    eq('seven graded calls sit on three distinct goals, two of which have a disagreeing call', g.distinctGoals, { graded: 3, withADisagreeingCall: 2 })
    eq('the premise counts: three rows without a side or score, one join mismatch, one capture, every call has a minute', [g.premises.callsWithoutSideOrScore, g.premises.callsWhoseScoreAtCallDisagreesWithTheCapture, g.premises.callsOnCapturesWithAGoalRowLackingAScore, g.premises.callsOnCapturesWhoseTotalsAreNotOneToN, g.premises.distinctCaptures, g.premises.callsWithoutACallMinute], [3, 1, 0, 0, 1, 0])
    eq('the capture has no full-time row and no live row, for each of the thirteen calls and for the one capture', [g.premises.fullTimeScoreVersusLastGoal, g.premises.liveRowScoreVersusLastGoal, g.stoppageResolvingGoals], [{ calls: { 'no full-time score': 13 }, distinctCaptures: { 'no full-time score': 1 } }, { calls: { 'no live row score': 13 }, distinctCaptures: { 'no live row score': 1 } }, { graded: 0, agree: 0, disagree: 0 }])
    eq('no tags, no tag blocks', [g.byTag, g.notApplicable.byTagAndReason], [{}, {}])
    eq('the rule version is recorded', g.ruleVersion, RULE_VERSION)
    eq('every call is in exactly one place', [g.graded + g.notApplicable.total, g.agree + g.disagree, sum(g.notApplicable.byReason), sum(g.confusion), sumGraded(g.resolvedMinuteDistance)], [13, 7, 6, 7, 7])
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
    const own = timeline([['home', 25, { is_home: false, goal_type: 'ownGoal' }]]) // home's score rose; the row says is_home false
    const absent = timeline([['away', 33, { is_home: undefined, goal_type: undefined }]])
    const g = gradeCalls([
      item(callOf({ side: 'home', outcome: 'hit', rm: 25 }), capture(own), 'o'),
      item(callOf({ side: 'away', outcome: 'hit', rm: 33 }), capture(absent), 'p'),
    ])
    eq('both agree on the score rise', [g.graded, g.agree], [2, 2])
    eq('is_home disagrees once and is absent once', g.isHomeVersusScoreRise, { agrees: 0, disagrees: 1, absent: 1 })
    eq('goal types are tallied, a missing one as (none)', g.resolvingGoalType, { ownGoal: { graded: 1, agree: 1, disagree: 0 }, '(none)': { graded: 1, agree: 1, disagree: 0 } })
    eq('is_home that is not a boolean is absent', gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 5 }), capture(timeline([['home', 5, { is_home: 'true' }]])))]).isHomeVersusScoreRise, { agrees: 0, disagrees: 0, absent: 1 })
    eq('goal_type that is not text is (none)', gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 5 }), capture(timeline([['home', 5, { goal_type: 7 }]])))]).resolvingGoalType, { '(none)': { graded: 1, agree: 1, disagree: 0 } })
  })

  await scenario('5 the distance from resolved_minute is bucketed, and a stoppage-time goal is told apart', () => {
    const cap = capture(timeline([['home', 50]]))
    const bucketOf = (rm, c = cap) => Object.keys(gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm }), c)]).resolvedMinuteDistance)
    eq('0, 1 (either side), 2, 3 and far', [50, 51, 49, 48, 53, 60].map((rm) => bucketOf(rm)[0]), ['0', '1', '1', '2', '3+', '3+'])
    eq('no resolved_minute, a text one, and a goal with no minute or a text one', [bucketOf(undefined)[0], bucketOf('50')[0], bucketOf(50, capture(timeline([['home', null]])))[0], bucketOf(50, capture(timeline([['home', '50']])))[0]], ['no minute', 'no minute', 'no minute', 'no minute'])
    const stoppage = capture(timeline([['home', 90, { added_time: 3 }]]))
    eq('a goal at the nominal 90 with 3 added minutes, called at 94: a far distance that is not read as a wrong goal', bucketOf(94, stoppage), ['3+ stoppage'])
    eq('...but a near distance is a near distance', bucketOf(91, stoppage), ['1'])
    eq('added_time that is text is not added time', bucketOf(94, capture(timeline([['home', 90, { added_time: '3' }]]))), ['3+'])
    eq('added_time 0 or absent is not stoppage', [bucketOf(94, capture(timeline([['home', 90, { added_time: 0 }]])))[0], bucketOf(94, capture(timeline([['home', 90, { added_time: null }]])))[0]], ['3+', '3+'])
  })

  await scenario('6 tags are tallied by label, for graded and not applicable calls, and a not-applicable reason by label', () => {
    const cap = capture(T1())
    const g = gradeCalls([
      item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), cap, 'a', { slug: 'epl', state: 'full-time' }), // agree
      item(callOf({ side: 'home', outcome: 'miss', rm: 20 }), cap, 'a', { slug: 'epl', state: 'full-time' }), // disagree
      item(callOf({ side: 'home', outcome: 'hit', a: 2, b: 1 }), cap, 'a', { slug: 'mls', state: 'in-play' }), // not applicable: no fourth goal
      item(callOf({ side: 'away', outcome: 'miss', rm: 20 }), cap, 'a', { slug: 'mls', state: 'in-play' }), // agree
      item(callOf({ side: 'draw', outcome: 'miss' }), cap, 'a', { slug: 'mls', state: 'full-time' }), // not applicable: no side
    ])
    eq('by slug', g.byTag.slug, { epl: { graded: 2, agree: 1, disagree: 1, notApplicable: 0 }, mls: { graded: 1, agree: 1, disagree: 0, notApplicable: 2 } })
    eq('by state', g.byTag.state, { 'full-time': { graded: 2, agree: 1, disagree: 1, notApplicable: 1 }, 'in-play': { graded: 1, agree: 1, disagree: 0, notApplicable: 1 } })
    eq('each not-applicable reason by label', g.notApplicable.byTagAndReason, {
      slug: { mls: { [REASONS.none]: 1, [REASONS.side]: 1 } },
      state: { 'in-play': { [REASONS.none]: 1 }, 'full-time': { [REASONS.side]: 1 } },
    })
    eq('no tags, no tag block', gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), cap)]).byTag, {})
    eq('tags that are not an object are ignored, as are tags that are an array', [gradeCalls([{ call: callOf({ side: 'home', outcome: 'hit', rm: 20 }), capture: cap, key: 'z', tags: 'x' }]).byTag, gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), cap, 'z', ['a'])]).byTag], [{}, {}])
  })

  await scenario('7 captures are counted once however many calls sit on them, and an item with no key is its own capture', () => {
    const ok2 = capture(T1())
    const lacking = { incidents: [{ type: 'goal', minute: 1 }] }
    const gap = { incidents: [{ type: 'goal', minute: 1, home_score: 2, away_score: 0 }] }
    const c = (cap, key) => item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), cap, key)
    const g = gradeCalls([c(ok2, 'e1'), c(ok2, 'e1'), c(lacking, 'e2'), c(lacking, 'e2'), c(gap, 'e3')])
    eq('three captures for five calls', g.premises.distinctCaptures, 3)
    eq('one capture lacking a score, two calls on it; one capture with a gap, one call', [g.premises.distinctCapturesWithAGoalRowLackingAScore, g.premises.callsOnCapturesWithAGoalRowLackingAScore, g.premises.distinctCapturesWhoseTotalsAreNotOneToN, g.premises.callsOnCapturesWhoseTotalsAreNotOneToN], [1, 2, 1, 1])
    eq('an unreadable capture is neither of the two, nor in the minute diagnostics', gradeCalls([c({ incidents: 5 }, 'u')]).premises, {
      callsWithoutSideOrScore: 0, callsWithoutACallMinute: 0, callsOnCapturesWithAGoalRowLackingAScore: 0, callsOnCapturesWhoseTotalsAreNotOneToN: 0, callsWhoseScoreAtCallDisagreesWithTheCapture: 0,
      distinctCaptures: 1, distinctCapturesWithAGoalRowLackingAScore: 0, distinctCapturesWhoseTotalsAreNotOneToN: 0, distinctCapturesWithTwoGoalsInOneMinute: 0, distinctCapturesWhoseMinuteOrderIsNotTotalOrder: 0,
      fullTimeScoreVersusLastGoal: { calls: { 'not evaluated': 1 }, distinctCaptures: { 'not evaluated': 1 } },
      liveRowScoreVersusLastGoal: { calls: { 'not evaluated': 1 }, distinctCaptures: { 'not evaluated': 1 } },
    })
    // two keyless items on different matches must not share one parsed capture
    const homeFirst = capture(timeline([['home', 10]]))
    const awayFirst = capture(timeline([['away', 10]]))
    const keyless = gradeCalls([
      { call: callOf({ side: 'home', outcome: 'hit', rm: 10 }), capture: homeFirst, tags: {} },
      { call: callOf({ side: 'home', outcome: 'hit', rm: 10 }), capture: awayFirst, tags: {} },
    ])
    eq('the second is graded against its own capture: one agrees, one disagrees, two captures', [keyless.agree, keyless.disagree, keyless.premises.distinctCaptures], [1, 1, 2])
    eq('a null key and a number key are not aliased either', [gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 10 }), homeFirst, null), item(callOf({ side: 'home', outcome: 'hit', rm: 10 }), awayFirst, null)]).disagree, gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 10 }), homeFirst, 7), item(callOf({ side: 'home', outcome: 'hit', rm: 10 }), awayFirst, 8)]).premises.distinctCaptures], [1, 2])
    eq('an item that is not an object is not applicable and does not throw, and is counted in the total', [gradeCalls([null, 5, 'x', [], c(ok2, 'e1')]).notApplicable.byReason, gradeCalls([null]).population, gradeCalls([null, 5, 'x', [], c(ok2, 'e1')]).notApplicable.total, gradeCalls([null, 5, 'x', [], c(ok2, 'e1')]).graded], [{ [REASONS.item]: 4 }, 1, 4, 1])
  })

  await scenario('8 the grader against matches it did not write: generated calls with known answers', () => {
    // mulberry32, so the world is the same on every run
    let s = 20261123
    const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    const TYPES = ['regular', 'penalty', 'ownGoal', 'header']
    const items = []
    const expect = { agree: 0, disagree: 0, none: 0, join: 0 }
    const types = {}
    for (let m = 0; m < 160; m++) {
      const n = Math.floor(rnd() * 13) // 0..12 goals
      const sides = Array.from({ length: n }, () => (rnd() < 0.5 ? 'home' : 'away'))
      const goalTypes = sides.map(() => TYPES[Math.floor(rnd() * TYPES.length)])
      let minute = 5
      const steps = sides.map((sd, i) => { minute += rnd() < 0.2 ? 0 : 1 + Math.floor(rnd() * 8); return [sd, minute, { goal_type: goalTypes[i] }] })
      const cap = capture(timeline(steps), { ascending: rnd() < 0.5 })
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
          types[goalTypes[k]] = (types[goalTypes[k]] === undefined ? 0 : types[goalTypes[k]]) + 1
        }
        items.push(item(callOf({ side, outcome, a, b, rm: k < n ? steps[k][1] : 5 }), cap, `m${m}`))
      }
    }
    const g = gradeCalls(items)
    const graded = expect.agree + expect.disagree
    console.log(`  scenario 8 coverage: ${items.length} generated calls, ${graded} reach a grade, ${expect.none} have no goal to resolve on, ${expect.join} have a wrong split`)
    eq('800 calls placed, and enough of them reach a grade for this to mean something (Rule 91)', [g.population, graded >= 400], [800, true])
    eq('agree, disagree and the two reasons equal the answers the generator knew', [g.agree, g.disagree, g.notApplicable.byReason[REASONS.none] === undefined ? 0 : g.notApplicable.byReason[REASONS.none], g.notApplicable.byReason[REASONS.join] === undefined ? 0 : g.notApplicable.byReason[REASONS.join]], [expect.agree, expect.disagree, expect.none, expect.join])
    eq('every graded call resolves on the goal it was generated to, so the distance is always 0', Object.keys(g.resolvedMinuteDistance), ['0'])
    eq('and agree and disagree under it are the generator\'s', [g.resolvedMinuteDistance[0].agree, g.resolvedMinuteDistance[0].disagree], [expect.agree, expect.disagree])
    eq('the type of each resolving goal is the type of goal k+1 (four types, all seen)', Object.fromEntries(Object.entries(g.resolvingGoalType).map(([k, v]) => [k, v.graded])), types)
    eq('nothing is lost', [g.graded + g.notApplicable.total, sumGraded(g.byLedgerOutcome)], [800, g.graded])
  })

  await scenario('9 gradeCall and readGoals directly; an empty or odd input', () => {
    eq('gradeCalls of nothing', [gradeCalls([]).population, gradeCalls(undefined).population, gradeCalls(null).graded], [0, 0, 0])
    eq('a valid call with no capture, or a null one, is unreadable and does not throw', [gradeCall({ side: 'home', outcome: 'hit', score_at_call: { home: 0, away: 0 } }, undefined).reason, gradeCall({ side: 'home', outcome: 'hit', score_at_call: { home: 0, away: 0 } }, null).reason], [REASONS.unreadable, REASONS.unreadable])
    eq('gradeCall on no call and no capture', [gradeCall(undefined, undefined).reason, gradeCall(null, null).reason], [REASONS.side, REASONS.side])
    const rg = readGoals(capture(T1()))
    const call = (o) => ({ side: 'home', outcome: 'hit', score_at_call: { home: 0, away: 0 }, ...o })
    eq('a whole-number score is required on EACH half: 1.5, -1, NaN, Infinity, text, null and true', [1.5, -1, NaN, Infinity, '0', null, true].flatMap((x) => [gradeCall(call({ score_at_call: { home: x, away: 0 } }), rg).reason, gradeCall(call({ score_at_call: { home: 0, away: x } }), rg).reason]), Array(14).fill(REASONS.score))
    eq('a score object with only one side is no score, on either side', [gradeCall(call({ score_at_call: { home: 1 } }), rg).reason, gradeCall(call({ score_at_call: { away: 1 } }), rg).reason], [REASONS.score, REASONS.score])
    eq('a huge score is a score with no goal after it, not an error', [150, 2 ** 60].flatMap((x) => [gradeCall(call({ score_at_call: { home: x, away: 0 } }), rg).reason, gradeCall(call({ score_at_call: { home: 0, away: x } }), rg).reason]), Array(4).fill(REASONS.none))
    eq('the vendor outcomes that are not hit or miss are not graded: nogoal, unclear, open, nothing, and text', ['nogoal', 'unclear', 'open', undefined, 'HIT', 7].map((o) => gradeCall(call({ outcome: o }), rg).reason), Array(6).fill(REASONS.outcome))
    eq('readGoals orders by total and says it is sequential', [rg.ok, rg.sequential, rg.withoutScore, rg.goals.map((x) => x.total), rg.goals.map((x) => x.minute)], [true, true, 0, [1, 2, 3], [20, 55, 80]])
    eq('readGoals on a body with no incidents', readGoals({}), { ok: false })
    eq('readGoals with a goal row lacking a score is not sequential, and keeps the count', readGoals({ incidents: [{ type: 'goal', minute: 1, home_score: 1 }] }), { ok: true, goals: [], withoutScore: 1, sequential: false, final: null, live: null, extended: false, twoInOneMinute: false, minuteOrderBroken: false })
    eq('a graded call carries its verdict, index, type, distance and stoppage flag', gradeCall({ side: 'away', outcome: 'miss', score_at_call: { home: 0, away: 0 }, resolved_minute: 22 }, rg), { graded: true, verdict: 'miss', agree: true, k: 0, goalType: 'regular', isHomeAgreesWithRise: true, distance: 2, stoppage: false })
    eq('a call that is not applicable carries only its reason', gradeCall({ side: 'draw' }, rg), { graded: false, reason: REASONS.side })
  })

  await scenario('10 the coverage line, and the source cannot reach out', () => {
    const g = gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), capture(T1()))])
    eq('the line carries every denominator', coverageLine(g, { gradeable: 370, uniqueCalls: 1746 }), `graded 1 of 1 gradeable calls (census: 370 gradeable of 1746) | agree 1, disagree 0, not applicable 0 | resolving goal at the ledger's resolved_minute for 1 of 1 graded | rule ${RULE_VERSION}`)
    eq('with no census block the line says n/a, not a number', coverageLine(g, undefined), `graded 1 of 1 gradeable calls (census: n/a gradeable of n/a) | agree 1, disagree 0, not applicable 0 | resolving goal at the ledger's resolved_minute for 1 of 1 graded | rule ${RULE_VERSION}`)
    // every number in the line is a different number, so a swapped or mislabelled one is seen
    const mixed = gradeCalls([
      item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), capture(T1())), item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), capture(T1())), // agree, distance 0
      item(callOf({ side: 'home', outcome: 'miss', rm: 20 }), capture(T1())), // disagree, distance 0
      item(callOf({ side: 'home', outcome: 'miss', rm: 22 }), capture(T1())), // disagree, distance 2
      item(callOf({ side: 'home', outcome: 'hit', rm: 21 }), capture(T1())), // agree, distance 1
      item(callOf({ side: 'draw', outcome: 'hit' }), capture(T1())), // not applicable
    ])
    eq('5 graded of 6, 3 agree, 2 disagree, 1 not applicable, 3 at distance 0 (of which 2 agree), against a census of 370 and 1746', coverageLine(mixed, { gradeable: 370, uniqueCalls: 1746 }), `graded 5 of 6 gradeable calls (census: 370 gradeable of 1746) | agree 3, disagree 2, not applicable 1 | resolving goal at the ledger's resolved_minute for 3 of 5 graded | rule ${RULE_VERSION}`)
    eq('with nothing at distance 0 the line says 0, not undefined', coverageLine(gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 99 }), capture(T1()))]), { gradeable: 1, uniqueCalls: 1 }).includes('for 0 of 1 graded'), true)
    eq('the rule version is the one this check was written against', RULE_VERSION, '2026-11-23.3')
    // purity, asserted of the source text with comments removed: this file runs in the same process as the BSD token
    const code = SOURCE_TEXT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const forbidden = [/\bimport\b/, /\brequire\b/, /\bfetch\b/, /\bprocess\b/, /\bglobalThis\b/, /\beval\b/, /\bFunction\b/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bDeno\b/, /\bBun\b/, /\bBuffer\b/, /\bfs\b/, /\bchild_process\b/, /\bDate\b/, /\bMath\.random\b/, /\bsetTimeout\b/]
    eq('no import, no network, no process, no clock, no randomness in the source', forbidden.filter((re) => re.test(code)).map(String), [])
    eq('the source exports the rule it claims', [typeof RULE_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/.test(RULE_VERSION)], ['string', true])
  })

  await scenario('11 two real captures from the repository, read by the grader', () => {
    const read = (f) => fs.readFileSync(path.resolve('data', f))
    const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
    const finished = read('bsd-flow-finished-incidents.json')
    const inplay = read('bsd-flow-inplay-incidents.json')
    // the hashes data/PROVENANCE.md records: if the files change, the hand-derived answers below no longer apply
    eq('the finished capture is the one provenance names', sha(finished), 'cf327cb385aa3c18ef473d607b3c371fb047307f3f9f274bf50a48ad3ad59922')
    eq('the in-play capture is the one provenance names', sha(inplay), 'c4a96597e2925eb52cfa3434d6688ac3a667f8f049e04cbc356e607e3c352eb0')
    const fin = JSON.parse(finished.toString('utf8'))
    const rg = readGoals(fin)
    // event 213708: goals 1' home (1-0), 55' away (1-1), 64' home (2-1), 80' away (2-2); full time 2-2; incidents listed newest first
    eq('four goals ordered by total, newest-first in the file', [rg.sequential, rg.goals.map((g) => g.total), rg.goals.map((g) => g.minute), rg.goals.map((g) => g.isHome)], [true, [1, 2, 3, 4], [1, 55, 64, 80], [true, false, true, false]])
    eq('the full-time row says 2-2 and the last goal says 2-2', [rg.final, finalAgreement(rg)], [{ home: 2, away: 2 }, 'matches'])
    eq('no stoppage goal, no tie, minutes in order', [rg.goals.map((g) => g.added), rg.twoInOneMinute, rg.minuteOrderBroken], [[null, null, null, null], false, false])
    const at = (side, outcome, a, b, rm) => item({ id: 1, event: { id: 213708 }, minute: 30, side, outcome, score_at_call: { home: a, away: b }, resolved_minute: rm }, fin, 'real')
    const g = gradeCalls([
      at('home', 'hit', 0, 0, 1), // goal 1: home. agree
      at('away', 'hit', 1, 0, 55), // goal 2: away. agree
      at('home', 'hit', 1, 1, 64), // goal 3: home. agree
      at('home', 'miss', 2, 1, 80), // goal 4: away, the call was home: FIELD miss. agree
      at('away', 'hit', 0, 0, 1), // goal 1 was home, the call away, the ledger says hit: disagree
      at('home', 'hit', 2, 2, 90), // no fifth goal: not applicable
    ])
    eq('five graded, four agree, one disagrees, one has no goal to resolve on', [g.graded, g.agree, g.disagree, g.notApplicable.byReason], [5, 4, 1, { [REASONS.none]: 1 }])
    eq('every resolving goal is at the ledger resolved_minute, and all are regular', [Object.keys(g.resolvedMinuteDistance), g.resolvedMinuteDistance[0], g.resolvingGoalType], [['0'], { graded: 5, agree: 4, disagree: 1 }, { regular: { graded: 5, agree: 4, disagree: 1 } }])
    eq('is_home agrees with the score rise on all five', g.isHomeVersusScoreRise, { agrees: 5, disagrees: 0, absent: 0 })
    eq('four distinct goals, one with a disagreeing call', g.distinctGoals, { graded: 4, withADisagreeingCall: 1 })
    const live = readGoals(JSON.parse(inplay.toString('utf8')))
    // event 601226 in play: no goal yet, a half-time row and a live second-half row
    eq('the in-play capture holds no goal, is sequential, and has no full-time score', [live.ok, live.goals, live.sequential, live.final, finalAgreement(live)], [true, [], true, null, 'no full-time score'])
    eq('a call on it has no goal to resolve on', gradeCall({ side: 'home', outcome: 'hit', score_at_call: { home: 0, away: 0 }, resolved_minute: 88 }, live).reason, REASONS.none)
  })

  await scenario('12 two defects in one call: the reason is the first in the rule\'s order', () => {
    const T = capture(T1())
    const bad = { incidents: [{ type: 'goal', minute: 1, home_score: 1 }, { type: 'goal', minute: 2, home_score: 5, away_score: 5 }] } // a goal lacking a score AND totals that are not 1..n
    const gapOnly = { incidents: [{ type: 'goal', minute: 1, home_score: 2, away_score: 0 }] } // totals 2: a gap, and a call at k = 0 has nothing to resolve on either
    const riseJoin = { incidents: [{ type: 'goal', minute: 10, home_score: 1, away_score: 0 }, { type: 'goal', minute: 20, home_score: 0, away_score: 2 }] } // k=1 with the wrong split AND a rise of (-1, +2)
    const table = [
      ['side and score', gradeCall({ side: 'draw', outcome: 'hit', score_at_call: null }, readGoals(T)).reason, REASONS.side],
      ['score and outcome', gradeCall({ side: 'home', outcome: 'open', score_at_call: null }, readGoals(T)).reason, REASONS.score],
      ['outcome and an unreadable capture', gradeCall({ side: 'home', outcome: 'open', score_at_call: { home: 0, away: 0 } }, readGoals({})).reason, REASONS.outcome],
      ['an unreadable capture and nothing else', gradeCall({ side: 'home', outcome: 'hit', score_at_call: { home: 0, away: 0 } }, readGoals({})).reason, REASONS.unreadable],
      ['a goal lacking a score and a gap', reasonOf(home(), bad), REASONS.noScore],
      ['a gap and no goal to resolve on', reasonOf(home(), gapOnly), REASONS.sequence],
      ['no goal to resolve on and a wrong split', reasonOf(home({ score: { home: 5, away: 0 } }), T), REASONS.none],
      ['a wrong split and a rise that is not one', reasonOf(home({ score: { home: 0, away: 1 } }), riseJoin), REASONS.join],
      ['a rise that is not one, alone', reasonOf(home({ score: { home: 1, away: 0 } }), riseJoin), REASONS.rise],
    ]
    for (const [name, got, want] of table) eq(`${name}`, got, want)
  })

  await scenario('13 a bad running total anywhere in the list makes the capture untrusted', () => {
    const rows = (pairs) => ({ incidents: pairs.map(([h, a], i) => ({ type: 'goal', minute: 10 + i, home_score: h, away_score: a })) })
    const defects = [
      ['totals 1 1 3', [[1, 0], [0, 1], [2, 1]]],
      ['totals 1 2 4', [[1, 0], [1, 1], [3, 1]]],
      ['totals 1 3 3', [[1, 0], [2, 1], [1, 2]]],
      ['totals 1 2 3 4 5 7', [[1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [4, 3]]],
      ['totals 1 2 3 4 6 6', [[1, 0], [1, 1], [2, 1], [2, 2], [3, 3], [4, 2]]],
      ['totals 2 2 2', [[1, 1], [2, 0], [0, 2]]],
    ]
    for (const [name, pairs] of defects) eq(`${name}`, reasonOf(home(), rows(pairs)), REASONS.sequence)
    const alternating = capture(timeline(Array.from({ length: 12 }, (_, i) => [i % 2 === 0 ? 'home' : 'away', 5 + i * 7])))
    const calls = Array.from({ length: 12 }, (_, k) => callOf({ side: k % 2 === 0 ? 'home' : 'away', outcome: 'hit', a: Math.ceil(k / 2), b: Math.floor(k / 2), rm: 5 + k * 7 }))
    const g = gradeCalls(calls.map((c) => item(c, alternating, 'long')))
    eq('a clean 12-goal capture grades a call at every one of its 12 positions', [g.graded, g.agree, g.notApplicable.total], [12, 12, 0])
  })

  await scenario('14 the goal type is the type of the RESOLVING goal, and vendor text cannot rewrite the tally', () => {
    const cap = capture(timeline([['home', 10, { goal_type: 'penalty' }], ['away', 40, { goal_type: 'ownGoal' }], ['home', 70, { goal_type: 'regular' }], ['away', 125, { goal_type: 'header' }]]))
    const at = (k) => item(callOf({ side: 'home', outcome: 'hit', a: Math.ceil(k / 2), b: Math.floor(k / 2), rm: [10, 40, 70, 125][k] }), cap, 'g')
    const g = gradeCalls([at(0), at(1), at(2), at(3)])
    eq('four calls, four different resolving types, each counted once', Object.fromEntries(Object.entries(g.resolvingGoalType).map(([k, v]) => [k, v.graded])), { penalty: 1, ownGoal: 1, regular: 1, header: 1 })
    const odd = (t) => Object.keys(gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 5 }), capture(timeline([['home', 5, { goal_type: t }]])))]).resolvingGoalType)
    eq('text that is not a short word is (other); __proto__, a long string, spaces, a digit first and an empty string among them', ['__proto__', 'x'.repeat(25), 'two words', '1abc', '', 'a/b', 'constructor'].map((t) => odd(t)[0]), ['(other)', '(other)', '(other)', '(other)', '(other)', '(other)', 'constructor'])
    eq('a hyphen and an underscore are allowed inside a type', [odd('own-goal')[0], odd('own_goal')[0]], ['own-goal', 'own_goal'])
    eq('a 24-character word is a type, a 25-character one is not', [odd('a'.repeat(24))[0], odd('a'.repeat(25))[0]], ['a'.repeat(24), '(other)'])
    const g2 = gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 5 }), capture(timeline([['home', 5, { goal_type: '__proto__' }]])), 'p', { slug: '__proto__' })])
    eq('Object.prototype is untouched, and a tag value of __proto__ is an ordinary key', [({}).graded, ({}).agree, Object.keys(g2.byTag.slug), Object.getPrototypeOf(g2.byTag.slug)], [undefined, undefined, ['__proto__'], null])
  })

  await scenario('15 counts only: no key, id, team or player survives into the output', () => {
    const cap = capture(timeline([['home', 10, { player: 'Player Y' }]]), { eventId: 999111 })
    const call = { ...callOf({ side: 'home', outcome: 'hit', rm: 10 }), id: 424242, team: 'Team X', event: { id: 777333, home_team: 'Alpha FC' } }
    const g = gradeCalls([item(call, cap, 'SENTINEL-KEY', { slug: 'epl' }), item({ ...call, side: 'draw' }, cap, 'SENTINEL-KEY', { slug: 'epl' })])
    const text = JSON.stringify(g)
    eq('none of the identifying values is in the output', ['SENTINEL-KEY', '424242', 'Team X', 'Player Y', '777333', 'Alpha FC', '999111'].filter((s) => text.includes(s)), [])
    eq('the output has exactly these top-level keys', Object.keys(g).sort(), ['agree', 'byLedgerOutcome', 'byTag', 'confusion', 'disagree', 'distinctGoals', 'graded', 'isHomeVersusScoreRise', 'notApplicable', 'population', 'premises', 'resolvedMinuteDistance', 'resolvingGoalType', 'ruleVersion', 'stoppageResolvingGoals'])
    eq('and these premise keys', Object.keys(g.premises).sort(), ['callsOnCapturesWhoseTotalsAreNotOneToN', 'callsOnCapturesWithAGoalRowLackingAScore', 'callsWhoseScoreAtCallDisagreesWithTheCapture', 'callsWithoutACallMinute', 'callsWithoutSideOrScore', 'distinctCaptures', 'distinctCapturesWhoseMinuteOrderIsNotTotalOrder', 'distinctCapturesWhoseTotalsAreNotOneToN', 'distinctCapturesWithAGoalRowLackingAScore', 'distinctCapturesWithTwoGoalsInOneMinute', 'fullTimeScoreVersusLastGoal', 'liveRowScoreVersusLastGoal'])
    eq('every leaf is a number or a count map: the output holds no string but the rule version and the map keys', JSON.stringify(g, (k, v) => (typeof v === 'string' && k !== 'ruleVersion' ? '<<string>>' : v)).includes('<<string>>'), false)
  })

  await scenario('16 the diagnostics that say what kind of disagreement it is', () => {
    const tie = capture(timeline([['home', 30], ['away', 30]]))
    const broken = capture(timeline([['home', 40], ['away', 38]]))
    const clean = capture(timeline([['home', 10], ['away', 20]]))
    const cl = (cap, key, o = {}) => item(callOf({ side: 'home', outcome: 'hit', rm: 10, ...o }), cap, key)
    const g = gradeCalls([cl(tie, 't'), cl(tie, 't'), cl(broken, 'b'), cl(clean, 'c')])
    eq('two goals in one minute: one capture; minutes out of total order: one capture', [g.premises.distinctCapturesWithTwoGoalsInOneMinute, g.premises.distinctCapturesWhoseMinuteOrderIsNotTotalOrder], [1, 1])
    eq('a goal with no minute is neither a tie nor out of order', [gradeCalls([cl(capture(timeline([['home', null], ['away', null]])), 'n')]).premises.distinctCapturesWithTwoGoalsInOneMinute, gradeCalls([cl(capture(timeline([['home', null], ['away', 5]])), 'n')]).premises.distinctCapturesWhoseMinuteOrderIsNotTotalOrder], [0, 0])
    eq('a later goal at an earlier minute than ANY earlier one is out of order, not only than the previous one', gradeCalls([cl(capture(timeline([['home', 50], ['away', 51], ['home', 40]])), 'o')]).premises.distinctCapturesWhoseMinuteOrderIsNotTotalOrder, 1)
    eq('calls with no minute are counted', [gradeCalls([cl(clean, 'c')]).premises.callsWithoutACallMinute, gradeCalls([{ call: { ...callOf({ side: 'home', outcome: 'hit', rm: 10 }), minute: undefined }, capture: clean, key: 'c' }, { call: { ...callOf({ side: 'home', outcome: 'hit', rm: 10 }), minute: '30' }, capture: clean, key: 'c' }]).premises.callsWithoutACallMinute], [0, 2])
    // the full-time row against the last goal
    const finalOf = (goals, final, text) => readGoals(capture(timeline(goals), { final, finalText: text }))
    eq('full time 1-1 after a home and an away goal: matches', finalAgreement(finalOf([['home', 10], ['away', 20]], [1, 1])), 'matches')
    eq('full time 2-1 after a home and an away goal: differs', finalAgreement(finalOf([['home', 10], ['away', 20]], [2, 1])), 'differs')
    eq('full time 1-2 after a home and an away goal (home equal, away different): differs', finalAgreement(finalOf([['home', 10], ['away', 20]], [1, 2])), 'differs')
    eq('full time 0-0 and no goal: matches', finalAgreement(readGoals(capture([], { final: [0, 0] }))), 'matches')
    eq('no full-time row: no full-time score', finalAgreement(finalOf([['home', 10]], undefined)), 'no full-time score')
    eq('AET and AP rows are full-time rows that can be compared; a PEN row means the match went past 90 and is not compared; an FT row that is live is no full-time row', [finalAgreement(finalOf([['home', 10]], [1, 0], 'AET')), finalAgreement(finalOf([['home', 10]], [1, 0], 'AP')), finalAgreement(finalOf([['home', 10]], [1, 0], 'PEN')), finalAgreement(readGoals({ incidents: [timeline([['home', 10]])[0], { type: 'period', text: 'FT', is_live: true, home_score: 1, away_score: 0 }] }))], ['matches', 'matches', 'not evaluated (extra time)', 'no full-time score'])
    const rowsOf = (...periods) => readGoals({ incidents: [...periods, ...timeline([['home', 10], ['away', 20]]).reverse()] })
    const per = (text, h, a) => ({ type: 'period', text, minute: 90, is_live: false, home_score: h, away_score: a })
    eq('the FIRST full-time row in the list is the final one (the list is newest first): AET 3-2 before FT 2-2', rowsOf(per('AET', 3, 2), per('FT', 2, 2)).final, { home: 3, away: 2 })
    eq('a full-time row with only one score is no full-time score, either one', [finalAgreement(rowsOf({ type: 'period', text: 'FT', is_live: false, home_score: 1 })), finalAgreement(rowsOf({ type: 'period', text: 'FT', is_live: false, away_score: 1 }))], ['no full-time score', 'no full-time score'])
    eq('text that only contains a full-time word is not a full-time row', [finalAgreement(rowsOf(per('Gap', 1, 1))), finalAgreement(rowsOf(per('Half', 1, 1)))], ['no full-time score', 'no full-time score'])
    eq('a full-time row whose scores are swapped is a different score', [rowsOf(per('FT', 1, 2)).final, finalAgreement(rowsOf(per('FT', 1, 1)))], [{ home: 1, away: 2 }, 'matches'])
    eq('an item whose call is null is not applicable and is not a call without a minute', [gradeCalls([{ call: null, capture: clean, key: 'q' }]).notApplicable.byReason, gradeCalls([{ call: null, capture: clean, key: 'q' }]).premises.callsWithoutACallMinute], [{ [REASONS.side]: 1 }, 0])
    eq('a full-time row with no scores is no full-time score', finalAgreement(readGoals({ incidents: [timeline([['home', 10]])[0], { type: 'period', text: 'FT', is_live: false }] })), 'no full-time score')
    eq('an untrusted capture is not evaluated, and neither is no capture', [finalAgreement(readGoals({ incidents: [{ type: 'goal', minute: 1 }] })), finalAgreement(readGoals({})), finalAgreement(undefined), finalAgreement(readGoals({ incidents: [{ type: 'goal', minute: 1, home_score: 2, away_score: 0 }] }))], ['not evaluated', 'not evaluated', 'not evaluated', 'not evaluated'])
    const withFinal = gradeCalls([
      cl(capture(timeline([['home', 10], ['away', 20]]), { final: [1, 1] }), 'm'), cl(capture(timeline([['home', 10], ['away', 20]]), { final: [1, 1] }), 'm'),
      cl(capture(timeline([['home', 10]]), { final: [2, 0] }), 'd'), cl(capture(timeline([['home', 10]])), 'x'), cl({ incidents: 5 }, 'u'),
    ])
    eq('tallied per call and per distinct capture', withFinal.premises.fullTimeScoreVersusLastGoal, { calls: { matches: 2, differs: 1, 'no full-time score': 1, 'not evaluated': 1 }, distinctCaptures: { matches: 1, differs: 1, 'no full-time score': 1, 'not evaluated': 1 } })
  })

  await scenario('17 several calls on one goal count as one goal', () => {
    const cap = capture(timeline([['home', 10], ['away', 20]]))
    const at = (k, side, outcome, key) => item(callOf({ side, outcome, a: k === 0 ? 0 : 1, b: 0, rm: k === 0 ? 10 : 20 }), cap, key)
    const g = gradeCalls([
      at(0, 'away', 'hit', 'x'), at(0, 'home', 'hit', 'x'), at(0, 'home', 'hit', 'x'), // goal 1: the disagreeing call comes FIRST, then two that agree
      at(1, 'away', 'hit', 'x'), // goal 2: agrees
      at(0, 'home', 'hit', 'y'), // another match, its own goal 1: agrees
    ])
    eq('five graded calls on three goals, one with a disagreeing call', [g.graded, g.distinctGoals], [5, { graded: 3, withADisagreeingCall: 1 }])
    eq('the same k on two captures is two goals, and two keys on one capture object are two captures', [gradeCalls([at(0, 'home', 'hit', 'p'), at(0, 'home', 'hit', 'q')]).distinctGoals.graded, gradeCalls([at(0, 'home', 'hit', 'p'), at(0, 'home', 'hit', 'p')]).distinctGoals.graded], [2, 1])
  })

  await scenario('19 the reviewers\' second-round assertions: reason vocabulary, minute diagnostics, last goal by total, sides as exact text, stoppage at every nominal minute, keys, prototype-free tallies at every site, non-finite numbers, goal-type text, full-time rows, which rows are goals, five tags', () => {
    const hit = (o = {}) => callOf({ side: 'home', outcome: 'hit', rm: 10, ...o })
    const prem = (cap, key = 'k') => gradeCalls([item(hit(), cap, key)]).premises
    const rg = readGoals(capture(T1()))
    const per = (text, h, a, extra = {}) => ({ type: 'period', text, minute: 90, is_live: false, home_score: h, away_score: a, ...extra })
    const finalOf = (...rows) => readGoals({ incidents: [...rows, ...timeline([['home', 10], ['away', 20]]).reverse()] }).final
    // F1: the reason wording is the artifact's vocabulary; it must not move without a RULE_VERSION bump, and no two may collide
    eq('F1 REASONS text pinned', REASONS, {
      item: 'the item is not an object',
      side: 'the ledger row has no home or away side',
      score: 'the ledger row has no whole-number score_at_call',
      outcome: 'the outcome is not hit or miss',
      unreadable: 'the capture has no incidents array',
      noScore: 'a goal row in the capture has no running score',
      sequence: 'the capture goal rows are not running totals 1 to n',
      none: 'the capture holds no goal after the score at the call',
      join: 'score_at_call does not match the capture score before that goal',
      rise: 'the running score did not rise by one on one side',
    })
    eq('F1 REASONS are distinct', new Set(Object.values(REASONS)).size, Object.keys(REASONS).length)

    // F2: the minute-order diagnostic is "some goal is earlier than an earlier goal", not "earlier than the smallest"
    eq('F2 minutes 10, 20, 15 are out of total order', prem(capture(timeline([['home', 10], ['away', 20], ['home', 15]]))).distinctCapturesWhoseMinuteOrderIsNotTotalOrder, 1)
    eq('F2 minutes 20, 10, 15 are out of total order', prem(capture(timeline([['home', 20], ['away', 10], ['home', 15]]))).distinctCapturesWhoseMinuteOrderIsNotTotalOrder, 1)
    eq('F2 a goal with no minute in the middle does not reset the order', prem(capture(timeline([['home', 50], ['away', null], ['home', 40]]))).distinctCapturesWhoseMinuteOrderIsNotTotalOrder, 1)
    eq('F2 a goal with no minute in the middle does not clear the ties', prem(capture(timeline([['home', 30], ['away', null], ['home', 30]]))).distinctCapturesWithTwoGoalsInOneMinute, 1)
    eq('F2 a tie that is not between neighbours (10, 20, 10) is a tie', prem(capture(timeline([['home', 10], ['away', 20], ['home', 10]]))).distinctCapturesWithTwoGoalsInOneMinute, 1)
    eq('F2 ties are counted from the clock, minute and added time together: 90+1 and 90+3 are two moments, 90+1 and 90+1 are one', [prem(capture(timeline([['home', 90, { added_time: 1 }], ['away', 90, { added_time: 3 }]]))).distinctCapturesWithTwoGoalsInOneMinute, prem(capture(timeline([['home', 90, { added_time: 1 }], ['away', 90, { added_time: 1 }]]))).distinctCapturesWithTwoGoalsInOneMinute], [0, 1])
    eq('F2 45 and 45+2 are two moments, a later total at 90+1 after 90+3 is out of order, and 90+3 after 90+1 is not', [prem(capture(timeline([['home', 45], ['away', 45, { added_time: 2 }]]))).distinctCapturesWithTwoGoalsInOneMinute, prem(capture(timeline([['home', 90, { added_time: 3 }], ['away', 90, { added_time: 1 }]]))).distinctCapturesWhoseMinuteOrderIsNotTotalOrder, prem(capture(timeline([['home', 90, { added_time: 1 }], ['away', 90, { added_time: 3 }]]))).distinctCapturesWhoseMinuteOrderIsNotTotalOrder, prem(capture(timeline([['home', 45, { added_time: 4 }], ['away', 45]]))).distinctCapturesWhoseMinuteOrderIsNotTotalOrder], [0, 1, 0, 1])
    eq('F2 an untrusted capture (a gap) still gets the minute diagnostics (pins today\'s behaviour)', [
      prem({ incidents: [{ type: 'goal', minute: 10, home_score: 1, away_score: 0 }, { type: 'goal', minute: 5, home_score: 3, away_score: 0 }] }).distinctCapturesWhoseMinuteOrderIsNotTotalOrder,
      prem({ incidents: [{ type: 'goal', minute: 10, home_score: 1, away_score: 0 }, { type: 'goal', minute: 10, home_score: 3, away_score: 0 }] }).distinctCapturesWithTwoGoalsInOneMinute,
      prem({ incidents: [{ type: 'goal', minute: 10, home_score: 1, away_score: 0 }, { type: 'goal', minute: 10, home_score: 1, away_score: 0 }] }).distinctCapturesWithTwoGoalsInOneMinute,
    ], [1, 1, 1])

    // F3: finalAgreement when the capture holds no goal row but the full-time row has a score (the case the tally exists for)
    const fa = (goals, final) => finalAgreement(readGoals(capture(goals, { final })))
    eq('F3 no goal rows, full time 1-0: differs', fa([], [1, 0]), 'differs')
    eq('F3 no goal rows, full time 0-1: differs', fa([], [0, 1]), 'differs')
    eq('F3 no goal rows, full time 0-0: matches', fa([], [0, 0]), 'matches')
    eq('F3 the last goal is the one with the largest total, not the largest minute (a correction)', fa(timeline([['home', 40], ['away', 38]]), [1, 1]), 'matches')

    // F4: a call on the away side with a missing score is a score defect (the score check does not depend on the side)
    eq('F4 away call, no score_at_call', gradeCall({ side: 'away', outcome: 'hit', score_at_call: null }, rg).reason, REASONS.score)
    eq('F4 away call, text score', gradeCall({ side: 'away', outcome: 'hit', score_at_call: { home: '1', away: 0 } }, rg).reason, REASONS.score)
    eq('F4 away call, one half of the score', gradeCall({ side: 'away', outcome: 'hit', score_at_call: { away: 0 } }, rg).reason, REASONS.score)

    // F5: sides are exact text
    eq('F5 HOME, Home, " home", "home " and Away are not sides', ['HOME', 'Home', ' home', 'home ', 'Away'].map((s) => gradeCall({ side: s, outcome: 'hit', score_at_call: { home: 0, away: 0 } }, rg).reason), Array(5).fill(REASONS.side))

    // F6: stoppage goals exist at 45, 105 and 120 as well as 90 (census P2: added_incidents_by_min 45:183, 90:436, 105:2, 120:7)
    const bucketAt = (minute, added, rm) => Object.keys(gradeCalls([item(hit({ rm }), capture(timeline([['home', minute, { added_time: added }]])))]).resolvedMinuteDistance)[0]
    eq('F6 45+2 called at 49, 105+2 at 109, 120+3 at 124, 90+1 at 95: all "3+ stoppage"', [bucketAt(45, 2, 49), bucketAt(105, 2, 109), bucketAt(120, 3, 124), bucketAt(90, 1, 95)], Array(4).fill('3+ stoppage'))
    eq('F6 stoppage is any positive added_time, whatever the nominal minute', bucketAt(47, 2, 51), '3+ stoppage')
    eq('F6 a fractional distance keeps its fraction', bucketAt(20, null, 20.5), '0.5')

    // F7: counting keys: 1 and "1" are two captures, a boolean is no key, an empty string is a key
    const two = (k1, k2) => gradeCalls([item(hit(), capture(timeline([['home', 10]])), k1), item(hit(), capture(timeline([['away', 10]])), k2)])
    eq('F7 key 1 and key "1" are two captures', two(1, '1').premises.distinctCaptures, 2)
    eq('F7 key true and key true are two captures (a boolean is no key)', two(true, true).premises.distinctCaptures, 2)
    eq('F7 key "" and key "" are one capture (an empty string is a string key; pins today\'s behaviour)', two('', '').premises.distinctCaptures, 1)

    // F8: tag values are kept exactly
    const tg = gradeCalls([item(hit(), capture(T1()), 'a', { slug: 'Epl' }), item(hit(), capture(T1()), 'b', { slug: 'epl' })])
    eq('F8 Epl and epl are two cells', Object.keys(tg.byTag.slug).sort(), ['Epl', 'epl'])

    // F9: the premises count calls that are not applicable too, and only the reason they are named for
    const nm = gradeCalls([item({ ...callOf({ side: 'draw', outcome: 'hit' }), minute: undefined }, capture(T1()), 'a')])
    eq('F9 a not-applicable call with no minute is counted as a call without a minute', nm.premises.callsWithoutACallMinute, 1)
    const rise = gradeCalls([item(callOf({ side: 'home', outcome: 'hit', a: 1, b: 0, rm: 20 }), { incidents: [{ type: 'goal', minute: 10, home_score: 1, away_score: 0 }, { type: 'goal', minute: 20, home_score: 0, away_score: 2 }] }, 'a')])
    eq('F9 a call that fails on the rise is none of the capture-defect premises', [rise.notApplicable.byReason, rise.premises.callsOnCapturesWhoseTotalsAreNotOneToN, rise.premises.callsOnCapturesWithAGoalRowLackingAScore, rise.premises.callsWhoseScoreAtCallDisagreesWithTheCapture, rise.premises.distinctCapturesWhoseTotalsAreNotOneToN], [{ [REASONS.rise]: 1 }, 0, 0, 0, 0])

    // F10: every tally is a prototype-free object, and a tag value of __proto__ on a NOT-applicable call cannot rewrite the prototype
    const pr = gradeCalls([item(callOf({ side: 'draw', outcome: 'hit' }), capture(T1()), 'p', { slug: '__proto__', constructor: 'toString' }), item(hit(), capture(T1()), 'q', { slug: '__proto__' })])
    const protoOf = (o) => Object.getPrototypeOf(o)
    eq('F10 Object.prototype is untouched by a not-applicable call tagged __proto__', [({})[REASONS.side], ({}).graded, Object.keys(Object.prototype).length], [undefined, undefined, 0])
    eq('F10 every tally has no prototype', [
      protoOf(pr.notApplicable.byReason), protoOf(pr.notApplicable.byTagAndReason), protoOf(pr.notApplicable.byTagAndReason.slug), protoOf(pr.notApplicable.byTagAndReason.slug['__proto__']),
      protoOf(pr.byTag), protoOf(pr.byTag.slug), protoOf(pr.confusion), protoOf(pr.byLedgerOutcome), protoOf(pr.resolvingGoalType), protoOf(pr.resolvedMinuteDistance),
      protoOf(pr.premises.fullTimeScoreVersusLastGoal.calls), protoOf(pr.premises.fullTimeScoreVersusLastGoal.distinctCaptures),
    ].map((x) => x), Array(12).fill(null))
    eq('F10 the tag name constructor and the tag value __proto__ are ordinary keys', [Object.keys(pr.byTag).sort(), Object.keys(pr.notApplicable.byTagAndReason).sort()], [['constructor', 'slug'], ['constructor', 'slug']])

    // F11: numbers that JSON can carry but that are not finite are not numbers (1e999 parses to Infinity)
    const inf = JSON.parse('{"incidents":[{"type":"goal","minute":1,"home_score":1e999,"away_score":0}]}')
    eq('F11 an infinite running score is no running score', gradeCall({ side: 'home', outcome: 'hit', score_at_call: { home: 0, away: 0 } }, readGoals(inf)).reason, REASONS.noScore)
    const infMin = JSON.parse('{"incidents":[{"type":"goal","minute":1e999,"home_score":1,"away_score":0}]}')
    eq('F11 an infinite goal minute is no minute', Object.keys(gradeCalls([item(hit({ rm: 5 }), infMin)]).resolvedMinuteDistance), ['no minute'])

    // F12: the goal-type whitelist: ASCII word, no newline, no dot
    eq('F12 goal types with a newline, a dot or a non-ASCII letter are (other)', ['abc\nxyz', 'a.b', 'Ünï', 'abc\n'].map((t) => Object.keys(gradeCalls([item(hit({ rm: 5 }), capture(timeline([['home', 5, { goal_type: t }]])))]).resolvingGoalType)[0]), Array(4).fill('(other)'))
    eq('F12 goal type is not case-folded', Object.keys(gradeCalls([item(hit({ rm: 5 }), capture(timeline([['home', 5, { goal_type: 'OwnGoal' }]])))]).resolvingGoalType), ['OwnGoal'])

    // F13: the full-time row: text must be text, is_live must be false, both scores must be numbers; and the pinned prefix behaviour
    eq('F13 an array text, a row with no is_live, and text scores are no full-time score', [finalOf(per(['FT'], 1, 1)), finalOf(per('FT', 1, 1, { is_live: undefined })), finalOf(per('FT', '1', 1)), finalOf(per('FT', 1, '1'))], [null, null, null, null])
    eq('F13 pins the prefix match: "Penalties" and "FT " and "aet" are full-time rows; "Full time", "Postponed", "Pause", "Extra time" and "Second half" are not', [finalOf(per('Penalties', 5, 4)), finalOf(per('FT ', 5, 4)), finalOf(per('aet', 5, 4)), finalOf(per('Full time', 5, 4)), finalOf(per('Postponed', 5, 4)), finalOf(per('Pause', 5, 4)), finalOf(per('Extra time', 5, 4)), finalOf(per('Second half', 5, 4))], [{ home: 5, away: 4 }, { home: 5, away: 4 }, { home: 5, away: 4 }, null, null, null, null, null])

    // F14: which rows are goals: type goal, and nothing else, even with a goal_type
    eq('F14 a non-goal row with a goal_type and scores is not a goal', readGoals({ incidents: [{ type: 'shot', goal_type: 'regular', minute: 3, home_score: 1, away_score: 0 }] }).goals, [])
    eq('F14 a goal row is exactly these fields', Object.keys(readGoals(capture(timeline([['home', 5, { player: 'P Y' }]]))).goals[0]).sort(), ['added', 'away', 'home', 'isHome', 'minute', 'total', 'type'])

    // F15: running scores that are not whole numbers
    eq('F15 a running total of 1.4 is a gap in the totals, not a goal 1', [1.4, 0.6, 1.5].map((h) => gradeCall({ side: 'home', outcome: 'hit', score_at_call: { home: 0, away: 0 } }, readGoals({ incidents: [{ type: 'goal', minute: 1, home_score: h, away_score: 0 }] })).reason), [REASONS.sequence, REASONS.sequence, REASONS.sequence])

    // F16: an incidents value that is text or array-like is no incidents array
    eq('F16 incidents as text or as {length}', [{ incidents: 'abc' }, { incidents: { length: 2 } }, { incidents: new String('x') }].map((c) => readGoals(c).ok), [false, false, false])

    // F17: a negative minute is not an ordering defect by itself (pins the equivalence the harness header assumes)
    eq('F17 minutes -1 then 5 are in order', prem(capture(timeline([['home', -1], ['away', 5]]))).distinctCapturesWhoseMinuteOrderIsNotTotalOrder, 0)

    // F18: the runner puts five tags on every item (slug, state, var, eventId, extraTime): all five are tallied for graded and for
    // not-applicable calls, whatever the value; and nothing is truncated at a size the check never reaches
    const five = { slug: 'epl', state: 'full-time', var: 'no var rows', eventId: 'matches', extraTime: 'no' }
    const t5 = gradeCalls([item(hit({ rm: 10 }), capture(timeline([['home', 10]])), 'a', five), item(callOf({ side: 'draw', outcome: 'hit' }), capture(timeline([['home', 10]])), 'b', five)])
    eq('F18 five tag names for a graded and a not-applicable call', [Object.keys(t5.byTag).sort(), Object.keys(t5.notApplicable.byTagAndReason).sort()], [['eventId', 'extraTime', 'slug', 'state', 'var'], ['eventId', 'extraTime', 'slug', 'state', 'var']])
    const g5 = gradeCalls([item(hit({ rm: 10 }), capture(timeline([['home', 10]])), 'a', { ...five, extra: '' })])
    eq('F18 all six tag names, one of them with an empty value, are tallied for a GRADED call alone', [Object.keys(g5.byTag).sort(), Object.values(g5.byTag).map((v) => Object.values(v)[0].graded)], [['eventId', 'extra', 'extraTime', 'slug', 'state', 'var'], [1, 1, 1, 1, 1, 1]])
    const oddTags = gradeCalls([item(hit({ rm: 10 }), capture(timeline([['home', 10]])), 'a', { a: '', b: null, c: undefined, d: false, e: 0 }), item(callOf({ side: 'draw', outcome: 'hit' }), capture(timeline([['home', 10]])), 'b', { a: '', b: null, c: undefined, d: false, e: 0 })])
    eq('F18 empty, null, undefined, false and 0 tag values are tallied as their text, graded and not applicable', [Object.keys(oddTags.byTag).sort(), ['a', 'b', 'c', 'd', 'e'].map((n) => Object.keys(oddTags.byTag[n])[0]), Object.keys(oddTags.notApplicable.byTagAndReason).sort()], [['a', 'b', 'c', 'd', 'e'], ['', 'null', 'undefined', 'false', '0'], ['a', 'b', 'c', 'd', 'e']])
    eq('F18 a 100-character tag value is not cut', Object.keys(gradeCalls([item(hit({ rm: 10 }), capture(timeline([['home', 10]])), 'a', { slug: 'x'.repeat(100) })]).byTag.slug)[0].length, 100)
    const sixty = timeline(Array.from({ length: 60 }, (_, i) => [i % 2 === 0 ? 'home' : 'away', 1 + i]))
    eq('F18 a 60-goal capture grades the call at goal 41 and at goal 60', [40, 59].map((k) => { const a = Math.ceil(k / 2); return gradeCall(callOf({ side: k % 2 === 0 ? 'home' : 'away', outcome: 'hit', a, b: k - a, rm: 1 + k }), readGoals(capture(sixty))).graded }), [true, true])
    eq('F18 a capture of 6000 rows is read', gradeCalls([item(hit({ rm: 10 }), { incidents: [...Array.from({ length: 6000 }, () => ({ type: 'card', minute: 1 })), timeline([['home', 10]])[0]] })]).graded, 1)
    const many = gradeCalls(Array.from({ length: 1500 }, (_, i) => item(hit({ rm: 10 }), capture(timeline([['home', 10]])), `m${i}`)))
    eq('F18 1500 distinct captures are 1500 captures', [many.graded, many.premises.distinctCaptures, many.distinctGoals.graded], [1500, 1500, 1500])
    const longKey = 'k'.repeat(100)
    eq('F18 two items with the same 100-character key share one capture', gradeCalls([item(hit(), capture(timeline([['home', 10]])), longKey), item(hit(), capture(timeline([['away', 10]])), longKey)]).premises.distinctCaptures, 1)


  })

  await scenario('20 a match that went past 90 minutes: the full-time row is the score at 90, so it is not compared with the last goal', () => {
    // real captures carry 'ET' (decided), a live 'Extra time' and 'PEN' (outbox/empowerment-premises-latest.json in field-relay-nba)
    const goals = timeline([['home', 20], ['away', 70], ['home', 105]]) // 1-0, 1-1, then an extra-time goal: 2-1
    const per = (text, h, a, live = false) => ({ type: 'period', text, minute: 120, is_live: live, home_score: h, away_score: a })
    const ft = per('FT', 1, 1)
    const decided = readGoals({ incidents: [per('ET', 2, 1), ...goals.slice().reverse(), ft] })
    eq('an ET row beside an FT row at 90: not evaluated (extra time), not "differs"', [finalAgreement(decided), decided.extended, decided.final], ['not evaluated (extra time)', true, { home: 1, away: 1 }])
    const liveEt = readGoals({ incidents: [per('Extra time', 2, 1, true), ...goals.slice().reverse(), ft] })
    eq('a live Extra time row is extra time too', [finalAgreement(liveEt), liveAgreement(liveEt), liveEt.extended], ['not evaluated (extra time)', 'not evaluated (extra time)', true])
    eq('Extra, extra and ET begin an extra-time row; Second half, Penalties-free text and Gap do not', [['Extra time', 'extra', 'ET', 'et', 'PEN', 'pen'].map((x) => readGoals({ incidents: [per(x, 0, 0)] }).extended), ['Second half', 'HT', 'FT', 'Gap', 'Set', 'Competition', ''].map((x) => readGoals({ incidents: [per(x, 0, 0)] }).extended)], [Array(6).fill(true), Array(7).fill(false)])
    eq('a period row with no text is not extra time', [readGoals({ incidents: [{ type: 'period', is_live: false, home_score: 0, away_score: 0 }] }).extended, readGoals({ incidents: [{ type: 'period', text: 5 }] }).extended], [false, false])
    eq('the grade is untouched by it: a call on the extra-time goal still grades', gradeCall(callOf({ side: 'home', outcome: 'hit', a: 1, b: 1, rm: 105 }), decided).graded, true)
  })

  await scenario('21 the live row\'s score against the last goal, the free test for a capture taken in play', () => {
    const goals = timeline([['home', 20], ['away', 55]])
    const live = (h, a, extra = {}) => readGoals({ incidents: [{ type: 'period', text: 'Second half', minute: 90, is_live: true, home_score: h, away_score: a, ...extra }, ...goals.slice().reverse()] })
    eq('a live row of 1-1 after a home and an away goal: matches; of 2-1 or 1-2: differs', [liveAgreement(live(1, 1)), liveAgreement(live(2, 1)), liveAgreement(live(1, 2))], ['matches', 'differs', 'differs'])
    eq('no goal and a live row of 0-0: matches; of 1-0: differs', [liveAgreement(readGoals({ incidents: [{ type: 'period', text: 'Second half', is_live: true, home_score: 0, away_score: 0 }] })), liveAgreement(readGoals({ incidents: [{ type: 'period', text: 'Second half', is_live: true, home_score: 1, away_score: 0 }] }))], ['matches', 'differs'])
    eq('no live row, a row that is not live, a live row with half a score or text scores: no live row score', [liveAgreement(readGoals({ incidents: goals })), liveAgreement(live(1, 1, { is_live: false })), liveAgreement(live(1, undefined)), liveAgreement(live('1', 1))], ['no live row score', 'no live row score', 'no live row score', 'no live row score'])
    eq('the FIRST live row in the list is the one read', liveAgreement(readGoals({ incidents: [{ type: 'period', is_live: true, home_score: 1, away_score: 1 }, { type: 'period', is_live: true, home_score: 9, away_score: 9 }, ...goals.slice().reverse()] })), 'matches')
    eq('an untrusted capture, no capture and an unreadable one are not evaluated', [liveAgreement(readGoals({ incidents: [{ type: 'goal', minute: 1 }] })), liveAgreement(undefined), liveAgreement(readGoals({}))], ['not evaluated', 'not evaluated', 'not evaluated'])
    const g = gradeCalls([
      item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), { incidents: [{ type: 'period', is_live: true, home_score: 1, away_score: 1 }, ...goals.slice().reverse()] }, 'a'),
      item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), { incidents: [{ type: 'period', is_live: true, home_score: 1, away_score: 1 }, ...goals.slice().reverse()] }, 'a'),
      item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), { incidents: [{ type: 'period', is_live: true, home_score: 5, away_score: 0 }, ...goals.slice().reverse()] }, 'b'),
    ])
    eq('tallied per call and per distinct capture', g.premises.liveRowScoreVersusLastGoal, { calls: { matches: 2, differs: 1 }, distinctCaptures: { matches: 1, differs: 1 } })
    eq('a period row with no is_live flag at all is not the live row', liveAgreement(readGoals({ incidents: [{ type: 'period', text: 'Second half', home_score: 1, away_score: 1 }, ...goals.slice().reverse()] })), 'no live row score')
    eq('both live tallies are prototype-free', [Object.getPrototypeOf(g.premises.liveRowScoreVersusLastGoal.calls), Object.getPrototypeOf(g.premises.liveRowScoreVersusLastGoal.distinctCaptures)], [null, null])
    // a goal in the first half's added time (45+1) is a different moment from the first minute of the second half (46)
    const prem = (c) => gradeCalls([item(callOf({ side: 'home', outcome: 'hit', rm: 45 }), c, 'k')]).premises
    eq('45+1 and 46 are two moments, in order; 90+1 and 91 likewise (extra time)', [prem(capture(timeline([['home', 45, { added_time: 1 }], ['away', 46]]))), prem(capture(timeline([['home', 90, { added_time: 1 }], ['away', 91]])))].map((p) => [p.distinctCapturesWithTwoGoalsInOneMinute, p.distinctCapturesWhoseMinuteOrderIsNotTotalOrder]), [[0, 0], [0, 0]])
    eq('46 then 45+1 is out of order', prem(capture(timeline([['home', 46], ['away', 45, { added_time: 1 }]]))).distinctCapturesWhoseMinuteOrderIsNotTotalOrder, 1)
  })

  await scenario('22 graded calls whose resolving goal has added time are told apart whatever the distance', () => {
    const cap = (added) => capture(timeline([['home', 45, { added_time: added }], ['away', 90, { added_time: 3 }]]))
    const g = gradeCalls([
      item(callOf({ side: 'home', outcome: 'hit', rm: 45 }), cap(2), 'a'), // goal 1 has 2 added minutes, distance 0: agree
      item(callOf({ side: 'away', outcome: 'miss', rm: 47 }), cap(2), 'a'), // goal 1 again, FIELD home, the call was away, outcome miss: agree; distance 2
      item(callOf({ side: 'home', outcome: 'miss', rm: 45 }), cap(2), 'a'), // goal 1: FIELD hit, ledger miss: disagree
      item(callOf({ side: 'home', outcome: 'hit', a: 1, b: 0, rm: 93 }), cap(2), 'a'), // goal 2 (90+3) is away: FIELD miss, ledger hit: disagree
      item(callOf({ side: 'home', outcome: 'hit', rm: 45 }), cap(0), 'b'), // added_time 0: not stoppage
      item(callOf({ side: 'home', outcome: 'hit', rm: 45 }), cap(null), 'c'), // added_time null: not stoppage
    ])
    eq('four stoppage-time resolving goals (three on goal 1, one on goal 2): two agree, two disagree; the two plain ones are not counted', g.stoppageResolvingGoals, { graded: 4, agree: 2, disagree: 2 })
    eq('six graded calls in all', g.graded, 6)
  })

  await scenario('18 the grader is the same grader when the data is the same', () => {
    // the rule has no clock, no randomness and no memory: the same items give the same counts, twice, and the input is not changed
    const items = [item(callOf({ side: 'home', outcome: 'hit', rm: 20 }), capture(T1()), 'a', { slug: 'epl' }), item(callOf({ side: 'away', outcome: 'hit', a: 1, b: 0, rm: 55 }), capture(T1()), 'a', { slug: 'epl' })]
    const before = JSON.stringify(items)
    const x = gradeCalls(items)
    const y = gradeCalls(items)
    eq('twice the same, and the input is untouched', [stable(x) === stable(y), JSON.stringify(items) === before], [true, true])
    eq('a second call does not carry counts over from the first', [y.graded, y.population], [2, 2])
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
