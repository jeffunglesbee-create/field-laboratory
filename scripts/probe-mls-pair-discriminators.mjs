// The 51 MLS pairs say `indistinguishable`. Is that the data, or the instrument?
//
// `classifyPair` answers `duplicate` only on evidence — two rows sharing an
// espn_event_id, or two rows sharing a start_time — and the 51 MLS clusters
// carry neither. That is the honest verdict from the four fields
// `probe-fixture-identity-duplicates.mjs` reads. It is NOT a statement that no
// discriminator exists; it is a statement that none of those four is one.
//
// So this asks two further questions, cheapest first:
//
//   1. DOES ANY OTHER COLUMN SEPARATE THE TWO ROWS? The identity probe reads
//      home, away, espn_event_id, start_time. The table has more. A pair whose
//      venues differ, or whose scores differ, is two games; a pair agreeing on
//      every populated field is one row written twice.
//
//   2. WHAT DOES THE SOURCE SAY? Two MLS clubs playing each other twice on one
//      date is not a thing the league schedules, but asserting that from
//      knowledge is exactly the move this project keeps deleting. The relay
//      serves the slate. Ask it how many fixtures it lists between those clubs
//      on that date, and let the answer be the discriminator.
//
// MERGING IS NOT IN SCOPE HERE AND MUST NOT BE. This probe writes nothing to D1.
// A merge deletes a row, and `Do not delete archive rows without explicit human
// approval` is standing. What it produces is the evidence a merge would need.
//
// Usage:  node scripts/probe-mls-pair-discriminators.mjs --recon   shapes first
//         node scripts/probe-mls-pair-discriminators.mjs
//         node scripts/probe-mls-pair-discriminators.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'
import { schemeOf } from './game-id-scheme.mjs'
import { clustersByDay, mixedScheme } from './probe-archive-scheme-duplicates.mjs'
import { sameFixture } from './probe-espn-id-collisions.mjs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const RELAY_SECRET = process.env.RELAY_SHARED_SECRET || ''
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/**
 * How two rows compare on one column.
 *
 * FOUR STATES, and the two middle ones are the reason this is a function rather
 * than `a === b`. `both-null` and `one-null` are not agreement: a column absent
 * from both rows discriminates nothing, and a column present on one side only is
 * the stub pattern this whole defect is made of. Only `differ` is evidence of
 * two games, and only `agree` is evidence of one row twice.
 */
export const compareField = (a, b) => {
  const na = a === null || a === undefined || a === ''
  const nb = b === null || b === undefined || b === ''
  if (na && nb) return 'both-null'
  if (na || nb) return 'one-null'
  return String(a) === String(b) ? 'agree' : 'differ'
}

/**
 * What a pair's field comparison proves, if anything.
 *
 * `two-games` needs a column that DIFFERS on a field two rows of one fixture
 * could not disagree about. `one-row-twice` needs agreement on something
 * substantive — a shared score, a shared venue — not merely on the date and the
 * sport, which every row in the cluster shares by construction.
 */
export const fieldVerdict = (comparisons, substantive) => {
  const differing = substantive.filter(f => comparisons[f] === 'differ')
  if (differing.length) return { verdict: 'two-games', because: differing }
  const agreeing = substantive.filter(f => comparisons[f] === 'agree')
  if (agreeing.length) return { verdict: 'one-row-twice', because: agreeing }
  return { verdict: 'no-discriminator', because: [] }
}

/**
 * The slate's answer: how many fixtures between these two clubs on this date?
 *
 * Returns a state, never a guess. `not-observable` when the slate could not be
 * read at all — which must never be reported as "no duplicate found", the
 * failure this repo keeps deleting.
 */
export const slateVerdict = (matches) => {
  if (matches === null || matches === undefined) return 'not-observable'
  if (matches === 0) return 'absent-from-slate'
  if (matches === 1) return 'one-fixture'
  return 'doubleheader'
}

/**
 * Slate entries that are the same fixture as this pair.
 *
 * `/v2/games` nests the club under `home.name`, so a comparison against the flat
 * `home` the archive stores has to unwrap it first. Measured, not remembered:
 * `--recon` printed `"home":{"name":"Seattle Sounders FC","abbr":"SEA","score":2}`.
 */
export const slateMatches = (slate, row) =>
  (slate ?? [])
    .filter(g => g?.home?.name && g?.away?.name)
    .filter(g => sameFixture({ home: g.home.name, away: g.away.name }, row))

/**
 * The pair's verdict, slate first.
 *
 * THE SLATE OUTRANKS THE FIELDS, and deliberately. Two rows of one fixture can
 * disagree about a venue string without being two games — one writer says
 * `Audi Field` and another says `Audi Field, Washington` — so a field difference
 * is weak evidence in the direction that matters least. How many fixtures the
 * league actually played between those clubs that day is not a formatting
 * question, and the relay serves it.
 *
 * When the slate cannot answer, the fields are consulted and their limit is
 * stated rather than papered over.
 */
export const pairVerdict = (slate, fields) => {
  if (slate === 'one-fixture') return { verdict: 'duplicate', from: 'slate' }
  if (slate === 'doubleheader') return { verdict: 'two-games', from: 'slate' }
  if (fields.verdict === 'two-games') return { verdict: 'two-games', from: 'fields' }
  if (fields.verdict === 'one-row-twice') return { verdict: 'likely-duplicate', from: 'fields' }
  return { verdict: 'still-indistinguishable', from: slate === 'not-observable' ? 'slate-unread' : 'nothing' }
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('two values that differ are evidence', compareField('a', 'b') === 'differ')
  check('two equal values agree', compareField('7', 7) === 'agree', 'compared as strings')
  check('BOTH NULL IS NOT AGREEMENT', compareField(null, null) === 'both-null',
    'a column absent from both rows discriminates nothing, and counting it as '
    + 'agreement would let 20 empty columns "prove" a duplicate')
  check('ONE NULL IS NOT AGREEMENT EITHER', compareField('x', null) === 'one-null',
    'a value on one side only is the stub pattern this defect is made of')
  check('empty string counts as null', compareField('', '') === 'both-null')

  check('a differing substantive field means two games',
    fieldVerdict({ venue: 'differ', home_score: 'both-null' }, ['venue', 'home_score']).verdict === 'two-games')
  check('agreement on a substantive field means one row twice',
    fieldVerdict({ venue: 'agree' }, ['venue']).verdict === 'one-row-twice')
  check('NULLS EVERYWHERE PROVE NOTHING',
    fieldVerdict({ venue: 'both-null', home_score: 'one-null' }, ['venue', 'home_score']).verdict === 'no-discriminator',
    'this is the state the 51 are in until something else answers')
  check('one differing field outranks several agreeing ones',
    fieldVerdict({ venue: 'differ', note: 'agree' }, ['venue', 'note']).verdict === 'two-games',
    'two rows of ONE fixture cannot disagree about the venue')

  check('one listed fixture means the pair is one game', slateVerdict(1) === 'one-fixture')
  check('two listed fixtures is a real doubleheader', slateVerdict(2) === 'doubleheader')
  check('THE SLATE FAILING TO LOAD IS ITS OWN STATE', slateVerdict(null) === 'not-observable',
    'reporting an unread slate as "no duplicate" is the silence this repo deletes')
  check('a fixture the slate does not list is not "one fixture"',
    slateVerdict(0) === 'absent-from-slate',
    'zero means the slate cannot answer for this pair, not that the pair is fine')

  const g = (h, a, id) => ({ home: { name: h }, away: { name: a }, espnEventId: id })
  const slate = [g('D.C. United', 'Los Angeles Football Club', '761769'),
                 g('Seattle Sounders FC', 'Chicago Fire FC', '761755')]
  check('the slate is unwrapped before comparison — home is an OBJECT there',
    slateMatches(slate, { home: 'D.C. United', away: 'Los Angeles Football Club' }).length === 1,
    'the archive stores `home` flat and /v2/games nests it under home.name; '
    + 'comparing them directly matches nothing and would report every pair unanswerable')
  // A LIMIT, ASSERTED RATHER THAN HIDDEN. `sameTeam` is a token-subset match and
  // `lafc` is not a token of `Los Angeles Football Club`, so an abbreviated slate
  // entry would not match a spelled-out archive row. The measured data does not
  // hit this — `--recon` showed the archive row carrying the full name and the
  // slate carrying `Seattle Sounders FC`, both spelled out — and the sweep counts
  // `absent-from-slate` separately so a naming mismatch surfaces as a number
  // rather than as silence.
  check('AN ABBREVIATION DOES NOT MATCH A SPELLED-OUT NAME, and that is a real limit',
    slateMatches(slate, { home: 'D.C. United', away: 'LAFC' }).length === 0,
    'if this ever starts passing, sameTeam grew an alias table and this comment is stale')
  check('a slate entry missing a club name is skipped, not crashed on',
    slateMatches([{ home: null, away: { name: 'x' } }], { home: 'a', away: 'b' }).length === 0)
  check('a fixture the slate does not carry matches nothing',
    slateMatches(slate, { home: 'Columbus Crew', away: 'New England Revolution' }).length === 0)

  check('THE SLATE OUTRANKS A DIFFERING FIELD',
    pairVerdict('one-fixture', { verdict: 'two-games', because: ['venue'] }).verdict === 'duplicate',
    'two writers can spell one venue two ways; that is not two games, and the '
    + 'league schedule is not a formatting question')
  check('a doubleheader on the slate is two games', pairVerdict('doubleheader', {}).verdict === 'two-games')
  check('with no slate answer the fields decide',
    pairVerdict('absent-from-slate', { verdict: 'two-games', because: ['home_score'] }).from === 'fields')
  check('AN UNREAD SLATE AND AN EMPTY ONE ARE DIFFERENT OUTCOMES',
    pairVerdict('not-observable', { verdict: 'no-discriminator' }).from === 'slate-unread'
    && pairVerdict('absent-from-slate', { verdict: 'no-discriminator' }).from === 'nothing',
    'one says the question was never asked; the other says it was asked and had no answer')
  check('field agreement is LIKELY-duplicate, never duplicate',
    pairVerdict('absent-from-slate', { verdict: 'one-row-twice', because: ['venue'] }).verdict === 'likely-duplicate',
    'agreement on a venue is consistent with a duplicate and does not establish one')

  process.exit(summarize() === 0 ? 0 : 1)
}

// ─── the sweep ────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const d1 = async (sql) => {
    if (!RELAY_SECRET) throw new Error(
      'RELAY_SHARED_SECRET is not set. This probe reads the relay\'s games tables through '
      + 'POST /d1/execute. Pass it from the workflow.')
    const r = await fetch(`${RELAY}/d1/execute`, {
      method: 'POST',
      headers: { 'X-FIELD-Relay': RELAY_SECRET, 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ sql }),
    })
    const t = await r.text()
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`)
    const j = JSON.parse(t)
    if (j.ok === false) throw new Error(`relay error: ${j.error}`)
    return j.results || []
  }

  // ── RECON: read the shapes before writing anything against them ────────────
  if (process.argv.includes('--recon')) {
    console.log('=== columns regular_season_games actually has ===')
    const cols = await d1(`PRAGMA table_info(regular_season_games)`)
    console.log(cols.map(c => `${c.name}:${c.type}`).join('  '))

    console.log('\n=== one MLS pair, every column ===')
    const rows = await d1(
      `SELECT * FROM regular_season_games WHERE sport = 'MLS' AND date = '2026-08-29' ORDER BY id`)
    for (const r of rows.slice(0, 4)) console.log(JSON.stringify(r))

    console.log('\n=== does the relay serve an MLS slate, and in what shape? ===')
    for (const d of ['2026-08-29', '20260829']) {
      try {
        const r = await fetch(`${RELAY}/v2/games?sport=mls&date=${d}`, { headers: { 'User-Agent': UA } })
        const t = (await r.text()).slice(0, 400)
        console.log(`  date=${d} -> HTTP ${r.status}  ${t}`)
      } catch (e) { console.log(`  date=${d} -> ${e.message}`) }
    }
    console.log('\n=== and what /context/date serves for that day ===')
    try {
      const r = await fetch(`${RELAY}/context/date?date=2026-08-29`, { headers: { 'User-Agent': UA } })
      const j = await r.json()
      console.log(`  HTTP ${r.status}  top-level keys: ${Object.keys(j).join(', ')}`)
    } catch (e) { console.log(`  ${e.message}`) }
    process.exit(0)
  }

  // Columns two rows of ONE fixture should not disagree about. `league` is
  // excluded: it is null on every dash row measured, so it can only ever be
  // `one-null`. `created_at` is excluded because it records the WRITE, not the
  // fixture — the whole point is that the two rows were written at different
  // times.
  const SUBSTANTIVE = ['venue', 'home_score', 'away_score', 'start_time', 'note', 'crew', 'streams']

  const rows = await d1(`SELECT * FROM regular_season_games WHERE sport = 'MLS'`)
  const mixed = clustersByDay(rows).filter(c => mixedScheme(c.rows))
  console.log(`\n${rows.length} MLS row(s), ${mixed.length} mixed-scheme cluster(s)\n`)

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

  const out = { probed_at: new Date().toISOString(), clusters: mixed.length, verdicts: {}, from: {}, pairs: [], error: null }

  for (const c of mixed) {
    const [a, b] = c.rows
    const comparisons = Object.fromEntries(SUBSTANTIVE.map(f => [f, compareField(a[f], b[f])]))
    const fields = fieldVerdict(comparisons, SUBSTANTIVE)

    const slate = await slateFor(c.date)
    const matches = slate === null ? null : slateMatches(slate, a).length
    const sv = slateVerdict(matches)
    const v = pairVerdict(sv, fields)

    out.verdicts[v.verdict] = (out.verdicts[v.verdict] ?? 0) + 1
    out.from[v.from] = (out.from[v.from] ?? 0) + 1
    out.pairs.push({
      date: c.date, ids: c.rows.map(r => r.id), verdict: v.verdict, from: v.from,
      slate: sv, slate_matches: matches,
      merge_key: sv === 'one-fixture' ? (slateMatches(slate, a)[0]?.espnEventId ?? null) : null,
      fields: Object.fromEntries(Object.entries(comparisons).filter(([, s2]) => s2 !== 'both-null')),
    })
  }

  for (const p of out.pairs.slice(0, 60))
    console.log(`  ${p.date}  ${p.verdict.padEnd(24)} via ${p.from.padEnd(12)} slate=${p.slate}`
      + `${p.merge_key ? ` key=${p.merge_key}` : ''}\n      ${p.ids.join('\n      ')}`)

  console.log('\n  verdicts:')
  for (const [k, n] of Object.entries(out.verdicts).sort((x, y) => y[1] - x[1]))
    console.log(`    ${String(n).padStart(4)}  ${k}`)
  console.log('  decided by:')
  for (const [k, n] of Object.entries(out.from).sort((x, y) => y[1] - x[1]))
    console.log(`    ${String(n).padStart(4)}  ${k}`)

  let fatal = 0
  const say = (ok, name, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
    if (!ok) { fatal++; if (detail) console.log(`      ${detail}`) }
  }
  say(mixed.length > 0, 'there were mixed-scheme clusters to resolve',
    'zero means the archive changed under this probe — read that, do not skip it')
  say((out.from['slate-unread'] ?? 0) === 0,
    'every pair got a slate answer, read or empty',
    `${out.from['slate-unread'] ?? 0} pair(s) had an UNREAD slate — the question was never asked `
    + 'for those, which is not the same as it having no answer')

  // A NAMING MISMATCH LOOKS EXACTLY LIKE A FIXTURE THE LEAGUE NEVER PLAYED.
  // `sameTeam` is a token-subset match, so an abbreviated slate entry against a
  // spelled-out archive row yields zero and reads as `absent-from-slate`. Count
  // it out loud so that failure mode is a number rather than a silence.
  const absent = out.pairs.filter(p => p.slate === 'absent-from-slate')
  if (absent.length) {
    console.log(`\n  ${absent.length} pair(s) the slate did not list. Read these before trusting the`)
    console.log('  count: a club-naming mismatch is indistinguishable from a fixture never played.')
    for (const p of absent.slice(0, 10)) console.log(`    ${p.date}  ${p.ids.join('  ')}`)
  }

  const resolved = (out.verdicts.duplicate ?? 0) + (out.verdicts['two-games'] ?? 0)
  console.log('')
  if (resolved === mixed.length)
    console.log(`RESOLVED      all ${mixed.length} pair(s) answered on evidence. The 51 were not`)
    , console.log('              indistinguishable in the data — only against the four fields the')
    , console.log('              identity probe reads.')
  else if (resolved === 0)
    console.log(`UNRESOLVED    none of the ${mixed.length} pair(s) could be answered. `
      + '`indistinguishable` stands.')
  else
    console.log(`PARTIAL       ${resolved} of ${mixed.length} answered on evidence; `
      + `${mixed.length - resolved} still open.`)

  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/mls-pair-discriminators-latest.json', JSON.stringify(out, null, 2))
  console.log('\nwrote outbox/mls-pair-discriminators-latest.json')
  process.exit(fatal ? 1 : 0)
}
