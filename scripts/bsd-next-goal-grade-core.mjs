// Grade BSD's published next-goal calls against FIELD's own captured goal timelines. PURE: this file imports nothing, reads no
// file, no environment variable and no network, and returns counts. It is executed inside field-relay-nba's runner, in the same
// process as the BSD token, so it is kept unable to touch any of them; scripts/check-bsd-next-goal-grade-core.mjs asserts that
// of the source text, which is a tripwire against an accident and not a sandbox (code that is import()ed into a process can reach
// that process; what limits the risk is that the runner loads this file only from a full commit SHA that was reviewed).
//
// WHY. docs/CC-CMD-2026-11-22-bsd-next-goal-grade-against-field-timelines.md. The census
// (field-relay-nba docs/CC-CMD-2026-11-22-bsd-next-goal-ledger-census.md) found 370 of 1,746 ledger calls gradeable: a hit or miss,
// with a resolved_minute, on a match whose R2 capture saw full time or holds the resolving goal. This asks whether the vendor's
// `outcome` agrees with what FIELD's own record of the match says happened next.
//
// WHAT IT IS NOT. Not an independent grade: FIELD's captures and the vendor's ledger both come from BSD, and the census found
// the ledger's resolved_minute equal to a goal minute in the capture for 370 of 370. Agreement is therefore expected; a
// disagreement is the finding, and the tallies below say what kind. Not a verdict on probabilities (no Brier, no calibration).
//
// THE RULE, fixed before the first run (RULE_VERSION is bumped by any change to it or to the shape of what it returns):
//   For a call with side S, outcome O and score_at_call (a, b), k = a + b.
//   1. The capture's goal rows are read with their running scores (home_score, away_score after the goal). A capture lists its
//      incidents newest-first and two goals can share a minute, so goals are ordered by running total, never by position or
//      minute. If any goal row lacks a running score, or the totals are not exactly 1, 2, ..., n, the capture is not trusted:
//      every call on it is "not applicable" under a named reason. There is no fallback to minute order.
//   2. The resolving goal is the goal with running total k + 1. The capture's score before it must equal score_at_call;
//      otherwise the call is not applicable (the join between the ledger and the capture is not what the rule assumes).
//   3. FIELD's side is the side whose running score rose by exactly one on that goal. The score is used, not `is_home`: the
//      relay's contract and the committed real examples say `is_home` marks the team credited with the goal, so the two are
//      expected to agree, and the score is the thing being graded. Their agreement is tallied (isHomeVersusScoreRise).
//   4. FIELD's verdict is "hit" if FIELD's side equals S, else "miss". The call AGREES when FIELD's verdict equals O.
// Every call lands in exactly one place: agree, disagree, or one named not-applicable reason. Nothing is dropped.
//
// WHAT THE ARTIFACT MUST LET A READER TELL APART (the review of 2026-11-23): a disagreement on a goal the vendor and FIELD both place
// at the same minute is one thing; a disagreement where the resolving goal is not at the ledger's resolved_minute is a join in doubt
// (a stale score_at_call, a VAR reversal), so agree and disagree are tallied BY that distance. Several calls can sit on one goal, so
// distinct goals are counted. The census's premises are counted here as well: calls with no minute, captures with two goals in one
// minute, captures whose minutes are not in total order, and whether the full-time row's score equals the last goal's.

export const RULE_VERSION = '2026-11-23.3'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null)
// tallies keyed by vendor-controlled text must not have a prototype: a key of '__proto__' would otherwise rewrite it
const tally = () => Object.create(null)
const bump = (o, k, n = 1) => { o[k] = (o[k] === undefined ? 0 : o[k]) + n }
const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/
const FULL_TIME = /^(ft|aet|ap|pen)/i
// a period row that says the match went past 90 minutes (real captures carry 'ET', a live 'Extra time' and 'PEN'): the full-time row's
// score is then the score at 90, not the last goal's, so it is not compared with it
const EXTENDED = /^(et|extra|pen)/i

export const REASONS = {
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
}

/**
 * One capture's goal rows, ordered by running total. `sequential` is false unless every goal row has both scores and the totals are
 * exactly 1..n. Also the diagnostics the premises need: two goals in one minute, minutes out of total order, the full-time row's score.
 */
export function readGoals (json) {
  const rows = isObj(json) && Array.isArray(json.incidents) ? json.incidents : null
  if (rows === null) return { ok: false }
  const goals = []
  let withoutScore = 0
  let final = null
  let live = null
  let extended = false
  for (const r of rows) {
    if (!isObj(r)) continue
    if (r.type === 'period') {
      if (typeof r.text === 'string' && EXTENDED.test(r.text)) extended = true
      if (live === null && r.is_live === true) {
        const lh = num(r.home_score)
        const la = num(r.away_score)
        if (lh !== null && la !== null) live = { home: lh, away: la }
      }
      if (final === null && r.is_live === false && typeof r.text === 'string' && FULL_TIME.test(r.text)) {
        const h = num(r.home_score)
        const a = num(r.away_score)
        if (h !== null && a !== null) final = { home: h, away: a }
      }
      continue
    }
    if (r.type !== 'goal') continue
    const home = num(r.home_score)
    const away = num(r.away_score)
    if (home === null || away === null) { withoutScore++; continue }
    goals.push({
      minute: num(r.minute),
      added: num(r.added_time),
      home,
      away,
      total: home + away,
      type: typeof r.goal_type === 'string' && GOAL_TYPE.test(r.goal_type) ? r.goal_type : typeof r.goal_type === 'string' ? '(other)' : '(none)',
      isHome: typeof r.is_home === 'boolean' ? r.is_home : null,
    })
  }
  goals.sort((x, y) => x.total - y.total)
  const sequential = withoutScore === 0 && goals.every((g, i) => g.total === i + 1)
  // a goal at the nominal 45 or 90 with added time is a different moment from one at the plain 45 or 90, so the clock of a goal is its
  // minute and its added time together (a tie is two goals at the same clock; out of order is a later total at an earlier clock)
  let twoInOneMinute = false
  let minuteOrderBroken = false
  const seen = new Set()
  let latest = null
  for (const g of goals) {
    if (g.minute === null) continue
    const clock = g.minute * 1000 + (g.added === null ? 0 : g.added)
    if (seen.has(clock)) twoInOneMinute = true
    seen.add(clock)
    if (latest !== null && clock < latest) minuteOrderBroken = true
    if (latest === null || clock > latest) latest = clock
  }
  return { ok: true, goals, withoutScore, sequential, final, live, extended, twoInOneMinute, minuteOrderBroken }
}

const lastScore = (parsed) => (parsed.goals.length === 0 ? { home: 0, away: 0 } : parsed.goals[parsed.goals.length - 1])

/** Does the full-time row's score equal the last goal's? Only said of a capture whose goal rows can be trusted and that did not go past 90. */
export function finalAgreement (parsed) {
  if (!parsed || !parsed.sequential) return 'not evaluated'
  if (parsed.extended) return 'not evaluated (extra time)'
  if (parsed.final === null) return 'no full-time score'
  const last = lastScore(parsed)
  return last.home === parsed.final.home && last.away === parsed.final.away ? 'matches' : 'differs'
}

/** The same question of a capture taken in play: does the live row's running score equal the last goal's? (The free test for the in-play captures.) */
export function liveAgreement (parsed) {
  if (!parsed || !parsed.sequential) return 'not evaluated'
  if (parsed.extended) return 'not evaluated (extra time)'
  if (parsed.live === null) return 'no live row score'
  const last = lastScore(parsed)
  return last.home === parsed.live.home && last.away === parsed.live.away ? 'matches' : 'differs'
}

/** One call against one parsed capture (readGoals). Returns { graded: false, reason } or { graded: true, ... }. */
export function gradeCall (call, parsed) {
  const side = isObj(call) ? call.side : undefined
  if (side !== 'home' && side !== 'away') return { graded: false, reason: REASONS.side }
  const sc = call.score_at_call
  const a = isObj(sc) ? count(sc.home) : null
  const b = isObj(sc) ? count(sc.away) : null
  if (a === null || b === null) return { graded: false, reason: REASONS.score }
  if (call.outcome !== 'hit' && call.outcome !== 'miss') return { graded: false, reason: REASONS.outcome }
  if (!parsed || !parsed.ok) return { graded: false, reason: REASONS.unreadable }
  if (parsed.withoutScore > 0) return { graded: false, reason: REASONS.noScore }
  if (!parsed.sequential) return { graded: false, reason: REASONS.sequence }
  const k = a + b
  const resolving = parsed.goals[k]
  if (resolving === undefined) return { graded: false, reason: REASONS.none }
  const prev = k === 0 ? { home: 0, away: 0 } : parsed.goals[k - 1]
  if (prev.home !== a || prev.away !== b) return { graded: false, reason: REASONS.join }
  const dh = resolving.home - prev.home
  const da = resolving.away - prev.away
  let fieldSide = null
  if (dh === 1 && da === 0) fieldSide = 'home'
  else if (dh === 0 && da === 1) fieldSide = 'away'
  if (fieldSide === null) return { graded: false, reason: REASONS.rise }
  const verdict = fieldSide === side ? 'hit' : 'miss'
  const rm = num(call.resolved_minute)
  return {
    graded: true,
    verdict,
    agree: verdict === call.outcome,
    k,
    goalType: resolving.type,
    isHomeAgreesWithRise: resolving.isHome === null ? null : resolving.isHome === (fieldSide === 'home'),
    distance: rm === null || resolving.minute === null ? null : Math.abs(resolving.minute - rm),
    stoppage: resolving.added !== null && resolving.added > 0,
  }
}

// a stoppage-time goal carries the nominal minute (45 or 90) and an added_time, so a far distance on one is not read as a wrong goal
const bucket = (d, stoppage) => (d === null ? 'no minute' : d >= 3 ? (stoppage ? '3+ stoppage' : '3+') : String(d))

/**
 * items: [{ call, capture, key, tags }] where `capture` is an incidents.json body, `key` an opaque id for counting distinct
 * captures (it is never returned; an item with no string or number key is its own capture), and `tags` a flat object of labels
 * (for example { slug, state }) tallied for agreement. Returns counts only.
 */
export function gradeCalls (items) {
  const list = Array.isArray(items) ? items : []
  const parsedByKey = new Map()
  const keyOf = (it) => (typeof it.key === 'string' || typeof it.key === 'number' ? it.key : it.capture)
  const parsedOf = (it) => {
    const k = keyOf(it)
    if (!parsedByKey.has(k)) parsedByKey.set(k, readGoals(it.capture))
    return parsedByKey.get(k)
  }
  const goalsSeen = new Map()
  const out = {
    ruleVersion: RULE_VERSION,
    population: list.length,
    graded: 0,
    agree: 0,
    disagree: 0,
    notApplicable: { total: 0, byReason: tally(), byTagAndReason: tally() },
    confusion: tally(),
    byLedgerOutcome: tally(),
    resolvingGoalType: tally(),
    isHomeVersusScoreRise: { agrees: 0, disagrees: 0, absent: 0 },
    resolvedMinuteDistance: tally(),
    distinctGoals: { graded: 0, withADisagreeingCall: 0 },
    stoppageResolvingGoals: { graded: 0, agree: 0, disagree: 0 },
    byTag: tally(),
    premises: {
      callsWithoutSideOrScore: 0,
      callsWithoutACallMinute: 0,
      callsOnCapturesWithAGoalRowLackingAScore: 0,
      callsOnCapturesWhoseTotalsAreNotOneToN: 0,
      callsWhoseScoreAtCallDisagreesWithTheCapture: 0,
      distinctCaptures: 0,
      distinctCapturesWithAGoalRowLackingAScore: 0,
      distinctCapturesWhoseTotalsAreNotOneToN: 0,
      distinctCapturesWithTwoGoalsInOneMinute: 0,
      distinctCapturesWhoseMinuteOrderIsNotTotalOrder: 0,
      fullTimeScoreVersusLastGoal: { calls: tally(), distinctCaptures: tally() },
      liveRowScoreVersusLastGoal: { calls: tally(), distinctCaptures: tally() },
    },
  }
  for (const it of list) {
    if (!isObj(it)) {
      out.notApplicable.total++
      bump(out.notApplicable.byReason, REASONS.item)
      continue
    }
    const parsed = parsedOf(it)
    const r = gradeCall(it.call, parsed)
    const tags = isObj(it.tags) ? it.tags : {}
    const cell = (name, value) => {
      if (out.byTag[name] === undefined) out.byTag[name] = tally()
      const t = String(value)
      if (out.byTag[name][t] === undefined) out.byTag[name][t] = { graded: 0, agree: 0, disagree: 0, notApplicable: 0 }
      return out.byTag[name][t]
    }
    if (isObj(it.call) && num(it.call.minute) === null) out.premises.callsWithoutACallMinute++
    bump(out.premises.fullTimeScoreVersusLastGoal.calls, finalAgreement(parsed))
    bump(out.premises.liveRowScoreVersusLastGoal.calls, liveAgreement(parsed))
    if (!r.graded) {
      out.notApplicable.total++
      bump(out.notApplicable.byReason, r.reason)
      for (const name of Object.keys(tags)) {
        cell(name, tags[name]).notApplicable++
        if (out.notApplicable.byTagAndReason[name] === undefined) out.notApplicable.byTagAndReason[name] = tally()
        const t = String(tags[name])
        if (out.notApplicable.byTagAndReason[name][t] === undefined) out.notApplicable.byTagAndReason[name][t] = tally()
        bump(out.notApplicable.byTagAndReason[name][t], r.reason)
      }
      if (r.reason === REASONS.side || r.reason === REASONS.score) out.premises.callsWithoutSideOrScore++
      if (r.reason === REASONS.noScore) out.premises.callsOnCapturesWithAGoalRowLackingAScore++
      if (r.reason === REASONS.sequence) out.premises.callsOnCapturesWhoseTotalsAreNotOneToN++
      if (r.reason === REASONS.join) out.premises.callsWhoseScoreAtCallDisagreesWithTheCapture++
      continue
    }
    out.graded++
    if (r.agree) out.agree++
    else out.disagree++
    bump(out.confusion, `ledger ${it.call.outcome}, FIELD ${r.verdict}`)
    if (out.byLedgerOutcome[it.call.outcome] === undefined) out.byLedgerOutcome[it.call.outcome] = { graded: 0, agree: 0, disagree: 0 }
    out.byLedgerOutcome[it.call.outcome].graded++
    out.byLedgerOutcome[it.call.outcome][r.agree ? 'agree' : 'disagree']++
    if (out.resolvingGoalType[r.goalType] === undefined) out.resolvingGoalType[r.goalType] = { graded: 0, agree: 0, disagree: 0 }
    out.resolvingGoalType[r.goalType].graded++
    out.resolvingGoalType[r.goalType][r.agree ? 'agree' : 'disagree']++
    if (r.isHomeAgreesWithRise === null) out.isHomeVersusScoreRise.absent++
    else if (r.isHomeAgreesWithRise) out.isHomeVersusScoreRise.agrees++
    else out.isHomeVersusScoreRise.disagrees++
    if (r.stoppage) {
      out.stoppageResolvingGoals.graded++
      out.stoppageResolvingGoals[r.agree ? 'agree' : 'disagree']++
    }
    const b = bucket(r.distance, r.stoppage)
    if (out.resolvedMinuteDistance[b] === undefined) out.resolvedMinuteDistance[b] = { graded: 0, agree: 0, disagree: 0 }
    out.resolvedMinuteDistance[b].graded++
    out.resolvedMinuteDistance[b][r.agree ? 'agree' : 'disagree']++
    const gk = keyOf(it)
    if (!goalsSeen.has(gk)) goalsSeen.set(gk, new Map())
    goalsSeen.get(gk).set(r.k, goalsSeen.get(gk).get(r.k) === true || !r.agree)
    for (const name of Object.keys(tags)) {
      const c = cell(name, tags[name])
      c.graded++
      c[r.agree ? 'agree' : 'disagree']++
    }
  }
  for (const byGoal of goalsSeen.values()) {
    for (const anyDisagreement of byGoal.values()) {
      out.distinctGoals.graded++
      if (anyDisagreement) out.distinctGoals.withADisagreeingCall++
    }
  }
  out.premises.distinctCaptures = parsedByKey.size
  for (const p of parsedByKey.values()) {
    bump(out.premises.fullTimeScoreVersusLastGoal.distinctCaptures, finalAgreement(p))
    bump(out.premises.liveRowScoreVersusLastGoal.distinctCaptures, liveAgreement(p))
    if (!p.ok) continue
    if (p.withoutScore > 0) out.premises.distinctCapturesWithAGoalRowLackingAScore++
    else if (!p.sequential) out.premises.distinctCapturesWhoseTotalsAreNotOneToN++
    if (p.twoInOneMinute) out.premises.distinctCapturesWithTwoGoalsInOneMinute++
    if (p.minuteOrderBroken) out.premises.distinctCapturesWhoseMinuteOrderIsNotTotalOrder++
  }
  return out
}

/** The one line a reader sees first, with every denominator (Rule 91). */
export function coverageLine (grade, census) {
  const c = isObj(census) ? census : {}
  const exact = grade.resolvedMinuteDistance['0'] === undefined ? 0 : grade.resolvedMinuteDistance['0'].graded
  return `graded ${grade.graded} of ${grade.population} gradeable calls (census: ${c.gradeable === undefined ? 'n/a' : c.gradeable} gradeable of ${c.uniqueCalls === undefined ? 'n/a' : c.uniqueCalls}) | agree ${grade.agree}, disagree ${grade.disagree}, not applicable ${grade.notApplicable.total} | resolving goal at the ledger's resolved_minute for ${exact} of ${grade.graded} graded | rule ${grade.ruleVersion}`
}
