// Grade BSD's published next-goal calls against a goal timeline that does NOT come from BSD: ESPN's. PURE: this file imports nothing, reads no
// file, no environment variable and no network, and returns counts. It is executed inside field-relay-nba's runner, in the same process as the
// BSD token, so it is kept unable to touch any of them; scripts/check-espn-reference-grade-core.mjs asserts that of the source text, which is a
// tripwire against an accident and not a sandbox (code import()ed into a process can reach that process; what limits the risk is that the
// runner loads this file only from a full commit SHA that was reviewed).
//
// WHY. docs/CC-CMD-2026-11-23-bsd-next-goal-independent-reference.md. The first grade (CC-CMD-2026-11-22) found 372 of 372 gradeable calls agree
// with FIELD's own captured goal timelines, and said what that is worth: FIELD's captures and the vendor's ledger are both BSD, so agreement is
// one feed read twice. This asks whether the vendor's `outcome` is TRUE, against a second vendor's record of the same match.
//
// WHAT COMES IN (per match; the runner builds it; nothing here is fetched):
//   reach  { reached: boolean, reason: string|null }   did the relay's archive rows give this match exactly one ESPN id (Task 0's E2)
//   espn   null | { rows: [...], competitors: [{ id, homeAway, score }] }   ESPN's goal list (the rows of `scoreboard.competitions[0].details`,
//          read as the Task 0 manifest recorded them) and the event's two competitors; null when ESPN gave no timeline
//   bsd    null | the first grade's readGoals() of the match's incidents.json capture ({ ok, goals, sequential, final, extended, ... })
//   calls  [{ side, outcome, score_at_call: { home, away }, resolved_minute }]   the ledger's calls on the match
//   slug   the R2 directory label
//
// THE RULE, fixed before the first run (RULE_VERSION is bumped by any change to it or to the shape of what it returns):
//   ESPN's goals. A row is a goal when scoringPlay is true and shootout is not true (a shootout kick is not in the score). It needs a team id that is
//   one of the two competitors and a clock whose displayValue is `M'` or `M'+A'`. The goal count must equal ESPN's final score, and the sides must
//   add up to it, or the match has no usable timeline (a named reason, never a repair). Goals are ordered by (M, A); two goals at one (M, A) are a tie.
//   Own goals. ESPN's convention for whose `team.id` an own goal carries was NOT known when this was written (Task 0 saw none). It is not assumed:
//   a match's convention is the one that reproduces ESPN's own final score, 'opposite' (credited to the other side than the row's team) or 'same';
//   if both do, an own goal's side is ambiguous; if neither does, the match has no usable timeline. Which convention fits is TALLIED (E3).
//   The call. k = score_at_call's total. ESPN's resolving goal is its (k + 1)th. ESPN's score before it, from the first k goals, must equal
//   score_at_call (the join), else the call is not applicable. A tie at the resolving goal's position, or an own goal whose side is ambiguous, is
//   not applicable. The verdict is `hit` when the resolving goal's side equals the call's side, else `miss`; the call AGREES when it equals outcome.
//   The guard. If the capture is at full time and ESPN's final score differs from the capture's, every call on the match is not applicable (a
//   join to the wrong match); an extra-time capture or one with no full-time row is not compared, and that is counted.
// Every call lands in exactly one place: agree, disagree, or one named not-applicable reason. Nothing is dropped.
//
// STEP A (source against source, no call involved) is counted once per match with a usable ESPN timeline and a trusted capture: goals in number,
// in the order of their sides, and in minute (each within 1), and, for each ESPN own goal, whether its team id is the side BSD credits or the other.
// It says whether ESPN is independent enough to DISAGREE with BSD at all (E5): zero differences would mean the second source adds nothing.

export const RULE_VERSION = '2026-11-25.1'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
// tallies keyed by text from outside must not have a prototype: a key of '__proto__' would otherwise rewrite it
const tally = () => Object.create(null)
const bump = (o, k, n = 1) => { o[k] = (o[k] === undefined ? 0 : o[k]) + n }
const SAFE = /^[A-Za-z0-9][A-Za-z0-9 .'&+():,-]{0,79}$/
const safe = (v) => (typeof v === 'string' && SAFE.test(v) ? v : '(other)')
const DISPLAY = /^(\d{1,3})'(?:\+(\d{1,2})')?$/

export const REASONS = {
  item: 'the match is not an object',
  side: 'the ledger row has no home or away side',
  score: 'the ledger row has no whole-number score_at_call',
  outcome: 'the outcome is not hit or miss',
  noTimeline: 'the match has no ESPN timeline',
  competitors: 'ESPN gave no two competitors with a home and an away side',
  unreadable: 'a goal row in ESPN has no team that is a competitor, or no readable clock',
  count: "ESPN's goal list does not equal its final score in number",
  sides: "ESPN's goals by side do not add up to its final score",
  convention: "neither own-goal convention reproduces ESPN's final score",
  finalDiffers: "ESPN's final score differs from the capture's",
  none: 'ESPN lists no goal after the score at the call',
  join: "ESPN's score before that goal is not score_at_call",
  tie: 'two ESPN goals share one clock at the resolving goal',
  ownGoal: "an own goal at or before the resolving goal has a side ESPN's data leaves ambiguous",
}
const reachReason = (r) => `no ESPN id for the match: ${safe(isObj(r) ? r.reason : null)}`

/** ESPN's goals for one match, or { ok: false, reason }. Pure reading of the rows; no repair. */
export function timelineOf (espn) {
  const comp = isObj(espn) && Array.isArray(espn.competitors) ? espn.competitors : null
  if (comp === null || comp.length !== 2) return { ok: false, reason: REASONS.competitors }
  const byId = new Map()
  for (const c of comp) {
    if (!isObj(c) || typeof c.id !== 'string' || c.id === '' || (c.homeAway !== 'home' && c.homeAway !== 'away') || count(c.score) === null) return { ok: false, reason: REASONS.competitors }
    byId.set(c.id, c)
  }
  const home = comp.filter((c) => c.homeAway === 'home')
  const away = comp.filter((c) => c.homeAway === 'away')
  if (byId.size !== 2 || home.length !== 1 || away.length !== 1) return { ok: false, reason: REASONS.competitors }
  const final = { home: home[0].score, away: away[0].score }
  const rows = Array.isArray(espn.rows) ? espn.rows : null
  if (rows === null) return { ok: false, reason: REASONS.unreadable }
  const goals = []
  for (const r of rows) {
    if (!isObj(r) || r.scoringPlay !== true || r.shootout === true) continue
    const team = isObj(r.team) && typeof r.team.id === 'string' ? byId.get(r.team.id) : undefined
    const display = isObj(r.clock) && typeof r.clock.displayValue === 'string' ? DISPLAY.exec(r.clock.displayValue) : null
    if (team === undefined || display === null) return { ok: false, reason: REASONS.unreadable }
    goals.push({ m: Number(display[1]), a: display[2] === undefined ? 0 : Number(display[2]), v: num(isObj(r.clock) ? r.clock.value : null), rowSide: team.homeAway, own: r.ownGoal === true })
  }
  if (goals.length !== final.home + final.away) return { ok: false, reason: REASONS.count }
  const flip = (s) => (s === 'home' ? 'away' : 'home')
  const totals = (own) => {
    const t = { home: 0, away: 0 }
    for (const g of goals) t[g.own ? own(g.rowSide) : g.rowSide]++
    return t
  }
  const fits = (t) => t.home === final.home && t.away === final.away
  const opposite = fits(totals(flip))
  const same = fits(totals((s) => s))
  const hasOwn = goals.some((g) => g.own)
  if (!opposite && !same) return { ok: false, reason: hasOwn ? REASONS.convention : REASONS.sides }
  const convention = !hasOwn ? 'none' : opposite && same ? 'ambiguous' : opposite ? 'opposite' : 'same'
  for (const g of goals) g.side = !g.own ? g.rowSide : convention === 'opposite' ? flip(g.rowSide) : convention === 'same' ? g.rowSide : null
  goals.sort((x, y) => (x.m * 100 + x.a) - (y.m * 100 + y.a) || (x.v === null || y.v === null ? 0 : x.v - y.v))
  for (let i = 0; i < goals.length; i++) goals[i].tieNext = i + 1 < goals.length && goals[i].m === goals[i + 1].m && goals[i].a === goals[i + 1].a
  return { ok: true, goals, final, convention }
}

/** BSD's goals as sides, read from the first grade's parsed capture; null when the capture cannot be trusted or a goal does not move one score by one. */
export function bsdSidesOf (bsd) {
  if (!isObj(bsd) || bsd.ok !== true || bsd.sequential !== true || !Array.isArray(bsd.goals)) return null
  let prev = { home: 0, away: 0 }
  const out = []
  for (const g of bsd.goals) {
    const dh = g.home - prev.home
    const da = g.away - prev.away
    const side = dh === 1 && da === 0 ? 'home' : dh === 0 && da === 1 ? 'away' : null
    if (side === null) return null
    out.push({ side, minute: num(g.minute) === null ? null : g.minute + (num(g.added) === null ? 0 : g.added), nominal: num(g.minute) })
    prev = { home: g.home, away: g.away }
  }
  return { goals: out, final: isObj(bsd.final) ? bsd.final : null, extended: bsd.extended === true }
}

const bucket = (d, stoppage) => (d === null ? 'no minute' : d >= 3 ? (stoppage ? '3+ stoppage' : '3+') : String(d))

/** Step A for one match: ESPN's timeline against BSD's. Counted into `a`. */
function stepA (tl, bsd, a) {
  a.matchesCompared++
  const e = tl.goals
  const b = bsd.goals
  if (e.length !== b.length) { a.differentInNumber++; return }
  const sameSides = e.every((g, i) => g.side === null ? false : g.side === b[i].side)
  const sameMinutes = e.every((g, i) => b[i].minute !== null && Math.abs((g.m + g.a) - b[i].minute) <= 1)
  if (!sameSides) a.differentInOrder++
  else if (!sameMinutes) a.differentInMinute++
  else a.identical++
  // E3: for each ESPN own goal, is its team id the side BSD credits (so ESPN credits the beneficiary) or the other
  for (let i = 0; i < e.length; i++) {
    if (!e[i].own) continue
    bump(a.ownGoalRowTeam, e[i].rowSide === b[i].side ? 'is the side BSD credits' : 'is the other side')
  }
}

/**
 * @param matches [{ key, slug, reach, espn, bsd, calls }] (see above). Returns counts only.
 */
export function gradeAgainstEspn (matches) {
  const list = Array.isArray(matches) ? matches : []
  const out = {
    ruleVersion: RULE_VERSION, matches: 0, population: 0, graded: 0, agree: 0, disagree: 0,
    notApplicable: { total: 0, byReason: tally() },
    matchesByOutcome: tally(), bySlug: tally(),
    distance: tally(), agreeByBsdOnGoal: tally(), conventions: tally(), finalGuard: tally(),
    stepA: { matchesCompared: 0, identical: 0, differentInNumber: 0, differentInOrder: 0, differentInMinute: 0, ownGoalRowTeam: tally() },
  }
  const na = (slug, reason, n = 1) => {
    out.notApplicable.total += n
    bump(out.notApplicable.byReason, reason, n)
    const s = slugEntry(slug)
    s.notApplicable += n
  }
  const slugEntry = (slug) => {
    const k = safe(slug)
    if (out.bySlug[k] === undefined) out.bySlug[k] = { calls: 0, graded: 0, agree: 0, disagree: 0, notApplicable: 0 }
    return out.bySlug[k]
  }
  for (const m of list) {
    out.matches++
    if (!isObj(m)) { na('(other)', REASONS.item); out.population++; slugEntry('(other)').calls++; continue }
    const calls = Array.isArray(m.calls) ? m.calls : []
    const slug = m.slug
    const S = slugEntry(slug)
    out.population += calls.length
    S.calls += calls.length
    const naAll = (reason, outcome) => { na(slug, reason, calls.length); bump(out.matchesByOutcome, outcome) }
    if (!isObj(m.reach) || m.reach.reached !== true) { naAll(reachReason(m.reach), 'no ESPN id for the match'); continue }
    if (!isObj(m.espn)) { naAll(REASONS.noTimeline, 'no ESPN timeline'); continue }
    const tl = timelineOf(m.espn)
    if (!tl.ok) { naAll(tl.reason, 'ESPN timeline unusable'); continue }
    bump(out.conventions, tl.convention)
    const bsd = bsdSidesOf(m.bsd)
    // the guard: a full-time capture and ESPN must agree on the final score
    let guard = 'no trusted capture'
    if (bsd !== null) guard = bsd.extended ? 'not compared (extra time)' : bsd.final === null ? 'not compared (no full-time row)' : (bsd.final.home === tl.final.home && bsd.final.away === tl.final.away ? 'equal' : 'differs')
    bump(out.finalGuard, guard)
    if (guard === 'differs') { naAll(REASONS.finalDiffers, 'final score differs'); continue }
    bump(out.matchesByOutcome, 'timeline usable')
    if (bsd !== null) stepA(tl, bsd, out.stepA)
    for (const call of calls) {
      const side = isObj(call) ? call.side : undefined
      if (side !== 'home' && side !== 'away') { na(slug, REASONS.side); continue }
      const sc = call.score_at_call
      const a = isObj(sc) ? count(sc.home) : null
      const b = isObj(sc) ? count(sc.away) : null
      if (a === null || b === null) { na(slug, REASONS.score); continue }
      if (call.outcome !== 'hit' && call.outcome !== 'miss') { na(slug, REASONS.outcome); continue }
      const k = a + b
      const resolving = tl.goals[k]
      if (resolving === undefined) { na(slug, REASONS.none); continue }
      const before = { home: 0, away: 0 }
      let beforeKnown = true
      for (let i = 0; i < k; i++) { const s = tl.goals[i].side; if (s === null) { beforeKnown = false; break } before[s]++ }
      if (beforeKnown && (before.home !== a || before.away !== b)) { na(slug, REASONS.join); continue }
      if (resolving.side === null) { na(slug, REASONS.ownGoal); continue }
      if (!beforeKnown) { na(slug, REASONS.ownGoal); continue }
      if (resolving.tieNext || (k > 0 && tl.goals[k - 1].tieNext)) { na(slug, REASONS.tie); continue }
      const verdict = resolving.side === side ? 'hit' : 'miss'
      const agree = verdict === call.outcome
      out.graded++
      S.graded++
      if (agree) { out.agree++; S.agree++ } else { out.disagree++; S.disagree++ }
      const rm = num(call.resolved_minute)
      const key = `${agree ? 'agree' : 'disagree'} @ ${bucket(rm === null ? null : Math.abs(resolving.m - rm), resolving.a > 0)}`
      bump(out.distance, key)
      // does the BSD capture place the same side and a minute within 1 at that position (step A, on the very goal the call resolved on)
      let onGoal = 'no capture to compare'
      if (bsd !== null) {
        const bg = bsd.goals[k]
        onGoal = bg === undefined ? 'BSD has no goal there' : bg.side === resolving.side && bg.minute !== null && Math.abs(bg.minute - (resolving.m + resolving.a)) <= 1 ? 'BSD agrees with ESPN' : 'BSD differs from ESPN'
      }
      bump(out.agreeByBsdOnGoal, `${agree ? 'agree' : 'disagree'} / ${onGoal}`)
    }
  }
  out.partitions = out.population === out.graded + out.notApplicable.total && out.graded === out.agree + out.disagree
    && out.notApplicable.total === Object.values(out.notApplicable.byReason).reduce((x, y) => x + y, 0)
  return out
}

/** The coverage line, every denominator in it (CLAUDE.md Rule 91). */
export function coverageLine (g) {
  const per = Object.entries(g.notApplicable.byReason).map(([r, n]) => `${r}: ${n}`).join('; ')
  const a = g.stepA
  return `graded ${g.graded} of ${g.population} calls on ${g.matches} matches (agree ${g.agree}, disagree ${g.disagree}, not applicable ${g.notApplicable.total}${per === '' ? '' : ` [${per}]`}) | step A on ${a.matchesCompared} matches: identical ${a.identical}, different in number ${a.differentInNumber}, in order ${a.differentInOrder}, in minute ${a.differentInMinute} | rule ${g.ruleVersion}`
}
