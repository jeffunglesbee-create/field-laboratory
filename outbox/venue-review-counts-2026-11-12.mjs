// STEP 1 OF TASK 4, docs/CC-CMD-2026-11-09-venue-review-remainder.md: how often each review venue is on a slate.
//
// The sourcing rule held 75 candidate grounds in review (outbox/venue-source-results-latest.json). Step 0 priced them as a group
// (outbox/venue-red-days-2026-11-09.md: adding all of them would have removed 0 red days from the last 60). This prices them one by one: for each review name,
// among the archive's games from the candidates file's window start (2026-07-01) to the last complete day, how many games and how many distinct days carry
// exactly that `venue` string, which is how the page's `known.has(v)` matches. The owner decides each venue from that number; nothing here adds a row.
//
// WHAT THIS IS. The same method as outbox/venue-red-days-2026-11-09.mjs. Mode `sql` prints ONE statement for the D1 database `field-archive`
// (cc49101c-0569-4d41-8e7a-be139cde4f26), through the D1 connector: it embeds the review names (with an index each), counts per name, and returns one row per
// name plus an `all` row (column sums), an index-weighted checksum row over the typed rows (`wsum`: weighted counts in c1..c5, weighted first- and last-date
// offsets in s1 and s2), a `win` row (the whole window) and a checksum row for the embedded list. The rows are saved BY HAND into outbox/venue-review-counts-rows-2026-11-12.json (the connector returns them to the session, not to a file), so `report`
// refuses them unless they check out MECHANICALLY: every row is internally consistent, the typed rows sum to the `all` row the database computed, the index-weighted
// sums equal the database's (a number typed into the wrong row cannot keep them), the embedded list equals the current one (n, characters, position-weighted
// code-point sum, index-weighted lengths), and the numbers agree with three records that did not come from this statement (controls 1 to 3 in `analyze`).
// Mode `selftest` makes each of those checks fail on purpose (Rule 90).
//
// Usage:   node outbox/venue-review-counts-2026-11-12.mjs sql      <from> <to>                 > statement.sql
//          node outbox/venue-review-counts-2026-11-12.mjs report   <rows.json> <from> <to>     > outbox/venue-review-counts-2026-11-12.md
//          node outbox/venue-review-counts-2026-11-12.mjs selftest <rows.json> <from> <to>     > outbox/venue-review-counts-selftest-2026-11-12.txt
// Needs `npm run build` first (build/Venues.js is a copy of src/Venues.fs; the script reads the compiled module the page loads, and requires its row names to
// equal the names in the source text).
//
// PREMISES, each with the one command that would refute it (Rule 100):
//   1. The review list is the `review` array of outbox/venue-source-results-latest.json, and a name is "covered" when it is a row of the table the page loads.
//      Refuted by: a name in the compiled module that the source text does not have, or the reverse. `lists` stops on it. (The CC-CMD's 66 and the 71 here
//      are reconciled in the record, from git, by outbox/venue-review-population-2026-11-12.mjs, not by this script.)
//   2. The archive's `venue` is the page's `data-venue`.   NOT established for past days. Refuted by: render the page on a past day's capture and diff
//      `data-venue` against the archive. What supports it: control 3 (one name, one record that read the same archive) and control 1 (every name was drawn
//      from the archive, so none may be absent from it).
//   3. A game is one row of `regular_season_games` or `postseason_games`.   Refuted by: `c2` (distinct ids) below `c1` (rows) in `all`; the record prints both.
//   4. The window is the candidates file's.   The file's own `source` text says `date >= 2026-07-01` and `queried 2026-10-22`; `lists` stops if the text stops saying so.
//      The upper end is a choice made here: the last complete UTC day, so a day still being captured is not in a count.
//   5. The saved rows came from the statement `sql` prints today.   Refuted by: `sql` printing a sha256 other than `statementSha256` in the rows file. `analyze` stops on it.
//   6. The archive only accumulates: a name's games today are at least what the candidates file counted, and no more of them were created before the file's first
//      query than the file counted.   NOT established; it is what control 1 assumes, and a trip of that control is a finding about the archive, not a harness fault.
//   7. `s.venue = rv.n` compares bytes, as the page's `known.has(v)` does.   Refuted by: a COLLATE clause on either table (or any object) in sqlite_master. The
//      definitions were read through the connector and are saved with the rows; `checkDdl` stops on it.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const HERE = p => new URL(p, import.meta.url)
const must = (ok, msg) => { if (!ok) throw new Error('venue-review-counts: ' + msg) }
const V = await import(HERE('../build/Venues.js').href)

export const COLUMNS = ['kind', 'key', 'c1', 'c2', 'c3', 'c4', 'c5', 's1', 's2']
// venue rows: key = the name's index in the embedded list; c1 games, c2 distinct game ids, c3 distinct days, c4 distinct home values,
//   c5 games created before CUTOFF, s1 first date, s2 last date.   `all`/`wsum`/`wdate`/`chk-rv`/`win` rows: see buildSql.
const KINDS = ['venue', 'all', 'wsum', 'win', 'chk-rv']   // five terms: D1 refuses a compound SELECT of six ("too many terms in compound SELECT", measured 2026-11-12); Step 0's statement had five
const CUTOFF = '2026-10-22'   // the day data/venue-source-candidates.json was first queried (its `source` text says so; `lists` checks)
const MANADON = 'Manadon Sports Hub'
const MANADON_DOC = './cc-session-2026-11-11-manadon-row.md'
const STEP0_ROWS = './venue-red-days-rows-2026-11-09.json'

const dayMs = 86400000
const dayOff = (date, from) => Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / dayMs)
const calendarDays = (from, to) => dayOff(to, from) + 1
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ---------- the review list, the table, the candidates file: three files read, each checked against the others ----------
function lists() {
  const R = JSON.parse(readFileSync(HERE('./venue-source-results-latest.json'), 'utf8'))
  const review = R.review.map(x => x.name)
  must(review.length > 0 && new Set(review).size === review.length, 'the review list is empty or repeats a name')
  const names = [...review].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  for (const n of names) must(typeof n === 'string' && n.length > 0 && n === n.trim() && !/[\n\r\\]/.test(n), `a review name is empty, padded, or carries a newline or backslash: ${JSON.stringify(n)}`)
  must(Math.max(...names.map(n => [...n].length)) <= 80, 'a review name is longer than the 80 positions the checksum covers')

  // the table: from the module the page loads, and from the source text; the two must agree
  const compiled = [...new Set(Array.from(V.all).map(v => v.Name))].sort()
  const fs = readFileSync(HERE('../src/Venues.fs'), 'utf8')
  const typed = [...fs.matchAll(/^\s*at "((?:[^"\\]|\\.)*)"/gm)].map(m => m[1].replace(/\\(["\\])/g, '$1'))
  must(typed.every(s => !/\\/.test(s)), 'src/Venues.fs: a row name carries an escape other than \\" and \\\\, so the two texts cannot be compared')
  const fromSource = [...new Set(typed)].sort()
  must(typed.length === fromSource.length, 'src/Venues.fs: a row name is typed twice')
  must(JSON.stringify(compiled) === JSON.stringify(fromSource), `the table read from build/Venues.js (${compiled.length} names) and from src/Venues.fs (${fromSource.length}) differ`)
  const tbl = new Set(compiled)

  // the candidates file: its window and first-query day are what the statement uses; it must say so itself
  const C = JSON.parse(readFileSync(HERE('../data/venue-source-candidates.json'), 'utf8'))
  const win = /date >= (\d{4}-\d{2}-\d{2})/.exec(C.source)
  must(win, 'data/venue-source-candidates.json: its `source` text no longer names the window start (`date >= YYYY-MM-DD`)')
  must(C.source.includes(`queried ${CUTOFF}`), `data/venue-source-candidates.json: its \`source\` text no longer says \`queried ${CUTOFF}\`, the cutoff used for c5`)
  const cand = new Map(C.candidates.map(c => [c.venue, c]))
  must(cand.size === C.candidates.length, 'data/venue-source-candidates.json: a candidate is listed twice')
  const meta = new Map(R.review.map(x => [x.name, { sports: x.sports, home: x.home, why: x.why, agreeing: x.agreeing || [] }]))
  return { run: R.run, at: R.at, of: R.of, windowFrom: win[1], names, table: compiled, covered: names.filter(n => tbl.has(n)), cand, meta }
}
const sums = names => ({
  n: names.length,
  len: names.reduce((a, s) => a + [...s].length, 0),
  w: names.reduce((a, s) => a + [...s].reduce((b, c, i) => b + c.codePointAt(0) * (i + 1), 0), 0),   // position-weighted code-point sum
  iw: names.reduce((a, s, i) => a + (i + 1) * [...s].length, 0),                                        // ties each index to its name
  max: Math.max(...names.map(s => [...s].length)),
})

// ---------- the statement ----------
export function buildSql(from, to, L) {
  const q = s => `'${s.replace(/'/g, "''")}'`
  const vals = L.names.map((n, i) => `(${i + 1}, ${q(n)})`).join(',\n')
  const win = `date >= ${q(from)} AND date <= ${q(to)}`
  const off = c => `CAST(julianday(${c}) - julianday(${q(from)}) AS INTEGER)`
  return `WITH RECURSIVE
pos(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM pos WHERE i < 80),
rv(idx, n) AS (VALUES
${vals}
),
slate AS (
  SELECT id, date, venue, home, created_at FROM regular_season_games WHERE ${win}
  UNION ALL
  SELECT id, date, venue, home, created_at FROM postseason_games WHERE ${win}
),
per AS (
  SELECT rv.idx AS idx, rv.n AS n,
    COUNT(s.id) AS g, COUNT(DISTINCT s.id) AS gi, COUNT(DISTINCT s.date) AS d, COUNT(DISTINCT s.home) AS nh,
    COALESCE(SUM(s.created_at < ${q(CUTOFF)}), 0) AS ob,
    MIN(s.date) AS f, MAX(s.date) AS l
  FROM rv LEFT JOIN slate s ON s.venue = rv.n
  GROUP BY rv.idx, rv.n
)
SELECT 'venue' AS kind, idx AS key, g AS c1, gi AS c2, d AS c3, nh AS c4, ob AS c5, f AS s1, l AS s2 FROM per
UNION ALL SELECT 'all', NULL, SUM(g), SUM(gi), SUM(d), SUM(nh), SUM(ob), MIN(f), MAX(l) FROM per
UNION ALL SELECT 'wsum', NULL, SUM(g * idx), SUM(gi * idx), SUM(d * idx), SUM(nh * idx), SUM(ob * idx), SUM(${off('f')} * idx), SUM(${off('l')} * idx) FROM per
UNION ALL SELECT 'win', NULL, COUNT(*), COUNT(DISTINCT id), COUNT(DISTINCT date), NULL, NULL, MIN(date), MAX(date) FROM slate
UNION ALL SELECT 'chk-rv', NULL, COUNT(*), SUM(LENGTH(n)), (SELECT SUM(unicode(substr(x.n, p.i, 1)) * p.i) FROM rv x JOIN pos p ON p.i <= LENGTH(x.n)), SUM(idx * LENGTH(n)), MAX(LENGTH(n)), NULL, NULL FROM rv
ORDER BY 1, 2`
}

// ---------- the records the counts are held against (they did not come from this statement) ----------
// Control 3: the Manadon session's own read of the same archive, quoted in its session record.
export function manadonRecord(doc) {
  const where = 'outbox/cc-session-2026-11-11-manadon-row.md'
  const m = /both tables: one row, `([^`]+)`, `start_time` (\d{4}-\d{2}-\d{2})T/.exec(doc)
  must(m, `${where}: the sentence that reads the archive's one Manadon row ("both tables: one row, \`<id>\`, \`start_time\` <date>T...") was not found`)
  const p = /^(.+)_(\d{4}-\d{2}-\d{2})_(.+)$/.exec(m[1])
  must(p && p[2] === m[2], `${where}: the row id ${JSON.stringify(m[1])} does not carry its start_time's date ${m[2]}`)
  return { id: m[1], date: m[2] }
}
// Control 2: the two review names Step 0 saw on its two thin days (it lists names only on a day with at most one covered venue).
export function thinDayNames(step0) {
  const ix = Object.fromEntries(step0.columns.map((c, i) => [c, i]))
  const out = []
  for (const r of step0.rows) if (r[ix.kind] === 'day' && r[ix.s2]) for (const n of r[ix.s2].split(' | ')) out.push({ day: r[ix.key], name: n })
  return out
}
const loadControls = L => ({
  cand: L.cand,
  thin: thinDayNames(JSON.parse(readFileSync(HERE(STEP0_ROWS), 'utf8'))),
  manadon: manadonRecord(readFileSync(HERE(MANADON_DOC), 'utf8')),
})

// Premise 7: `s.venue = rv.n` compares bytes. True unless a column or index is declared COLLATE; the table definitions were read from sqlite_master and saved with the rows.
export function checkDdl(ddl) {
  must(ddl && Array.isArray(ddl.rows), 'the saved rows carry no `ddl` record of the two tables\' definitions')
  for (const t of ['regular_season_games', 'postseason_games']) {
    const r = ddl.rows.filter(x => x.name === t && x.type === 'table')
    must(r.length === 1, `ddl: want exactly one table row for ${t}, found ${r.length}`)
    must(/\n\s*venue TEXT\b/.test(r[0].sql), `ddl: ${t} does not define \`venue TEXT\` as its own column line`)
    must(!/COLLATE/i.test(r[0].sql), `ddl: ${t} carries a COLLATE clause, so \`=\` on its venue column may not compare bytes`)
  }
  must(ddl.rows.every(x => x.type === 'table'), 'ddl: an object other than a table carries a COLLATE clause, so `=` may not compare bytes')
}

// ---------- the checks on the saved rows, and the derivation ----------
export function analyze(data, from, to, L, ctl) {
  must(from === L.windowFrom, `the window starts ${from}; the candidates file's starts ${L.windowFrom}, and control 1 compares against its counts`)
  must(JSON.stringify(data.columns) === JSON.stringify(COLUMNS), 'the saved columns are not the statement\'s')
  checkDdl(data.ddl)
  const rows = data.rows.map(r => { must(Array.isArray(r) && r.length === COLUMNS.length, 'a saved row has the wrong number of cells'); return Object.fromEntries(COLUMNS.map((c, i) => [c, r[i]])) })
  for (const r of rows) must(KINDS.includes(r.kind), `a saved row has an unexpected kind: ${JSON.stringify(r.kind)}`)
  const one = kind => { const m = rows.filter(r => r.kind === kind); must(m.length === 1, `want exactly one "${kind}" row, found ${m.length}`); return m[0] }
  const N = L.names.length
  const vrows = rows.filter(r => r.kind === 'venue')
  const keys = vrows.map(r => r.key)
  must(keys.every(k => Number.isInteger(k) && k >= 1 && k <= N), `a venue row has an index outside 1..${N}`)
  must(new Set(keys).size === keys.length, `a venue row appears twice: index ${keys.find((k, i) => keys.indexOf(k) !== i)}`)
  must(vrows.length === N, `the statement embedded ${N} names but the saved rows hold ${vrows.length} venue rows (missing index ${[...Array(N).keys()].map(i => i + 1).filter(i => !keys.includes(i)).join(', ')})`)
  const [all, wsum, win, chk] = ['all', 'wsum', 'win', 'chk-rv'].map(one)
  must(rows.length === N + 4, `the saved rows number ${rows.length}, the statement returns ${N + 4}`)
  for (const r of rows) for (const c of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const label = `${r.kind}${r.key === null ? '' : ' ' + r.key}: ${c}`
    if (r.kind === 'win' && (c === 'c4' || c === 'c5')) { must(r[c] === null, `${label} is not null, the statement's window row returns NULL there (${JSON.stringify(r[c])})`); continue }
    must(Number.isInteger(r[c]) && r[c] >= 0, `${label} is not a non-negative integer (${JSON.stringify(r[c])})`)
  }
  for (const c of ['s1', 's2']) must(Number.isInteger(wsum[c]) && wsum[c] >= 0, `wsum: ${c} (an index-weighted date offset) is not a non-negative integer (${JSON.stringify(wsum[c])})`)

  // the list the statement ran with is the current one
  const s = sums(L.names)
  must(chk.c1 === s.n && chk.c2 === s.len && chk.c3 === s.w && chk.c4 === s.iw && chk.c5 === s.max,
    `the name list the statement ran with is not the current one: database ${chk.c1}/${chk.c2}/${chk.c3}/${chk.c4}/${chk.c5}, now ${s.n}/${s.len}/${s.w}/${s.iw}/${s.max} (n/characters/weighted/index-weighted/longest)`)

  // the rows are this statement's
  const sql = buildSql(from, to, L)
  const sqlHash = createHash('sha256').update(sql).digest('hex'), sqlBytes = Buffer.byteLength(sql)
  must(data.statementSha256 === sqlHash && data.statementBytes === sqlBytes,
    `the saved rows say they came from a statement of ${data.statementBytes} bytes, sha256 ${data.statementSha256}, but \`sql ${from} ${to}\` prints ${sqlBytes} bytes, sha256 ${sqlHash}: these rows are not that statement's`)

  // each row on its own
  const tbl = new Set(L.covered)
  const venues = vrows.sort((a, b) => a.key - b.key).map(r => {
    const name = L.names[r.key - 1], tag = `${name} (index ${r.key})`
    must(r.c2 <= r.c1, `${tag}: distinct ids (${r.c2}) exceed games (${r.c1})`)
    must(r.c3 <= r.c1, `${tag}: days (${r.c3}) exceed games (${r.c1})`)
    must(r.c4 <= r.c1, `${tag}: homes (${r.c4}) exceed games (${r.c1})`)
    must(r.c5 <= r.c1, `${tag}: games created before ${CUTOFF} (${r.c5}) exceed games (${r.c1})`)
    const some = r.c1 > 0
    must((r.c3 > 0) === some && (r.s1 !== null) === some && (r.s2 !== null) === some, `${tag}: games, days and dates disagree about whether the name appears`)
    if (some) {
      for (const c of ['s1', 's2']) must(typeof r[c] === 'string' && DATE_RE.test(r[c]), `${tag}: ${c} is not a date (${JSON.stringify(r[c])})`)
      must(from <= r.s1 && r.s1 <= r.s2 && r.s2 <= to, `${tag}: dates ${r.s1}..${r.s2} are out of order or outside ${from}..${to}`)
      must(r.c3 <= dayOff(r.s2, r.s1) + 1, `${tag}: ${r.c3} days exceed the span of ${r.s1}..${r.s2}`)
      must((r.c3 === 1) === (r.s1 === r.s2), `${tag}: ${r.c3} day(s) but first ${r.s1} and last ${r.s2}`)
    }
    const m = L.meta.get(name)
    return { idx: r.key, name, g: r.c1, gi: r.c2, d: r.c3, nh: r.c4, ob: r.c5, f: r.s1, l: r.s2, covered: tbl.has(name), sports: m.sports, home: m.home, why: m.why, agreeing: m.agreeing }
  })

  // the column sums the database computed, and the index-weighted sums that a number typed into the wrong row cannot keep
  for (const [i, c] of ['c1', 'c2', 'c3', 'c4', 'c5'].entries()) {
    const t = venues.reduce((a, v) => a + [v.g, v.gi, v.d, v.nh, v.ob][i], 0)
    must(all[c] === t, `the column sums of the venue rows differ from the ALL row the database computed: ${c} is ${t} typed, ${all[c]} computed`)
    const w = venues.reduce((a, v) => a + [v.g, v.gi, v.d, v.nh, v.ob][i] * v.idx, 0)
    must(wsum[c] === w, `the index-weighted sums differ from the database's: ${c} is ${w} typed, ${wsum[c]} computed`)
  }
  const firsts = venues.filter(v => v.f !== null).map(v => v.f).sort(), lasts = venues.filter(v => v.l !== null).map(v => v.l).sort()
  must(all.s1 === firsts[0] && all.s2 === lasts[lasts.length - 1], `the earliest/latest dates of the venue rows (${firsts[0]}, ${lasts[lasts.length - 1]}) differ from the ALL row (${all.s1}, ${all.s2})`)
  for (const [c, f] of [['s1', 'f'], ['s2', 'l']]) {
    const w = venues.reduce((a, v) => a + (v[f] === null ? 0 : dayOff(v[f], from) * v.idx), 0)
    must(wsum[c] === w, `the index-weighted date offsets differ from the database's: ${f === 'f' ? 'first' : 'last'} dates give ${w} typed, ${wsum[c]} computed`)
  }
  must(win.c2 <= win.c1 && win.c1 >= all.c1, `the window row (${win.c1} games, ${win.c2} ids) is smaller than the named venues' games (${all.c1}) or has more ids than games`)
  must(win.c3 >= 1 && win.c3 <= calendarDays(from, to), `the window row counts ${win.c3} days with games, but ${from}..${to} holds ${calendarDays(from, to)} calendar days`)
  must(win.s1 >= from && win.s2 <= to && win.s1 <= all.s1 && all.s2 <= win.s2, `the window row's dates (${win.s1}..${win.s2}) do not hold the venue rows' (${all.s1}..${all.s2}) inside ${from}..${to}`)

  // the controls: three records that did not come from this statement
  const byName = new Map(venues.map(v => [v.name, v]))
  let c1n = 0
  for (const v of venues) {
    const c = ctl.cand.get(v.name)
    must(c, `control 1: ${v.name} is a review name but not a row of data/venue-source-candidates.json`)
    must(v.g >= 1, `control 1: ${v.name} has no game in the window, but every review name was drawn from the archive's games of that window`)
    must(v.g >= c.games, `control 1: ${v.name}: the archive holds ${v.g} game(s) in the window, fewer than the ${c.games} the candidates file counted (it only accumulates)`)
    must(v.ob <= c.games, `control 1: ${v.name}: ${v.ob} game(s) were created before ${CUTOFF}, more than the ${c.games} the candidates file counted`)
    must(v.l >= c.last, `control 1: ${v.name}: its last date ${v.l} is before the candidates file's ${c.last}`)
    c1n++
  }
  let c2n = 0
  for (const t of ctl.thin) {
    const v = byName.get(t.name)
    if (!v) continue
    must(v.g >= 1 && v.f <= t.day && t.day <= v.l, `control 2: Step 0 saw ${t.name} on its thin day ${t.day}, but its dates here are ${v.f}..${v.l} (${v.g} game(s))`)
    c2n++
  }
  must(c2n >= 1, 'control 2: none of the names Step 0 listed on its thin days is a review name')
  const mv = byName.get(MANADON)
  must(mv, `control 3: ${MANADON} is not a review name`)
  must(mv.g === 1 && mv.gi === 1 && mv.d === 1 && mv.f === ctl.manadon.date && mv.l === ctl.manadon.date,
    `control 3: ${MANADON} must be exactly the one row ${ctl.manadon.id} that the 2026-11-11 session read in the same archive (1 game, 1 day, ${ctl.manadon.date}); found ${mv.g} game(s), ${mv.d} day(s), ${mv.f}..${mv.l}`)
  return { venues, all, win, sqlHash, sqlBytes, controls: { cand: c1n, thin: c2n, manadon: ctl.manadon } }
}

// ---------- the record ----------
const BANDS = [[1, 1, '1 day'], [2, 4, '2 to 4 days'], [5, 9, '5 to 9 days'], [10, 19, '10 to 19 days'], [20, Infinity, '20 or more days']]
const cell = s => String(s).replace(/\|/g, '\\|')
const pct = (a, b) => (100 * a / b).toFixed(1) + '%'
const short = why => {
  if (/^ambiguous name/.test(why)) return `ambiguous name (${why.replace(/^ambiguous name: /, '').split('; ').length} candidates)`
  if (/^roof: the lead names no roof/.test(why)) return 'roof: the lead names none, the article mentions a retractable roof'
  return why
}
function render(res, from, to, L, ctl) {
  const { venues, all, win, sqlHash, sqlBytes, controls } = res
  const unc = venues.filter(v => !v.covered), cov = venues.filter(v => v.covered)
  const sortKey = (a, b) => b.d - a.d || b.g - a.g || (a.name < b.name ? -1 : 1)
  const G = unc.reduce((a, v) => a + v.g, 0), D = unc.reduce((a, v) => a + v.d, 0)
  must(unc.length === 71 && cov.length === 4 && L.names.length === 75, `the population paragraph below is written for 71 review names with no row and 4 with one, 75 in all (read from git by outbox/venue-review-population-2026-11-12.mjs); this data has ${unc.length} and ${cov.length}, ${L.names.length} in all, so the paragraph and its heading must be rewritten`)
  const out = []
  const p = s => out.push(s)
  p('# The review venues the table does not carry, and how often each is on a slate (Task 4, Step 1)')
  p('')
  p('Session 2026-11-12, field-laboratory. Governing record: `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 4. Written by `outbox/venue-review-counts-2026-11-12.mjs` from `outbox/venue-review-counts-rows-2026-11-12.json`.')
  p('')
  p(`**Checked ${venues.length} of ${L.names.length} review names** (${unc.length} with no table row, ${cov.length} with one), in the archive's games ${from}..${to}: ${calendarDays(from, to)} calendar days, ${win.c3} with games, ${win.c1} games in all. The ${unc.length} names with no row carry **${G} games on ${D} venue-days** (a venue-day is one name on one slate day), ${pct(G, win.c1)} of the window's games.`)
  p(`Every one of the ${unc.length} has at least one game in the window (control 1 refuses a name with none: each was drawn from the archive's games of that window). Nothing here adds a row; the owner decides each venue from these numbers.`)
  p('')
  p('## The population, and why it is 71 and not 66')
  p('')
  p(`The CC-CMD's Task 4 says 66. Read from git by \`outbox/venue-review-population-2026-11-12.mjs\`, output in \`outbox/venue-review-population-2026-11-12.txt\`, at three commits: at \`87b6bbb1\`, the CC-CMD's first commit (2026-11-09 09:08 ET), the review list held 70 names and 3 of them were already table rows (M. M. Roberts Stadium, Ryan Field and St James Park, hand rows of 2026-10-25), so 67 had none; the CC-CMD's 66 is those 67 less U.S. Bank Stadium, which Task 1 takes. At \`3429152d\` (2026-11-09 15:02 ET, which puts the 2026-11-09 source fill's accepted rows into the table, run 42682560865) the list held 67: Johan Cruijff Arena, U.S. Bank Stadium and Wembley Stadium had left it, each a table row and in \`accepted\` at that commit, which leaves 64. The 2026-11-10 sourcing run (42861596952) took the list from 67 to 75: 8 names entered, 7 with no row (Crabble Athletic Ground, EnviroVent Stadium, Flamingo Park, RAW Charging Stadium, Stade de France, The Stan Robinson Stadium, The Wyatt Homes Stadium) and Manadon Sports Hub, which received a hand row on 2026-11-11 (\`7e1a7e59\`), after that run. All 8 are among the 18 rows of \`outbox/venue-candidates-gained-2026-11-10.json\`, the grounds the archive gained after the candidates file was built on 2026-10-22. 64 + 7 = 71, and 71 + 4 with a row = 75.`)
  p('')
  p('## By days in the window')
  p('')
  p(`| days in the window | names | games | share of the ${G} games |`)
  p('|---|---|---|---|')
  for (const [lo, hi, label] of BANDS) {
    const b = unc.filter(v => v.d >= lo && v.d <= hi)
    p(`| ${label} | ${b.length} | ${b.reduce((a, v) => a + v.g, 0)} | ${pct(b.reduce((a, v) => a + v.g, 0), G)} |`)
  }
  const catOf = v => {
    if (/^roof:/.test(v.why)) { must(v.agreeing.length >= 2, `${v.name}: held on roof, but the results file lists fewer than two sources agreeing on its position`); return 'roof not settled (position agreed)' }
    if (/^ambiguous name/.test(v.why)) return 'ambiguous name'
    if (/^no source answered/.test(v.why)) return 'no source answered with a point'
    must(/^no two independent families agree/.test(v.why), `${v.name}: an unrecognised hold reason: ${v.why}`)
    return 'no two independent families agree on the position'
  }
  const cats = new Map()
  for (const v of unc) { const k = catOf(v), c = cats.get(k) || { names: 0, g: 0, d: 0 }; c.names++; c.g += v.g; c.d += v.d; cats.set(k, c) }
  p('')
  p('## By what held each one back')
  p('')
  p('The sourcing rule\'s own reason (the last column of the table below), grouped. A name held on roof has a position the results file lists sources agreeing on; the other groups need the position settled first.')
  p('')
  p('| held because | names | games | venue-days |')
  p('|---|---|---|---|')
  for (const [k, c] of [...cats].sort((a, b) => b[1].g - a[1].g)) p(`| ${k} | ${c.names} | ${c.g} | ${c.d} |`)
  p('')
  p(`## The ${unc.length}, most days first`)
  p('')
  p('`games` is the number of archive rows with exactly that venue string (a card each); `days` the distinct slate days among them. `sport(s)` and `home` are the sourcing run\'s own columns for the name. `held because` is the sourcing rule\'s one-line reason for holding the name; for a ground the owner decides to leave out it is the candidate for the line that says why.')
  p('')
  p('| # | venue | sport(s) | home | games | days | first | last | held because |')
  p('|---|---|---|---|---|---|---|---|---|')
  unc.sort(sortKey).forEach((v, i) => p(`| ${i + 1} | ${cell(v.name)} | ${cell(v.sports.replaceAll(',', ', '))} | ${cell(v.home)}${v.nh > 1 ? ` (+${v.nh - 1} more)` : ''} | ${v.g} | ${v.d} | ${v.f} | ${v.l} | ${cell(short(v.why))} |`))
  p('')
  p(`## The ${cov.length} review names that already have a row`)
  p('')
  p('Counted with the others. They are not part of the decision; Manadon Sports Hub is the one whose count is known independently (control 3).')
  p('')
  p('| venue | sport(s) | home | games | days | first | last |')
  p('|---|---|---|---|---|---|---|')
  for (const v of cov.sort(sortKey)) p(`| ${cell(v.name)} | ${cell(v.sports.replaceAll(',', ', '))} | ${cell(v.home)} | ${v.g} | ${v.d} | ${v.f} | ${v.l} |`)
  p('')
  p('## Controls: three records that did not come from this statement')
  p('')
  p(`1. **The candidates file** (\`data/venue-source-candidates.json\`, built from this archive on ${CUTOFF} and extended 2026-11-10 with 17 grounds gained since). For each of the ${controls.cand} names: the games counted here are at least the file's, no more games were created before ${CUTOFF} than the file counted, and the last date here is not before the file's. A name that the archive had spelled differently, or a window that missed a table, fails it.`)
  p(`2. **Step 0's two thin days** (\`outbox/venue-red-days-rows-2026-11-09.json\`: 2026-09-28 and 2026-11-09). Step 0 listed the review names it saw on them by a different statement. ${controls.thin} of ${controls.thin} are present here, and each day lies inside that name's first..last dates.`)
  p(`3. **Manadon Sports Hub.** The 2026-11-11 session read the same archive and found one row, \`${controls.manadon.id}\` (\`outbox/cc-session-2026-11-11-manadon-row.md\`). Here: 1 game, 1 day, ${controls.manadon.date}.`)
  p('')
  p('## Method, and its coverage')
  p('')
  p(`- Checked ${venues.length} of ${L.names.length} embedded names, ${venues.length + 4} of ${venues.length + 4} saved rows (${venues.length} venue rows and the \`all\`, \`wsum\`, \`win\` and \`chk-rv\` rows). One database, two tables (\`regular_season_games\` and \`postseason_games\` together), one window ${from}..${to}.`)
  p(`- A game is a row. The window holds ${win.c1} rows and ${win.c2} distinct ids${win.c1 === win.c2 ? ', so no game is in both tables' : ' (DIFFERENT: some id sits in both tables)'}; at the named venues, ${all.c1} rows and ${all.c2} distinct ids.`)
  p(`- The review list is \`review\` of \`outbox/venue-source-results-latest.json\` (sourcing run ${L.run}, ${L.at}): ${L.names.length} names, ${L.of} candidates. "Has a row" is membership in the table the page loads: ${L.table.length} names in \`build/Venues.js\`, equal to the ${L.table.length} read from \`src/Venues.fs\`.`)
  p('- Matching is exact, as the page\'s `known.has(v)` is: `s.venue = rv.n` compares bytes in SQLite unless a column is declared COLLATE. Neither table\'s `CREATE TABLE` carries one and no other object does (`sqlite_master`, read 2026-11-12 and saved in the rows file as `ddl`; `analyze` refuses the rows if that record says otherwise), so a trailing space or another case is a different name.')
  p(`- The names were embedded in the statement with an index each and re-computed inside the database: n, characters, a position-weighted code-point sum, index-weighted lengths and the longest name all equal (row \`chk-rv\`). The statement is ${sqlBytes} bytes, sha256 \`${sqlHash}\`, printed by \`node outbox/venue-review-counts-2026-11-12.mjs sql ${from} ${to}\`; the saved rows name the same length and hash, and \`report\` refuses to write when they do not.`)
  p('- The rows were saved by hand from the connector\'s output. They are checked mechanically: each row is internally consistent, the typed columns sum to the `all` row the database computed, and the index-weighted sums (`wsum`: the counts, and the first- and last-date offsets) equal the database\'s, so a number in the wrong row does not survive. That the text run through the connector is the printed text is not provable from here; the list checksum and the three controls stand in for it.')
  p('- A second path to the figures: `outbox/venue-review-counts-recompute-2026-11-12.mjs` rebuilds every total and every table row from the statement text, the saved rows, `src/Venues.fs` and the results file, does not import the script that wrote this file, and compares the result with this file\'s text (its output: `outbox/venue-review-counts-recompute-2026-11-12.txt`). Its refusals, and those of the population recount, were made to fire on doctored inputs by `outbox/venue-review-counts-mutations-2026-11-12.mjs` (its output: `outbox/venue-review-counts-mutations-2026-11-12.txt`).')
  p('')
  p('## Not established')
  p('')
  p('- **Anything forward.** These are past counts. A qualifying round or a one-off event (the sport column shows which) does not recur on a schedule, and a count over a window that includes the summer says nothing about how often a ground is on the slate in January.')
  p('- That the archive\'s venue strings are the page\'s `data-venue` strings on every day (Step 0\'s premise 1). Controls 1 to 3 hold names against three records; none renders the page.')
  p('- Whether a card at one of these grounds showed a weather chip on the day. By the page\'s rule a card whose venue is not a table row has none, but no rendered page was read.')
  p('- Which venues belong in the table. The numbers say how often a ground is on a slate; they do not say the ground\'s position, roof or zone, which is what the sourcing rule held back (the last column). The decision is the owner\'s.')
  p('- The upper end of the window (the last complete day) is a choice made here. The candidates file\'s own window has no upper end.')
  return out.join('\n') + '\n'
}

// ---------- the self-test: every check made to fail on purpose (Rule 90) ----------
function selftest(data, from, to, L, ctl) {
  const clone = () => JSON.parse(JSON.stringify(data))
  const ctlClone = () => ({ cand: new Map([...ctl.cand].map(([k, v]) => [k, { ...v }])), thin: ctl.thin.map(x => ({ ...x })), manadon: { ...ctl.manadon } })
  const ix = Object.fromEntries(COLUMNS.map((c, i) => [c, i]))
  const kindRow = (d, kind) => d.rows.find(r => r[ix.kind] === kind)
  const vrow = (d, pick) => d.rows.filter(r => r[ix.kind] === 'venue').find(pick)
  const nameOf = r => L.names[r[ix.key] - 1]
  const refit = d => {   // recompute the aggregate rows from the venue rows, so a doctored venue still agrees with them and only the check aimed at is left to fire
    const v = d.rows.filter(r => r[ix.kind] === 'venue'), all = kindRow(d, 'all'), ws = kindRow(d, 'wsum')
    for (const c of ['c1', 'c2', 'c3', 'c4', 'c5']) { all[ix[c]] = v.reduce((a, r) => a + r[ix[c]], 0); ws[ix[c]] = v.reduce((a, r) => a + r[ix[c]] * r[ix.key], 0) }
    all[ix.s1] = v.map(r => r[ix.s1]).filter(x => x !== null).sort()[0]
    all[ix.s2] = v.map(r => r[ix.s2]).filter(x => x !== null).sort().at(-1)
    ws[ix.s1] = v.reduce((a, r) => a + (r[ix.s1] === null ? 0 : dayOff(r[ix.s1], from) * r[ix.key]), 0)
    ws[ix.s2] = v.reduce((a, r) => a + (r[ix.s2] === null ? 0 : dayOff(r[ix.s2], from) * r[ix.key]), 0)
    return d
  }
  const globalFirst = data.rows.filter(r => r[ix.kind] === 'venue').map(r => r[ix.s1]).filter(x => x !== null).sort()[0]
  const plusDay = date => new Date(Date.parse(date + 'T00:00:00Z') + dayMs).toISOString().slice(0, 10)
  const DATA_CASES = [
    ['a venue\'s games are one too high', d => { const r = vrow(d, r => nameOf(r) !== MANADON); r[ix.c1] += 1; return !!r }, 'differ from the ALL row'],
    ['two venues\' games and ids are swapped (the column sums are kept)', d => { const a = vrow(d, r => r[ix.c1] > 0 && r[ix.c1] === r[ix.c2]), b = vrow(d, r => r !== a && r[ix.c1] > 0 && r[ix.c1] === r[ix.c2] && r[ix.c1] !== a[ix.c1] && r[ix.c3] <= a[ix.c1] && a[ix.c3] <= r[ix.c1]); if (!a || !b) return false; [a[ix.c1], b[ix.c1]] = [b[ix.c1], a[ix.c1]];[a[ix.c2], b[ix.c2]] = [b[ix.c2], a[ix.c2]]; return true }, 'index-weighted sums differ'],
    ['a first date is typed one day late (every sum of counts is kept)', d => { const r = vrow(d, r => r[ix.s1] !== null && r[ix.s1] !== globalFirst && r[ix.s1] < r[ix.s2] && r[ix.c3] < dayOff(r[ix.s2], r[ix.s1]) + 1 && plusDay(r[ix.s1]) < r[ix.s2]); if (!r) return false; r[ix.s1] = plusDay(r[ix.s1]); return true }, 'index-weighted date offsets differ'],
    ['a venue row was lost in transcription', d => { const i = d.rows.findIndex(r => r[ix.kind] === 'venue'); if (i < 0) return false; d.rows.splice(i, 1); return true }, 'saved rows hold'],
    ['a venue row is typed twice', d => { const r = vrow(d, () => true); d.rows.push([...r]); return !!r }, 'appears twice'],
    ['a venue row carries an index outside the list', d => { const r = vrow(d, () => true); r[ix.key] = L.names.length + 1; return !!r }, 'outside 1..'],
    ['the name-list checksum differs', d => { const r = kindRow(d, 'chk-rv'); r[ix.c3] += 1; return !!r }, 'name list the statement ran with is not the current one'],
    ['the index-weighted length checksum differs', d => { const r = kindRow(d, 'chk-rv'); r[ix.c4] += 1; return !!r }, 'name list the statement ran with is not the current one'],
    ['a date is typed outside the window', d => { const r = vrow(d, r => r[ix.s2] !== null); r[ix.s2] = '2099-01-01'; return !!r }, 'out of order or outside'],
    ['a venue\'s days exceed its games', d => { const r = vrow(d, r => r[ix.c1] > 0); r[ix.c3] = r[ix.c1] + 1; return !!r }, 'days ('],
    ['a venue\'s distinct ids exceed its games', d => { const r = vrow(d, r => r[ix.c1] > 0); r[ix.c2] = r[ix.c1] + 1; return !!r }, 'distinct ids ('],
    ['a venue\'s distinct homes exceed its games', d => { const r = vrow(d, r => r[ix.c1] > 0); r[ix.c4] = r[ix.c1] + 1; return !!r }, 'homes ('],
    ['a venue\'s games created before the cutoff exceed its games', d => { const r = vrow(d, r => r[ix.c1] > 0); r[ix.c5] = r[ix.c1] + 1; return !!r }, 'games created before'],
    ['a venue\'s date is typed in another format', d => { const r = vrow(d, r => r[ix.s1] !== null); r[ix.s1] = r[ix.s1].replaceAll('-', '/'); return !!r }, 'is not a date'],
    ['a venue\'s days exceed the span between its first and last date', d => { const r = vrow(d, r => r[ix.s1] !== null && r[ix.c1] > dayOff(r[ix.s2], r[ix.s1]) + 1 && r[ix.c3] > 1); if (!r) return false; r[ix.c3] = dayOff(r[ix.s2], r[ix.s1]) + 2; return true }, 'exceed the span'],
    ['the ALL row\'s latest date is not the latest of the venue rows', d => { const r = kindRow(d, 'all'); r[ix.s2] = plusDay(r[ix.s2]); return !!r }, 'earliest/latest dates'],
    ['the window row ends before the venue rows do', d => { const r = kindRow(d, 'win'); r[ix.s2] = '2026-11-10'; return !!r }, 'window row\'s dates'],
    ['the window row carries a number where the statement returns NULL', d => { const r = kindRow(d, 'win'); r[ix.c4] = 5; return !!r }, 'returns NULL there'],
    ['an index-weighted date offset is typed as text', d => { const r = kindRow(d, 'wsum'); r[ix.s1] = String(r[ix.s1]); return !!r }, 'an index-weighted date offset'],
    ['the name-list count differs', d => { const r = kindRow(d, 'chk-rv'); r[ix.c1] -= 1; return !!r }, 'name list the statement ran with is not the current one'],
    ['the name-list character total differs', d => { const r = kindRow(d, 'chk-rv'); r[ix.c2] += 1; return !!r }, 'name list the statement ran with is not the current one'],
    ['the name-list longest-name length differs', d => { const r = kindRow(d, 'chk-rv'); r[ix.c5] += 1; return !!r }, 'name list the statement ran with is not the current one'],
    ['a venue with games has no dates', d => { const r = vrow(d, r => r[ix.c1] > 0); r[ix.s1] = null; return !!r }, 'disagree about whether the name appears'],
    ['a venue with one day has two different dates', d => { const r = vrow(d, r => r[ix.c3] === 1 && r[ix.s1] !== null); if (!r) return false; r[ix.s2] = plusDay(r[ix.s1]); return true }, 'day(s) but first'],
    ['a count is typed as text', d => { const r = vrow(d, () => true); r[ix.c1] = String(r[ix.c1]); return !!r }, 'is not a non-negative integer'],
    ['the saved columns are in another order', d => { d.columns = [...d.columns].reverse(); return true }, 'the saved columns are not the statement\'s'],
    ['a saved row has a cell too many', d => { d.rows[0].push(null); return true }, 'wrong number of cells'],
    ['a row has a kind the statement does not return', d => { d.rows[0][ix.kind] = 'other'; return true }, 'unexpected kind'],
    ['the ALL row is typed twice', d => { const r = kindRow(d, 'all'); d.rows.push([...r]); return !!r }, 'want exactly one "all" row, found 2'],
    ['the window row counts more days than the window holds', d => { const r = kindRow(d, 'win'); r[ix.c3] = calendarDays(from, to) + 1; return !!r }, 'calendar days'],
    ['the window row holds fewer games than the named venues', d => { const r = kindRow(d, 'win'); r[ix.c1] = 1; r[ix.c2] = 1; return !!r }, 'is smaller than the named venues'],
    ['the saved table definitions are missing', d => { if (!d.ddl) return false; delete d.ddl; return true }, 'carry no `ddl` record'],
    ['a saved table definition is missing', d => { if (!d.ddl) return false; d.ddl.rows.pop(); return true }, 'want exactly one table row'],
    ['a table\'s venue column is declared COLLATE NOCASE', d => { const r = d.ddl && d.ddl.rows.find(x => x.name === 'regular_season_games'); if (!r) return false; r.sql = r.sql.replace('venue TEXT,', 'venue TEXT COLLATE NOCASE,'); return true }, 'carries a COLLATE clause'],
    ['a table definition names no venue column line', d => { const r = d.ddl && d.ddl.rows.find(x => x.name === 'postseason_games'); if (!r) return false; r.sql = r.sql.replace('venue TEXT,', 'place TEXT,'); return true }, 'does not define `venue TEXT`'],
    ['an index that carries COLLATE came back from the definitions query', d => { if (!d.ddl) return false; d.ddl.rows.push({ name: 'idx_venue', type: 'index', sql: 'CREATE INDEX idx_venue ON regular_season_games (venue COLLATE NOCASE)' }); return true }, 'an object other than a table'],
    ['the saved rows name another statement hash', d => { d.statementSha256 = '0'.repeat(64); return true }, 'these rows are not that statement\'s'],
    ['the saved rows name another statement length', d => { d.statementBytes += 1; return true }, 'these rows are not that statement\'s'],
    // refit keeps every aggregate consistent, so the edit reaches the control it is aimed at and not an earlier check
    ['control 3: Manadon Sports Hub has two games (every aggregate kept consistent)', d => { const r = vrow(d, r => nameOf(r) === MANADON); if (!r) return false; r[ix.c1] = 2; r[ix.c2] = 2; refit(d); return true }, 'control 3'],
    // Step 0 saw Manadon on 2026-11-09 and the session record names the same day, so the only way to move the row's date without tripping control 2 first is to doctor the record (see CTL_CASES)
    ['control 2: Manadon Sports Hub is on another day than Step 0 saw it (every aggregate kept consistent)', d => { const r = vrow(d, r => nameOf(r) === MANADON); if (!r) return false; r[ix.s1] = plusDay(r[ix.s1]); r[ix.s2] = r[ix.s1]; refit(d); return true }, 'control 2'],
    ['control 1: a name is absent from the archive window (games 0, every aggregate kept consistent)', d => { const r = vrow(d, r => nameOf(r) !== MANADON && r[ix.c1] > 0); if (!r) return false; r[ix.c1] = r[ix.c2] = r[ix.c3] = r[ix.c4] = r[ix.c5] = 0; r[ix.s1] = r[ix.s2] = null; refit(d); return true }, 'control 1'],
  ]
  const CTL_CASES = [
    ['control 1: the candidates file counted more games than the archive holds', c => { const v = [...c.cand.values()].find(x => x.games >= 1 && L.covered.indexOf(x.venue) < 0 && L.names.includes(x.venue)); if (!v) return false; v.games += 100000; return true }, 'fewer than the'],
    ['control 1: more games were created before the cutoff than the candidates file counted', c => { const r = vrow(data, r => r[ix.c5] >= 1); if (!r) return false; c.cand.get(nameOf(r)).games = r[ix.c5] - 1; return true }, 'more than the'],
    ['control 1: the candidates file\'s last date is after the archive\'s', c => { const v = c.cand.get(L.names[0]); v.last = '2099-01-01'; return true }, 'is before the candidates file\'s'],
    ['control 1: a review name is missing from the candidates file', c => c.cand.delete(L.names[0]), 'not a row of data/venue-source-candidates.json'],
    ['control 2: Step 0\'s thin day lies outside the name\'s first..last dates', c => { const t = c.thin.find(x => L.names.includes(x.name)); if (!t) return false; t.day = '2000-01-01'; return true }, 'control 2: Step 0 saw'],
    ['control 2: no name Step 0 listed is a review name', c => { if (!c.thin.length) return false; c.thin = c.thin.map(t => ({ ...t, name: 'Nowhere Park' })); return true }, 'none of the names Step 0 listed'],
    ['control 3: the 2026-11-11 record names another day for the Manadon row', c => { c.manadon.date = plusDay(c.manadon.date); return true }, 'control 3'],
  ]
  const lines = []
  let caught = 0, problems = 0
  const base = (() => { try { analyze(clone(), from, to, L, ctlClone()); return 'holds' } catch (e) { problems++; return `FAILS: ${e.message}` } })()
  lines.push(`${base === 'holds' ? 'PASS' : 'FAIL'}  control: the unedited rows pass every check (${base})`)
  const run = (name, applied, fn, fragment, changed) => {
    if (!applied) { problems++; lines.push(`BROKEN      ${name}: the edit found nothing to change (no such row in the saved data)`); return }
    if (!changed) { problems++; lines.push(`BROKEN      ${name}: the edit left its input unchanged`); return }
    try { fn(); problems++; lines.push(`NOT CAUGHT  ${name}  (every check passed on the doctored input)`) }
    catch (e) {
      if (e.message.includes(fragment)) { caught++; lines.push(`CAUGHT      ${name}\n              ${e.message.slice(0, 210)}`) }
      else { problems++; lines.push(`WRONG CAUSE ${name}\n              ${e.message.slice(0, 210)}\n              wanted a message containing: ${fragment}`) }
    }
  }
  for (const [name, edit, fragment] of DATA_CASES) {
    const d = clone(); let applied; try { applied = edit(d) } catch { applied = false }
    run(name, applied, () => analyze(d, from, to, L, ctlClone()), fragment, JSON.stringify(d) !== JSON.stringify(data))
  }
  const before = JSON.stringify([...ctl.cand], null) + JSON.stringify(ctl.thin) + JSON.stringify(ctl.manadon)
  for (const [name, edit, fragment] of CTL_CASES) {
    const c = ctlClone(); let applied; try { applied = edit(c) } catch { applied = false }
    run(name, applied, () => analyze(clone(), from, to, L, c), fragment, JSON.stringify([...c.cand]) + JSON.stringify(c.thin) + JSON.stringify(c.manadon) !== before)
  }
  // the Manadon record's sentence, doctored, each copy run through `manadonRecord`
  const doc = readFileSync(HERE(MANADON_DOC), 'utf8')
  const qBase = (() => { try { return `holds, id ${manadonRecord(doc).id}` } catch (e) { problems++; return `FAILS: ${e.message}` } })()
  lines.push(`${qBase.startsWith('holds') ? 'PASS' : 'FAIL'}  control: the unedited session record passes manadonRecord (${qBase})`)
  const QUOTE_CASES = [
    ['the sentence that reads the archive\'s one Manadon row is gone', s => s.replace('both tables: one row,', 'both tables: some rows,'), 'was not found'],
    ['the row id names another day than its start_time', s => s.replace('`FA Cup_2026-11-09_e401931098`', '`FA Cup_2026-11-08_e401931098`'), 'does not carry its start_time\'s date'],
  ]
  for (const [name, edit, fragment] of QUOTE_CASES) {
    const edited = edit(doc)
    run(name, true, () => manadonRecord(edited), fragment, edited !== doc)
  }
  // the window start is an argument, not a row: `analyze` is called with a window that starts a day after the candidates file's
  run('the window starts a day after the candidates file\'s', true, () => analyze(clone(), plusDay(from), to, L, ctlClone()), 'the window starts', true)
  const total = DATA_CASES.length + CTL_CASES.length + QUOTE_CASES.length + 1
  lines.push('')
  lines.push(`${caught} of ${total} cases caught; control ${base === 'holds' ? 'holds' : 'FAILS'}; ${problems} problem(s)`)
  lines.push(`coverage: ${total} doctored inputs: ${DATA_CASES.length} copies of the saved rows, ${CTL_CASES.length} copies of the control records, one doctored window argument (each run through \`analyze\`, which carries every check that decides whether a record may be written), and ${QUOTE_CASES.length} copies of the session record (each run through \`manadonRecord\`).`)
  lines.push('NOT exercised here: the statement\'s own SQL (the join, the window and the date filter are exercised only by the three controls on real data); the compiled-table-versus-source agreement in `lists` (it would need a')
  lines.push('doctored build); the candidates file\'s `source` text checks in `lists`; the Step 0 thin-day reader on a differently shaped file; the row-count check `rows.length === N + 4` (every way to break it is refused earlier by the')
  lines.push('kind, index and "exactly one" checks, so it cannot fire on its own); and the report\'s wording. Those checks exist and have not been made to fail.')
  return { text: lines.join('\n') + '\n', ok: problems === 0 && caught === total }
}

// ---------- main ----------
const [mode, ...args] = process.argv.slice(2)
if (mode === 'sql') {
  const [from, to] = args
  must(from && to, 'usage: sql <from> <to>')
  const L = lists()
  const sql = buildSql(from, to, L)
  process.stdout.write(sql + '\n')
  console.error(`sql: ${Buffer.byteLength(sql)} bytes, sha256 ${createHash('sha256').update(sql).digest('hex')}, ${L.names.length} names embedded`)
} else if (mode === 'report' || mode === 'selftest') {
  const [rowsFile, from, to] = args
  must(rowsFile && from && to, `usage: ${mode} <rows.json> <from> <to>`)
  const data = JSON.parse(readFileSync(rowsFile, 'utf8'))
  const L = lists()
  const ctl = loadControls(L)
  if (mode === 'selftest') {
    const t = selftest(data, from, to, L, ctl)
    process.stdout.write(t.text)
    process.exitCode = t.ok ? 0 : 1
  } else {
    process.stdout.write(render(analyze(data, from, to, L, ctl), from, to, L, ctl))
  }
} else {
  console.error('usage: node outbox/venue-review-counts-2026-11-12.mjs sql <from> <to> | report <rows.json> <from> <to> | selftest <rows.json> <from> <to>')
  process.exitCode = 2
}
