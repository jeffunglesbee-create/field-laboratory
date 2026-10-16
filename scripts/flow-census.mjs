#!/usr/bin/env node
// The soccer census: Task 1 (Flow, build/Flow.js) and Task 2 (Tactical Lock,
// build/TacticalLock.js `lockWindows`) of docs/CC-CMD-2026-10-15-empowerment-metrics.md,
// run over every BSD capture in R2 through the compiled F#, one walk for both. There
// is no second implementation of the metric here: this file walks the store,
// reads each capture's two files as TEXT, hands the text to `decodeCapture`,
// and adds up what `flowCensus` says. The only arithmetic of its own is a raw
// count of shotmap rows, kept to check the F# against (a census that re-derived
// its own subject would verify the copy).
//
// What it writes:
//   outbox/flow-census-latest.json — counts only: no team, no xG value, no
//     verdict about anyone. Its coverage line states N of N (Rule 91).
//   with --capture, four fixtures under data/ (verbatim bytes, never
//     re-serialised) and their data/PROVENANCE.md sections:
//       bsd-flow-finished-{stats,incidents}.json — the newest capture that
//         recorded full time in regulation (FT at 90', no extra-time or live
//         marker), read whole, holding a Flow run, a shared minute and a
//         half-time separator;
//       bsd-flow-inplay-{stats,incidents}.json — the newest capture taken in
//         play, read whole, holding a Flow run, uploaded at least 24 h before
//         the run (a stale record, not a match in progress).
//     If either has no candidate the script refuses and writes neither.
//
// The premises this rests on were measured first, over every capture, by
// field-relay-nba scripts/empowerment-premises.mjs (run 38963130231, artifact
// outbox/empowerment-premises-latest.json there). This census does not
// re-measure them; it reports what the F# did with them.
//
// The R2 walk is scripts/probe-empowerment.mjs's, imported rather than copied.
//
// Usage:  node scripts/flow-census.mjs --self-test
//         node scripts/flow-census.mjs [--capture]        (CI: needs npm run build)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createChecks, finish, isMain } from './checks.mjs'
import { pool, enumerate, slugWalk, groupCaptures, SHELL_BYTES } from './probe-empowerment.mjs'
import * as Flow from '../build/Flow.js'
import * as Lock from '../build/TacticalLock.js'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const OUT = 'outbox/flow-census-latest.json'
const TASK0_AT = '2026-10-16T09:35:05.514Z'
const PREMISES = 'field-relay-nba outbox/empowerment-premises-latest.json (run 38963130231)'
const TIMEOUT_MS = 30_000
const DAY_MS = 86_400_000

const COUNTED = ['Shots', 'OwnGoalRows', 'ShootoutKicks', 'Positive', 'Zero', 'Estimated', 'WithoutXg',
  'WithoutMinute', 'WithoutSide', 'Malformed', 'AddedAt45', 'AddedAt90', 'AddedAt105', 'AddedAt120',
  'AddedElsewhere', 'SharedMinutes', 'FlowRuns', 'FlowClosedByOpponent', 'FlowClosedByOpponentZeroXg',
  'FlowClosedByShared', 'FlowClosedAtHalfTime', 'FlowClosedAtFullTime', 'FlowClosedAtExtraInterval',
  'FlowClosedAtExtraEnd', 'FlowClosedByCaptureEnd', 'SeparatorsHalfTime', 'SeparatorsFullTime',
  'SeparatorsExtraInterval', 'SplitHalfTime', 'SplitFullTime', 'SplitExtraInterval',
  'ZeroInsideFlowRuns', 'EstimatedInsideFlowRuns']

/**
 * The raw shotmap row count, and how many rows Flow should find without an xG
 * number: own-goal rows (`gtype` "own") and shootout kicks (`sit` "shootout")
 * are set aside before that question is asked, so they are left out here too.
 */
const rawShots = (statsText) => {
  try {
    const rows = JSON.parse(statsText)?.shotmap
    if (!Array.isArray(rows)) return { rows: 0, nullXg: 0 }
    const counted = rows.filter(r => r?.gtype !== 'own' && r?.sit !== 'shootout')
    return { rows: rows.length, nullXg: counted.filter(r => typeof r?.xg !== 'number').length }
  } catch { return { rows: 0, nullXg: 0 } }
}

const LOCK_FIELDS = ['TeamWindows', 'RestartsUnclocked', 'ShotsUnclocked', 'Unmeasured', 'Clocked', 'LockedOnPossible', 'XgMissing']

const CLOSERS = ['FlowClosedByOpponent', 'FlowClosedByOpponentZeroXg', 'FlowClosedByShared', 'FlowClosedAtHalfTime',
  'FlowClosedAtFullTime', 'FlowClosedAtExtraInterval', 'FlowClosedAtExtraEnd', 'FlowClosedByCaptureEnd']

/**
 * Every capture through the F#. `captures` items: { slug, id, uploaded,
 * statsText, incidentsText (string or null) }.
 */
function tally(captures) {
  const sum = Object.fromEntries(COUNTED.map(k => [k, 0]))
  const byStage = {}, byCompetition = {}
  const rows = []
  let raw = 0, rawNullXg = 0, withRun = 0, read = 0, unclosed = 0
  const unread = []
  const lock = Object.fromEntries(LOCK_FIELDS.map(k => [k, 0]))
  const lockRefused = []
  for (const x of captures) {
    const c = Flow.decodeCapture(x.statsText, x.incidentsText ?? undefined)
    const n = Flow.flowCensus(c)
    for (const k of COUNTED) sum[k] += n[k]
    if (CLOSERS.reduce((t, k) => t + n[k], 0) !== n.FlowRuns) unclosed++
    // Tactical Lock: a Result, tag 0 Ok / tag 1 Error.
    const w = Lock.lockWindows(x.statsText, x.incidentsText ?? undefined)
    if (w.tag === 0) { for (const k of LOCK_FIELDS) lock[k] += w.fields[0][k] }
    else lockRefused.push({ slug: x.slug, id: x.id, reason: String(w.fields[0]).slice(0, 120) })
    const r = rawShots(x.statsText)
    raw += r.rows; rawNullXg += r.nullXg
    byStage[n.Stage] = (byStage[n.Stage] ?? 0) + 1
    const comp = byCompetition[x.slug] ??= { captures: 0, read: 0, flow_runs: 0 }
    comp.captures++; comp.flow_runs += n.FlowRuns
    if (n.Read) { read++; comp.read++ } else unread.push({ slug: x.slug, id: x.id, without_xg: n.WithoutXg, without_minute: n.WithoutMinute, without_side: n.WithoutSide, malformed: n.Malformed })
    if (n.FlowRuns > 0) withRun++
    rows.push({ x, n })
  }
  return { sum, byStage, byCompetition, raw, rawNullXg, withRun, read, unread, rows, unclosed, lock, lockRefused }
}

/** The fixture choice, by rule, newest first (ties by slug then id). */
function selectFixtures(rows, runAt) {
  const newest = (a, b) => String(b.x.uploaded).localeCompare(String(a.x.uploaded)) || a.x.slug.localeCompare(b.x.slug) || String(a.x.id).localeCompare(String(b.x.id))
  const finished = rows.filter(r => r.n.Stage === 'full-time-seen' && !r.n.LiveMarker && !r.n.ExtraTimeMarker && r.n.Read
    && r.n.FlowRuns >= 1 && r.n.SharedMinutes >= 1 && r.n.SeparatorsHalfTime >= 1 && r.x.incidentsText).sort(newest)[0] ?? null
  const inPlay = rows.filter(r => r.n.Stage === 'in-play' && r.n.Read && r.n.FlowRuns >= 1 && r.x.incidentsText
    && Date.parse(runAt) - Date.parse(r.x.uploaded) >= DAY_MS).sort(newest)[0] ?? null
  return { finished, inPlay }
}

const sha = (t) => createHash('sha256').update(t).digest('hex')

function writeFixtures(sel, runAt) {
  const P = 'data/PROVENANCE.md'
  const files = []
  for (const [role, r, rule] of [
    ['finished', sel.finished, 'the newest-uploaded capture that recorded full time in regulation (FT at 90\', no live or extra-time marker), read whole, holding at least one Flow run, one shared minute and one half-time separator'],
    ['inplay', sel.inPlay, 'the newest-uploaded capture taken in play (a live period marker, no full time), read whole, holding at least one Flow run, uploaded at least 24 h before the run'],
  ]) {
    for (const [kind, text] of [['stats', r.x.statsText], ['incidents', r.x.incidentsText]]) {
      const path = `data/bsd-flow-${role}-${kind}.json`
      writeFileSync(path, text)
      files.push({ path, bytes: Buffer.byteLength(text), sha256: sha(text) })
    }
    const marker = `## \`bsd-flow-${role}-stats.json\` and \`bsd-flow-${role}-incidents.json\``
    const entry = [
      marker, '',
      '```',
      `GET ${RELAY}/bsd/r2/read?key=bsd/${r.x.slug}/${r.x.id}/stats.json`,
      `GET ${RELAY}/bsd/r2/read?key=bsd/${r.x.slug}/${r.x.id}/incidents.json`,
      ...files.slice(-2).map(f => `${f.path}: ${f.bytes} bytes, sha256 ${f.sha256}`),
      `R2 upload ${r.x.uploaded}; captured ${runAt}; run ${process.env.GITHUB_RUN_ID || 'local'}`,
      '```', '',
      `Captured by \`scripts/flow-census.mjs --capture\`: the R2 bytes as served, written as text and never re-serialised. Chosen by rule, not by hand: ${rule}.`, '',
      `**What it exercises.** Stage \`${r.n.Stage}\`; ${r.n.Shots} shotmap rows (${r.n.Positive} positive xG, ${r.n.Estimated} estimated); ${r.n.FlowRuns} Flow run(s); ${r.n.SharedMinutes} shared minute(s); separators at half time ${r.n.SeparatorsHalfTime}, full time ${r.n.SeparatorsFullTime}.`, '',
      '**What it does not exercise.** A capture with no xG on a shot (those stay unread and are listed in outbox/flow-census-latest.json), an own-goal row or a shootout kick unless counted above, the witness (its only route is the event row, which is not part of a capture), and a capture taken in extra time.', '',
    ].join('\n')
    const prov = readFileSync(P, 'utf8')
    const at = prov.indexOf(marker)
    if (at === -1) writeFileSync(P, prov.replace(/\s*$/, '\n') + '\n' + entry)
    else { const after = prov.indexOf('\n## ', at + 1); writeFileSync(P, prov.slice(0, at) + entry + (after === -1 ? '' : prov.slice(after + 1))) }
  }
  return files
}

async function getText(url) {
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'FIELD-laboratory/1.0' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (res.ok) return await res.text()
    } catch { /* retried once, then counted as failed */ }
  }
  return null
}

async function live(capture) {
  const { check, summarize } = createChecks()
  const runAt = new Date().toISOString()
  const failedPages = []
  const listPage = async (prefix) => {
    const t = await getText(`${RELAY}/bsd/r2/list?prefix=${encodeURIComponent(prefix)}`)
    try { const j = JSON.parse(t); if (Array.isArray(j?.keys)) return j } catch { /* fall through */ }
    failedPages.push(prefix); return null
  }
  const budget = { calls: 0 }
  const walk = await slugWalk(listPage, undefined, budget)
  const keys = []; let capped = walk.capped
  for (const r of await pool(walk.slugs, 4, (sl) => enumerate(listPage, `bsd/${sl}/`, undefined, undefined, budget))) { keys.push(...r.keys); capped = capped || r.capped }
  const comps = groupCaptures(keys)
  const size = new Map(keys.map(k => [k.key, k.size]))
  const targets = []
  for (const [slug, v] of Object.entries(comps)) for (const [id, e] of Object.entries(v.events))
    if (e.files.includes('stats.json') && (size.get(`bsd/${slug}/${id}/stats.json`) ?? 0) >= SHELL_BYTES)
      targets.push({ slug, id, uploaded: e.uploaded, hasIncidents: e.files.includes('incidents.json') })
  let failedReads = 0
  const read = async (key) => { const t = await getText(`${RELAY}/bsd/r2/read?key=${encodeURIComponent(key)}`); if (t === null) failedReads++; return t }
  const captures = (await pool(targets, 6, async (t) => ({ ...t,
    statsText: await read(`bsd/${t.slug}/${t.id}/stats.json`),
    incidentsText: t.hasIncidents ? await read(`bsd/${t.slug}/${t.id}/incidents.json`) : null }))).filter(c => c.statsText !== null)
  const T = tally(captures)
  const task0 = targets.filter(t => String(t.uploaded) <= TASK0_AT).length
  const coverage = `${captures.length} of ${targets.length} non-shell captures read and decoded through build/Flow.js `
    + `(${task0} uploaded at or before Task 0's census at ${TASK0_AT}); ${walk.slugs.length} slugs, ${budget.calls} list calls`
    + `${capped ? ', CAPPED' : ''}${failedPages.length ? `, ${failedPages.length} list page(s) failed` : ''}${failedReads ? `, ${failedReads} read(s) failed` : ''}`

  check('the R2 walk is complete', !capped && failedPages.length === 0, `capped=${capped} failed pages=${failedPages.slice(0, 5).join(', ')}`)
  check('every capture was read', failedReads === 0 && captures.length === targets.length, `${failedReads} failed reads; ${captures.length} of ${targets.length}`)
  check('the F# counted every shotmap row the text holds', T.sum.Shots === T.raw, `F# ${T.sum.Shots} vs raw ${T.raw}`)
  check('the F# found exactly the rows without an xG number that the text holds, own goals and shootout kicks aside',
    T.rawNullXg === T.sum.WithoutXg, `raw ${T.rawNullXg}, F# WithoutXg ${T.sum.WithoutXg}`)
  check('every Flow run has exactly one closer', T.unclosed === 0, `${T.unclosed} capture(s) whose closers do not sum to their runs`)
  check('every Tactical Lock window is either clocked or unmeasured', T.lock.Unmeasured + T.lock.Clocked === T.lock.TeamWindows,
    `${T.lock.Unmeasured} + ${T.lock.Clocked} vs ${T.lock.TeamWindows}`)

  let fixtures = null
  if (capture) {
    const sel = selectFixtures(T.rows, runAt)
    check('a finished capture qualifies as a fixture', sel.finished !== null, 'no witnessed capture with a run, a shared minute and a half-time separator')
    check('an in-play capture qualifies as a fixture', sel.inPlay !== null, 'no live-stage capture with a run uploaded 24 h ago')
    if (sel.finished && sel.inPlay) fixtures = { finished: `${sel.finished.x.slug}/${sel.finished.x.id}`, in_play: `${sel.inPlay.x.slug}/${sel.inPlay.x.id}`, files: writeFixtures(sel, runAt) }
  }

  const s = T.sum
  mkdirSync('outbox', { recursive: true })
  writeFileSync(OUT, JSON.stringify({
    cc_cmd: 'docs/CC-CMD-2026-10-15-empowerment-metrics.md', task: 1, ran_at: runAt, relay: RELAY,
    run_id: process.env.GITHUB_RUN_ID || null, premises: PREMISES, coverage,
    population: { non_shell_now: targets.length, uploaded_by_task0: task0, read: captures.length, by_competition: T.byCompetition },
    stage: { by_stage: T.byStage, note: 'no stage is a witness: the only route to one is the capture\'s own event row two FIELD days after kickoff' },
    shots: { rows: s.Shots, raw_rows: T.raw, own_goal_rows: s.OwnGoalRows, shootout_kicks: s.ShootoutKicks,
      positive: s.Positive, zero: s.Zero, estimated: s.Estimated, without_xg: s.WithoutXg, raw_without_xg: T.rawNullXg,
      added_at: { 45: s.AddedAt45, 90: s.AddedAt90, 105: s.AddedAt105, 120: s.AddedAt120, elsewhere: s.AddedElsewhere } },
    unread: { captures: T.unread.length, note: 'a shot with no xG number leaves its whole capture unread; these go to the owner before any run treats them', list: T.unread },
    flow: { captures_read: T.read, captures_with_flow_run: T.withRun, flow_runs: s.FlowRuns, shared_minutes: s.SharedMinutes,
      closed_by: { opponent_shot: s.FlowClosedByOpponent, opponent_shots_of_zero_xg_only: s.FlowClosedByOpponentZeroXg, shared_minute: s.FlowClosedByShared,
        half_time: s.FlowClosedAtHalfTime, full_time: s.FlowClosedAtFullTime, extra_time_interval: s.FlowClosedAtExtraInterval,
        end_of_extra_time: s.FlowClosedAtExtraEnd, capture_end: s.FlowClosedByCaptureEnd },
      boundaries: {
        half_time: { separators: s.SeparatorsHalfTime, same_team_splits: s.SplitHalfTime, flow_runs_ended: s.FlowClosedAtHalfTime },
        full_time: { separators: s.SeparatorsFullTime, same_team_splits: s.SplitFullTime, flow_runs_ended: s.FlowClosedAtFullTime },
        extra_time_interval: { separators: s.SeparatorsExtraInterval, same_team_splits: s.SplitExtraInterval, flow_runs_ended: s.FlowClosedAtExtraInterval } },
      zero_inside_flow_runs: s.ZeroInsideFlowRuns, estimated_inside_flow_runs: s.EstimatedInsideFlowRuns },
    tactical_lock: { ...T.lock, refused: T.lockRefused.length, refused_list: T.lockRefused.slice(0, 20),
      note: 'window counts from TacticalLock.lockWindows; Unmeasured and LockedOnPossible come from lockClassify, never from a literal' },
    fixtures,
  }, null, 2) + '\n')
  console.log(`COVERAGE: ${coverage}`)
  console.log(`Flow runs ${s.FlowRuns} in ${T.withRun} captures; ${T.unread.length} unread; stages ${JSON.stringify(T.byStage)}`)
  console.log(`Tactical Lock: ${T.lock.TeamWindows} team windows, ${T.lock.Unmeasured} unmeasured, ${T.lock.Clocked} clocked, ${T.lock.LockedOnPossible} could be LockedOn; ${T.lockRefused.length} captures refused`)
  finish(summarize())
}

function selfTest() {
  const { check, summarize } = createChecks()
  const row = (m, home, xg, extra = '') => `{"min":${m},"home":${home},"xg":${xg},"type":"miss"${extra}}`
  const stats = (rows) => `{"event_id":1,"shotmap":[${rows.join(',')}]}`
  const per = (text, minute, live, h, a) => `{"type":"period","text":"${text}","minute":${minute},"is_live":${live},"home_score":${h},"away_score":${a}}`
  const inc = (...p) => `{"event_id":1,"incidents":[${p.join(',')}]}`
  const ft = inc(per('HT', 45, false, 0, 0), per('FT', 90, false, 1, 0))
  const live2 = inc(per('HT', 45, false, 0, 0), per('Second half', 90, true, 0, 0))
  const runAt = '2026-10-16T12:00:00Z'
  const captures = [
    // finished, a run (10,11,12), a shared minute at 30, a half-time separator (44 -> 50)
    { slug: 'epl', id: '1', uploaded: '2026-10-10T20:00:00Z', incidentsText: ft,
      statsText: stats([row(10, true, 0.1), row(11, true, 0.1), row(12, true, 0.1), row(30, true, 0.1), row(30, false, 0.1), row(44, true, 0.1), row(50, false, 0.1)]) },
    // in play, uploaded 2 days before the run, a run
    { slug: 'mls', id: '2', uploaded: '2026-10-14T01:00:00Z', incidentsText: live2,
      statsText: stats([row(60, false, 0.2), row(61, false, 0.2), row(62, false, 0.2)]) },
    // one shot with no xG: unread, and an own-goal row with no xG that is set aside
    { slug: 'mls', id: '3', uploaded: '2026-10-15T01:00:00Z', incidentsText: null,
      statsText: stats([row(5, true, 'null'), row(6, true, 'null', ',"gtype":"own"'), row(7, false, 0.1)]) },
    // in play but uploaded an hour before the run: not a fixture candidate
    { slug: 'epl', id: '4', uploaded: '2026-10-16T11:00:00Z', incidentsText: live2,
      statsText: stats([row(60, true, 0.2), row(61, true, 0.2), row(62, true, 0.2)]) },
  ]
  const T = tally(captures)
  check('the F# shot count equals the raw row count', T.sum.Shots === 3 + 3 + 7 + 3 && T.raw === T.sum.Shots, `F# ${T.sum.Shots} raw ${T.raw}`)
  check('an own goal is counted and set aside', T.sum.OwnGoalRows === 1, `own goals ${T.sum.OwnGoalRows}`)
  check('the capture with a null-xG shot is unread and named', T.unread.length === 1 && T.unread[0].id === '3' && T.sum.WithoutXg === 1, JSON.stringify(T.unread))
  check('the raw null-xG count leaves out the own goal, as the F# does', T.rawNullXg === 1 && T.rawNullXg === T.sum.WithoutXg, `raw ${T.rawNullXg}`)
  check('three Flow runs, each closed once', T.sum.FlowRuns === 3 && T.unclosed === 0, `runs ${T.sum.FlowRuns} unclosed ${T.unclosed}`)
  check('the estimated count is the F#\'s', tally([{ ...captures[0], statsText: stats([row(10, true, 0.1, ',"xg_estimated":true'), row(11, true, 0.1)]) }]).sum.Estimated === 1, 'estimated')
  check('Tactical Lock windows are counted through the F#, all unmeasured', T.lock.TeamWindows > 0 && T.lock.Unmeasured === T.lock.TeamWindows && T.lock.LockedOnPossible === 0,
    JSON.stringify(T.lock))
  check('the shared minute and the half-time separator are counted', T.sum.SharedMinutes === 1 && T.sum.SeparatorsHalfTime === 1, `shared ${T.sum.SharedMinutes} sep ${T.sum.SeparatorsHalfTime}`)
  const sel = selectFixtures(T.rows, runAt)
  check('the finished fixture is the capture that recorded full time', sel.finished?.x.id === '1', String(sel.finished?.x.id))
  check('the in-play fixture is the one uploaded at least a day ago', sel.inPlay?.x.id === '2', String(sel.inPlay?.x.id))
  const none = selectFixtures(tally(captures.slice(2)).rows, runAt)
  check('with no candidate, nothing is selected', none.finished === null && none.inPlay === null, JSON.stringify(none))
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else await live(process.argv.includes('--capture'))
}
