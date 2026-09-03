// Merge the 51 MLS duplicate pairs. DRY RUN BY DEFAULT.
//
// The evidence is `probe-mls-pair-discriminators.mjs`, runs 33776839924 and
// 33777097281: 51 mixed-scheme clusters, all 51 answered `duplicate` by the
// relay's own MLS slate, 51 DISTINCT ESPN event ids. This acts on that and
// nothing else — it re-derives the pairs and re-asks the slate rather than
// trusting a JSON artifact from a run that finished some minutes ago, for the
// same reason `run-duplicate-row-cleanup.mjs` re-runs its gates: a delete must
// be gated on the state it is about to act on.
//
// A MERGE IS NOT A DELETE, and treating it as one would lose data. Each side
// holds fields the other lacks: the dash row carries `venue` and `opening_odds`
// and no `espn_event_id`; the underscore row carries the event id and the start
// time. So the survivor absorbs every field it is missing BEFORE the loser goes,
// and no non-null value on the survivor is ever overwritten.
//
// IDS ARE NOT RENAMED. `briefs.game_id` joins on the games id — that is what
// `game-id-scheme.mjs` exists to classify — so renaming a survivor to the
// `${SPORT}_${date}_e${eventId}` shape `d253209` now writes would orphan every
// brief pointing at it. Out of scope, and named here so it is a decision rather
// than an omission.
//
// WHAT THIS DOES NOT FIX. The external writer keeps inserting dash rows; this
// merges the ones that exist. Writing the slate's event id onto each survivor
// means a future `/archive/game` call carrying that numeric `source_id` upserts
// onto the survivor instead of creating a third row — which is `d253209`'s key
// doing its job — but it does not stop the dash writer.
//
// Usage:  node scripts/merge-mls-duplicate-pairs.mjs               DRY RUN
//         node scripts/merge-mls-duplicate-pairs.mjs --self-test
//         node scripts/merge-mls-duplicate-pairs.mjs --execute --i-have-approval

import { writeFileSync, mkdirSync } from 'node:fs'
import { schemeOf } from './game-id-scheme.mjs'
import { clustersByDay, mixedScheme } from './probe-archive-scheme-duplicates.mjs'
import { slateMatches, slateVerdict } from './probe-mls-pair-discriminators.mjs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const RELAY_SECRET = process.env.RELAY_SHARED_SECRET || ''
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const nul = v => v === null || v === undefined || v === ''

/** Columns that define WHICH FIXTURE a row is. A merge must never move one. */
export const IDENTITY = ['id', 'sport', 'date', 'home', 'away']

/**
 * Columns the merge may fill in. `created_at` is excluded on purpose: it records
 * when THIS row was written, and copying the loser's onto the survivor would
 * turn a provenance fact into a fiction.
 */
export const MERGEABLE = [
  'league', 'home_score', 'away_score', 'venue', 'streams', 'note', 'tags', 'crew',
  'local_note', 'opening_odds', 'closing_odds', 'drama_peak', 'drama_arc',
  'espn_event_id', 'went_to_ot', 'finalized_at', 'start_time', 'importance',
]

/**
 * Which row survives, or a refusal.
 *
 * FOUR CASES, and the fourth is the one that matters. Two rows carrying two
 * DIFFERENT non-null event ids are two games — `classifyPair` says so, and this
 * must refuse rather than merge them, because a merge there destroys a real
 * fixture. It cannot happen given the slate said `one-fixture`, and it is
 * checked anyway: the whole point of a gate is that it holds when the reasoning
 * upstream of it is wrong.
 *
 * Otherwise the `provider-composite` row survives — the one whose id shape this
 * project writes and whose id `briefs` are most likely to reference. When it
 * lacks the event id, the merge supplies the slate's.
 */
export const pickSurvivor = (a, b, slateKey) => {
  const ea = nul(a.espn_event_id) ? null : String(a.espn_event_id)
  const eb = nul(b.espn_event_id) ? null : String(b.espn_event_id)
  if (ea && eb && ea !== eb)
    return { refuse: true, why: `two different event ids (${ea}, ${eb}) — two games, not a duplicate` }
  if (!slateKey)
    return { refuse: true, why: 'no slate key; nothing authoritative to merge onto' }
  for (const [x, y] of [[a, b], [b, a]]) {
    const ex = nul(x.espn_event_id) ? null : String(x.espn_event_id)
    if (ex && ex !== slateKey)
      return { refuse: true, why: `${x.id} carries event id ${ex}, the slate says ${slateKey}` }
  }
  const pc = [a, b].filter(r => schemeOf(r.id) === 'provider-composite')
  if (pc.length !== 1)
    return { refuse: true, why: `expected exactly one provider-composite row, found ${pc.length}` }
  const survivor = pc[0]
  const loser = survivor === a ? b : a
  return { survivor, loser, reason: 'provider-composite survives; briefs join on the games id' }
}

/**
 * The fields the survivor is missing and the loser has.
 *
 * NEVER OVERWRITES. A merge that let the loser's value win could replace a real
 * score with a stub's null-adjacent value, and there is no undo on a D1 write.
 */
export const mergePayload = (survivor, loser) => {
  const out = {}
  for (const f of MERGEABLE)
    if (nul(survivor[f]) && !nul(loser[f])) out[f] = loser[f]
  return out
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const dash = (o = {}) => ({ id: '2026-08-29-mls-sd-la', ...o })
  const ours = (o = {}) => ({ id: 'MLS_2026-08-29_sandiego_lagalaxy', ...o })

  const p = pickSurvivor(dash({ venue: 'X' }), ours({ espn_event_id: '761767' }), '761767')
  check('the provider-composite row survives', p.survivor?.id === 'MLS_2026-08-29_sandiego_lagalaxy')
  check('...and the dash row is the loser', p.loser?.id === '2026-08-29-mls-sd-la')
  check('order does not matter',
    pickSurvivor(ours({ espn_event_id: '761767' }), dash(), '761767').survivor?.id
      === 'MLS_2026-08-29_sandiego_lagalaxy')
  check('a survivor with no event id is still fine — the slate supplies it',
    pickSurvivor(dash(), ours(), '761767').survivor?.id === 'MLS_2026-08-29_sandiego_lagalaxy')

  // ASSERTED ON THE REASON, NOT JUST ON `refuse`. With two differing ids and a
  // slate key present, at most one id can equal the key — so the
  // slate-contradiction gate below would refuse this input too, and a test
  // checking only `refuse === true` passes with this gate deleted. Measured:
  // it did, 16/16, until the assertion moved to the message. The gate earns its
  // place by firing FIRST and saying the true thing ("two games"), which the
  // other gate does not.
  const twoGames = pickSurvivor(dash({ espn_event_id: '1' }), ours({ espn_event_id: '2' }), '1')
  check('TWO DIFFERENT EVENT IDS ARE REFUSED, AND NAMED AS TWO GAMES',
    twoGames.refuse === true && /two games/.test(twoGames.why),
    `refuse=${twoGames.refuse} why=${twoGames.why} — a merge here destroys a real fixture, `
    + 'and the caller needs to be told that rather than told the key disagrees')
  const contra = pickSurvivor(dash(), ours({ espn_event_id: '999' }), '761767')
  check('an event id CONTRADICTING the slate is refused, and says so',
    contra.refuse === true && /the slate says 761767/.test(contra.why),
    `why=${contra.why} — merging onto a key the source disagrees with is inventing the answer`)
  const noKey = pickSurvivor(dash(), ours(), null)
  check('no slate key is a refusal, not a guess, and names the absence',
    noKey.refuse === true && /no slate key/.test(noKey.why), `why=${noKey.why}`)
  const twoOurs = pickSurvivor(ours({ id: 'MLS_a' }), ours({ id: 'MLS_b' }), '1')
  check('TWO ROWS OF OUR OWN SCHEME ARE REFUSED, and the count is named',
    twoOurs.refuse === true && /found 2/.test(twoOurs.why),
    `why=${twoOurs.why} — that is one writer running twice, a different defect this merge does not address`)
  const twoDash = pickSurvivor(dash({ id: '2026-08-29-a' }), dash({ id: '2026-08-29-b' }), '1')
  check('two dash rows are refused too, and for the same stated reason',
    twoDash.refuse === true && /found 0/.test(twoDash.why), `why=${twoDash.why}`)

  check('the payload carries what the survivor lacks',
    mergePayload({ venue: null, start_time: '20:00' }, { venue: 'Audi Field', start_time: null })
      .venue === 'Audi Field')
  check('A NON-NULL SURVIVOR VALUE IS NEVER OVERWRITTEN',
    mergePayload({ venue: 'Audi Field' }, { venue: 'Somewhere Else' }).venue === undefined,
    'there is no undo on a D1 write, and the loser is the stub')
  check('an empty string counts as missing',
    mergePayload({ venue: '' }, { venue: 'Audi Field' }).venue === 'Audi Field')
  check('nothing to copy yields an empty payload',
    Object.keys(mergePayload({ venue: 'A' }, { venue: null })).length === 0)
  check('THE IDENTITY COLUMNS ARE NOT MERGEABLE',
    IDENTITY.every(f => !MERGEABLE.includes(f)),
    'a merge that moved `home` would change which fixture the row is')
  check('created_at is not mergeable either', !MERGEABLE.includes('created_at'),
    'it records when THIS row was written; copying the loser\'s makes a provenance fact a fiction')
  check('the payload only ever contains mergeable columns',
    Object.keys(mergePayload({ id: null, home: null, venue: null },
      { id: 'x', home: 'y', venue: 'z' })).every(f => MERGEABLE.includes(f)))

  process.exit(summarize() === 0 ? 0 : 1)
}

// ─── the run ──────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const EXECUTE = process.argv.includes('--execute') && process.argv.includes('--i-have-approval')
  if (process.argv.includes('--execute') && !EXECUTE) {
    console.error('--execute requires --i-have-approval on the same command line.')
    console.error('Deleting archive rows needs explicit human approval; a single flag is too easy to type.')
    process.exit(1)
  }

  const d1 = async (sql, params = []) => {
    if (!RELAY_SECRET) throw new Error('RELAY_SHARED_SECRET is not set. This will not guess it.')
    const r = await fetch(`${RELAY}/d1/execute`, {
      method: 'POST',
      headers: { 'X-FIELD-Relay': RELAY_SECRET, 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ sql, params }),
    })
    const t = await r.text()
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`)
    const j = JSON.parse(t)
    if (j.ok === false) throw new Error(`relay error: ${j.error}`)
    return j.results || []
  }

  console.log(`=== MLS duplicate merge — ${EXECUTE ? 'EXECUTE' : 'DRY RUN'} — ${new Date().toISOString()} ===\n`)

  const rows = await d1(`SELECT * FROM regular_season_games WHERE sport = 'MLS'`)
  const clusters = clustersByDay(rows).filter(c => mixedScheme(c.rows))
  console.log(`${rows.length} MLS row(s), ${clusters.length} mixed-scheme cluster(s)\n`)

  const slateCache = new Map()
  const slateFor = async (date) => {
    if (slateCache.has(date)) return slateCache.get(date)
    let games = null
    try {
      const r = await fetch(`${RELAY}/v2/games?sport=mls&date=${date}`, { headers: { 'User-Agent': UA } })
      if (r.ok) { const j = await r.json(); games = Array.isArray(j?.games) ? j.games : null }
    } catch { games = null }
    slateCache.set(date, games)
    return games
  }

  // Every table /d1/execute will let us read, and which of their columns holds a
  // games id. `game_id` is the convention; `id` is excluded because it is the
  // table's own key, not a reference.
  const ALLOWED = ['odds_history', 'odds_backfill_progress', 'regular_season_games', 'postseason_games',
    'change_log', 'analytics_output', 'briefs', 'codex', 'jq_retry_telemetry', 'game_thread_notes']
  const REFERENCERS = []
  for (const t of ALLOWED) {
    if (t === 'regular_season_games' || t === 'postseason_games') continue
    let cols = []
    try { cols = await d1(`PRAGMA table_info(${t})`) } catch { continue }
    for (const c of cols)
      if (/^game_id$/i.test(c.name) || /_game_id$/i.test(c.name)) REFERENCERS.push([t, c.name])
  }
  console.log(`  referencing column(s) discovered: ${REFERENCERS.map(([t, c]) => `${t}.${c}`).join(', ') || '(none)'}\n`)

  const plan = []
  const refused = []

  for (const c of clusters) {
    const [a, b] = c.rows
    if (c.rows.length !== 2) { refused.push({ date: c.date, ids: c.rows.map(r => r.id), why: `cluster of ${c.rows.length}, not 2` }); continue }

    const slate = await slateFor(c.date)
    const matches = slate === null ? null : slateMatches(slate, a)
    const sv = slateVerdict(matches === null ? null : matches.length)
    if (sv !== 'one-fixture') { refused.push({ date: c.date, ids: [a.id, b.id], why: `slate says ${sv}` }); continue }

    const key = matches[0]?.espnEventId ? String(matches[0].espnEventId) : null
    const pick = pickSurvivor(a, b, key)
    if (pick.refuse) { refused.push({ date: c.date, ids: [a.id, b.id], why: pick.why }); continue }

    const payload = mergePayload(pick.survivor, pick.loser)
    if (nul(pick.survivor.espn_event_id) && !payload.espn_event_id) payload.espn_event_id = key

    // REFERENTIAL SAFETY, over every table that actually references a game —
    // DISCOVERED, not listed from memory. The first version of this checked
    // `briefs` and `change_log` because those were the two I could name, which
    // is the same guess-instead-of-probe this repo keeps deleting. REFERENCERS
    // is built from PRAGMA table_info over the /d1/execute allowlist, so a table
    // with a game-id column that nobody remembered still blocks.
    const refs = {}
    for (const [table, col] of REFERENCERS) {
      const n = await d1(`SELECT COUNT(*) n FROM ${table} WHERE ${col} = ?`, [pick.loser.id])
      const k = Number(n[0]?.n ?? 0)
      if (k) refs[`${table}.${col}`] = k
    }
    plan.push({
      date: c.date, key,
      survivor: pick.survivor.id, loser: pick.loser.id,
      payload, refs,
    })
  }

  for (const p of plan.slice(0, 60)) {
    console.log(`  ${p.date}  key=${p.key}`)
    console.log(`     keep   ${p.survivor}`)
    const r = Object.entries(p.refs).map(([k, n]) => `${k}=${n}`).join('  ')
    console.log(`     delete ${p.loser}${r ? `   refs: ${r}` : ''}`)
    console.log(`     absorb ${Object.keys(p.payload).length ? Object.keys(p.payload).join(', ') : '(nothing)'}`)
  }

  const fieldCounts = {}
  for (const p of plan) for (const f of Object.keys(p.payload)) fieldCounts[f] = (fieldCounts[f] ?? 0) + 1
  console.log('\n  fields the survivors would absorb, across all pairs:')
  for (const [f, n] of Object.entries(fieldCounts).sort((x, y) => y[1] - x[1]))
    console.log(`    ${String(n).padStart(4)}  ${f}`)

  if (refused.length) {
    console.log(`\n  REFUSED ${refused.length} pair(s) — these are NOT merged and NOT skipped silently:`)
    for (const r of refused) console.log(`    ${r.date}  ${r.ids.join('  ')}\n      ${r.why}`)
  }

  let fatal = 0
  const say = (ok, name, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
    if (!ok) { fatal++; if (detail) console.log(`      ${detail}`) }
  }
  console.log('')
  say(plan.length > 0, 'there is a plan to act on',
    'zero pairs planned — read that rather than reporting a clean merge')
  say(refused.length === 0, 'no pair was refused',
    `${refused.length} refused; a merge that proceeds past a refusal is not the merge that was reviewed`)
  say(REFERENCERS.length > 0, 'at least one referencing column was discovered',
    'zero means PRAGMA returned nothing and the referential check measured NOTHING — '
    + 'which would look exactly like a clean merge')
  const totals = {}
  for (const p of plan) for (const [k, n] of Object.entries(p.refs)) totals[k] = (totals[k] ?? 0) + n
  if (Object.keys(totals).length) {
    console.log('\n  rows in other tables pointing at a row that would be deleted:')
    for (const [k, n] of Object.entries(totals)) console.log(`    ${String(n).padStart(4)}  ${k}`)
  }
  // SAMPLE THE ACTUAL ROWS. A count says a reference exists; it does not say
  // whether repointing it at the survivor is right, disposable, or wrong. That
  // decision needs the content, and reading it from a count is the shape of
  // error this session has already made twice today.
  const sample = plan.find(p => Object.keys(p.refs).length)
  if (sample) {
    console.log(`\n  sample of what points at ${sample.loser}:`)
    for (const [k] of Object.entries(sample.refs)) {
      const [table, col] = k.split('.')
      const got = await d1(`SELECT * FROM ${table} WHERE ${col} = ? LIMIT 3`, [sample.loser])
      for (const g of got) console.log(`    ${table}: ${JSON.stringify(g).slice(0, 320)}`)
    }
  }

  const orphaning = plan.filter(p => Object.keys(p.refs).length)
  say(orphaning.length === 0, 'nothing else references a row that would be deleted',
    `${orphaning.length} of ${plan.length} pair(s) would orphan a reference. `
    + `Totals: ${Object.entries(totals).map(([k, n]) => `${k}=${n}`).join(', ')}. `
    + 'Repoint them at the survivor or decide they are disposable — do not delete past this.')
  say(new Set(plan.map(p => p.key)).size === plan.length, 'every merge key is distinct',
    'two pairs resolving to one event id would fold two real fixtures together')
  say(new Set(plan.map(p => p.survivor)).size === plan.length, 'every survivor is distinct')

  mkdirSync('outbox', { recursive: true })
  const out = { probed_at: new Date().toISOString(), executed: EXECUTE, planned: plan.length, refused, plan, results: [] }

  if (!EXECUTE) {
    console.log(`\nDRY RUN — nothing was written. ${plan.length} pair(s) planned, ${refused.length} refused.`)
    console.log('To execute:  --execute --i-have-approval   (both flags, and only with human approval)')
  } else if (fatal) {
    console.log('\nREFUSING TO EXECUTE — a gate above failed. The gates are the review.')
  } else {
    console.log(`\nEXECUTING ${plan.length} merge(s).\n`)
    for (const p of plan) {
      const sets = Object.keys(p.payload)
      if (sets.length) {
        await d1(`UPDATE regular_season_games SET ${sets.map(f => `${f} = ?`).join(', ')} WHERE id = ?`,
          [...sets.map(f => p.payload[f]), p.survivor])
      }
      await d1(`DELETE FROM regular_season_games WHERE id = ?`, [p.loser])
      // VERIFY THE STATE, do not assume the write took. Two facts, both checked.
      const [gone, kept] = await Promise.all([
        d1(`SELECT COUNT(*) n FROM regular_season_games WHERE id = ?`, [p.loser]),
        d1(`SELECT id, espn_event_id, venue FROM regular_season_games WHERE id = ?`, [p.survivor]),
      ])
      const ok = Number(gone[0]?.n ?? 1) === 0 && kept.length === 1
      out.results.push({ ...p, loser_gone: Number(gone[0]?.n ?? 1) === 0, survivor: kept[0] ?? null })
      console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${p.loser} -> ${p.survivor}  eid=${kept[0]?.espn_event_id ?? '?'}`)
      if (!ok) fatal++
    }
    say(out.results.every(r => r.loser_gone), 'every loser row is gone')
    say(out.results.every(r => r.survivor), 'every survivor row is still present')
  }

  writeFileSync('outbox/mls-merge-latest.json', JSON.stringify(out, null, 2))
  console.log('\nwrote outbox/mls-merge-latest.json')
  process.exit(fatal ? 1 : 0)
}
