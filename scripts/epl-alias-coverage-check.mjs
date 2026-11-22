// Does the relay's team resolver reach every club in the league, from every feed that names it?
//
// field-relay-nba docs/CC-CMD-2026-09-11-epl-identity-resolve.md, Task 2, carried forward on the owner's word
// 2026-11-22 and built here, not in the relay (LAB-FIRST-A). Its text: "Promotion and relegation change three clubs
// every summer and nothing currently verifies the alias table against the live league. Add a check comparing
// /espn-standings/soccer/eng.1/standings (20 clubs) against resolver coverage, and report clubs present in the league
// but absent from any alias path."
//
// WHAT "COVERED" MEANS HERE, and why it is not "has a CANONICAL entry". A club with no alias entry is fine when every feed
// spells it the same way. What fails silently is a spelling that resolves to a key no league club has: the CC-CMD's
// own case, the archive's `C Palace` -> `cpalace` against the league's `Crystal Palace` -> `crystalpalace`, which sat
// unmatched until an alias was added. So the league is the reference and each feed is compared with it, through the
// relay's own resolver:
//
//     ORPHAN   a name in a feed whose key is no league club's. A gap. GATES.
//     UNSEEN   a league club no name in that feed reaches. For FPL, which lists the league's clubs by construction, a
//              gap and GATES. For the archive it is reported only: a club has no archive row until it has played.
//
// THE ARCHIVE IS READ FOR THE CURRENT SEASON ONLY. Its rows go back past the season: the three clubs relegated in May
// 2026 (West Ham United, Wolverhampton Wanderers, Burnley) are in it, rightly, and would read as orphans for ever. The
// season comes from the standings (`season: 2026`) and the window opens 1 July of that year, a date on which the
// English league does not play (measured 2026-11-22: the archive's last previous-season row is 2026-05-24, its first
// this-season row 2026-08-21).
//
// A SEASON THAT HAS NOT STARTED IS PENDING, NOT UNREADABLE. When the standings show every club on 0 games played and the
// archive holds no row since 1 July, the archive leg is PENDING (reported, not red): there is nothing to compare yet, and
// weeks of red every summer would teach people to ignore the check. It needs the standings to say so (a missing
// games-played figure is not "0") and the archive to have answered with rows from earlier seasons (an empty archive is
// not a season that has not started). Once any club has played, an archive with no rows in the window is NOT MEASURED again.
// What stays red on purpose: while feeds disagree about which clubs are in the league (FPL on the new season, ESPN still on the
// old one) the names reach no club, and that is the moment to look, not a thing to tune green.
//
// Rule 99: a feed that did not answer, or answered with nothing, is NOT MEASURED, and that is as red as a gap. A
// check that cannot read the league has not found the league covered.
//
// WHERE THE RESOLVER COMES FROM. A checkout of field-relay-nba's source at `.relay-src` (a public repo; the lab's
// verify already makes this checkout), `RELAY_RESOLVER_PATH` to point elsewhere. It is not copied here: a copy of
// the resolver is the thing that would agree with itself. The --self-test uses injected resolvers and needs no
// checkout; the live run is the one that exercises the real one.
//
// Usage:  node scripts/epl-alias-coverage-check.mjs               live: three public relay routes, the real resolver
//         node scripts/epl-alias-coverage-check.mjs --self-test   no network, no checkout
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve as resolvePath } from 'node:path'
import { createChecks, finish, isMain, escapeAnnotationData, ANNOTATION_CAP } from './checks.mjs'
import { appendFileSync } from 'node:fs'
import { extractStandings, extractFplBootstrap } from './probe-epl-substrate.mjs'

export const EXPECTED_CLUBS = 20
/** The English league does not play on 1 July, so a season's rows are those on or after it. */
export const seasonStart = (season) => `${season}-07-01`

/** `/archive/sport/EPL` -> the names in the current season's rows, and how many rows that was. Never throws. */
export const archiveNames = (j, season) => {
  const games = Array.isArray(j?.games) ? j.games : null
  if (games === null) return { ok: false, why: 'the archive answered without a games list' }
  if (!Number.isInteger(season)) return { ok: false, why: 'the standings carry no season year, so the archive window is unknown' }
  const since = seasonStart(season)
  const rows = games.filter(g => typeof g?.date === 'string' && g.date >= since)
  const names = rows.flatMap(g => [g?.home, g?.away]).filter(n => typeof n === 'string' && n.trim() !== '')
  return { ok: true, since, rows: rows.length, total: games.length, names }
}

/**
 * The comparison. Pure: the resolver is an argument, a throw from it is an orphan and not a crash.
 * league: club names from the standings. feeds: { id: { names: string[], why?, gatesUnseen?, detail? } }.
 */
export function measure({ league, feeds, resolve, expected = EXPECTED_CLUBS }) {
  const key = (n) => { try { return String(resolve(n) ?? '') } catch { return '' } }
  const notMeasured = []
  const gaps = []
  const clubs = new Map()
  for (const n of league ?? []) {
    const k = key(n)
    if (k === '') { gaps.push(`league club "${n}" resolves to no key`); continue }
    if (clubs.has(k)) gaps.push(`two league clubs share the key ${k}: "${clubs.get(k)}" and "${n}"`)
    else clubs.set(k, n)
  }
  if (!Array.isArray(league) || league.length !== expected) {
    notMeasured.push(`the standings list ${Array.isArray(league) ? league.length : 'no'} clubs, not ${expected}`)
  }
  const perFeed = {}
  for (const [id, f] of Object.entries(feeds ?? {})) {
    const names = [...new Set((f?.names ?? []))]
    if (names.length === 0 && typeof f?.pending === 'string') {
      perFeed[id] = { state: 'pending', why: f.pending }
      continue
    }
    if (names.length === 0) {
      perFeed[id] = { state: 'not-measured', why: f?.why ?? 'it carried no names' }
      notMeasured.push(`feed ${id}: ${perFeed[id].why}`)
      continue
    }
    const keys = new Set(names.map(key))
    const orphans = names.filter(n => !clubs.has(key(n))).sort()
    const unseen = [...clubs].filter(([k]) => !keys.has(k)).map(([, n]) => n)
    perFeed[id] = { state: 'measured', names: names.length, orphans, unseen, gatesUnseen: f.gatesUnseen === true, detail: f.detail ?? '' }
    for (const n of orphans) gaps.push(`feed ${id}: "${n}" resolves to no league club`)
    if (f.gatesUnseen === true) for (const c of unseen) gaps.push(`feed ${id}: league club "${c}" has no name in the feed that reaches it`)
  }
  // Every league club with the spellings that reach it, per feed. The diagnostic when something is red.
  const table = [...clubs].map(([k, club]) => ({
    club,
    key: k,
    spellings: Object.fromEntries(Object.entries(perFeed).filter(([, v]) => v.state === 'measured')
      .map(([id]) => [id, [...new Set(feeds[id].names.filter(n => key(n) === k))].sort()])),
  }))
  const verdict = notMeasured.length ? 'not-measured' : gaps.length ? 'gaps' : 'covered'
  return { verdict, clubs: clubs.size, expected, perFeed, gaps, notMeasured, table }
}

/** The lines to print. The coverage line comes first and says what was and was not read (Rule 91). */
export function render(m, { resolver = 'unknown' } = {}) {
  const feedBits = Object.entries(m.perFeed).map(([id, v]) => v.state === 'measured'
    ? `${id} ${v.names} name(s), ${v.orphans.length} orphan(s), ${v.unseen.length} unseen${v.detail ? ` (${v.detail})` : ''}`
    : v.state === 'pending' ? `${id} PENDING (${v.why})` : `${id} NOT MEASURED`)
  const lines = [
    `checked ${m.clubs} of ${m.expected} league clubs against ${Object.keys(m.perFeed).length} feed(s): ${feedBits.join('; ') || 'none'}`,
    `resolver: ${resolver}`,
    `VERDICT: ${m.verdict}`,
  ]
  for (const w of m.notMeasured) lines.push(`not measured: ${w}`)
  for (const g of m.gaps) lines.push(`gap: ${g}`)
  for (const [id, v] of Object.entries(m.perFeed)) {
    if (v.state === 'measured' && !v.gatesUnseen && v.unseen.length) lines.push(`info: feed ${id} has no name yet for ${v.unseen.join(', ')} (reported, not gating)`)
  }
  if (m.verdict !== 'covered') for (const r of m.table) lines.push(`  ${r.club.padEnd(24)} ${JSON.stringify(r.spellings)}`)
  return lines
}

/** covered -> 0. A gap and a feed that could not be read are both red. */
export const exitFor = (verdict) => (verdict === 'covered' ? 0 : 1)

const get = async (fetchImpl, url, ms = 30_000) => {
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(ms) })
    const text = await r.text()
    if (!r.ok) return { state: 'http-error', why: `HTTP ${r.status}` }
    try { return { state: 'ok', json: JSON.parse(text) } } catch { return { state: 'unparseable', why: 'the body is not JSON' } }
  } catch (e) { return { state: 'unreachable', why: `${e?.name ?? 'Error'}: ${e?.cause?.code ?? e?.message ?? e}` } }
}

/** The sum of every club's games played in a standings payload, or null when the payload carries no such figure (not 0). */
export const gamesPlayed = (j) => {
  const entries = j?.children?.[0]?.standings?.entries ?? j?.standings?.entries ?? j?.entries ?? []
  const figures = entries.map(e => (e?.stats ?? []).find(s => s?.name === 'gamesPlayed')?.value)
  return figures.length > 0 && figures.every(v => typeof v === 'number') ? figures.reduce((a, b) => a + b, 0) : null
}

/** Three public relay routes -> the input of `measure`. Never throws; every failure is a named state. */
export async function live({ fetchImpl, relay }) {
  const st = await get(fetchImpl, `${relay}/espn-standings/soccer/eng.1/standings`)
  const std = st.state === 'ok' ? extractStandings(st.json) : null
  const league = std?.fields?.teams ?? []
  const season = std?.fields?.season ?? null
  const played = st.state === 'ok' ? gamesPlayed(st.json) : null
  const feeds = {}
  const fp = await get(fetchImpl, `${relay}/fpl/bootstrap-static`)
  const fpNames = fp.state === 'ok' ? Object.values(extractFplBootstrap(fp.json).fields.id_to_name).filter(n => typeof n === 'string') : []
  feeds.fpl = { names: fpNames, why: fp.state === 'ok' ? 'FPL listed no teams' : `FPL ${fp.state}: ${fp.why}`, gatesUnseen: true }
  const ar = await get(fetchImpl, `${relay}/archive/sport/EPL`)
  if (ar.state !== 'ok') feeds.archive = { names: [], why: `the archive ${ar.state}: ${ar.why}` }
  else {
    const a = archiveNames(ar.json, season)
    const notStarted = a.ok && a.rows === 0 && a.total > 0 && played === 0
    feeds.archive = a.ok
      ? { names: a.names, why: `the archive had no EPL rows since ${a.since}`, detail: `${a.rows} of ${a.total} rows since ${a.since}`,
          ...(notStarted ? { pending: `the season has not started: every club on 0 games played, no archive row since ${a.since}` } : {}) }
      : { names: [], why: a.why }
  }
  return { league, feeds, standings: st.state === 'ok' ? 'ok' : `${st.state}: ${st.why}` }
}

// ── self-test ────────────────────────────────────────────────────────────────────────────────────────
// PROVENANCE. The names below are verbatim: the league and FPL names from outbox/epl-substrate-probe-latest.json (a
// runner's read of 2026-10-04, season 2026), the archive names from a read-only SELECT of field-archive on 2026-11-22
// (34 distinct EPL home/away names, 135 rows). RECORDED_KEYS is what the relay's resolver (field-relay-nba bd4a6c7)
// returned for each of those names on 2026-11-22. It is a record of outputs, NOT the resolver: the live run is what
// exercises the real one.
const LEAGUE = ['Manchester City', 'Arsenal', 'Brighton & Hove Albion', 'Brentford', 'Leeds United', 'Liverpool', 'Everton', 'Hull City', 'Newcastle United', 'Chelsea', 'Ipswich Town', 'Manchester United', 'Nottingham Forest', 'Sunderland', 'Crystal Palace', 'Aston Villa', 'AFC Bournemouth', 'Coventry City', 'Fulham', 'Tottenham Hotspur']
const FPL = ['Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton', 'Chelsea', 'Coventry City', 'Crystal Palace', 'Everton', 'Fulham', 'Hull City', 'Ipswich Town', 'Leeds', 'Liverpool', 'Man City', 'Man Utd', 'Newcastle', "Nott'm Forest", 'Spurs', 'Sunderland']
const THIS_SEASON = ['Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton', 'C Palace', 'Chelsea', 'Coventry', 'Everton', 'Fulham', 'Hull', 'Ipswich', 'Leeds', 'Liverpool', 'Man City', 'Man United', 'Man Utd', 'Newcastle', 'Nottm Forest', 'Spurs', 'Sunderland']
const LAST_SEASON = ['AFC Bournemouth', 'Brighton & Hove Albion', 'Burnley', 'Crystal Palace', 'Leeds United', 'Manchester City', 'Manchester United', 'Newcastle United', 'Nottingham Forest', 'Sunderland AFC', 'Tottenham Hotspur', 'West Ham United', 'Wolverhampton Wanderers']
const GAMES = [
  ...THIS_SEASON.map(n => ({ date: '2026-11-21', home: n, away: 'Arsenal' })),
  ...LAST_SEASON.map(n => ({ date: '2026-05-24', home: n, away: 'Arsenal' })),
]
const RECORDED_KEYS = {
  'AFC Bournemouth': 'afcbournemouth', Bournemouth: 'afcbournemouth', Arsenal: 'arsenal', 'Aston Villa': 'astonvilla', Brentford: 'brentford',
  Brighton: 'brightonhovealbion', 'Brighton & Hove Albion': 'brightonhovealbion', Burnley: 'burnley', 'C Palace': 'cpalace', 'Crystal Palace': 'cpalace',
  Chelsea: 'chelsea', Coventry: 'coventrycity', 'Coventry City': 'coventrycity', Everton: 'everton', Fulham: 'fulham', Hull: 'hullcity', 'Hull City': 'hullcity',
  Ipswich: 'ipswichtown', 'Ipswich Town': 'ipswichtown', Leeds: 'leedsunited', 'Leeds United': 'leedsunited', Liverpool: 'liverpool',
  'Man City': 'manchestercity', 'Manchester City': 'manchestercity', 'Man United': 'manchesterunited', 'Man Utd': 'manchesterunited', 'Manchester United': 'manchesterunited',
  Newcastle: 'newcastleunited', 'Newcastle United': 'newcastleunited', 'Nottingham Forest': 'nottinghamforest', 'Nottm Forest': 'nottinghamforest', "Nott'm Forest": 'nottinghamforest',
  Spurs: 'tottenhamhotspur', 'Tottenham Hotspur': 'tottenhamhotspur', Sunderland: 'sunderlandafc', 'Sunderland AFC': 'sunderlandafc',
  'West Ham United': 'westhamunited', 'Wolverhampton Wanderers': 'wolverhamptonwanderers',
}
const recorded = (n) => RECORDED_KEYS[n] ?? String(n).toLowerCase().replace(/[^a-z0-9]/g, '')
/** The resolver as it was before the C Palace alias: the same table, with `C Palace` falling through to its own letters. */
const beforeAlias = (n) => (n === 'C Palace' ? 'cpalace' : n === 'Crystal Palace' ? 'crystalpalace' : recorded(n))

const feedsFrom = (games, season = 2026, fpl = FPL) => {
  const a = archiveNames({ games }, season)
  return {
    fpl: { names: fpl, why: 'FPL listed no teams', gatesUnseen: true },
    archive: { names: a.names, why: 'no rows', detail: `${a.rows} of ${a.total} rows since ${a.since}` },
  }
}

async function selfTest() {
  const { check, summarize } = createChecks()
  const feeds = feedsFrom(GAMES)

  const ok = measure({ league: LEAGUE, feeds, resolve: recorded })
  check('C1 the recorded names are covered: 20 of 20 clubs, FPL and the archive both', ok.verdict === 'covered' && ok.clubs === 20 &&
    ok.perFeed.fpl.orphans.length === 0 && ok.perFeed.archive.orphans.length === 0 && ok.perFeed.fpl.unseen.length === 0, JSON.stringify({ v: ok.verdict, gaps: ok.gaps }))
  check('C2 the archive was read for this season only: 21 names, not the 34 of both seasons', ok.perFeed.archive.names === 21, String(ok.perFeed.archive.names))

  // The case the CC-CMD measured: before the alias, the archive's `C Palace` met no league club.
  const pre = measure({ league: LEAGUE, feeds, resolve: beforeAlias })
  check('G1 before the C Palace alias the check is RED: the archive name is an orphan', pre.verdict === 'gaps' && pre.perFeed.archive.orphans.join() === 'C Palace', JSON.stringify(pre.perFeed.archive.orphans))
  check('G2 ...and the league club it should have reached is named as unseen in the archive, as information', pre.perFeed.archive.unseen.join() === 'Crystal Palace' && !pre.gaps.some(g => g.includes('league club "Crystal Palace"')), JSON.stringify(pre.perFeed.archive.unseen))
  check('G3 an orphan in FPL gates too', measure({ league: LEAGUE, feeds: feedsFrom(GAMES, 2026, [...FPL.filter(n => n !== 'Spurs'), 'Tottenham']), resolve: recorded }).gaps.some(g => g.startsWith('feed fpl: "Tottenham"')))
  check('G4 a league club FPL has no name for gates (FPL lists the league)', measure({ league: LEAGUE, feeds: feedsFrom(GAMES, 2026, FPL.filter(n => n !== 'Fulham')), resolve: recorded }).gaps.includes('feed fpl: league club "Fulham" has no name in the feed that reaches it'))
  check('G5 a club the archive has no row for yet does NOT gate (it has not played)', measure({ league: LEAGUE, feeds: feedsFrom(GAMES.filter(g => g.home !== 'Fulham')), resolve: recorded }).verdict === 'covered')

  // The window does real work: with it open to every date the relegated clubs read as orphans.
  const nowindow = measure({ league: LEAGUE, feeds: { ...feeds, archive: { names: GAMES.flatMap(g => [g.home, g.away]), why: 'x' } }, resolve: recorded })
  check('W1 without the season window the three relegated clubs are orphans (what the window is for)', nowindow.perFeed.archive.orphans.join() === 'Burnley,West Ham United,Wolverhampton Wanderers', JSON.stringify(nowindow.perFeed.archive.orphans))
  const edge = archiveNames({ games: [{ date: '2026-06-30', home: 'Burnley', away: 'Arsenal' }, { date: '2026-07-01', home: 'Fulham', away: 'Arsenal' }] }, 2026)
  check('W2 the window opens on 1 July: that day is in, the day before is out', edge.rows === 1 && edge.names.includes('Fulham') && !edge.names.includes('Burnley'), JSON.stringify(edge))
  check('W3 no season year means the archive is not read, and says why', archiveNames({ games: GAMES }, null).ok === false && /season/.test(archiveNames({ games: GAMES }, null).why))
  check('W4 an archive answer with no games list is not read as an empty season', archiveNames({ ok: true }, 2026).ok === false)
  check('W5 FPL gates unseen clubs and the archive does not, as live() sets them', (await live({ fetchImpl: async () => ({ ok: false, status: 503, text: async () => '' }), relay: 'https://r' })).feeds.fpl.gatesUnseen === true
    && (await live({ fetchImpl: async () => ({ ok: false, status: 503, text: async () => '' }), relay: 'https://r' })).feeds.archive.gatesUnseen !== true)

  // What is not a pass.
  check('N1 19 clubs in the standings is NOT MEASURED, not covered', measure({ league: LEAGUE.slice(1), feeds, resolve: recorded }).verdict === 'not-measured')
  check('N2 no standings at all is not measured', measure({ league: [], feeds, resolve: recorded }).verdict === 'not-measured')
  const noFpl = measure({ league: LEAGUE, feeds: { ...feeds, fpl: { names: [], why: 'FPL http-error: HTTP 503' } }, resolve: recorded })
  check('N3 a feed that carried nothing is not measured, with its reason, and is not "covered"', noFpl.verdict === 'not-measured' && noFpl.notMeasured.join().includes('HTTP 503'), JSON.stringify(noFpl.notMeasured))
  check('N4 two league clubs with one key is a gap', measure({ league: [...LEAGUE.slice(0, 19), 'Man City'], feeds, resolve: recorded }).gaps.some(g => g.startsWith('two league clubs share the key manchestercity')))
  let thrower = null
  try { thrower = measure({ league: LEAGUE, feeds, resolve: (n) => { if (n === 'C Palace') throw new Error('boom'); return recorded(n) } }) } catch { thrower = null }
  check('N5 a resolver that throws on a name makes it an orphan, not a crash', thrower !== null && thrower.verdict === 'gaps' && thrower.perFeed.archive.orphans.includes('C Palace'))
  const noKey = measure({ league: [...LEAGUE.slice(0, 19), 'Fulham'].map(n => n === 'Fulham' ? 'Nowhere FC' : n), feeds, resolve: (n) => (n === 'Nowhere FC' ? '' : recorded(n)) })
  check('N7 a league club that resolves to no key is a gap', noKey.gaps.includes('league club "Nowhere FC" resolves to no key'), JSON.stringify(noKey.gaps))
  check('N6 a name that resolves to nothing is an orphan', measure({ league: LEAGUE, feeds, resolve: (n) => (n === 'Hull' ? '' : recorded(n)) }).perFeed.archive.orphans.includes('Hull'))

  // Output and exit.
  const lines = render(pre, { resolver: 'test' })
  check('O1 the first line says how many clubs and feeds were checked, before the verdict', /^checked 20 of 20 league clubs against 2 feed\(s\): fpl 20 name\(s\), 0 orphan\(s\), 0 unseen; archive \d+ name\(s\), 1 orphan\(s\)/.test(lines[0]) && lines[2] === 'VERDICT: gaps', lines.slice(0, 3).join(' | '))
  check('O2 a gap is printed with its feed and name, and the per-club spellings follow', lines.includes('gap: feed archive: "C Palace" resolves to no league club') && lines.some(l => l.trim().startsWith('Crystal Palace')))
  check('O3 a covered run prints no per-club table', render(ok).every(l => !l.trim().startsWith('Crystal Palace')))
  check('O4 covered exits 0; a gap and a feed that could not be read both exit 1', exitFor('covered') === 0 && exitFor('gaps') === 1 && exitFor('not-measured') === 1)

  // live(): every failure is a named state.
  const S = '/espn-standings/soccer/eng.1/standings', B = '/fpl/bootstrap-static', A = '/archive/sport/EPL'
  const route = (map) => async (url) => {
    const h = Object.entries(map).find(([p]) => url === `https://r${p}`)?.[1]
    if (h instanceof Error) throw h
    return h ?? { ok: false, status: 404, text: async () => '' }
  }
  const j = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) })
  const standings = { season: { year: 2026 }, children: [{ standings: { entries: LEAGUE.map(n => ({ team: { displayName: n, abbreviation: 'X' }, stats: [] })) } }] }
  const bootstrap = { teams: FPL.map((name, i) => ({ id: i + 1, name })) }
  const archive = { ok: true, games: GAMES }
  const full = await live({ fetchImpl: route({ '/espn-standings/soccer/eng.1/standings': j(standings), '/fpl/bootstrap-static': j(bootstrap), '/archive/sport/EPL': j(archive) }), relay: 'https://r' })
  const m = measure({ ...full, resolve: recorded })
  check('L1 live() reads the three routes into a covered measurement', m.verdict === 'covered' && m.perFeed.archive.names === 21 && full.league.length === 20, JSON.stringify({ v: m.verdict, n: full.league.length }))
  const down = await live({ fetchImpl: route({ '/espn-standings/soccer/eng.1/standings': new TypeError('fetch failed'), '/fpl/bootstrap-static': j(bootstrap), '/archive/sport/EPL': j(archive) }), relay: 'https://r' })
  check('L2 an unreachable standings route is not measured, with the reason', measure({ ...down, resolve: recorded }).verdict === 'not-measured' && /unreachable/.test(down.standings), down.standings)
  const h503 = await live({ fetchImpl: route({ '/espn-standings/soccer/eng.1/standings': j(standings), '/fpl/bootstrap-static': { ok: false, status: 503, text: async () => 'busy' }, '/archive/sport/EPL': j(archive) }), relay: 'https://r' })
  check('L3 an FPL 503 is not measured, naming the status', /HTTP 503/.test(measure({ ...h503, resolve: recorded }).notMeasured.join()))
  const bad = await live({ fetchImpl: route({ '/espn-standings/soccer/eng.1/standings': j(standings), '/fpl/bootstrap-static': j(bootstrap), '/archive/sport/EPL': { ok: true, status: 200, text: async () => '<html>' } }), relay: 'https://r' })
  check('L4 an archive body that is not JSON is not measured', /unparseable/.test(measure({ ...bad, resolve: recorded }).notMeasured.join()))
  const empty = await live({ fetchImpl: route({ '/espn-standings/soccer/eng.1/standings': j({ season: { year: 2026 }, children: [{ standings: { entries: [] } }] }), '/fpl/bootstrap-static': j(bootstrap), '/archive/sport/EPL': j(archive) }), relay: 'https://r' })
  check('L5 a 200 standings with no entries is not measured (Rule 99: empty is not present)', measure({ ...empty, resolve: recorded }).verdict === 'not-measured')

  // A season that has not started is PENDING; a missing figure or an empty archive is not "not started".
  const stats = (n) => [{ name: 'gamesPlayed', value: n }]
  const stdWith = (played) => ({ season: { year: 2026 }, children: [{ standings: { entries: LEAGUE.map(n => ({ team: { displayName: n, abbreviation: 'X' }, stats: played === undefined ? [] : stats(played) })) } }] })
  const mayOnly = { ok: true, games: GAMES.filter(g => g.date < '2026-07-01') }
  const liveWith = (std, arch) => live({ fetchImpl: route({ [S]: j(std), [B]: j(bootstrap), [A]: j(arch) }), relay: 'https://r' })
  const pend = await liveWith(stdWith(0), mayOnly)
  const pm = measure({ ...pend, resolve: recorded })
  check('P1 every club on 0 games and no archive row since 1 July: the archive is PENDING and the run is covered', pm.verdict === 'covered' && pm.perFeed.archive.state === 'pending' && pm.perFeed.fpl.state === 'measured', JSON.stringify({ v: pm.verdict, a: pm.perFeed.archive }))
  check('P1b ...and the coverage line says PENDING and why', /archive PENDING \(the season has not started/.test(render(pm)[0]), render(pm)[0])
  check('P2 once any club has played, an archive with no row in the window is NOT MEASURED again', measure({ ...(await liveWith(stdWith(1), mayOnly)), resolve: recorded }).verdict === 'not-measured')
  check('P3 a standings payload with no games-played figure is not "0 games": not measured', measure({ ...(await liveWith(stdWith(undefined), mayOnly)), resolve: recorded }).verdict === 'not-measured')
  check('P4 an archive with no rows at all is not a season that has not started: not measured', measure({ ...(await liveWith(stdWith(0), { ok: true, games: [] })), resolve: recorded }).verdict === 'not-measured')
  check('P5 gamesPlayed sums every club and is null when any club lacks the figure', gamesPlayed(stdWith(2)) === 40 && gamesPlayed(stdWith(undefined)) === null && gamesPlayed({}) === null)

  // main(): the exit status, the annotations and the summary, with every dependency passed in.
  const env = { RELAY_URL: 'https://r', RELAY_RESOLVER_PATH: fileURLToPath(import.meta.url) }
  const fetchOk = route({ [S]: j(standings), [B]: j(bootstrap), [A]: j(archive) })
  const run = async (over = {}) => {
    const logged = [], summaries = []
    const code = await main({ env: { ...env, ...(over.env ?? {}) }, fetchImpl: over.fetchImpl ?? fetchOk, loadResolver: async () => over.resolver ?? recorded, log: (l) => logged.push(l), summary: (t) => summaries.push(t) })
    return { code, logged, summaries }
  }
  const x1 = await run()
  check('X1 covered: exit 0, no annotation', x1.code === 0 && x1.logged.some(l => l === 'VERDICT: covered') && !x1.logged.some(l => l.startsWith('::error')), JSON.stringify(x1.logged.slice(0, 4)))
  const x2 = await run({ resolver: beforeAlias, env: { GITHUB_ACTIONS: 'true' } })
  check('X2 a gap: exit 1 and, in Actions, the orphan is an ::error annotation on the run page', x2.code === 1 && x2.logged.includes('::error title=EPL alias coverage::gap: feed archive: "C Palace" resolves to no league club'), JSON.stringify(x2.logged.filter(l => l.startsWith('::error'))))
  check('X2b ...and outside Actions it prints no annotation', !(await run({ resolver: beforeAlias })).logged.some(l => l.startsWith('::error')))
  check('X3 an FPL route that answers 503: exit 1', (await run({ fetchImpl: route({ [S]: j(standings), [B]: { ok: false, status: 503, text: async () => '' }, [A]: j(archive) }) })).code === 1)
  const x4 = await run({ env: { RELAY_RESOLVER_PATH: '/nonexistent/resolver.mjs' } })
  check('X4 no resolver to compare with: exit 2, says nothing was compared', x4.code === 2 && /NOT MEASURED: the relay's resolver is not at \/nonexistent/.test(x4.logged[0]) && /Nothing was compared/.test(x4.logged[0]))
  check('X5 the step summary carries the verdict and the gap', x2.summaries.length === 1 && /EPL alias coverage: gaps/.test(x2.summaries[0]) && /C Palace/.test(x2.summaries[0]))
  const many = annotationsOf({ notMeasured: [], gaps: Array.from({ length: 15 }, (_, i) => `g${i}`) })
  check('X6 at most ten annotations, the last saying how many were left out', many.length === ANNOTATION_CAP && /6 more not shown/.test(many.at(-1)), JSON.stringify(many.length))
  check('X7 an annotation escapes a newline in a name instead of breaking the line', annotationsOf({ notMeasured: ['a\nb'], gaps: [] })[0].endsWith('::not measured: a%0Ab'))
  return summarize()
}

/** Annotations for a red run, so the names are on the run page and not only in a log. GitHub shows ten per step. */
export const annotationsOf = (m) => {
  const msgs = [...m.notMeasured.map(w => `not measured: ${w}`), ...m.gaps.map(g => `gap: ${g}`)]
  const shown = msgs.slice(0, ANNOTATION_CAP - 1)
  const out = shown.map(t => `::error title=${'EPL alias coverage'}::${escapeAnnotationData(t)}`)
  if (msgs.length > shown.length) out.push(`::error title=EPL alias coverage::${escapeAnnotationData(`${msgs.length - shown.length} more not shown; see the log`)}`)
  return out
}

/**
 * The whole run, with everything it touches passed in, so the exit status and the wiring have a test.
 * Returns the exit code: 0 covered, 1 a gap or a feed that could not be read, 2 no resolver to compare with.
 */
export async function main({ env, fetchImpl, loadResolver, log, summary }) {
  const path = resolvePath(env.RELAY_RESOLVER_PATH || '.relay-src/src/identity-resolver.js')
  if (!existsSync(path)) {
    log(`NOT MEASURED: the relay's resolver is not at ${path}. Check out field-relay-nba into .relay-src, or set RELAY_RESOLVER_PATH. Nothing was compared.`)
    return 2
  }
  const resolve = await loadResolver(path)
  const sha = spawnSync('git', ['-C', resolvePath(path, '..', '..'), 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' })
  const resolver = `${path} @ ${sha.status === 0 ? sha.stdout.trim() : 'unknown commit'}`
  const input = await live({ fetchImpl, relay: env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev' })
  if (input.standings !== 'ok') log(`standings: ${input.standings}`)
  const m = measure({ league: input.league, feeds: input.feeds, resolve })
  const lines = render(m, { resolver })
  for (const l of lines) log(l)
  if (m.verdict !== 'covered' && env.GITHUB_ACTIONS === 'true') for (const a of annotationsOf(m)) log(a)
  if (summary) summary(`### EPL alias coverage: ${m.verdict}\n\n${lines.map(l => `- ${l}`).join('\n')}\n`)
  return exitFor(m.verdict)
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) finish(await selfTest())
  else {
    process.exit(await main({
      env: process.env,
      fetchImpl: fetch,
      loadResolver: async (path) => (await import(pathToFileURL(path).href)).resolveTeamKey,
      log: (l) => console.log(l),
      summary: process.env.GITHUB_STEP_SUMMARY ? (t) => appendFileSync(process.env.GITHUB_STEP_SUMMARY, t) : null,
    }))
  }
}
