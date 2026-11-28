#!/usr/bin/env node
// THE SCORING TOOLING of the 2026-11-28 replication rule (outbox/forecast-replicate-uefa-2026-11-28.mjs, whose RULE block was committed first). It is NOT part of the rule: it computes what the rule defines, and it imports RULE, decide() and look2Gate() from the
// rule file instead of keeping a copy of them. It is tested on synthetic seasons and on two committed known answers (scripts/check-uefa-replicate.mjs), and each of its parts is shown red under a deliberate break (scripts/mutate-uefa-replicate.mjs).
//
// INTEGRITY FIRST. run() evaluates every G3 check before it calls the scoring function. A failed G3 returns the failed checks and the counts and NEVER an outcome-bearing number: the scoring function is not called, and nothing outcome-bearing is written.
//
//   node scripts/uefa-replicate-run.mjs --integrity-only --bundle24 outbox/forecast-uefa-data-2024-25-2026-11-28.json [--bundle26 <forward bundle> --look1-result <file> --look1-recompute <file> --today YYYY-MM-DD]
//   node scripts/uefa-replicate-run.mjs --look 1 --bundle24 <bundle> --out outbox/forecast-replicate-uefa-look1-result-2026-11-28.json
//   node scripts/uefa-replicate-run.mjs --look 2 --bundle26 <forward bundle> --look1-result <file> --look1-recompute <file> --out <look2 result file> --today YYYY-MM-DD     (the Look 1 bundle is the one the Look 1 result names)
//   node scripts/uefa-replicate-run.mjs --compare-independent --look 1|2 --result <result.json> --independent <independent output.json> --out <record.json> [--independent-script scripts/uefa-replicate-independent.mjs]
//   node scripts/uefa-replicate-run.mjs --gate --look1-result <file> --look1-recompute <file> --look2-result <file> [--bundle26 <forward bundle>] [--today YYYY-MM-DD] [--write-no-verdict]
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RULE, decide, stopVerdict, look2Gate, ruleBlockSha256, MARKER_LINES, sha256, blockSha256Of, LABELS, SHORT, dayBefore, leaguePhaseRows, forecastsOf, scoreForecasts, reported, openingMatches, eligibilityCounts, look1Set, forwardSet, frozenSet, look2Pool, verdictOf } from './uefa-replicate-score.mjs'
export * from './uefa-replicate-score.mjs'

export const RULE_COMMIT = '6a0e52906e6193c1ef917bad96bfef2ffc7457e3' // the commit that fixed this version of the rule block; its message carries the block's sha256
const keysOk = r => JSON.stringify(Object.keys(r)) === JSON.stringify(RULE.fields)
export function daysIn(from, to) { const o = []; for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400000) o.push(new Date(t).toISOString().slice(0, 10)); return o }

/** G3 (a) to (l) for ONE bundle. Pure counts, names and ids; no score is used. ctx: { text, committedBundleSha, window: {from,to}, expect: {completed, leaguePhase} | null (completed counts only for 2024-25), frozen: {ids:Set, sha} | null (Look 2 forward bundle only), clubsPerCompetition (tests only: the rule's 36 when absent) }.
 *  The rule-level checks (b) are made once, by ruleChecks(). The letters are the rule's. */
export function integrityChecks(bundle, ctx) {
  const checks = []
  const ck = (name, ok, detail = '') => checks.push({ name, ok: ok === true, detail: String(detail) })
  const rows = Array.isArray(bundle?.rows) ? bundle.rows : []
  const lp = leaguePhaseRows(rows)
  ck('(a) the bundle file\'s sha256 equals the one in the commit message of the commit that added it', typeof ctx.committedBundleSha === 'string' && sha256(ctx.text) === ctx.committedBundleSha, `${sha256(ctx.text)} against ${ctx.committedBundleSha}`)
  for (const l of LABELS) {
    const t = bundle?.counts?.tallies?.[l] ?? {}
    if (ctx.expect?.completed) ck(`(c) ${SHORT[l]}: completed events = ${ctx.expect.completed[l]}, and as many rows`, t.completed === ctx.expect.completed[l] && rows.filter(r => r.sport === l).length === ctx.expect.completed[l], `tally ${t.completed}, rows ${rows.filter(r => r.sport === l).length}`)
    ck(`(d) ${SHORT[l]}: league-phase matches by the counting rule = ${ctx.expect.leaguePhase[l]}`, lp.perLabel[l] === ctx.expect.leaguePhase[l], String(lp.perLabel[l]))
    ck(`(e) ${SHORT[l]}: ${ctx.clubsPerCompetition ?? RULE.clubsPerCompetition} distinct clubs`, lp.distinctClubs[l] === (ctx.clubsPerCompetition ?? RULE.clubsPerCompetition), String(lp.distinctClubs[l]))
    ck(`(g) ${SHORT[l]}: no completed event skipped`, t.skipped === 0, String(t.skipped))
    ck(`(j) ${SHORT[l]}: dateMismatch is 0 as the bundle states it`, t.dateMismatch === 0, String(t.dateMismatch))
  }
  ck('(e) every club on exactly N league-phase matches (8 / 8 / 6)', lp.clubsNotOnN.length === 0, lp.clubsNotOnN.slice(0, 8).join(' '))
  ck('(f) duplicateEventIds is 0 as the bundle states it', bundle?.counts?.duplicateEventIds === 0, String(bundle?.counts?.duplicateEventIds))
  ck('(f) no espn_event_id repeats among the rows, every espn_event_id matches ^[0-9]+$, and counts.rows equals the number of rows', new Set(rows.map(r => r.espn_event_id)).size === rows.length && bundle?.counts?.rows === rows.length && rows.every(r => typeof r.espn_event_id === 'string' && /^[0-9]+$/.test(r.espn_event_id)), `${new Set(rows.map(r => r.espn_event_id)).size} distinct of ${rows.length}, counts.rows ${bundle?.counts?.rows}`)
  ck('(g) no club has two events on one date in one competition', lp.twoOnOneDate === 0, String(lp.twoOnOneDate))
  ck('(g) no match has one club on both sides', lp.sameClub === 0, String(lp.sameClub))
  ck('(h) every league-phase match has the status STATUS_FULL_TIME', lp.rows.every(r => RULE.leaguePhaseStatus.includes(r.status)), `${lp.rows.filter(r => !RULE.leaguePhaseStatus.includes(r.status)).length} other`)
  ck('(i) no null score in a league-phase match', lp.rows.every(r => r.home_score !== null && r.away_score !== null), String(lp.rows.filter(r => r.home_score === null || r.away_score === null).length))
  const badDates = rows.filter(r => { const t = typeof r.start_time === 'string' && /(Z|[+-]\d{2}:?\d{2})$/.test(r.start_time) ? Date.parse(r.start_time) : NaN; if (!Number.isFinite(t)) return true; const u = new Date(t).toISOString().slice(0, 10); return !(r.date === u || r.date === dayBefore(u)) })
  ck('(j) the requested day equals the UTC day of start_time or the day before it, recomputed from the rows', badDates.length === 0, String(badDates.length))
  ck('(l) the bundle\'s fields list is FIELDS and every row has exactly those keys in that order', JSON.stringify(bundle?.fields) === JSON.stringify(RULE.fields) && rows.every(keysOk), `${rows.filter(r => !keysOk(r)).length} rows with other keys`)
  const nd = daysIn(ctx.window.from, ctx.window.to).length
  ck('(l) the bundle\'s from, to and daysRead are the window\'s, and every read answered HTTP 200', bundle?.from === ctx.window.from && bundle?.to === ctx.window.to && bundle?.daysRead === nd && JSON.stringify(bundle?.statuses) === JSON.stringify({ 200: nd * LABELS.length }), `${bundle?.from}..${bundle?.to}, ${bundle?.daysRead} of ${nd} days, ${JSON.stringify(bundle?.statuses)}`)
  const ec = eligibilityCounts(rows)   // counted from the presence of scores only: no gap, probability or outcome is computed here
  if (ctx.expectEligible) for (const l of LABELS) ck(`(m) ${SHORT[l]}: ${ctx.expectEligible[l]} eligible forecasts`, ec[l].eligible === ctx.expectEligible[l], String(ec[l].eligible))
  if (ctx.expectForwardEligible !== undefined) ck(`(m) the forward matches give ${ctx.expectForwardEligible} eligible forecasts (every forward match)`, LABELS.reduce((t, l) => t + ec[l].forward, 0) === ctx.expectForwardEligible, String(LABELS.reduce((t, l) => t + ec[l].forward, 0)))
  if (ctx.runDate !== undefined) ck('(l) the forward bundle\'s `to` is on or after the first forward day and not after the run date (UTC)', typeof bundle?.to === 'string' && bundle.to >= RULE.look2.forwardFrom && bundle.to <= ctx.runDate, `${bundle?.to} against ${RULE.look2.forwardFrom} .. ${ctx.runDate}`)
  if (ctx.frozen) {
    const fid = new Set(lp.rows.filter(r => r.date <= RULE.look2.frozenThrough).map(r => r.espn_event_id))
    const miss = [...ctx.frozen.ids].filter(i => !fid.has(i)).length, extra = [...fid].filter(i => !ctx.frozen.ids.has(i)).length
    ck('(k) the frozen bundle file is the pinned one (sha256)', ctx.frozen.sha === RULE.frozenBundleSha256, ctx.frozen.sha)
    ck(`(k) the frozen part of this read has exactly the ${RULE.frozenIds} espn_event_ids of the pinned frozen bundle`, ctx.frozen.ids.size === RULE.frozenIds && miss === 0 && extra === 0, `read ${fid.size}, pinned ${ctx.frozen.ids.size}, missing from the read ${miss}, extra in the read ${extra}`)
    // the fresh read governs the frozen matches' ratings; its scores and start times must be the pinned ones, event by event (the pinned rows carry club names, so ids are not compared)
    const byId = new Map(rows.map(r => [r.espn_event_id, r])), diff = (ctx.frozen.rows ?? []).filter(p => { const r = byId.get(p.espn_event_id); return !r || r.home_score !== p.home_score || r.away_score !== p.away_score || r.start_time !== p.start_time })
    ck('(k) every frozen match has, in the read, the pinned bundle\'s home score, away score and start time', Array.isArray(ctx.frozen.rows) && ctx.frozen.rows.length === RULE.frozenIds && diff.length === 0, `${diff.length} of ${(ctx.frozen.rows ?? []).length} differ`)
  }
  checks.counts = { rows: rows.length, byLabel: Object.fromEntries(LABELS.map(l => [SHORT[l], rows.filter(r => r.sport === l).length])), leaguePhase: Object.fromEntries(LABELS.map(l => [SHORT[l], lp.perLabel[l]])), phaseSlugLeaguePhase: Object.fromEntries(LABELS.map(l => [SHORT[l], rows.filter(r => r.sport === l && r.phase === 'league-phase').length])) }
  return checks
}

/** G3 (b): the rule block is the committed one. `committed` is the sha256 read from the commit message of RULE_COMMIT. */
export function ruleChecks(committed, actual = ruleBlockSha256, markers = MARKER_LINES, git = { headDescends: true, bundlesDescend: true, shownSha: committed, blockStable: true }) {
  return [
    { name: '(b) each marker line of the RULE block occurs exactly once', ok: markers.begin === 1 && markers.end === 1, detail: JSON.stringify(markers) },
    { name: '(b) the RULE block\'s sha256 (of the block text this run executed) equals the one in the commit message of RULE_COMMIT', ok: typeof committed === 'string' && actual === committed, detail: `${actual} against ${committed}` },
    { name: '(b) the block as stored in RULE_COMMIT (git show) has the same sha256, whatever its message says', ok: typeof git.shownSha === 'string' && git.shownSha === actual, detail: `${git.shownSha} against ${actual}` },
    { name: '(b) the block is identical in every commit that touches the rule file from RULE_COMMIT to the checkout', ok: git.blockStable === true, detail: String(git.blockStable) },
    { name: '(b) RULE_COMMIT is an ancestor of the checkout', ok: git.headDescends === true, detail: String(git.headDescends) },
    { name: '(b) RULE_COMMIT is an ancestor of the commit that added each bundle', ok: git.bundlesDescend === true, detail: String(git.bundlesDescend) },
  ]
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' })
const isAncestor = (a, b) => { try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { stdio: 'ignore' }); return true } catch { return false } }
const RULE_PATH = 'outbox/forecast-replicate-uefa-2026-11-28.mjs'
export function gitRuleFacts(bundleFiles) {
  const shown = c => { try { return blockSha256Of(git('show', `${c}:${RULE_PATH}`)) } catch { return null } }
  const added = f => git('log', '--diff-filter=A', '--format=%H', '-1', '--', f).trim()
  const touching = (() => { try { return git('log', '--format=%H', `${RULE_COMMIT}..HEAD`, '--', RULE_PATH).split('\n').filter(Boolean) } catch { return [null] } })()
  return { headDescends: isAncestor(RULE_COMMIT, 'HEAD'), bundlesDescend: bundleFiles.every(f => { const c = added(f); return c !== '' && isAncestor(RULE_COMMIT, c) }), shownSha: shown(RULE_COMMIT), blockStable: touching.every(c => c !== null && shown(c) === ruleBlockSha256) }
}

export const SCORE_FILE = fileURLToPath(new URL('./uefa-replicate-score.mjs', import.meta.url))
export const scoringSha256 = sha256(fs.readFileSync(SCORE_FILE, 'utf8'))
const exactlyOne = (msg, re) => { const m = [...String(msg).matchAll(new RegExp(re.source, 'gm'))]; return m.length === 1 ? m[0] : null }
/** The commit-message lines, each required exactly once (a second such line makes the parse null, so a quoted old hash cannot be read as the new one). */
export const ruleShaFromMessage = msg => exactlyOne(msg, /^RULE block sha256: ([0-9a-f]{64})$/)?.[1] ?? null
export const bundleShaFromMessage = (msg, file) => { const m = exactlyOne(msg, /^bundle sha256: ([0-9a-f]{64}) ([0-9]+) bytes (\S+)$/); return m && m[3] === file ? m[1] : null }
export const scoringShaFromMessage = msg => exactlyOne(msg, /^scoring sha256: ([0-9a-f]{64}) scripts\/uefa-replicate-score\.mjs$/)?.[1] ?? null
/** G3 (n): the scoring module (the loader, the scoring, the sets and the pooling) is the one recorded when the data was committed, and (at Look 2) the one the Look 1 result recorded. `bundles` = [{ path, message }]. */
export function scoringChecks(bundles, look1Result = null, actual = scoringSha256) {
  const out = bundles.map(b => ({ name: `(n) the scoring module's sha256 equals the one recorded in the commit message of the commit that added ${b.path}`, ok: scoringShaFromMessage(b.message) === actual, detail: `${actual} against ${scoringShaFromMessage(b.message)}` }))
  if (look1Result) out.push({ name: '(n) the Look 1 result records the same scoring sha256', ok: look1Result.scoringSha256 === actual, detail: `${actual} against ${look1Result.scoringSha256}` })
  return out
}
/** G3 (o), at Look 2: the Look 1 recomputation record exists, says agrees true, and is about THIS Look 1 result (its run z and run verdict are the result's). */
export function recordChecks(l1, rec) {
  return [
    { name: '(o) the Look 1 recomputation record exists and says agrees true', ok: rec?.agrees === true && rec?.look === 1, detail: JSON.stringify({ agrees: rec?.agrees, look: rec?.look }) },
    { name: '(o) the record is about this Look 1 result: its run z and run verdict are the result\'s', ok: rec?.runZ === l1?.z && rec?.runVerdict === l1?.verdict && typeof l1?.verdict === 'string', detail: `${rec?.runZ} ${rec?.runVerdict} against ${l1?.z} ${l1?.verdict}` },
  ]
}

/** One look. `checks` is G3 (a) to (o), already evaluated. `g3b` (Look 2 only) returns the Look 1 reproduction check and is called only after `checks` pass; `score` is called ONLY after both pass, so a failed G3 prints failed checks and counts and nothing else.
 *  `stops` is the number of this look's stops at G3 including this one: the first two are STOPPED AT G3 (no verdict), the third is NO VERDICT (the rule's stopVerdict). */
export function run(look, checks, score, g3b = null, stops = 1) {
  let failed = checks.filter(c => !c.ok)
  if (failed.length === 0 && look === 2 && g3b) { const c = g3b(); checks = [...checks, c]; failed = c.ok ? [] : [c] }
  if (failed.length > 0) return { verdict: stopVerdict(stops), failed: failed.map(c => `${c.name} [${c.detail}]`), scored: false, checks, stops }
  const m = score()
  const v = verdictOf(look, m.stats)
  return { ...v, scored: true, stats: m.stats, reported: m.reported, checks }
}

/** G3b: the Look 1 forecasts scored again from the Look 1 bundle give the committed z (to 1e-12) and the committed verdict, and that verdict is CONTINUE TO LOOK 2. Its line carries the Look 1 z and verdict, which are already public. */
export function g3bCheck(rows24, l1) {
  const s = scoreForecasts(look1Set(rows24)), v = verdictOf(1, s).verdict
  return { name: 'G3b the Look 1 forecasts scored again from the Look 1 bundle give the committed z and the committed verdict, and that verdict is CONTINUE TO LOOK 2', ok: Number.isFinite(s.z) && Math.abs(s.z - l1.z) <= RULE.look1Reproduction && v === l1.verdict && v === 'CONTINUE TO LOOK 2', detail: `recomputed ${s.z} ${v}, committed ${l1.z} ${l1.verdict}` }
}

const f4 = x => (Number.isFinite(x) ? x.toFixed(4) : String(x))
export function reportText(look, result, extra = {}) {
  const L = [], p = (...a) => L.push(a.join(' '))
  p(`RULE block sha256 ${ruleBlockSha256} (version ${RULE.version}); rule commit ${RULE_COMMIT}; tooling sha256 ${extra.toolingSha ?? '?'}; scoring sha256 ${scoringSha256}`)
  p(`LOOK ${look}: G3 ${result.checks.filter(c => c.ok).length} of ${result.checks.length} integrity checks passed`)
  for (const c of result.checks) p(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ' [' + c.detail + ']' : ''}`)
  if (extra.counts) p(`counts (not gating): ${JSON.stringify(extra.counts)}`)
  if (!result.scored) { p(`VERDICT: ${result.verdict}${result.stops ? ` (stop ${result.stops} of ${RULE.repairsPerLook + 1})` : ''}`); for (const f of result.failed) p(`  ${f}`); return L.join('\n') }
  const s = result.stats, r = result.reported
  p(`eligible forecasts n ${s.n}: ${s.folds.map(f => `${SHORT[f.name]} ${f.n}`).join(', ')}`)
  p(`Brier U ${f4(s.brierU)}, base rate ${f4(s.brierBase)}, mean D ${f4(s.meanD)}, sd(D) ${f4(s.sdD)}`)
  p(`z ${s.z} (boundary ${look === 1 ? RULE.look1.z : RULE.look2.z}); competition cells ${s.folds.map(f => `${SHORT[f.name]} z ${f4(f.z)}`).join(', ')}; home-win slope ${f4(s.slope)} +/- ${f4(s.slopeSE)}`)
  p(`reported, not gating: per competition ${s.folds.map(f => `${SHORT[f.name]} n ${f.n} Brier U ${f4(f.brierU)} base ${f4(f.brierBase)}`).join('; ')}; opening matches (league-phase, not forecast) ${JSON.stringify(extra.opening ?? {})}`)
  p(`reported, not gating: log loss U ${f4(r.logLossU)} base ${f4(r.logLossBase)}; Brier uniform ${f4(r.brierUniform)}; observed shares ${r.observedShares.map(f4).join(' / ')} against the draw share assumed ${r.drawShareAssumed}; SE of mean D iid ${f4(r.seIid)}, clustered by home club ${f4(r.seClusteredByHomeClub)}`)
  if (r.pooledZIncludingTheFrozen90 !== undefined) p(`reported, not gating (Look 2, the one item that uses forecasts outside this run, for disclosure only): the pooled z with the ${r.frozenEligible} eligible frozen 2026-27 forecasts also included ${r.pooledZIncludingTheFrozen90}`)
  if (result.verdict === 'BUILD' && extra.fitFrozen) p(`BUILD does not retire the frozen 2026-27 bundle's adverse out-of-fit result: Brier difference ${f4(extra.fitFrozen.forwardDiff)}, z ${f4(extra.fitFrozen.forwardZ)}, n ${extra.fitFrozen.forwardN} (outbox/forecast-fit-uefa-result-2026-11-27.json)`)
  p(`VERDICT: ${result.verdict}`)
  for (const f of result.failed) p(`  ${f}`)
  return L.join('\n')
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
const readBundle = file => { const text = fs.readFileSync(file, 'utf8'); return { text, bundle: JSON.parse(text) } }
const arg = (argv, k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null }
const addedMessage = f => git('log', '--diff-filter=A', '--format=%B', '-1', '--', f)
const jsonIfExists = f => (f && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : undefined)

/** Every path ever added in any commit of the repository (the working tree is not enough: a deleted result, stop file or repair record must still count). Cached for one run. */
let everCache = null
export const everAdded = () => { if (everCache) return everCache; try { everCache = git('log', '--all', '--diff-filter=A', '--name-only', '--format=').split('\n').filter(Boolean) } catch { everCache = [] } return everCache }
const listLike = (dir, prefix, suffix) => {
  const found = new Set(fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith(suffix)).map(f => path.posix.join(dir, f)) : [])
  for (const q of everAdded()) if (path.posix.dirname(q) === dir && path.posix.basename(q).startsWith(prefix) && q.endsWith(suffix)) found.add(q)
  return [...found]
}
/** The stop files of a look: `<result path without .json>-stop-<n>.txt`, one per stop at G3, in the working tree or in any commit; their count is the look's stop count (the third stop is NO VERDICT). */
export const stopFiles = out => listLike(path.posix.dirname(out), path.posix.basename(out).replace(/\.json$/, '-stop-'), '.txt')
/** The repair records of a look: `<result path without .json>-repair-<n>.md`, committed by the author before the next run after a stop. */
export const repairFiles = out => listLike(path.posix.dirname(out), path.posix.basename(out).replace(/\.json$/, '-repair-'), '.md')
/** A result path that was ever added is refused, whether or not it is still in the tree. */
export const resultEver = out => fs.existsSync(out) || everAdded().includes(out)

export const LOOK1_RESULT = 'outbox/forecast-replicate-uefa-look1-result-2026-11-28.json'
export const WINDOW24_RE = /^outbox\/forecast-uefa-data-2024-25-[A-Za-z0-9._-]+\.json$/
/** G3 (a), the choice of bundle: the Look 1 bundle is the first 2024-25 bundle ever committed, or the one a repair record names (a line `bundle24: <path>`). */
export function firstBundleCheck(f24, addedInOrder, repairTexts) {
  const earliest = addedInOrder.find(q => WINDOW24_RE.test(q))
  const named = repairTexts.some(t => t.split('\n').some(l => l.trim() === `bundle24: ${f24}`))
  return { name: '(a) the bundle scored is a 2024-25 bundle path and the first one ever committed, or the one a repair record names (a line `bundle24: <path>`)', ok: WINDOW24_RE.test(f24) && (earliest === f24 || named), detail: `first ${earliest}, scored ${f24}` }
}
const addedInCommitOrder = () => { try { return git('log', '--all', '--diff-filter=A', '--name-only', '--format=', '--reverse').split('\n').filter(Boolean) } catch { return [] } }

export function look1Parts(file24, readMsg = addedMessage, extraBundles = [], out = null) {
  const { text, bundle } = readBundle(file24)
  const msg = readMsg(file24)
  const ic = integrityChecks(bundle, { text, committedBundleSha: bundleShaFromMessage(msg, file24), window: RULE.look1, expect: RULE.expected2024, expectEligible: RULE.expectedEligible2024 })
  const repairTexts = out ? repairFiles(out).map(f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '') : []
  const checks = [...ruleChecks(ruleShaFromMessage(git('log', '-1', '--format=%B', RULE_COMMIT)), ruleBlockSha256, MARKER_LINES, gitRuleFacts([file24, ...extraBundles])), firstBundleCheck(file24, addedInCommitOrder(), repairTexts), ...ic, ...scoringChecks([{ path: file24, message: msg }])]
  return { checks: Object.assign(checks, { counts: ic.counts }), rows: bundle.rows, text }
}

/** The comparison of the run's result with the independent implementation's output, as a committed record. `agrees` is true iff the verdicts are equal; a z difference above 1e-9 with the same verdict is `zAgrees` false and does not void the verdict (both numbers are in the record). `finalVerdict` is what a consumer reads: the run's verdict when the verdicts agree, else NO VERDICT. */
export function recomputeRecord(look, result, independent, toolingSha, independentSha256 = null) {
  const zDifference = Math.abs(result.z - independent.z), agrees = typeof result.verdict === 'string' && result.verdict === independent.verdict
  return { look, agrees, zAgrees: Number.isFinite(zDifference) && zDifference <= 1e-9, finalVerdict: agrees ? result.verdict : 'NO VERDICT', runVerdict: result.verdict, independentVerdict: independent.verdict, runZ: result.z, independentZ: independent.z, zDifference, independentSha256, ruleSha256: ruleBlockSha256, ruleCommit: RULE_COMMIT, toolingSha256: toolingSha, scoringSha256 }
}

/** The Look 2 checks: the forward bundle's G3, the scoring pins, the Look 1 record. Shared by `--look 2` and by the uncounted integrity pre-check the gate makes before it says RUN. */
function look2Parts(p1, l1, rec1, f26, today) {
  const { text, bundle } = readBundle(f26)
  const frozenText = fs.readFileSync('outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json', 'utf8')
  const frozenRows = JSON.parse(frozenText).rows
  const msg26 = addedMessage(f26)
  const c26 = integrityChecks(bundle, { text, committedBundleSha: bundleShaFromMessage(msg26, f26), window: { from: RULE.look2.seasonFrom, to: bundle.to }, runDate: today, expect: { leaguePhase: RULE.expected2024.leaguePhase }, expectForwardEligible: RULE.forwardEligible, frozen: { sha: sha256(frozenText), ids: new Set(frozenRows.map(r => r.espn_event_id)), rows: frozenRows } })
  const checks = Object.assign([...p1.checks, ...c26.map(c => ({ ...c, name: `[2026-27] ${c.name}` })), ...scoringChecks([{ path: f26, message: msg26 }], l1), ...recordChecks(l1, rec1)], { counts: { look1: p1.checks.counts, forward: c26.counts } })
  return { checks, rows26: bundle.rows, bundle26: { path: f26, sha256: sha256(text) } }
}

async function main() {
  const argv = process.argv.slice(2)
  const toolingSha = sha256(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8'))
  if (argv.includes('--compare-independent')) {
    const look = Number(arg(argv, '--look')), rf = arg(argv, '--result'), inf = arg(argv, '--independent'), out = arg(argv, '--out'), isf = arg(argv, '--independent-script')
    if (![1, 2].includes(look) || !rf || !inf || !out) { console.error('usage: --compare-independent --look 1|2 --result <result.json> --independent <independent output.json> --out <record.json> [--independent-script <file>]'); return 2 }
    const rec = recomputeRecord(look, JSON.parse(fs.readFileSync(rf, 'utf8')), JSON.parse(fs.readFileSync(inf, 'utf8')), toolingSha, isf && fs.existsSync(isf) ? sha256(fs.readFileSync(isf, 'utf8')) : null)
    fs.writeFileSync(out, JSON.stringify(rec, null, 1) + '\n')
    console.log(`RECOMPUTE look ${look}: verdicts ${rec.agrees ? 'agree' : 'DIFFER'} (${rec.runVerdict} / ${rec.independentVerdict}); final verdict ${rec.finalVerdict}; z difference ${rec.zDifference}${rec.zAgrees ? '' : ' (above 1e-9)'}`)
    return 0
  }
  if (argv.includes('--gate')) {
    const l1f = arg(argv, '--look1-result'), l2f = arg(argv, '--look2-result'), rcf = arg(argv, '--look1-recompute'), b26 = arg(argv, '--bundle26'), today = arg(argv, '--today') ?? new Date().toISOString().slice(0, 10)
    const look1Verdict = jsonIfExists(l1f)?.verdict
    let allClubsOnN = false
    if (b26 && fs.existsSync(b26)) { const lp = leaguePhaseRows(JSON.parse(fs.readFileSync(b26, 'utf8')).rows ?? []); allClubsOnN = LABELS.every(l => lp.perLabel[l] === RULE.expected2024.leaguePhase[l]) && lp.clubsNotOnN.length === 0 }
    const gate = look2Gate(today, { look1Verdict, look1RecomputeAgrees: jsonIfExists(rcf)?.agrees === true, look2VerdictCommitted: Boolean(l2f && resultEver(l2f)), allClubsOnN, look2Stops: l2f ? stopFiles(l2f).length : 0, look2Repairs: l2f ? repairFiles(l2f).length : 0 })
    console.log(`GATE: ${gate}`)
    if (gate === 'NO VERDICT' && argv.includes('--write-no-verdict') && l2f) fs.writeFileSync(l2f, JSON.stringify({ look: 2, verdict: 'NO VERDICT', failed: [`no committed Look 2 result by a run that started on or before the deadline ${RULE.look2.deadline}, or three stops (today ${today})`], ruleSha256: ruleBlockSha256, ruleCommit: RULE_COMMIT, toolingSha256: toolingSha, scoringSha256 }, null, 1) + '\n')
    return 0
  }
  const look = argv.includes('--integrity-only') ? 0 : Number(arg(argv, '--look'))
  if (![0, 1, 2].includes(look)) { console.error('usage: --integrity-only | --look 1 | --look 2 | --compare-independent | --gate (see the header)'); return 2 }
  const out = arg(argv, '--out'), l1f = arg(argv, '--look1-result'), b26 = arg(argv, '--bundle26')
  const today = arg(argv, '--today') ?? new Date().toISOString().slice(0, 10)
  const l1 = (look === 2 || (look === 0 && b26)) ? jsonIfExists(l1f) : undefined
  if ((look === 2 || (look === 0 && b26)) && !l1?.bundle24?.path) { console.error('a Look 2 run (or an integrity pre-check of the forward bundle) needs --look1-result naming the Look 1 bundle (key bundle24.path)'); return 2 }
  const f24 = (look === 2 || (look === 0 && b26)) ? l1.bundle24.path : arg(argv, '--bundle24')
  if (!f24) { console.error('--bundle24 is required'); return 2 }
  if ((look === 2 || (look === 0 && b26)) && arg(argv, '--bundle24') && arg(argv, '--bundle24') !== f24) { console.error(`--bundle24 ${arg(argv, '--bundle24')} is not the Look 1 bundle named in the Look 1 result (${f24})`); return 2 }
  if (look !== 0 && out && resultEver(out)) { console.error(`${out} already exists (now or in history): a look is run once to a completed G3 and its result is never rewritten`); return 2 }
  if (look !== 0 && out && stopFiles(out).length > repairFiles(out).length) { console.error(`a stop of this look has no repair record yet (${stopFiles(out).length} stops, ${repairFiles(out).length} repair records): not run`); return 2 }
  if (look === 2 && today > RULE.look2.deadline) { console.log('the Look 2 deadline has passed: not run'); return 2 }
  const p1 = look1Parts(f24, undefined, b26 ? [b26] : [], look === 1 ? out : (l1f ?? LOOK1_RESULT))
  let checks = p1.checks, rows26 = null, g3b = null, score, bundle26 = null, opening = openingMatches(p1.rows)
  const fit = JSON.parse(fs.readFileSync('outbox/forecast-fit-uefa-result-2026-11-27.json', 'utf8')).an
  const fitFrozen = { forwardDiff: fit.forwardDiff, forwardZ: fit.forwardZ, forwardN: fit.forwardN }
  if (look === 2 || (look === 0 && b26)) {
    const rec1 = jsonIfExists(arg(argv, '--look1-recompute'))
    const p2 = look2Parts(p1, l1, rec1, b26, today)
    checks = p2.checks; rows26 = p2.rows26; bundle26 = p2.bundle26
    opening = { look1: opening, forward: openingMatches(rows26) }
    // G3b: the Look 1 forecasts are scored again from the Look 1 bundle: the z must be the committed one, and the verdict they give must be the committed one and CONTINUE TO LOOK 2 (so an edited verdict key cannot start a Look 2)
    g3b = () => g3bCheck(p1.rows, l1)
    score = () => { const pooled = look2Pool(p1.rows, rows26), frz = frozenSet(rows26); return { stats: scoreForecasts(pooled), reported: { ...reported(pooled), pooledZIncludingTheFrozen90: scoreForecasts(look1Set(p1.rows).concat(frz, forwardSet(rows26))).z, frozenEligible: frz.length } } }
  } else if (look === 1) score = () => { const fs24 = look1Set(p1.rows); return { stats: scoreForecasts(fs24), reported: reported(fs24) } }
  const stops = out ? stopFiles(out).length + 1 : 1
  const result = look === 0 ? { verdict: 'INTEGRITY ONLY', failed: checks.filter(c => !c.ok).map(c => c.name), scored: false, checks } : run(look, checks, score, g3b, stops)
  const text = reportText(look, result, { counts: checks.counts, toolingSha, opening, fitFrozen })
  console.log(text)
  if (look === 0) return result.failed.length === 0 ? 0 : 1
  const common = { bundle24: { path: f24, sha256: sha256(p1.text) }, ...(bundle26 ? { bundle26 } : {}), ruleSha256: ruleBlockSha256, ruleCommit: RULE_COMMIT, toolingSha256: toolingSha, scoringSha256, runId: process.env.GITHUB_RUN_ID ?? null, checkout: git('rev-parse', 'HEAD').trim() }
  if (result.scored && out) fs.writeFileSync(out, JSON.stringify({ look, verdict: result.verdict, failed: result.failed, z: result.stats.z, stats: result.stats, reported: result.reported, ...common, checks: result.checks }, null, 1) + '\n')
  if (!result.scored && out) {
    fs.writeFileSync(out.replace(/\.json$/, `-stop-${stops}.txt`), text + '\n')
    // the third stop of a look is its NO VERDICT: the result file says so, and the gate and the run workflow stop there
    if (result.verdict === 'NO VERDICT') fs.writeFileSync(out, JSON.stringify({ look, verdict: 'NO VERDICT', failed: result.failed, stops, ...common }, null, 1) + '\n')
  }
  return result.scored ? 0 : 1
}
// an exception before a result is written writes nothing and exits 3 (neither a stop nor a verdict; the rule says what may be repaired)
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main().then(c => { process.exitCode = c }, e => { console.error(`ERROR ${e?.name}: ${e?.message}`); process.exitCode = 3 })
