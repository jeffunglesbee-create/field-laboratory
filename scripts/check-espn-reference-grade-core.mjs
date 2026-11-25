#!/usr/bin/env node
// Check for scripts/espn-reference-grade-core.mjs. Every expected value is derived BY HAND from the rule in that file's header, on synthetic
// ESPN-shaped payloads written from the field names Task 0 recorded (field-relay-nba outbox/espn-task0-2026-11-24T17-14-03-855Z.json and the
// anchored run of 2026-08-30): scoringPlay, shootout, ownGoal, team.id, clock.value (seconds), clock.displayValue ("29'" or "90'+2'").
// Exit 1 and a FAIL line on any difference; scripts/mutate-espn-reference-grade-core.mjs proves each assertion can fail.
// Nothing is exported: a check that exits on import must not export (the laboratory's import-purity gate).
// `--self-test` is accepted and changes nothing: it is the form the mutation harness starts this file in, from a copy outside the repo, because scripts/mutate-copy-check.mjs
// proves a harness's control by making every `--self-test` process started there fail or fall silent. CORE_FILE names the core to read (the harness's mutant).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const SRC = process.env.CORE_FILE !== undefined && process.env.CORE_FILE !== '' ? process.env.CORE_FILE : path.join(dir, 'espn-reference-grade-core.mjs')
const core = await import(SRC)
const { timelineOf, bsdSidesOf, gradeAgainstEspn, coverageLine, REASONS, RULE_VERSION } = core

let n = 0
let bad = 0
const norm = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v))
function eq (name, actual, expected) {
  n++
  const a = JSON.stringify(norm(actual))
  const e = JSON.stringify(norm(expected))
  if (a !== e) { bad++; console.log(`FAIL ${name}\n  expected ${e}\n  actual   ${a}`) }
}

// ---- the file reads nothing and reaches for nothing (a tripwire against an accident, not a sandbox)
const text = fs.readFileSync(SRC, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
eq('purity: no import, require, process, fetch, Date, Math.random, eval, Function, globalThis', /\b(import|require|process|fetch|Date|eval|Function|globalThis|XMLHttpRequest|WebSocket)\b|Math\.random/.test(text), false)
eq('exports: exactly the names the runner and this check use', Object.keys(core).sort(), ['REASONS', 'RULE_VERSION', 'bsdSidesOf', 'coverageLine', 'gradeAgainstEspn', 'timelineOf'])

// ---- builders
const row = (team, display, value, o = {}) => ({ scoringPlay: true, shootout: false, ownGoal: false, penaltyKick: false, team: { id: team }, clock: { value, displayValue: display }, type: { text: 'Goal' }, ...o })
const comp = (h, a) => [{ id: 'H', homeAway: 'home', score: h }, { id: 'A', homeAway: 'away', score: a }]
const espn = (rows, h, a) => ({ rows, competitors: comp(h, a) })
const bsdOf = (goals, final, o = {}) => ({ ok: true, sequential: true, goals, final, extended: false, ...o })
const bg = (minute, home, away, added = null) => ({ minute, added, home, away })
const call = (side, outcome, a, b, rm) => ({ side, outcome, score_at_call: { home: a, away: b }, resolved_minute: rm })
const one = (m) => gradeAgainstEspn([m])
const reasonOfRows = (rows) => timelineOf(espn(rows, 1, 0)).reason
const row3 = [row('H', "10'", 590), row('A', "40'", 2390), row('H', "75'", 4490)]       // 2-1, in time order
const bsd3 = bsdOf([bg(10, 1, 0), bg(40, 1, 1), bg(75, 2, 1)], { home: 2, away: 1 })

// ---- timelineOf: reading ESPN's rows
let t = timelineOf(espn([row('H', "75'", 4490), row('A', "40'", 2390), row('H', "10'", 590)], 2, 1))
eq('timelineOf: ordered by the displayed clock, whatever the order of the rows', t.goals.map((g) => `${g.rowSide}${g.m}`), ['home10', 'away40', 'home75'])
eq('timelineOf: ok, the final score, no own goal so the convention is none', [t.ok, t.final, t.convention], [true, { home: 2, away: 1 }, 'none'])
t = timelineOf(espn([row('H', "90'+2'", 5400), row('A', "90'", 5390), row('H', "45'+1'", 2700)], 2, 1))
eq("timelineOf: 45'+1' comes before 90', and 90' before 90'+2' (whose clock.value is the same 5400 as a goal at 90:00)", t.goals.map((g) => `${g.m}+${g.a}`), ['45+1', '90+0', '90+2'])
eq("timelineOf: the displayed stoppage minute orders goals the numeric clock cannot (both are 5400 at the end of the half)", timelineOf(espn([row('H', "90'+3'", 5400), row('A', "90'+1'", 5400)], 1, 1)).goals.map((g) => g.a), [1, 3])
eq("timelineOf: 45'+1', 90' and 90'+2' are three different clocks, no tie", timelineOf(espn([row('H', "90'+2'", 5400), row('A', "90'", 5390), row('H', "45'+1'", 2700)], 2, 1)).goals.map((g) => g.tieNext), [false, false, false])
eq('timelineOf: a row that is not a scoring play (a card, say) is not a goal even with a team and a clock', timelineOf(espn([row('H', "10'", 590), { team: { id: 'A' }, clock: { value: 100, displayValue: "2'" }, type: { text: 'Yellow Card' } }], 1, 0)).goals.length, 1)
eq('timelineOf: a goal row with no team object is unreadable', reasonOfRows([{ scoringPlay: true, clock: { value: 1, displayValue: "1'" } }]), REASONS.unreadable)
t = timelineOf(espn([row('H', "45'+2'", 2820), row('A', "45'+2'", 2820)], 1, 1))
eq('timelineOf: two goals at one displayed clock are a tie, marked on the first', t.goals.map((g) => g.tieNext), [true, false])
t = timelineOf(espn([row('H', "10'", 590), row('H', "30'", 1790, { shootout: true }), row('A', "31'", 1850, { scoringPlay: false })], 1, 0))
eq('timelineOf: a shootout kick and a row that is not a scoring play are not goals', [t.ok, t.goals.length], [true, 1])
t = timelineOf(espn([row('H', "10'", 590, { shootout: undefined })], 1, 0))
eq('timelineOf: an absent shootout flag is not a shootout', [t.ok, t.goals.length], [true, 1])
const reasonOf = (e) => timelineOf(e).reason
eq('timelineOf: three competitors', reasonOf({ rows: [], competitors: [...comp(0, 0), { id: 'X', homeAway: 'home', score: 0 }] }), REASONS.competitors)
eq('timelineOf: two homes', reasonOf({ rows: [], competitors: [{ id: 'H', homeAway: 'home', score: 0 }, { id: 'A', homeAway: 'home', score: 0 }] }), REASONS.competitors)
eq('timelineOf: the same id twice', reasonOf({ rows: [], competitors: [{ id: 'H', homeAway: 'home', score: 0 }, { id: 'H', homeAway: 'away', score: 0 }] }), REASONS.competitors)
eq('timelineOf: a fractional score', reasonOf({ rows: [], competitors: comp(1.5, 0) }), REASONS.competitors)
eq('timelineOf: a competitor without an id', reasonOf({ rows: [], competitors: [{ id: '', homeAway: 'home', score: 0 }, { id: 'A', homeAway: 'away', score: 0 }] }), REASONS.competitors)
eq('timelineOf: rows that are not a list', reasonOf({ rows: 'x', competitors: comp(0, 0) }), REASONS.unreadable)
eq('timelineOf: a goal whose team is not a competitor', reasonOf(espn([row('X', "10'", 590)], 1, 0)), REASONS.unreadable)
eq('timelineOf: a goal with no clock', reasonOf(espn([{ ...row('H', "10'", 590), clock: undefined }], 1, 0)), REASONS.unreadable)
eq("timelineOf: a clock that is not M' or M'+A'", [reasonOf(espn([row('H', '10', 590)], 1, 0)), reasonOf(espn([row('H', "10' +2'", 590)], 1, 0)), reasonOf(espn([row('H', 'Goal by X', 590)], 1, 0))], [REASONS.unreadable, REASONS.unreadable, REASONS.unreadable])
eq('timelineOf: fewer goal rows than the score', reasonOf(espn([row('H', "10'", 590)], 2, 1)), REASONS.count)
eq('timelineOf: more goal rows than the score', reasonOf(espn([row('H', "10'", 590), row('A', "20'", 1190)], 1, 0)), REASONS.count)
eq('timelineOf: the right number of goals on the wrong sides', reasonOf(espn([row('H', "10'", 590), row('H', "20'", 1190), row('H', "30'", 1790)], 2, 1)), REASONS.sides)
eq('timelineOf: null, and a non-object', [timelineOf(null).reason, timelineOf(7).reason], [REASONS.competitors, REASONS.competitors])

// ---- the own-goal convention, fitted to ESPN's own final score
t = timelineOf(espn([row('H', "10'", 590), row('A', "50'", 2990, { ownGoal: true })], 2, 0))
eq("convention 'opposite': the row's team is the side that conceded; the goal is credited to the other; the final 2-0 is reproduced", [t.convention, t.goals.map((g) => g.side)], ['opposite', ['home', 'home']])
t = timelineOf(espn([row('H', "20'", 1190, { ownGoal: true })], 1, 0))
eq("convention 'same': the row's team is the side credited, and 1-0 is reproduced", [t.convention, t.goals[0].side], ['same', 'home'])
t = timelineOf(espn([row('A', "10'", 590, { ownGoal: true }), row('H', "20'", 1190, { ownGoal: true })], 1, 1))
eq("convention 'ambiguous': both fit a 1-1, so an own goal's side is not known", [t.ok, t.convention, t.goals.map((g) => g.side)], [true, 'ambiguous', [null, null]])
eq('convention: neither reproduces ESPN\'s final score', reasonOf(espn([row('H', "10'", 590), row('H', "20'", 1190, { ownGoal: true })], 0, 2)), REASONS.convention)
eq('convention: a normal goal is never flipped', timelineOf(espn([row('A', "10'", 590, { ownGoal: false })], 0, 1)).goals[0].side, 'away')

// ---- bsdSidesOf: the first grade's parsed capture, as sides
eq('bsdSidesOf: sides from the running score; the minute is the minute plus the added time', bsdSidesOf(bsdOf([bg(45, 1, 0, 2), bg(60, 1, 1)], { home: 1, away: 1 })), { goals: [{ side: 'home', minute: 47, nominal: 45 }, { side: 'away', minute: 60, nominal: 60 }], final: { home: 1, away: 1 }, extended: false })
eq('bsdSidesOf: a capture that is not sequential, or not ok, or not an object', [bsdSidesOf({ ...bsd3, sequential: false }), bsdSidesOf({ ok: false }), bsdSidesOf(null)], [null, null, null])
eq('bsdSidesOf: a goal that moves a score by two is not read', bsdSidesOf(bsdOf([bg(10, 2, 0)], null)), null)
eq('bsdSidesOf: a goal that moves neither score is not read', bsdSidesOf(bsdOf([bg(10, 0, 0)], null)), null)
eq('bsdSidesOf: an absent minute stays absent, and the extra-time flag is carried', bsdSidesOf(bsdOf([{ minute: null, added: null, home: 1, away: 0 }], null, { extended: true })), { goals: [{ side: 'home', minute: null, nominal: null }], final: null, extended: true })

// ---- one match, graded: the rule, call by call
const base = { key: 'm1', slug: 'epl', reach: { reached: true, reason: null }, espn: espn(row3, 2, 1), bsd: bsd3 }
const calls = [
  call('home', 'hit', 0, 0, 10),    // k=0: the first goal is home's: hit; the ledger says hit: AGREE, distance 0
  call('away', 'hit', 0, 0, 13),    // verdict miss, the ledger says hit: DISAGREE, distance 3
  call('away', 'hit', 1, 0, 41),    // k=1: away's goal: hit: AGREE, distance 1
  call('home', 'miss', 1, 1, 75),   // k=2: home's goal: verdict hit, the ledger says miss: DISAGREE, distance 0
  call('home', 'hit', 2, 1, 80),    // k=3: ESPN has no fourth goal
  call('home', 'hit', 0, 1, 20),    // ESPN's score before its second goal is 1-0, not 0-1: the join fails
  call('left', 'hit', 0, 0, 10),    // no home or away side
  { side: 'home', outcome: 'hit', resolved_minute: 10 },   // no score_at_call
  call('home', 'open', 0, 0, null), // not hit or miss
]
let g = one({ ...base, calls })
eq('a match: 9 calls, 4 graded (2 agree, 2 disagree), 5 not applicable', [g.population, g.graded, g.agree, g.disagree, g.notApplicable.total], [9, 4, 2, 2, 5])
eq('a match: each not-applicable call under its own named reason', g.notApplicable.byReason, { [REASONS.none]: 1, [REASONS.join]: 1, [REASONS.side]: 1, [REASONS.score]: 1, [REASONS.outcome]: 1 })
eq('a match: agreement by the distance between ESPN\'s goal and the ledger\'s resolved_minute', g.distance, { 'agree @ 0': 1, 'disagree @ 3+': 1, 'agree @ 1': 1, 'disagree @ 0': 1 })
eq('a match: the BSD capture places the same side and minute on each of those goals', g.agreeByBsdOnGoal, { 'agree / BSD agrees with ESPN': 2, 'disagree / BSD agrees with ESPN': 2 })
eq('a match: step A, identical; the guard, equal; the convention, none', [g.stepA.matchesCompared, g.stepA.identical, g.finalGuard, g.conventions], [1, 1, { equal: 1 }, { none: 1 }])
eq('a match: every call placed exactly once', g.partitions, true)
eq('a match: by directory', g.bySlug, { epl: { calls: 9, graded: 4, agree: 2, disagree: 2, notApplicable: 5 } })

// ---- not reached, and no timeline
g = one({ key: 'm2', slug: 'eflchamp', reach: { reached: false, reason: 'eflchamp: no archive rows' }, espn: null, bsd: null, calls: [call('home', 'hit', 0, 0, 5), call('away', 'miss', 0, 0, 6)] })
eq('a match with no ESPN id: every call is not applicable, under the reach reason', [g.graded, g.notApplicable.byReason, g.matchesByOutcome], [0, { 'no ESPN id for the match: eflchamp: no archive rows': 2 }, { 'no ESPN id for the match': 1 }])
g = one({ ...base, reach: { reached: false, reason: '__proto__' } , calls: [call('home', 'hit', 0, 0, 5)] })
eq('a reach reason that could rewrite a prototype is pooled and the prototype is untouched', [g.notApplicable.byReason, Object.getPrototypeOf(g.notApplicable.byReason)], [{ 'no ESPN id for the match: (other)': 1 }, null])
g = one({ ...base, reach: undefined, calls: [call('home', 'hit', 0, 0, 5)] })
eq('a match with no reach record is not reached', g.notApplicable.byReason, { 'no ESPN id for the match: (other)': 1 })
g = one({ ...base, espn: null, calls: [call('home', 'hit', 0, 0, 5)] })
eq('a reached match with no ESPN timeline', [g.notApplicable.byReason, g.matchesByOutcome], [{ [REASONS.noTimeline]: 1 }, { 'no ESPN timeline': 1 }])
g = one({ ...base, espn: { rows: row3, competitors: [] }, calls: [call('home', 'hit', 0, 0, 5)] })
eq('an ESPN payload that cannot be read: the reason from timelineOf, every call', [g.notApplicable.byReason, g.matchesByOutcome], [{ [REASONS.competitors]: 1 }, { 'ESPN timeline unusable': 1 }])
g = one({ ...base, espn: espn([row('X', "10'", 590)], 1, 0), calls: [call('home', 'hit', 0, 0, 5), call('home', 'hit', 0, 0, 5)] })
eq('an unreadable goal row makes every call on the match not applicable', g.notApplicable.byReason, { [REASONS.unreadable]: 2 })
g = one('not an object')
eq('a match that is not an object is one call not applicable, and the run still partitions', [g.population, g.notApplicable.byReason, g.partitions], [1, { [REASONS.item]: 1 }, true])
g = gradeAgainstEspn(null)
eq('no matches at all', [g.matches, g.population, g.partitions], [0, 0, true])

// ---- the guard against the wrong match
g = one({ ...base, bsd: bsdOf([bg(10, 1, 0), bg(40, 1, 1), bg(75, 2, 1), bg(88, 2, 2)], { home: 2, away: 2 }), calls: [call('home', 'hit', 0, 0, 10), call('home', 'hit', 1, 1, 75)] })
eq('ESPN 2-1 against a full-time capture of 2-2: every call on the match is not applicable, and nothing is graded', [g.graded, g.notApplicable.byReason, g.finalGuard], [0, { [REASONS.finalDiffers]: 2 }, { differs: 1 }])
g = one({ ...base, bsd: bsdOf([bg(10, 1, 0), bg(40, 1, 1), bg(75, 2, 1), bg(110, 2, 2)], { home: 1, away: 1 }, { extended: true }), calls: [call('home', 'hit', 0, 0, 10)] })
eq('an extra-time capture is not compared, and is counted as not compared', [g.graded, g.finalGuard], [1, { 'not compared (extra time)': 1 }])
g = one({ ...base, bsd: bsdOf([bg(10, 1, 0)], null), calls: [call('home', 'hit', 0, 0, 10)] })
eq('a capture with no full-time row is not compared, and is counted', [g.graded, g.finalGuard], [1, { 'not compared (no full-time row)': 1 }])
g = one({ ...base, bsd: null, calls: [call('home', 'hit', 0, 0, 10)] })
eq('no capture: graded on ESPN alone, with the guard and the step A comparison both absent', [g.graded, g.finalGuard, g.stepA.matchesCompared, g.agreeByBsdOnGoal], [1, { 'no trusted capture': 1 }, 0, { 'agree / no capture to compare': 1 }])
g = one({ ...base, bsd: { ...bsd3, sequential: false }, calls: [call('home', 'hit', 0, 0, 10)] })
eq('a capture that cannot be trusted is no capture', g.finalGuard, { 'no trusted capture': 1 })

// ---- the capture's own place on the goal that resolved the call (step A, on that very goal)
g = one({ ...base, bsd: bsdOf([bg(10, 1, 0), bg(40, 1, 1)], null), calls: [call('home', 'hit', 1, 1, 75)] })
eq('a capture taken in play has no goal at that position: said so, not read as agreement or difference', g.agreeByBsdOnGoal, { 'agree / BSD has no goal there': 1 })
g = one({ ...base, bsd: bsdOf([bg(10, 1, 0), bg(40, 1, 1), bg(77, 2, 1)], { home: 2, away: 1 }), calls: [call('home', 'miss', 1, 1, 75)] })
eq('BSD two minutes from ESPN on the resolving goal differs', g.agreeByBsdOnGoal, { 'disagree / BSD differs from ESPN': 1 })
g = one({ ...base, bsd: bsdOf([bg(10, 1, 0), bg(40, 1, 1), bg(76, 2, 1)], { home: 2, away: 1 }), calls: [call('home', 'miss', 1, 1, 75)] })
eq('BSD one minute from ESPN on the resolving goal agrees', g.agreeByBsdOnGoal, { 'disagree / BSD agrees with ESPN': 1 })
g = one({ ...base, bsd: bsdOf([bg(10, 1, 0), bg(40, 2, 0), bg(75, 2, 1)], { home: 2, away: 1 }), calls: [call('away', 'hit', 1, 0, 40)] })
eq('BSD puts the other side on that goal, at the same minute: it differs', g.agreeByBsdOnGoal, { 'agree / BSD differs from ESPN': 1 })
g = one({ ...base, bsd: null, calls: [call('home', 'hit', 0, 0, null)] })
eq('a call with no resolved_minute is graded, in its own distance bucket', [g.graded, g.distance], [1, { 'agree @ no minute': 1 }])
g = one({ ...base, slug: '__proto__', calls: [call('home', 'hit', 0, 0, 10)] })
eq('a directory label that could rewrite a prototype is pooled', [Object.keys(g.bySlug), Object.getPrototypeOf(g.bySlug)], [['(other)'], null])
g = one({ key: 'm5', slug: 'epl', reach: { reached: true, reason: null }, bsd: null, espn: espn([row('A', "10'", 590, { ownGoal: true }), row('H', "20'", 1190, { ownGoal: true }), row('H', "30'", 1790)], 2, 1), calls: [call('home', 'hit', 1, 1, 30)] })
eq('a normal goal after two ambiguous own goals: the score before it cannot be known, so the call is not applicable (never graded on a guess)', [g.graded, g.notApplicable.byReason, g.conventions], [0, { [REASONS.ownGoal]: 1 }, { ambiguous: 1 }])
eq("an ownGoal flag that is a string, not the boolean true, is not an own goal", timelineOf(espn([row('H', "10'", 590, { ownGoal: 'false' })], 1, 0)).convention, 'none')
eq('bsdSidesOf: not ok, with everything else right, is still not trusted', bsdSidesOf({ ok: false, sequential: true, goals: [bg(10, 1, 0)], final: null }), null)

// ---- stoppage, ties, shootouts
const stop = { key: 'm3', slug: 'seriea', reach: { reached: true, reason: null }, espn: espn([row('H', "90'+2'", 5400), ...Array.from({ length: 5 }, (_, i) => row(i % 2 ? 'H' : 'A', "120'", 7200 + i, { shootout: true }))], 1, 0), bsd: null }
g = one({ ...stop, calls: [call('home', 'hit', 0, 0, 80), call('home', 'hit', 0, 0, 90)] })
eq("a goal at 90'+2' against a resolved_minute of 80 is a stoppage distance, against 90 it is 0; the five shootout kicks are not goals", [g.graded, g.distance], [2, { 'agree @ 3+ stoppage': 1, 'agree @ 0': 1 }])
g = one({ ...base, bsd: null, espn: espn([row('H', "45'+1'", 2760), row('A', "45'+1'", 2760)], 1, 1), calls: [call('home', 'hit', 0, 0, 46), call('home', 'hit', 1, 0, 46)] })
eq('two goals at one displayed clock: the resolving goal is tied with its neighbour, whichever side it is on', [g.graded, g.notApplicable.byReason], [0, { [REASONS.tie]: 2 }])
g = one({ ...base, espn: espn([row('H', "10'", 590), row('A', "30'", 1790), row('H', "30'", 1790)], 2, 1), bsd: null, calls: [call('home', 'hit', 0, 0, 10), call('away', 'hit', 2, 1, 30)] })
eq('a tie two goals after the resolving one does not matter; a tie as the resolving goal and the one before it does', [g.graded, g.agree], [1, 1])
g = one({ ...base, espn: espn([row('H', "10'", 590), row('A', "30'", 1790), row('H', "30'", 1790)], 2, 1), bsd: null, calls: [call('home', 'hit', 1, 0, 30)] })
eq('the resolving goal tied with the next one is not applicable', g.notApplicable.byReason, { [REASONS.tie]: 1 })

// ---- own goals through the call
const ogBase = { key: 'm4', slug: 'epl', reach: { reached: true, reason: null }, bsd: bsdOf([bg(10, 1, 0), bg(50, 2, 0)], { home: 2, away: 0 }) }
g = one({ ...ogBase, espn: espn([row('H', "10'", 590), row('A', "50'", 2990, { ownGoal: true })], 2, 0), calls: [call('home', 'hit', 1, 0, 50)] })
eq("an own goal under the 'opposite' convention resolves to the beneficiary, and a call on that side is a hit", [g.graded, g.agree, g.conventions], [1, 1, { opposite: 1 }])
eq("E3: the ESPN own-goal row's team is the OTHER side from the one the capture credits, once", g.stepA.ownGoalRowTeam, { 'is the other side': 1 })
g = one({ ...ogBase, bsd: bsdOf([bg(20, 1, 0)], { home: 1, away: 0 }), espn: espn([row('H', "20'", 1190, { ownGoal: true })], 1, 0), calls: [call('home', 'hit', 0, 0, 20)] })
eq("under the 'same' convention the row's own team is credited: E3 says it IS the side the capture credits", [g.conventions, g.stepA.ownGoalRowTeam], [{ same: 1 }, { 'is the side BSD credits': 1 }])
g = one({ ...ogBase, bsd: null, espn: espn([row('A', "10'", 590, { ownGoal: true }), row('H', "20'", 1190, { ownGoal: true })], 1, 1), calls: [call('home', 'hit', 0, 0, 10), call('home', 'hit', 1, 0, 20)] })
eq('an ambiguous own goal, as the resolving goal and before it, is not applicable and never guessed', [g.graded, g.notApplicable.byReason, g.conventions], [0, { [REASONS.ownGoal]: 2 }, { ambiguous: 1 }])
g = one({ ...ogBase, bsd: null, espn: espn([row('A', "10'", 590, { ownGoal: true }), row('H', "20'", 1190, { ownGoal: true })], 1, 1), calls: [call('home', 'hit', 5, 5, 20)] })
eq("a join that cannot be evaluated because an earlier own goal is ambiguous is the own-goal reason, not a pass", g.notApplicable.byReason, { [REASONS.none]: 1 })

// ---- step A: the two sources against each other
const sa = (espnRows, h, a, bsd) => one({ key: 'x', slug: 'epl', reach: { reached: true, reason: null }, espn: espn(espnRows, h, a), bsd, calls: [] }).stepA
eq('step A: a different number of goals', sa(row3, 2, 1, bsdOf([bg(10, 1, 0), bg(40, 1, 1)], null)), { matchesCompared: 1, identical: 0, differentInNumber: 1, differentInOrder: 0, differentInMinute: 0, ownGoalRowTeam: {} })
eq('step A: the same number, a different order of sides', sa(row3, 2, 1, bsdOf([bg(10, 1, 0), bg(40, 2, 0), bg(75, 2, 1)], null)).differentInOrder, 1)
eq('step A: the same sides, one minute off by two', [sa(row3, 2, 1, bsdOf([bg(10, 1, 0), bg(40, 1, 1), bg(78, 2, 1)], null)).differentInMinute, sa(row3, 2, 1, bsdOf([bg(11, 1, 0), bg(39, 1, 1), bg(76, 2, 1)], null)).identical], [1, 1])
eq('step A: a minute two off is a difference, one off is not', [sa(row3, 2, 1, bsdOf([bg(10, 1, 0), bg(40, 1, 1), bg(77, 2, 1)], null)).differentInMinute, sa(row3, 2, 1, bsdOf([bg(10, 1, 0), bg(40, 1, 1), bg(76, 2, 1)], null)).identical], [1, 1])
eq('step A: ambiguous own goals have no side to agree with: the order differs, it is not read as identical', sa([row('A', "10'", 590, { ownGoal: true }), row('H', "20'", 1190, { ownGoal: true })], 1, 1, bsdOf([bg(10, 0, 1), bg(20, 1, 1)], null)).differentInOrder, 1)
eq("step A: ESPN's 90'+2' is the capture's 90 plus 2 added minutes", sa([row('H', "90'+2'", 5400)], 1, 0, bsdOf([bg(90, 1, 0, 2)], null)).identical, 1)
eq('step A: a capture goal with no minute cannot match a minute', sa(row3, 2, 1, bsdOf([{ minute: null, added: null, home: 1, away: 0 }, bg(40, 1, 1), bg(75, 2, 1)], null)).differentInMinute, 1)

// ---- the whole run
const all = gradeAgainstEspn([{ ...base, calls }, { key: 'm2', slug: 'eflchamp', reach: { reached: false, reason: 'eflchamp: no archive rows' }, espn: null, bsd: null, calls: [call('home', 'hit', 0, 0, 5), call('away', 'miss', 0, 0, 6)] }, { ...ogBase, espn: espn([row('H', "10'", 590), row('A', "50'", 2990, { ownGoal: true })], 2, 0), calls: [call('home', 'hit', 1, 0, 50)] }])
eq('the run: 3 matches, 12 calls, 5 graded, 7 not applicable, partitioned', [all.matches, all.population, all.graded, all.notApplicable.total, all.partitions], [3, 12, 5, 7, true])
eq('the run: by directory', all.bySlug, { epl: { calls: 10, graded: 5, agree: 3, disagree: 2, notApplicable: 5 }, eflchamp: { calls: 2, graded: 0, agree: 0, disagree: 0, notApplicable: 2 } })
eq('the run: the coverage line carries every denominator', coverageLine(all).includes('graded 5 of 12 calls on 3 matches') && coverageLine(all).includes('not applicable 7') && coverageLine(all).includes('step A on 2 matches') && coverageLine(all).includes(RULE_VERSION), true)
eq('the run: the rule version is a dated string', /^\d{4}-\d{2}-\d{2}\.\d+$/.test(RULE_VERSION), true)

console.log(bad === 0 ? `ok ${n} assertions` : `${bad} of ${n} assertions FAILED`)
process.exit(bad === 0 ? 0 : 1)
