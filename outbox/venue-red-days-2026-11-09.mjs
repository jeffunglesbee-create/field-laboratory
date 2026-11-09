// STEP 0 OF TASK 4, docs/CC-CMD-2026-11-09-venue-review-remainder.md: for each of the last 60 days, would the live-slate check
//   "the venue table covers at least one venue on this slate"   (scripts/render-check.mjs, the `check(...)` after `observableVenues`)
// have gone red under the venue table AS IT STANDS TODAY (485 rows)? A day is red when the slate has at least one observable venue (a real,
// non-placeholder venue that is not a recorded indoor arena) and no card's venue is a table row.
//
// WHAT THIS IS. A re-runnable measurement. Mode `sql` prints ONE statement for the D1 database `field-archive` (cc49101c-0569-4d41-8e7a-be139cde4f26),
// through the D1 connector: it embeds the table's names and the recorded arenas as read from the module the page uses (build/Venues.js), classifies every
// archive game of the window, and returns one row per day plus a `days` row, an `all` row (column sums) and two checksum rows for the embedded lists.
// The rows are saved by hand into outbox/venue-red-days-rows-2026-11-09.json (the connector returns them to the session, not to a file), so the
// report refuses them unless they check out MECHANICALLY: every day row is internally consistent, the typed rows sum to the `all` row the database computed,
// the embedded lists equal the current ones (n, characters, position-weighted code-point sum), and every name typed on a thin day is checked against the page's
// own predicates. Mode `report` prints the record; mode `selftest` makes each of those checks fail on purpose (Rule 90).
//
// Usage:   node outbox/venue-red-days-2026-11-09.mjs sql      <from> <to>                 > statement.sql
//          node outbox/venue-red-days-2026-11-09.mjs report   <rows.json> <from> <to>     > outbox/venue-red-days-2026-11-09.md
//          node outbox/venue-red-days-2026-11-09.mjs selftest <rows.json> <from> <to>     > outbox/venue-red-days-selftest-2026-11-09.txt
// Needs `npm run build` first (build/Venues.js is a copy of src/Venues.fs; the script reads the compiled module the page loads).
//
// PREMISES, each with the one command that would refute it (Rule 100):
//   1. The archive's `venue` is the page's `data-venue`.   NOT established for past days. Refuted by: render the page on a past day's capture and diff `data-venue`
//      against the archive. What supports it: 2026-11-09's archive game count and arena count are compared with the live run's below (controls 3 and 1).
//   2. The arena list embedded here is complete.            It need not be for the headline: an arena the extraction missed counts as an observable, uncovered venue,
//      which can only make a day look MORE red, never less, so "0 red days" cannot be produced by it. It is checked both ways anyway (source text and compiled
//      literal must agree, and every name must be recognised by the page's own predicate), and every name typed from a thin day is run through `isIndoorArena`.
//   3. `date` is the slate day the page renders.            Refuted by: the control on 2026-11-09 (14 games here, 14 cards in the live run's decode line).
//   4. A passing check on the past says something about the future.   It does not, by construction: the table's sourced rows came from this same archive. See "Not established".
//   5. The saved rows came from the statement `sql` prints today.     Refuted by: `sql` printing a sha256 other than `statementSha256` in the rows file. `analyze` stops on it.
//   6. The document this record quotes says what the record quotes.   Refuted by: grep for the quoted string in outbox/venue-us-bank-stadium-2026-11-09.md. `checkQuotes` stops on it.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const HERE = p => new URL(p, import.meta.url)
const must = (ok, msg) => { if (!ok) throw new Error('venue-red-days: ' + msg) }
const V = await import(HERE('../build/Venues.js').href)

export const COLUMNS = ['kind', 'key', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 's1', 's2']
const PLACEHOLDERS = ['TBC', 'TBD', '—', '-', '']     // PLACEHOLDER_VENUES in scripts/render-check.mjs, same five strings
const BANK = 'U.S. Bank Stadium'

// ---------- the two lists the page uses, from the page's own module ----------
function lists() {
  const table = [...new Set(Array.from(V.all).map(v => v.Name))].sort()
  // The arenas are private to the module, so they are read twice, from two different texts, and must agree: the F# source block and the compiled literal.
  const fs = readFileSync(HERE('../src/Venues.fs'), 'utf8')
  const a0 = fs.indexOf('let private indoorArenas =')
  must(a0 >= 0 && fs.indexOf('let private indoorArenas =', a0 + 1) === -1, 'src/Venues.fs: want exactly one `let private indoorArenas =`')
  const a1 = fs.indexOf('/// True when the name is a recorded indoor arena', a0)
  must(a1 > a0, 'src/Venues.fs: the doc comment that ends the indoorArenas block was not found')
  const block = fs.slice(a0, a1).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  const fromSource = [...new Set([...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1]))].sort()
  const js = readFileSync(HERE('../build/Venues.js'), 'utf8')
  const lit = js.match(/^const indoorArenas = ofSeq\((\[.*\]), \{$/m)   // Fable puts the comparer on the next lines: `ofSeq([...], {` newline `Compare: ...`
  must(lit, 'build/Venues.js: the compiled `const indoorArenas = ofSeq([...], {` line was not found')
  const fromCompiled = [...new Set(JSON.parse(lit[1]))].sort()
  must(JSON.stringify(fromSource) === JSON.stringify(fromCompiled), `the arena list read from src/Venues.fs (${fromSource.length}) and from build/Venues.js (${fromCompiled.length}) differ`)
  const unrecognised = fromSource.filter(n => !V.isIndoorArena(n))
  must(unrecognised.length === 0, `arenas the page's own predicate does not recognise: ${JSON.stringify(unrecognised)}`)
  const both = fromSource.filter(n => table.includes(n))
  must(both.length === 0, `names that are both a table row and an arena: ${JSON.stringify(both)}`)
  for (const n of [...table, ...fromSource]) must(!/[\n\r\\]/.test(n), `a name carries a newline or a backslash: ${JSON.stringify(n)}`)
  return { table, arenas: fromSource }
}
const sum = names => ({
  n: names.length,
  len: names.reduce((a, s) => a + [...s].length, 0),
  w: names.reduce((a, s) => a + [...s].reduce((b, c, i) => b + c.codePointAt(0) * (i + 1), 0), 0),   // position-weighted code-point sum
})

// ---------- the statement ----------
export function buildSql(from, to, L) {
  const q = s => `'${s.replace(/'/g, "''")}'`
  const vals = names => names.map(n => `(${q(n)})`).join(',\n')
  const win = `date >= ${q(from)} AND date <= ${q(to)}`
  const chk = (label, t) => `UNION ALL SELECT '${label}', NULL, COUNT(*), SUM(LENGTH(n)), (SELECT SUM(unicode(substr(x.n, o.i, 1)) * o.i) FROM ${t} x JOIN pos o ON o.i <= LENGTH(x.n)), NULL, NULL, NULL, NULL, NULL, NULL, NULL FROM ${t}`
  return `WITH RECURSIVE
pos(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM pos WHERE i < 80),
tbl(n) AS (VALUES
${vals(L.table)}
),
arena(n) AS (VALUES
${vals(L.arenas)}
),
ph(n) AS (VALUES ${PLACEHOLDERS.map(p => `(${q(p)})`).join(', ')}),
slate AS (
  SELECT date, venue FROM regular_season_games WHERE ${win}
  UNION ALL
  SELECT date, venue FROM postseason_games WHERE ${win}
),
cls AS (
  SELECT date, venue,
    CASE WHEN venue IS NULL OR trim(venue) IN (SELECT n FROM ph) THEN 'p'
         WHEN venue IN (SELECT n FROM arena) THEN 'a'
         WHEN venue IN (SELECT n FROM tbl) THEN 't'
         ELSE 'u' END AS k
  FROM slate
),
perday AS (
  SELECT date, COUNT(*) AS games,
    SUM(k = 'p') AS p, SUM(k = 'a') AS a, SUM(k = 't') AS t, SUM(k = 'u') AS u,
    COUNT(DISTINCT CASE WHEN k = 'a' THEN venue END) AS av,
    COUNT(DISTINCT CASE WHEN k = 't' THEN venue END) AS tv,
    COUNT(DISTINCT CASE WHEN k = 'u' THEN venue END) AS uv
  FROM cls GROUP BY date
),
nm AS (
  SELECT date, k, group_concat(venue, ' | ') AS v
  FROM (SELECT DISTINCT date, k, venue FROM cls WHERE k IN ('t', 'u') ORDER BY venue)
  GROUP BY date, k
)
SELECT 'day' AS kind, d.date AS key, d.games AS c1, d.p AS c2, d.a AS c3, d.t AS c4, d.u AS c5, d.av AS c6, d.tv AS c7, d.uv AS c8,
  CASE WHEN d.tv <= 1 THEN (SELECT v FROM nm WHERE nm.date = d.date AND nm.k = 't') END AS s1,
  CASE WHEN d.tv <= 1 THEN (SELECT v FROM nm WHERE nm.date = d.date AND nm.k = 'u') END AS s2
FROM perday d
UNION ALL SELECT 'days', NULL, COUNT(*), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL FROM perday
UNION ALL SELECT 'all', NULL, SUM(games), SUM(p), SUM(a), SUM(t), SUM(u), SUM(av), SUM(tv), SUM(uv), NULL, NULL FROM perday
${chk('chk-tbl', 'tbl')}
${chk('chk-arena', 'arena')}
ORDER BY 1, 2`
}

// ---------- dates ----------
const dateRange = (from, to) => {
  const out = []
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}
const weekday = d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T12:00:00Z').getUTCDay()]

// ---------- the controls: two real days the live check has already judged, and one count ----------
// Real runs, quoted from the logs in outbox/venue-us-bank-stadium-2026-11-09.md (section 1): verify 42621717589 went RED on 2026-11-09 with
//   "→ Manadon Sports Hub, U.S. Bank Stadium — none of them in the 484-entry table (11 recorded indoor arena(s) not counted)",
// and the last green verify before it, 42507928169 (d9554f3, 2026-11-08 18:02Z), passed the step on 2026-11-08.
const CONTROL_RED = { date: '2026-11-09', observable: ['Manadon Sports Hub', BANK], arenas: 11, tableThen: 484 }
const CONTROL_GREEN = { date: '2026-11-08' }

// ---------- the quotes: what this record cites from outbox/venue-us-bank-stadium-2026-11-09.md must be in that file ----------
// Built from the control constants above, so the text the record prints and the text `checkQuotes` looks for cannot drift apart.
const EVIDENCE_DOC = './venue-us-bank-stadium-2026-11-09.md'
const RED_RUN = '42621717589'                                                       // verify, the push of 17d28eb: red on the 2026-11-09 slate
const GREEN_RUN = { id: '42507928169', sha: 'd9554f3', at: '2026-11-08 18:02Z' }    // verify: the last green run before it
const LIVE_RUN = '42631741258'                                                      // verify, the push of a18e26a: green; its step log printed the decode line
const FAIL_LINE = `${CONTROL_RED.observable.join(', ')} — none of them in the ${CONTROL_RED.tableThen}-entry table (${CONTROL_RED.arenas} recorded indoor arena(s) not counted)`
const RED_BLOCK = `and verify's own, from run ${RED_RUN}:\n\n\`\`\`\nFAIL  the venue table covers at least one venue on this slate\n      → ${FAIL_LINE}\n`
const GREEN_SENTENCE = `The last verify run that went green, ${GREEN_RUN.id} (\`${GREEN_RUN.sha}\`, ${GREEN_RUN.at}), passed this step on that day's slate.`
const LIVE_MARKER = `- Run ${LIVE_RUN}, workflow verify`
const DECODE_RE = /decode-status: decoded (\d+) game\(s\) for 2026-11-09/
export function checkQuotes(doc) {
  const name = 'outbox/venue-us-bank-stadium-2026-11-09.md'
  must(doc.includes(RED_BLOCK), `${name} does not hold the red verify run's FAIL block for run ${RED_RUN} (the marker line, a fence, the FAIL line, then "→ ${FAIL_LINE}")`)
  must(doc.includes(GREEN_SENTENCE), `${name} does not hold the last green verify run's sentence: ${JSON.stringify(GREEN_SENTENCE)}`)
  const at = doc.indexOf(LIVE_MARKER)
  must(at >= 0, `${name}: the line naming run ${LIVE_RUN} was not found`)
  const m = DECODE_RE.exec(doc.slice(at))
  must(m, `${name}: no decode-status line after the line naming run ${LIVE_RUN}`)
  return Number(m[1])
}
export function checkControls(days, L) {
  const red = days.find(d => d.key === CONTROL_RED.date)
  must(red, `control: ${CONTROL_RED.date} is not among the days`)
  must(red.soleCovered === BANK, `control: ${CONTROL_RED.date} must rest on ${BANK} alone (the live run went red without it), found covered=${JSON.stringify(red.s1)}`)
  const names = [...red.names1, ...red.names2].sort()
  must(JSON.stringify(names) === JSON.stringify([...CONTROL_RED.observable].sort()), `control: ${CONTROL_RED.date} observable venues are ${JSON.stringify(names)}, the live run's FAIL line named ${JSON.stringify(CONTROL_RED.observable)}`)
  must(red.c6 === CONTROL_RED.arenas, `control: ${CONTROL_RED.date} has ${red.c6} distinct arenas, the live run's FAIL line counted ${CONTROL_RED.arenas}`)
  must(L.table.length - 1 === CONTROL_RED.tableThen, `control: the table without ${BANK} has ${L.table.length - 1} rows, the live run's FAIL line said ${CONTROL_RED.tableThen}`)
  const green = days.find(d => d.key === CONTROL_GREEN.date)
  must(green, `control: ${CONTROL_GREEN.date} is not among the days`)
  must(green.verdict !== 'RED' && green.soleCovered !== BANK, `control: ${CONTROL_GREEN.date} must not be red even without ${BANK} (verify 42507928169 passed that day), found ${green.verdict}, covered=${JSON.stringify(green.s1)}`)
}

// ---------- the checks on the saved rows, and the derivation ----------
export function analyze(data, from, to, L, review) {
  must(JSON.stringify(data.columns) === JSON.stringify(COLUMNS), 'the saved columns are not the statement\'s')
  const rows = data.rows.map(r => { must(r.length === COLUMNS.length, 'a saved row has the wrong number of cells'); return Object.fromEntries(COLUMNS.map((c, i) => [c, r[i]])) })
  const one = kind => { const m = rows.filter(r => r.kind === kind); must(m.length === 1, `want exactly one "${kind}" row, found ${m.length}`); return m[0] }
  const dayRows = rows.filter(r => r.kind === 'day')
  const keys = dayRows.map(r => r.key)
  must(new Set(keys).size === keys.length, `a day appears twice: ${keys.find((k, i) => keys.indexOf(k) !== i)}`)
  const inWindow = new Set(dateRange(from, to))
  must(keys.every(k => inWindow.has(k)), `a saved day is outside ${from}..${to}: ${keys.find(k => !inWindow.has(k))}`)
  const daysRow = one('days')
  must(daysRow.c1 === dayRows.length, `the database counted ${daysRow.c1} days with games but the saved rows hold ${dayRows.length}`)

  // the lists the statement ran with are the current ones
  for (const [kind, list] of [['chk-tbl', L.table], ['chk-arena', L.arenas]]) {
    const r = one(kind), s = sum(list)
    must(r.c1 === s.n && r.c2 === s.len && r.c3 === s.w, `the ${kind.slice(4)} list the statement ran with is not the current one: database ${r.c1}/${r.c2}/${r.c3}, now ${s.n}/${s.len}/${s.w} (n/characters/weighted)`)
  }

  // the rows are this statement's: the one `sql` prints today is the one the saved rows say they came from
  const sql = buildSql(from, to, L)
  const sqlHash = createHash('sha256').update(sql).digest('hex'), sqlBytes = Buffer.byteLength(sql)
  must(data.statementSha256 === sqlHash && data.statementBytes === sqlBytes, `the saved rows say they came from a statement of ${data.statementBytes} bytes, sha256 ${data.statementSha256}, but \`sql ${from} ${to}\` prints ${sqlBytes} bytes, sha256 ${sqlHash}: these rows are not that statement's`)

  const tblSet = new Set(L.table), arSet = new Set(L.arenas), reviewSet = new Set(review)
  const days = []
  for (const r of dayRows.sort((a, b) => (a.key < b.key ? -1 : 1))) {
    for (const c of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']) must(Number.isInteger(r[c]) && r[c] >= 0, `${r.key}: ${c} is not a non-negative integer (${JSON.stringify(r[c])})`)
    must(r.c1 >= 1, `${r.key}: a day row with no games`)
    must(r.c1 === r.c2 + r.c3 + r.c4 + r.c5, `${r.key}: games (${r.c1}) is not placeholder + arena + table + other (${r.c2 + r.c3 + r.c4 + r.c5})`)
    must(r.c6 <= r.c3 && r.c7 <= r.c4 && r.c8 <= r.c5 && (r.c3 > 0) === (r.c6 > 0) && (r.c4 > 0) === (r.c7 > 0) && (r.c5 > 0) === (r.c8 > 0), `${r.key}: a venue count disagrees with its game count`)
    const thin = r.c7 <= 1
    must(thin || (r.s1 === null && r.s2 === null), `${r.key}: lists names although the day has ${r.c7} covered venues (the statement lists names only when there is at most one)`)
    const names1 = thin && r.s1 ? r.s1.split(' | ') : [], names2 = thin && r.s2 ? r.s2.split(' | ') : []
    if (thin) {
      must(names1.length === r.c7, `${r.key}: lists ${names1.length} covered name(s) for ${r.c7} covered venue(s)`)
      must(names2.length === r.c8, `${r.key}: lists ${names2.length} other name(s) for ${r.c8} other venue(s)`)
      for (const n of names1) must(tblSet.has(n), `${r.key}: ${JSON.stringify(n)} is named as covered but is not a table row`)
      for (const n of names2) {
        must(!tblSet.has(n), `${r.key}: ${JSON.stringify(n)} is named as uncovered but is a table row`)
        must(!arSet.has(n) && !V.isIndoorArena(n), `${r.key}: ${JSON.stringify(n)} is named as an observable venue but is recognised as an indoor arena`)
        must(!PLACEHOLDERS.includes(n.trim()), `${r.key}: ${JSON.stringify(n)} is a placeholder, not a venue`)
      }
    }
    const observable = r.c7 + r.c8
    const verdict = observable === 0 ? (r.c3 > 0 ? 'arenas only' : 'placeholders only') : r.c7 === 0 ? 'RED' : r.c7 === 1 ? 'thin' : 'covered'
    days.push({ ...r, names1, names2, observable, verdict, soleCovered: r.c7 === 1 ? names1[0] : null, wd: weekday(r.key), reviewHere: names2.filter(n => reviewSet.has(n)) })
  }
  const all = one('all')
  for (const [i, c] of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'].entries()) {
    const s = days.reduce((a, d) => a + d[c], 0)
    must(all[c] === s, `the column sums of the day rows differ from the ALL row the database computed: ${c} is ${s} typed, ${all[c]} computed`)
  }
  checkControls(days, L)
  return { days, all, daysRow, missing: [...inWindow].filter(d => !keys.includes(d)).sort(), sqlHash, sqlBytes }
}

// ---------- the record ----------
function render(res, from, to, L, decodeCount, review) {
  const { days, all, missing, sqlHash, sqlBytes } = res
  const out = []
  const p = (...a) => out.push(a.join(''))
  const by = v => days.filter(d => d.verdict === v)
  const red = by('RED'), thin = by('thin'), covered = by('covered'), arenasOnly = by('arenas only'), phOnly = by('placeholders only')
  const redWithoutBank = days.filter(d => d.soleCovered === BANK)
  const tvs = days.filter(d => d.observable > 0).map(d => d.c7).sort((a, b) => a - b)
  const median = tvs.length ? (tvs.length % 2 ? tvs[(tvs.length - 1) / 2] : (tvs[tvs.length / 2 - 1] + tvs[tvs.length / 2]) / 2) : null
  const bankDay = days.find(d => d.key === CONTROL_RED.date)
  const outside = review.filter(n => n !== BANK && !L.table.includes(n))     // the review venues still not table rows

  p(`# Red days in the last ${dateRange(from, to).length} days under today's venue table (Task 4, Step 0)`)
  p()
  p(`Session 2026-11-09, field-laboratory. Governing record: \`docs/CC-CMD-2026-11-09-venue-review-remainder.md\`, Task 4. Written by \`outbox/venue-red-days-2026-11-09.mjs\` from \`outbox/venue-red-days-rows-2026-11-09.json\`.`)
  p()
  p(`**${red.length} of ${days.length} days would have gone red** with the ${L.table.length}-row table and ${L.arenas.length} recorded arenas, window ${from} to ${to}.`)
  p(`**${redWithoutBank.length} of ${days.length} without the ${BANK} row** (${redWithoutBank.map(d => d.key).join(', ') || 'none'}): the day verify did go red, which is the row's reason to exist.`)
  p(`**${thin.length} day(s) rest on a single table row** (${thin.map(d => `${d.key} ${d.wd}, ${d.soleCovered}`).join('; ') || 'none'}).${red.length === 0 ? ' Every other day with an observable venue has two or more.' : ''}`)
  p()
  p('## What this prices')
  p()
  p(`Adding any or all of the ${outside.length} review venues still outside the table would have removed **${red.length} red days** from this window, because there were ${red.length}. ${redWithoutBank.length ? `The row that removed a red day from it is ${BANK} (${redWithoutBank.map(d => d.key).join(', ')}), added the same day.` : 'No table row removed a red day from it.'}`)
  p(`That is a statement about the past ${days.length} days and cannot be read forward: see "Not established". What it does say is where the table is thin: ${thin.length ? `the day${thin.length > 1 ? 's' : ''} above, each of which a single bad row (a wrong name, a removed row) would have turned red.` : 'nowhere in this window.'}`)
  if (thin.length) {
    p()
    p('| day | sole covered ground | other observable venues that day | of which in the sourcing run\'s review list |')
    p('|---|---|---|---|')
    for (const d of thin) p(`| ${d.key} ${d.wd} | ${d.soleCovered} | ${d.names2.join(', ') || 'none'} | ${d.reviewHere.join(', ') || 'none'} |`)
  }
  p()
  p('## The days, by verdict')
  p()
  p('| verdict | days |')
  p('|---|---|')
  p(`| RED: an observable venue, none in the table | ${red.length} |`)
  p(`| thin: exactly one covered venue | ${thin.length} |`)
  p(`| covered: two or more covered venues | ${covered.length} |`)
  p(`| arenas only: every real venue is a recorded arena (the check prints a warning and skips) | ${arenasOnly.length} |`)
  p(`| placeholders only: no real venue (the check prints a warning and skips) | ${phOnly.length} |`)
  p(`| no games in the archive | ${missing.length}${missing.length ? ` (${missing.join(', ')})` : ''} |`)
  p()
  p(`Over the ${tvs.length} days with an observable venue, covered venues per day: minimum ${tvs[0]}, median ${median}, maximum ${tvs[tvs.length - 1]}.`)
  p()
  p('## Controls: the instrument reproduces two real days and one count')
  p()
  p(`Run by the script before it prints anything; it refuses to write this file if any of the first two fails.`)
  p()
  const greenDay = days.find(d => d.key === CONTROL_GREEN.date)
  p(`1. **A real red day.** Without the ${BANK} row, ${CONTROL_RED.date} rests on that row alone, its observable venues are ${bankDay.names1.concat(bankDay.names2).sort().join(' and ')} and it has ${bankDay.c6} distinct recorded arenas, in a table of ${L.table.length - 1} rows. Verify run ${RED_RUN} went red that day with exactly "${FAIL_LINE}" (\`outbox/venue-us-bank-stadium-2026-11-09.md\`, section 1; the script checks that the file holds that block).`)
  p(`2. **A real green day.** ${CONTROL_GREEN.date} is ${greenDay.verdict} with ${greenDay.c7} covered venues, so it does not rest on ${BANK}, and verify run ${GREEN_RUN.id} (\`${GREEN_RUN.sha}\`, ${GREEN_RUN.at}) passed the step that day (same file, section 1; the script checks that the file holds that sentence).`)
  p(`3. **A count.** The archive holds ${bankDay.c1} games on ${CONTROL_RED.date}; the step log of verify run ${LIVE_RUN} printed \`decoded ${decodeCount} game(s) for ${CONTROL_RED.date}\` (same file, section 5; the script reads the number from there). ${bankDay.c1 === decodeCount ? 'They agree.' : '**They differ.** The archive is not the page\'s slate for that day to the game; read every number here as approximate.'}`)
  p()
  p('## Method, and its coverage')
  p()
  p(`- Checked ${days.length} of ${dateRange(from, to).length} calendar days in ${from}..${to}; ${all.c1} archive games (\`regular_season_games\` and \`postseason_games\` together; one database, one venue table, one arena list, one window). ${missing.length ? `Days with no games: ${missing.join(', ')}.` : 'No day in the window was empty.'}`)
  p(`- Classification, in the statement: a game is a placeholder (NULL, or ${PLACEHOLDERS.map(x => JSON.stringify(x)).join(', ')} after trimming), an arena (one of ${L.arenas.length}), a table row (one of ${L.table.length}, exact name, as the page's \`known.has(v)\` is) or other. A day is red when it has an observable venue (arena and placeholder excluded) and no table row. Games in this window: ${all.c2} placeholder, ${all.c3} arena, ${all.c4} table, ${all.c5} other.`)
  p(`- The lists are the page's own: the table from \`build/Venues.js\` \`all\`, the arenas read from \`src/Venues.fs\` and from the compiled literal, which agree, each recognised by \`isIndoorArena\`. They were embedded in the statement and re-computed inside the database: n, characters and a position-weighted code-point sum all equal (rows \`chk-tbl\`, \`chk-arena\`).`)
  p(`- The day rows were saved by hand from the connector's output and are checked mechanically: each row's games equal its four classes, the typed rows sum to the \`all\` row the database computed (${all.c1}, ${all.c2}, ${all.c3}, ${all.c4}, ${all.c5}, ${all.c6}, ${all.c7}, ${all.c8}), and the database's day count equals the saved rows.`)
  p(`- The statement is ${sqlBytes} bytes, sha256 \`${sqlHash}\`, printed by \`node outbox/venue-red-days-2026-11-09.mjs sql ${from} ${to}\`; the saved rows name the same length and hash, and \`report\` refuses to write when they do not. That the text run through the connector is that text is not provable from here; the list checksums, the partition and the controls are what stand in for it.`)
  p()
  p('## Not established')
  p()
  p(`- **Anything forward.** The table's sourced rows came from this same archive: the candidates file is built from the archive's venues, so a window of the archive is partly covered by construction. A ground the archive has not captured yet cannot show here. The count is how the table has fared against the past, not a forecast of red days.`)
  p('- That the archive\'s venue strings are the page\'s `data-venue` strings on every day (premise 1). Controls 1 and 3 compare one day: its venue names and its game count.')
  p(`- Which of the ${outside.length} review venues still outside the table appeared on any slate, or how often. This file counts days, not venues; the thin days above list the review venues that were present.`)
  p('- Whether any thin day would have been saved by a second covered ground: only the review venues listed in the thin-days table could have, and the owner decides whether they go in.')
  p()
  p('## Every day')
  p()
  p('| day | | games | arena venues | placeholder games | table venues | other observable venues | verdict |')
  p('|---|---|---|---|---|---|---|---|')
  for (const d of days) p(`| ${d.key} | ${d.wd} | ${d.c1} | ${d.c6} | ${d.c2} | ${d.c7} | ${d.c8} | ${d.verdict} |`)
  p()
  p(`To reproduce: \`npm run build\`, \`node outbox/venue-red-days-2026-11-09.mjs sql ${from} ${to}\`, run the statement on \`field-archive\` (\`cc49101c-0569-4d41-8e7a-be139cde4f26\`) through the D1 connector, save the returned rows in the shape of \`outbox/venue-red-days-rows-2026-11-09.json\`, then \`report\`. \`selftest\` (output in \`outbox/venue-red-days-selftest-2026-11-09.txt\`) shows each check refusing a doctored copy of those rows.`)
  return out.join('\n') + '\n'
}

// ---------- the self-test: every check made to fail on purpose (Rule 90) ----------
function selftest(data, from, to, L, review) {
  const clone = () => JSON.parse(JSON.stringify(data))
  const ix = Object.fromEntries(COLUMNS.map((c, i) => [c, i]))
  const dayOf = (d, key) => d.rows.find(r => r[ix.kind] === 'day' && r[ix.key] === key)
  const firstThin = d => d.rows.find(r => r[ix.kind] === 'day' && r[ix.c7] <= 1)
  const addOther = (r, name) => { r[ix.c1] += 1; r[ix.c5] += 1; r[ix.c8] += 1; if (name !== null) r[ix.s2] = r[ix.s2] ? r[ix.s2] + ' | ' + name : name }   // one more game at one more observable venue
  const CASES = [
    ['a day\'s table-game count is one too high', d => { const r = d.rows.find(x => x[ix.kind] === 'day'); r[ix.c4] += 1; return !!r }, 'is not placeholder + arena + table + other'],
    ['a day\'s games and table games are both one too high (the partition still holds)', d => { const r = d.rows.find(x => x[ix.kind] === 'day'); r[ix.c1] += 1; r[ix.c4] += 1; return !!r }, 'differ from the ALL row'],
    ['a day row was lost in transcription', d => { const i = d.rows.findIndex(x => x[ix.kind] === 'day'); if (i < 0) return false; d.rows.splice(i, 1); return true }, 'but the saved rows hold'],
    ['a day row is typed twice', d => { const r = d.rows.find(x => x[ix.kind] === 'day'); d.rows.push([...r]); return !!r }, 'appears twice'],
    ['a day row is dated outside the window', d => { const r = d.rows.find(x => x[ix.kind] === 'day'); r[ix.key] = '1999-01-01'; return !!r }, 'is outside'],
    ['the table-list checksum differs', d => { const r = d.rows.find(x => x[ix.kind] === 'chk-tbl'); r[ix.c3] += 1; return !!r }, 'list the statement ran with is not the current one'],
    ['the arena-list count differs', d => { const r = d.rows.find(x => x[ix.kind] === 'chk-arena'); r[ix.c1] -= 1; return !!r }, 'list the statement ran with is not the current one'],
    ['a thin day names a covered venue that is not a table row', d => { const r = d.rows.find(x => x[ix.kind] === 'day' && x[ix.c7] === 1); if (!r) return false; r[ix.s1] = 'Nowhere Park'; return true }, 'is not a table row'],
    // addOther keeps the partition and the venue/game counts consistent, so the edit reaches the check it is aimed at and not an earlier one
    ['a thin day lists an arena as an observable venue', d => { const r = firstThin(d); if (!r) return false; addOther(r, L.arenas[0]); return true }, 'recognised as an indoor arena'],
    ['a thin day lists a table row as an uncovered venue', d => { const r = firstThin(d); if (!r) return false; addOther(r, L.table[0]); return true }, 'but is a table row'],
    ['a thin day lists a placeholder as an observable venue', d => { const r = firstThin(d); if (!r) return false; addOther(r, 'TBC'); return true }, 'is a placeholder, not a venue'],
    ['a thin day\'s other-venue name count disagrees with its venue count', d => { const r = firstThin(d); if (!r) return false; addOther(r, null); return true }, 'other name(s) for'],
    ['a thin day names two covered venues for one', d => { const r = d.rows.find(x => x[ix.kind] === 'day' && x[ix.c7] === 1); if (!r) return false; r[ix.s1] = r[ix.s1] + ' | ' + L.table.find(n => n !== r[ix.s1]); return true }, 'covered name(s) for'],
    ['a day\'s other-venue count exceeds its other games', d => { const r = firstThin(d); if (!r) return false; r[ix.c8] += 1; return true }, 'a venue count disagrees with its game count'],
    ['a count is typed as text', d => { const r = d.rows.find(x => x[ix.kind] === 'day'); r[ix.c1] = String(r[ix.c1]); return !!r }, 'is not a non-negative integer'],
    ['the saved columns are in another order', d => { d.columns = [...d.columns].reverse(); return true }, 'the saved columns are not the statement\'s'],
    ['a saved row has a cell too many', d => { d.rows[0].push(null); return true }, 'a saved row has the wrong number of cells'],
    ['the ALL row is typed twice', d => { const r = d.rows.find(x => x[ix.kind] === 'all'); if (!r) return false; d.rows.push([...r]); return true }, 'want exactly one "all" row, found 2'],
    ['the red-day control: 2026-11-09 rests on another covered ground than the Bank', d => { const r = dayOf(d, CONTROL_RED.date); if (!r) return false; r[ix.s1] = L.table.find(n => n !== BANK); return true }, 'control: 2026-11-09 must rest on'],
    ['the red-day control: 2026-11-09 has one arena fewer than the live run counted (the ALL row kept consistent)', d => { const r = dayOf(d, CONTROL_RED.date), a = d.rows.find(x => x[ix.kind] === 'all'); if (!r || !a) return false; r[ix.c6] -= 1; a[ix.c6] -= 1; return true }, 'distinct arenas'],
    ['a day with two or more covered venues carries names', d => { const r = d.rows.find(x => x[ix.kind] === 'day' && x[ix.c7] >= 2); if (!r) return false; r[ix.s1] = 'Somewhere'; return true }, 'lists names although'],
    ['the red-day control fails: the observable venues on 2026-11-09 are not the live run\'s', d => { const r = dayOf(d, CONTROL_RED.date); if (!r || !r[ix.s2]) return false; r[ix.s2] = 'Somewhere Park'; return true }, 'control: 2026-11-09 observable venues'],
    ['the saved rows name another statement hash', d => { d.statementSha256 = '0'.repeat(64); return true }, 'these rows are not that statement\'s'],
    ['the saved rows name another statement length', d => { d.statementBytes += 1; return true }, 'these rows are not that statement\'s'],
  ]
  const lines = []
  let caught = 0, problems = 0
  const control = (() => { try { analyze(clone(), from, to, L, review); return 'holds' } catch (e) { problems++; return `FAILS: ${e.message}` } })()
  lines.push(`${control === 'holds' ? 'PASS' : 'FAIL'}  control: the unedited rows pass every check (${control})`)
  for (const [name, edit, fragment] of CASES) {
    const d = clone()
    let applied
    try { applied = edit(d) } catch (e) { applied = false }
    if (!applied) { problems++; lines.push(`BROKEN      ${name}: the edit found nothing to change (no such row in the saved data)`); continue }
    if (JSON.stringify(d) === JSON.stringify(data)) { problems++; lines.push(`BROKEN      ${name}: the edit left the rows unchanged`); continue }
    try { analyze(d, from, to, L, review); problems++; lines.push(`NOT CAUGHT  ${name}  (every check passed on the doctored rows)`) }
    catch (e) {
      if (e.message.includes(fragment)) { caught++; lines.push(`CAUGHT      ${name}\n              ${e.message.slice(0, 210)}`) }
      else { problems++; lines.push(`WRONG CAUSE ${name}\n              ${e.message.slice(0, 210)}\n              wanted a message containing: ${fragment}`) }
    }
  }
  // the green control is a function of the derived days, so it is doctored there: 2026-11-08 made to rest on the Bank row alone
  try {
    const res = analyze(clone(), from, to, L, review)
    const days = res.days.map(d => (d.key === CONTROL_GREEN.date ? { ...d, soleCovered: BANK } : d))
    checkControls(days, L)
    problems++; lines.push('NOT CAUGHT  the green-day control: 2026-11-08 made to rest on the Bank row alone')
  } catch (e) {
    if (e.message.includes('control: 2026-11-08')) { caught++; lines.push(`CAUGHT      the green-day control: 2026-11-08 made to rest on the Bank row alone\n              ${e.message.slice(0, 210)}`) }
    else { problems++; lines.push(`WRONG CAUSE the green-day control\n              ${e.message.slice(0, 210)}`) }
  }
  // the quotes: the evidence document doctored, each copy run through `checkQuotes`
  const evidence = readFileSync(HERE(EVIDENCE_DOC), 'utf8')
  const qControl = (() => { try { return `holds, decode count ${checkQuotes(evidence)}` } catch (e) { problems++; return `FAILS: ${e.message}` } })()
  lines.push(`${qControl.startsWith('holds') ? 'PASS' : 'FAIL'}  control: the unedited evidence document passes checkQuotes (${qControl})`)
  const QUOTE_CASES = [
    ['the cited FAIL line says 485 where the document says 484', s => s.replaceAll('484-entry table', '485-entry table'), 'red verify run\'s FAIL block'],
    ['the FAIL block sits under another run id', s => s.replace(`and verify's own, from run ${RED_RUN}:`, 'and verify\'s own, from run 1:'), 'red verify run\'s FAIL block'],
    ['the verify run\'s FAIL block is gone but the live-check copy of the same line remains', s => s.replace(RED_BLOCK, 'removed\n'), 'red verify run\'s FAIL block'],
    ['the last green run\'s id is off by one', s => s.replace(GREEN_RUN.id, '42507928170'), 'last green verify run\'s sentence'],
    ['the line naming the live run is gone', s => s.replace(LIVE_MARKER, '- Run 0, workflow verify'), 'the line naming run'],
    ['the decode-status line is gone', s => s.replace(DECODE_RE, 'decode-status: (gone)'), 'no decode-status line after'],
  ]
  for (const [name, edit, fragment] of QUOTE_CASES) {
    const edited = edit(evidence)
    if (edited === evidence) { problems++; lines.push(`BROKEN      ${name}: the edit left the document unchanged`); continue }
    try { checkQuotes(edited); problems++; lines.push(`NOT CAUGHT  ${name}  (checkQuotes passed on the doctored document)`) }
    catch (e) {
      if (e.message.includes(fragment)) { caught++; lines.push(`CAUGHT      ${name}\n              ${e.message.slice(0, 210)}`) }
      else { problems++; lines.push(`WRONG CAUSE ${name}\n              ${e.message.slice(0, 210)}\n              wanted a message containing: ${fragment}`) }
    }
  }
  const total = CASES.length + 1 + QUOTE_CASES.length
  lines.push('')
  lines.push(`${caught} of ${total} cases caught; control ${control === 'holds' ? 'holds' : 'FAILS'}; ${problems} problem(s)`)
  lines.push(`coverage: ${total} doctored inputs: ${CASES.length} copies of the saved rows (each run through \`analyze\`, which carries every check that decides whether a record may be written), the derived green-day control (1), and ${QUOTE_CASES.length} copies of outbox/venue-us-bank-stadium-2026-11-09.md (each run through \`checkQuotes\`).`)
  lines.push('NOT exercised here: the statement\'s own CASE logic (it is exercised only by the two real-day controls on real data); the arena extraction\'s two-text agreement (it would need a doctored build); the')
  lines.push('"They differ" branch of control 3 (it prints rather than refuses); a day with no games in the archive (it is listed in the verdict table, not refused); the date-range helper at a month boundary beyond the window')
  lines.push('used. Those checks exist and have not been made to fail.')
  return { text: lines.join('\n') + '\n', ok: problems === 0 && caught === total }
}

// ---------- main ----------
const [mode, ...args] = process.argv.slice(2)
if (mode === 'sql') {
  const [from, to] = args
  must(from && to, 'usage: sql <from> <to>')
  const sql = buildSql(from, to, lists())
  process.stdout.write(sql + '\n')
  console.error(`sql: ${Buffer.byteLength(sql)} bytes, sha256 ${createHash('sha256').update(sql).digest('hex')}`)
} else if (mode === 'report' || mode === 'selftest') {
  const [rowsFile, from, to] = args
  must(rowsFile && from && to, `usage: ${mode} <rows.json> <from> <to>`)
  const data = JSON.parse(readFileSync(rowsFile, 'utf8'))
  const L = lists()
  const review = JSON.parse(readFileSync(HERE('./venue-source-results-latest.json'), 'utf8')).review.map(x => x.name)
  if (mode === 'selftest') {
    const t = selftest(data, from, to, L, review)
    process.stdout.write(t.text)
    process.exitCode = t.ok ? 0 : 1
  } else {
    const res = analyze(data, from, to, L, review)
    const decodeCount = checkQuotes(readFileSync(HERE(EVIDENCE_DOC), 'utf8'))
    process.stdout.write(render(res, from, to, L, decodeCount, review))
  }
} else {
  console.error('usage: node outbox/venue-red-days-2026-11-09.mjs sql <from> <to> | report <rows.json> <from> <to> | selftest <rows.json> <from> <to>')
  process.exitCode = 2
}
