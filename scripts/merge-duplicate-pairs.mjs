// Merge same-fixture rows written under two id schemes. DRY RUN BY DEFAULT.
//
// SCOPED BY SPORT, not to MLS. It began as merge-mls-duplicate-pairs.mjs and
// merged 51 MLS pairs on 2026-09-03; the same sweep found 2 WNBA pairs under a
// THIRD id scheme (`sport-prefixed-external`,
// `wnba_2026-06-20_atlantadre_indianafev` against `WNBA_2026-06-20_dream_fever`),
// and nothing in the machinery was MLS-specific — `mixedScheme` compares schemes
// without naming them and `pickSurvivor` asks which row is provider-composite.
// Only the SQL filter and the slate URL were. Renamed rather than left with a
// name that had stopped being true.
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
// Usage:  node scripts/merge-duplicate-pairs.mjs --sport MLS          DRY RUN
//         node scripts/merge-duplicate-pairs.mjs --self-test
//         node scripts/merge-duplicate-pairs.mjs --sport WNBA --execute --i-have-approval

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

/**
 * Columns that do NOT distinguish two records of the same event.
 *
 * `id` is the row's own key and the game-id column is the thing being changed,
 * so neither can be evidence. `ts`, `consumed`, `created_at` and `updated_at`
 * are bookkeeping: two writes of one captured event, filed under two game ids
 * moments apart, differ there and are still one record. The event's own identity
 * travels inside the content columns — `change_log.new_value` carries the
 * odds payload's `captured_at`, which is what made the sampled pair identical to
 * the millisecond.
 *
 * NAMED HERE RATHER THAN INLINE because it is a judgement, and a judgement that
 * decides whether a row is deleted has to be visible and testable.
 */
export const NOT_EVIDENCE = ['id', 'ts', 'consumed', 'created_at', 'updated_at']

/**
 * Are these two rows the same record, filed under two game ids?
 *
 * Compares every column that is not in `ignore`, and REQUIRES AT LEAST ONE such
 * column — otherwise a table whose columns were all ignored would report every
 * row identical to every other, and the merge would delete real records while
 * reporting a clean duplicate collapse.
 */
export const sameRecord = (a, b, ignore) => {
  const skip = new Set(ignore.map(x => String(x).toLowerCase()))
  const keys = Object.keys(a ?? {}).filter(k => !skip.has(k.toLowerCase()))
  if (!keys.length) return false
  return keys.every(k => String(a[k] ?? '') === String(b?.[k] ?? ''))
}

/**
 * For one loser row: is it redundant, and if not, what makes it different?
 *
 * Returns `drop` with the survivor row it duplicates, or `repoint` with the
 * columns that differ from the nearest candidate — so a decision to repoint is
 * reported with its reason rather than as a default.
 */
export const referenceAction = (loserRow, survivorRows, ignore) => {
  for (const s of survivorRows ?? [])
    if (sameRecord(loserRow, s, ignore)) return { action: 'drop', duplicateOf: s.id ?? null }
  const skip = new Set(ignore.map(x => String(x).toLowerCase()))
  const keys = Object.keys(loserRow ?? {}).filter(k => !skip.has(k.toLowerCase()))
  const nearest = (survivorRows ?? [])[0]
  const differing = nearest ? keys.filter(k => String(loserRow[k] ?? '') !== String(nearest[k] ?? '')) : keys
  return { action: 'repoint', differing, comparedAgainst: nearest?.id ?? null }
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
  // THE WNBA PAIR USES A DIFFERENT THIRD SCHEME, and pickSurvivor must handle it
  // without being told: `sport-prefixed-external` is lower-case-prefixed, so the
  // upper-case row is still the only provider-composite one.
  const wnba = pickSurvivor(
    { id: 'wnba_2026-06-20_atlantadre_indianafev' },
    { id: 'WNBA_2026-06-20_dream_fever', espn_event_id: '401736123' }, '401736123')
  check('THE WNBA PAIR RESOLVES WITHOUT THE RULE KNOWING THE SCHEME',
    wnba.survivor?.id === 'WNBA_2026-06-20_dream_fever'
    && wnba.loser?.id === 'wnba_2026-06-20_atlantadre_indianafev',
    `${JSON.stringify(wnba)} — the loser here is sport-prefixed-external, not the `
    + 'dash shape the MLS pairs used; nothing in pickSurvivor names either')

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

  // ── the reference rule ────────────────────────────────────────────────────
  const IG = [...NOT_EVIDENCE, 'game_id']
  const cl = (o = {}) => ({ id: 1, game_id: 'x', source: 'odds_api', field: 'opening_odds',
    old_value: null, new_value: '{"captured_at":"2026-08-29T10:01:46.114Z"}', ts: '10:01', consumed: 0, ...o })

  check('THE SAMPLED PAIR IS ONE RECORD FILED TWICE',
    sameRecord(cl({ id: 10467, game_id: '2026-08-29-mls-sd-la' }),
               cl({ id: 10491, game_id: 'MLS_2026-08-29_sandiego_lagalaxy', ts: '10:02' }), IG),
    'same source, field and payload; different row id, game id and bookkeeping timestamp')
  check('a different captured_at is a different record',
    !sameRecord(cl(), cl({ new_value: '{"captured_at":"2026-08-29T11:55:38Z"}' }), IG))
  check('a different FIELD is a different record',
    !sameRecord(cl(), cl({ field: 'closing_odds' }), IG),
    'the survivor carries a closing_odds row the loser does not; it must never be dropped')
  check('a different SOURCE is a different record',
    !sameRecord(cl(), cl({ source: 'archive_game_closing' }), IG))
  check('IGNORING EVERY COLUMN MEANS NO MATCH, NOT EVERY MATCH',
    !sameRecord(cl(), cl({ source: 'totally different' }), Object.keys(cl())),
    'a table whose columns were all ignored would report every row identical to '
    + 'every other, and the merge would delete real records reporting a clean collapse')
  check('null and empty compare equal, so a NULL old_value is not spurious evidence',
    sameRecord(cl({ old_value: null }), cl({ old_value: '' }), IG))

  const drop = referenceAction(cl({ id: 10467 }), [cl({ id: 10491, ts: 'z' })], IG)
  check('a redundant row is dropped, and says which row it duplicates',
    drop.action === 'drop' && drop.duplicateOf === 10491)
  const rp = referenceAction(cl({ id: 10467, field: 'closing_odds' }), [cl({ id: 10491 })], IG)
  check('a row with no match is repointed, and NAMES what differs',
    rp.action === 'repoint' && rp.differing.includes('field'),
    `differing=${JSON.stringify(rp.differing)} — a repoint reported without its reason is a default, not a decision`)
  check('with no survivor rows at all, everything is repointed',
    referenceAction(cl(), [], IG).action === 'repoint')

  process.exit(summarize() === 0 ? 0 : 1)
}

// ─── the run ──────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  // The sport is REQUIRED and not defaulted. A merge that picked its own scope
  // could delete rows in a league nobody was looking at, and "it defaulted to
  // MLS" is not a thing to discover from an execute run.
  const si = process.argv.indexOf('--sport')
  const SPORT = si >= 0 ? process.argv[si + 1] : null
  if (!SPORT) { console.error('--sport is required (e.g. --sport MLS). This will not pick a scope for you.'); process.exit(1) }
  // The v2 slate names sports in lower case; measured, not assumed —
  // /v2/games?sport=mls answered 200 on 2026-09-03 and the archive's label is `MLS`.
  const V2_SPORT = SPORT.toLowerCase()

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

  console.log(`=== ${SPORT} duplicate merge — ${EXECUTE ? 'EXECUTE' : 'DRY RUN'} — ${new Date().toISOString()} ===\n`)

  const rows = await d1(`SELECT * FROM regular_season_games WHERE sport = ?`, [SPORT])
  const clusters = clustersByDay(rows).filter(c => mixedScheme(c.rows))
  console.log(`${rows.length} ${SPORT} row(s), ${clusters.length} mixed-scheme cluster(s)\n`)

  const slateCache = new Map()
  const slateFor = async (date) => {
    if (slateCache.has(date)) return slateCache.get(date)
    let games = null
    try {
      const r = await fetch(`${RELAY}/v2/games?sport=${V2_SPORT}&date=${date}`, { headers: { 'User-Agent': UA } })
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
    // The primary key is captured too: a drop targets the ROW, never a predicate.
    // A table with no single-column pk cannot be safely dropped from, and the
    // plan refuses those rather than widening a DELETE into a match.
    const pk = cols.filter(c => Number(c.pk) > 0)
    for (const c of cols)
      if (/^game_id$/i.test(c.name) || /_game_id$/i.test(c.name))
        REFERENCERS.push([t, c.name, pk.length === 1 ? pk[0].name : null])
  }
  console.log(`  referencing column(s) discovered: ${REFERENCERS.map(([t, c, k]) => `${t}.${c}${k ? '' : ' (NO SINGLE PK)'}`).join(', ') || '(none)'}\n`)

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
    // PER ROW, NOT PER TABLE. The sampled pair showed the loser's change_log row
    // is byte-identical to one the survivor already holds — same source, same
    // field, same captured_at — so repointing it would file one record twice
    // rather than preserve anything. Each row is classified on its own content.
    const refs = {}, survivorRefs = {}, actions = []
    let unsafeDrop = null
    for (const [table, col, pk] of REFERENCERS) {
      const [lrows, srows] = await Promise.all([
        d1(`SELECT * FROM ${table} WHERE ${col} = ?`, [pick.loser.id]),
        d1(`SELECT * FROM ${table} WHERE ${col} = ?`, [pick.survivor.id]),
      ])
      if (lrows.length) refs[`${table}.${col}`] = lrows.length
      if (srows.length) survivorRefs[`${table}.${col}`] = srows.length
      for (const row of lrows) {
        const a = referenceAction(row, srows, [...NOT_EVIDENCE, col])
        if (a.action === 'drop' && !pk) { unsafeDrop = `${table} has no single-column primary key`; continue }
        actions.push({ table, col, pk, rowId: pk ? row[pk] : null, ...a })
      }
    }
    if (unsafeDrop) { refused.push({ date: c.date, ids: [a.id, b.id], why: unsafeDrop }); continue }
    plan.push({
      date: c.date, key,
      survivor: pick.survivor.id, loser: pick.loser.id,
      payload, refs, survivorRefs, actions,
    })
  }

  for (const p of plan.slice(0, 60)) {
    console.log(`  ${p.date}  key=${p.key}`)
    console.log(`     keep   ${p.survivor}`)
    const r = Object.entries(p.refs).map(([k, n]) => `${k}=${n}`).join('  ')
    console.log(`     delete ${p.loser}${r ? `   refs: ${r}` : ''}`)
    console.log(`     absorb ${Object.keys(p.payload).length ? Object.keys(p.payload).join(', ') : '(nothing)'}`)
    const rp = p.actions.filter(x => x.action === 'repoint'), dr = p.actions.filter(x => x.action === 'drop')
    if (p.actions.length)
      console.log(`     refs   repoint ${rp.length}, drop ${dr.length} (redundant)`
        + (rp.length ? `  [${rp.map(x => `${x.table}#${x.rowId} differs on ${x.differing.join('/') || '(no survivor row)'}`).join('; ')}]` : ''))
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
  // SAMPLE BOTH SIDES. A count says a reference exists; it does not say whether
  // repointing it is right. And where BOTH rows carry references in one table,
  // repointing merges two series — so the question is not "is this a reference"
  // but "are these two records of the same event, or two different ones". Only
  // the rows answer that, and reading it off a count would be the same error a
  // third time.
  const sample = plan.find(p => Object.keys(p.refs).some(k => p.survivorRefs[k])) ?? plan.find(p => Object.keys(p.refs).length)
  if (sample) {
    for (const k of Object.keys(sample.refs)) {
      const [table, col] = k.split('.')
      for (const [label, id] of [['LOSER   ', sample.loser], ['SURVIVOR', sample.survivor]]) {
        const got = await d1(`SELECT * FROM ${table} WHERE ${col} = ? LIMIT 4`, [id])
        console.log(`\n  ${table} rows on ${label} ${id}:`)
        for (const g of got) console.log(`    ${JSON.stringify(g).slice(0, 300)}`)
        if (!got.length) console.log('    (none)')
      }
    }
  }

  // THE REFERENCES ARE REPOINTED, NOT ORPHANED, and this is the decision the
  // first dry run forced. The sampled rows are not incidental bookkeeping:
  //
  //   change_log: {"game_id":"2026-08-29-mls-sd-la","source":"odds_api",
  //                "field":"opening_odds","new_value":"{...draftkings...}"}
  //
  // The ODDS PIPELINE WROTE TO THE DASH ROW. 135 change_log rows and 22
  // odds_history rows hang off the rows that would be deleted, and deleting them
  // would detach a real odds series from the fixture it belongs to. The fixture
  // survives under the other id — the slate established that — so the correct
  // action is to move the references onto the survivor.
  //
  // Every referencing table must be writable through /d1/execute or the repoint
  // cannot happen and the delete must not either.
  const unwritable = [...new Set(Object.keys(totals).map(k => k.split('.')[0]))].filter(t => !ALLOWED.includes(t))
  say(unwritable.length === 0, 'every referencing table is writable through /d1/execute',
    `cannot repoint references in: ${unwritable.join(', ')} — and a delete that cannot repoint must not run`)

  const allActions = plan.flatMap(p => p.actions)
  const nRepoint = allActions.filter(a => a.action === 'repoint').length
  const nDrop = allActions.filter(a => a.action === 'drop').length
  console.log(`\n  reference plan: ${nRepoint} repoint, ${nDrop} drop as redundant, ${allActions.length} total`)
  const byTable = {}
  for (const a of allActions) {
    const k = `${a.table}.${a.col}`
    byTable[k] = byTable[k] || { repoint: 0, drop: 0 }
    byTable[k][a.action === 'drop' ? 'drop' : 'repoint']++
  }
  for (const [k, v] of Object.entries(byTable))
    console.log(`    ${k}: repoint ${v.repoint}, drop ${v.drop}`)
  say(allActions.length === Object.values(totals).reduce((x, y) => x + y, 0),
    'every reference got an action', 'a reference with no action would be silently orphaned')
  say(allActions.every(a => a.action !== 'drop' || a.rowId != null),
    'every dropped row is addressed by its own primary key',
    'a DELETE by predicate could match rows the plan never enumerated')

  const collide = plan.filter(p => Object.keys(p.refs).some(k => p.survivorRefs[k]))
  if (collide.length) {
    console.log(`\n  ${collide.length} pair(s) where BOTH rows carry references in the same table.`)
    console.log('  Repointing merges two series into one; read these before approving:')
    for (const p of collide.slice(0, 10))
      console.log(`    ${p.date}  ${p.loser} ${JSON.stringify(p.refs)}  +  ${p.survivor} ${JSON.stringify(p.survivorRefs)}`)
  }
  say(new Set(plan.map(p => p.key)).size === plan.length, 'every merge key is distinct',
    'two pairs resolving to one event id would fold two real fixtures together')
  say(new Set(plan.map(p => p.survivor)).size === plan.length, 'every survivor is distinct')

  mkdirSync('outbox', { recursive: true })
  const out = { probed_at: new Date().toISOString(), sport: SPORT, executed: EXECUTE, planned: plan.length, refused, plan, results: [] }

  if (!EXECUTE) {
    console.log(`\nDRY RUN — nothing was written. ${plan.length} pair(s) planned, ${refused.length} refused.`)
    console.log('To execute:  --execute --i-have-approval   (both flags, and only with human approval)')
  } else if (fatal) {
    console.log('\nREFUSING TO EXECUTE — a gate above failed. The gates are the review.')
  } else {
    console.log(`\nEXECUTING ${plan.length} merge(s).\n`)
    for (const p of plan) {
      // ORDER MATTERS AND IS NOT ARBITRARY. Repoint first: if it fails, the
      // delete never runs and the row is still there to repoint next time. Delete
      // first would leave 157 references pointing at nothing with no way back.
      for (const a of p.actions) {
        if (a.action === 'drop') {
          // BY PRIMARY KEY, never by predicate: the plan enumerated this exact
          // row and nothing else may be caught by the same statement.
          await d1(`DELETE FROM ${a.table} WHERE ${a.pk} = ?`, [a.rowId])
        } else {
          await d1(`UPDATE ${a.table} SET ${a.col} = ? WHERE ${a.pk} = ?`, [p.survivor, a.rowId])
        }
      }
      for (const k of Object.keys(p.refs)) {
        const [table, col] = k.split('.')
        const left = await d1(`SELECT COUNT(*) n FROM ${table} WHERE ${col} = ?`, [p.loser])
        if (Number(left[0]?.n ?? 1) !== 0)
          throw new Error(`${left[0].n} row(s) in ${k} still point at ${p.loser}; NOT deleting it`)
      }
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
      // AND THAT NOTHING STILL POINTS AT THE ROW THAT IS NOW GONE.
      let dangling = 0
      for (const k of Object.keys(p.refs)) {
        const [table, col] = k.split('.')
        const left = await d1(`SELECT COUNT(*) n FROM ${table} WHERE ${col} = ?`, [p.loser])
        dangling += Number(left[0]?.n ?? 0)
      }
      const ok = Number(gone[0]?.n ?? 1) === 0 && kept.length === 1 && dangling === 0
      out.results.push({ ...p, loser_gone: Number(gone[0]?.n ?? 1) === 0, dangling, survivor: kept[0] ?? null })
      console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${p.loser} -> ${p.survivor}  eid=${kept[0]?.espn_event_id ?? '?'}`)
      if (!ok) fatal++
    }
    say(out.results.every(r => r.loser_gone), 'every loser row is gone')
    say(out.results.every(r => r.survivor), 'every survivor row is still present')
    say(out.results.every(r => r.dangling === 0), 'no reference is left pointing at a deleted row',
      `${out.results.reduce((a, r) => a + r.dangling, 0)} dangling reference(s)`)
  }

  const outPath = `outbox/${SPORT.toLowerCase()}-merge-latest.json`
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`\nwrote ${outPath}`)
  process.exit(fatal ? 1 : 0)
}
