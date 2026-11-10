// The candidates list for the sourcing run of 2026-11-10: the 442 names of 2026-10-22, entry for entry, plus the grounds the archive has gained since
// (docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 3: "Rebuild data/venue-source-candidates.json by the procedure in outbox/cc-session-2026-10-22-outdoor-venue-sourcing.md").
// Run from the repository root:
//   node outbox/venue-candidates-extend-2026-11-10.mjs              the check: the list in the working tree is byte for byte the regeneration below; exits 1 unless it is
//   node outbox/venue-candidates-extend-2026-11-10.mjs --write      write the regeneration to data/venue-source-candidates.json (no trailing newline: the list's own byte format)
//   node outbox/venue-candidates-extend-2026-11-10.mjs --join-sql   print the SQL that checks the transcribed rows against D1; the connector's exact_matches must equal mine_rows
//   node outbox/venue-candidates-extend-2026-11-10.mjs --self-test  the regeneration and the check on synthetic lists, each doctored case caught by the check that names it
//
// WHY THE OLD NAMES STAY, instead of the procedure being run again from nothing. The list is the input of `scripts/venue-source.mjs --source`, which writes
// outbox/venue-source-results-latest.json with exactly the rows of the list it is given, and `scripts/venue-sourced-check.mjs --write` writes the table's generated block from that
// file's accepted rows. A list of only the new grounds would replace the 375 rows of the block by whatever it accepted. And the procedure's own filter, "minus names already in the
// table", applied to the 442 today would drop the 375 that ARE the block. So the list is the old one, unchanged, with the new names sorted in; the filter is applied to the new names only.
//
// WHAT THE INPUTS ARE, all fixed, so the check says the same thing after the table has taken the new rows:
//   BASE:LIST   the list of 2026-10-22 as committed at BASE, 442 entries, 62,081 bytes
//   BASE:TABLE  the table at BASE, whose names a new ground must not already be (a name in both would be two rows for one ground)
//   ROWS        the rows the archive gave on 2026-11-10 (the SQL is in the file): the venues of the list's window (date >= 2026-07-01, sport not NBA or NHL) with no row created before
//               2026-10-22. That is the shortcut; it was tested against the whole window the same day (outbox/venue-candidates-completeness-2026-11-10.sql): every venue of the window
//               that is not on the old list, not a table row and not a recorded arena is one of these rows or the placeholder "TBC".

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'
import { readTable, tableRowCount } from '../scripts/venue-source.mjs'

export const BASE = 'b1e02dabda288d11cfa7cb0d0e05cf1fe2a97edd'
export const LIST = 'data/venue-source-candidates.json'
export const TABLE = 'src/Venues.fs'
export const ROWS = 'outbox/venue-candidates-gained-2026-11-10.json'
export const DATE = '2026-11-10'

/** What is appended to the list's `source` line, said once. The number is the one added, so it cannot go stale. */
export const suffixFor = n =>
  `; extended ${DATE} with ${n} venues the archive gained since (${ROWS}: same window and sports, no row created before 2026-10-22; not a table row at ${BASE.slice(0, 7)}; not already listed)`

/** The list's own byte format, measured on the 442 of 2026-10-22: JSON.stringify with one space of indent and NO trailing newline. */
export const emit = o => JSON.stringify(o, null, 1)

const byVenue = (a, b) => (a.venue < b.venue ? -1 : a.venue > b.venue ? 1 : 0)
const sortedByVenue = list => list.every((c, i) => i === 0 || list[i - 1].venue < c.venue)

/**
 * The regeneration: the base list, entry for entry, with the rows' venues added in order.
 * A row whose venue is already listed is dropped (the old entry stays as it was), then a row whose venue is a table row.
 * It throws where the base is not what it was measured to be, or a row would need a convention nobody has recorded.
 */
export const extend = (baseText, tableNames, rows) => {
  const base = JSON.parse(baseText)
  if (emit(base) !== baseText) throw new Error('the base list is not in the byte format this script writes (JSON.stringify, one space of indent, no trailing newline)')
  if (!sortedByVenue(base.candidates)) throw new Error('the base list is not sorted by venue, so sorting the extension would move entries that are meant to stay where they are')
  const listed = new Set(base.candidates.map(c => c.venue))
  const inTable = new Set(tableNames)
  const seen = new Set()
  const added = [], dropped = []
  for (const r of rows) {
    if (seen.has(r.venue)) throw new Error(`the rows name ${JSON.stringify(r.venue)} twice`)
    seen.add(r.venue)
    if (listed.has(r.venue)) { dropped.push({ venue: r.venue, why: 'already a candidate' }); continue }
    if (inTable.has(r.venue)) { dropped.push({ venue: r.venue, why: 'already a table row' }); continue }
    if (/,/.test(r.homes)) throw new Error(`${JSON.stringify(r.venue)} has more than one home (${JSON.stringify(r.homes)}); the list has no entry like that and no recorded convention for one`)
    added.push({ venue: r.venue, sports: r.sports, home: r.homes, games: r.games, last: r.last })
  }
  const candidates = [...base.candidates, ...added].sort(byVenue)
  const text = emit({ source: base.source + suffixFor(added.length), count: candidates.length, candidates })
  return { text, added: added.sort(byVenue), dropped, baseCount: base.candidates.length, total: candidates.length }
}

const firstDifference = (a, b) => {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const ctx = s => JSON.stringify(s.slice(Math.max(0, i - 30), i + 30))
  return `lengths ${a.length} and ${b.length}; first difference at character ${i}: ${ctx(a)} against ${ctx(b)}`
}

/** Every check of the list in `actualText` against the regeneration, as named results; a check that cannot be made says so by failing, never by being absent. */
export const verify = (baseText, tableNames, rows, actualText) => {
  const want = extend(baseText, tableNames, rows)
  const base = JSON.parse(baseText)
  const out = []
  const add = (name, pass, detail) => out.push({ name, pass: Boolean(pass), detail })
  let actual = null, why = null
  try { actual = JSON.parse(actualText) } catch (e) { why = e.message }
  add('the list parses as JSON', actual !== null, why)
  if (actual === null || !Array.isArray(actual.candidates)) { if (actual !== null) add('the list has a candidates array', false, 'no array'); return out }
  const have = new Map(actual.candidates.map(c => [c.venue, c]))
  const changed = base.candidates.filter(b => !have.has(b.venue) || JSON.stringify(have.get(b.venue)) !== JSON.stringify(b)).map(b => b.venue)
  add(`all ${base.candidates.length} base entries are in the list, each unchanged (key order, types and values)`, changed.length === 0, `${changed.length} missing or changed: ${changed.slice(0, 5).join('; ')}`)
  const baseNames = new Set(base.candidates.map(c => c.venue))
  const beyond = actual.candidates.filter(c => !baseNames.has(c.venue))
  add(`the entries beyond the base are exactly the ${want.added.length} added, as the rows give them`, JSON.stringify(beyond) === JSON.stringify(want.added), `found ${beyond.length}: ${beyond.map(c => c.venue).slice(0, 5).join('; ')}`)
  add('the entries are sorted by venue', sortedByVenue(actual.candidates), 'an entry is out of order or a venue is listed twice')
  add(`count is the number of entries (${actual.candidates.length})`, actual.count === actual.candidates.length, `count says ${actual.count}`)
  add(`count is the base's ${want.baseCount} plus the ${want.added.length} added`, actual.count === want.total, `count says ${actual.count}, wanted ${want.total}`)
  add('source is the base source and the suffix, once', actual.source === base.source + suffixFor(want.added.length), `source is ${JSON.stringify(actual.source).slice(-120)}`)
  add('there is no trailing newline', !actualText.endsWith('\n'), 'the file ends with a newline; the 442 of 2026-10-22 did not')
  add('the file is byte for byte the regeneration', actualText === want.text, firstDifference(actualText, want.text))
  return out
}

/** The SQL that sets the transcribed rows beside what D1 says now, for the connector. Built from the rows file, so no one retypes a digit (the first hand copy of 2026-11-10 had one wrong). */
export const joinSql = file => {
  const q = s => `'${String(s).replace(/'/g, "''")}'`
  const body = file.sql.replace(/ ORDER BY venue$/, '')
  if (body === file.sql) throw new Error('the rows file\'s SQL does not end in " ORDER BY venue", so it cannot be used as a subquery')
  const mine = file.rows.map(r => `(${[q(r.venue), Number(r.games), q(r.first_date), q(r.last), q(r.first_created), q(r.sports), q(r.homes)].join(',')})`).join(',')
  const same = 'd1.venue = mine.venue AND d1.games = mine.games AND d1.first_date = mine.first_date AND d1.last = mine.last AND d1.first_created = mine.first_created AND d1.sports = mine.sports AND d1.homes = mine.homes'
  return `WITH mine(venue,games,first_date,last,first_created,sports,homes) AS (VALUES ${mine}), d1 AS (${body}) SELECT (SELECT COUNT(*) FROM mine) AS mine_rows, (SELECT COUNT(*) FROM d1) AS d1_rows, ` +
    `(SELECT COUNT(*) FROM mine JOIN d1 ON ${same}) AS exact_matches, (SELECT group_concat(mine.venue, ' | ') FROM mine LEFT JOIN d1 ON ${same} WHERE d1.venue IS NULL) AS unmatched`
}

const gitShow = path => execFileSync('git', ['show', `${BASE}:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

/** The three fixed inputs, with the table's denominator: names read of rows counted, so a reader that skips a row says so. */
const inputs = () => {
  const baseText = gitShow(LIST)
  const tableText = gitShow(TABLE)
  const tableNames = readTable(tableText).map(r => r.name)
  return { baseText, tableNames, tableCounted: tableRowCount(tableText), file: JSON.parse(readFileSync(ROWS, 'utf8')) }
}

const summary = (i, want) => [
  `BASE ${BASE.slice(0, 7)}: ${want.baseCount} entries on the list; the table's names read ${i.tableNames.length} of ${i.tableCounted} rows counted`,
  `ROWS ${ROWS}: ${i.file.rows.length} rows, queried ${i.file.queried}`,
  `ADDED ${want.added.length}: ${want.added.map(a => a.venue).join('; ')}`,
  `DROPPED ${want.dropped.length}: ${want.dropped.map(d => `${d.venue} (${d.why})`).join('; ') || 'none'}`,
  `TOTAL ${want.total} = ${want.baseCount} + ${want.added.length}`,
].join('\n')

const selfTest = () => {
  const { check, summarize } = createChecks()
  const mk = (venue, extra = {}) => ({ venue, sports: 'EPL', home: `Home of ${venue}`, games: 2, last: '2026-10-06', ...extra })
  const baseObj = { source: 'archive, queried 2026-10-22', count: 3, candidates: [mk('Alpha Park'), mk('Gamma Ground', { sports: 'EFL Cup,EFL Trophy' }), mk('Şükrü Saracoğlu Stadium')] }
  const baseText = emit(baseObj)
  const row = (venue, o = {}) => ({ venue, games: 1, first_date: '2026-11-07', last: '2026-11-07', first_created: '2026-11-07 10:00:44', sports: 'FA Cup', homes: `Club of ${venue}`, ...o })
  const rows = [row('Beta Road'), row('Gamma Ground'), row('Delta Field'), row('Epsilon Park', { homes: "Kid'minster" })]
  const tableNames = ['Delta Field', 'Some Hand Row']
  const got = extend(baseText, tableNames, rows)
  const out = JSON.parse(got.text)
  const refuses = (name, f, re) => { let msg = null; try { f() } catch (e) { msg = e.message } check(name, msg !== null && re.test(msg), msg ?? 'did not throw') }

  check('a new ground is added and sorted into place between the old ones', out.candidates.map(c => c.venue).join('|') === 'Alpha Park|Beta Road|Epsilon Park|Gamma Ground|Şükrü Saracoğlu Stadium', out.candidates.map(c => c.venue).join('|'))
  check('...with the five keys in the list\'s order and the types the list has', (c => Object.keys(c).join() === 'venue,sports,home,games,last' && typeof c.games === 'number' && typeof c.home === 'string')(out.candidates.find(c => c.venue === 'Beta Road')))
  check('...the rows\' homes become `home`, and an apostrophe in a name survives', out.candidates.find(c => c.venue === 'Epsilon Park').home === "Kid'minster" && out.candidates.find(c => c.venue === 'Beta Road').home === 'Club of Beta Road')
  check('a ground already on the list is dropped and its old entry stays exactly as it was', got.dropped.some(d => d.venue === 'Gamma Ground' && d.why === 'already a candidate') && JSON.stringify(out.candidates.find(c => c.venue === 'Gamma Ground')) === JSON.stringify(baseObj.candidates[1]), JSON.stringify(got.dropped))
  check('a ground that is a table row is dropped, and said to be', got.dropped.some(d => d.venue === 'Delta Field' && d.why === 'already a table row') && !out.candidates.some(c => c.venue === 'Delta Field'), JSON.stringify(got.dropped))
  check('added are exactly the two that were neither listed nor a table row, and total is 3 + 2', got.added.map(a => a.venue).join('|') === 'Beta Road|Epsilon Park' && got.total === 5 && got.baseCount === 3, JSON.stringify([got.added, got.total]))
  check('count is the number of entries and source is the base source and the suffix, once', out.count === 5 && out.source === baseObj.source + suffixFor(2) && out.source.split('; extended').length === 2, out.source)
  check('the text has no trailing newline and is JSON.stringify with one space of indent', !got.text.endsWith('\n') && got.text === JSON.stringify(out, null, 1))
  check('the suffix carries the number added, so a different set says a different number', suffixFor(17).includes(' with 17 venues ') && suffixFor(2).includes(' with 2 venues '))
  refuses('a row with two homes is refused, with its name', () => extend(baseText, tableNames, [row('Beta Road', { homes: 'One FC,Two FC' })]), /"Beta Road" has more than one home/)
  refuses('the same venue twice in the rows is refused', () => extend(baseText, tableNames, [row('Beta Road'), row('Beta Road')]), /name "Beta Road" twice/)
  refuses('a base that is not in the byte format is refused', () => extend(baseText + '\n', tableNames, rows), /byte format/)
  refuses('a base that is not sorted is refused', () => extend(emit({ ...baseObj, candidates: [baseObj.candidates[1], baseObj.candidates[0], baseObj.candidates[2]] }), tableNames, rows), /not sorted by venue/)
  check('an empty set of rows changes nothing but the suffix and keeps the base entries', (e => e.added.length === 0 && JSON.parse(e.text).candidates.length === 3 && JSON.parse(e.text).source === baseObj.source + suffixFor(0))(extend(baseText, tableNames, [])))

  // The check of a list, against the regeneration. Each doctored list must fail the check that NAMES the damage; the clean one passes all.
  const run = text => verify(baseText, tableNames, rows, text)
  const failed = results => results.filter(r => !r.pass).map(r => r.name)
  const names = { base: /base entries are in the list, each unchanged/, beyond: /entries beyond the base are exactly/, sorted: /sorted by venue/, count: /count is the number of entries/, total: /count is the base's/, source: /source is the base source/, newline: /no trailing newline/, bytes: /byte for byte/, parse: /parses as JSON/ }
  const catches = (name, text, ...keys) => { const f = failed(run(text)); check(name, keys.every(k => f.some(n => names[k].test(n))), `failed: ${f.join(' | ') || 'nothing'}`) }
  const doctor = f => { const o = JSON.parse(got.text); f(o); return emit(o) }
  check('the clean regeneration passes every check, and there are nine of them', failed(run(got.text)).length === 0 && run(got.text).length === 9, failed(run(got.text)).join(' | '))
  catches('AN OLD ENTRY WITH A CHANGED COUNT IS CAUGHT BY NAME', doctor(o => { o.candidates.find(c => c.venue === 'Alpha Park').games = 3 }), 'base', 'bytes')
  catches('AN OLD ENTRY WITH ITS KEYS REORDERED IS CAUGHT', doctor(o => { const c = o.candidates.find(x => x.venue === 'Alpha Park'); const { venue, ...rest } = c; Object.keys(c).forEach(k => delete c[k]); Object.assign(c, rest, { venue }) }), 'base')
  catches('AN OLD ENTRY REMOVED IS CAUGHT', doctor(o => { o.candidates.splice(0, 1); o.count -= 1 }), 'base', 'total')
  catches('A NEW ENTRY MISSING IS CAUGHT', doctor(o => { o.candidates = o.candidates.filter(c => c.venue !== 'Beta Road'); o.count -= 1 }), 'beyond', 'total')
  catches('AN ENTRY THE ROWS DO NOT GIVE IS CAUGHT', doctor(o => { o.candidates.push(mk('Zeta Ground')); o.count += 1 }), 'beyond', 'total')
  catches('A NEW ENTRY WITH A WRONG HOME IS CAUGHT', doctor(o => { o.candidates.find(c => c.venue === 'Beta Road').home = 'Somebody Else' }), 'beyond')
  catches('A LIST OUT OF ORDER IS CAUGHT', doctor(o => { o.candidates.reverse() }), 'sorted')
  catches('A COUNT THAT DISAGREES WITH THE ENTRIES IS CAUGHT', doctor(o => { o.count = 99 }), 'count', 'total')
  catches('A SOURCE WITHOUT THE SUFFIX IS CAUGHT', doctor(o => { o.source = baseObj.source }), 'source')
  catches('A SOURCE WITH THE SUFFIX TWICE IS CAUGHT', doctor(o => { o.source += suffixFor(2) }), 'source')
  catches('A TRAILING NEWLINE IS CAUGHT', got.text + '\n', 'newline', 'bytes')
  check('A DIFFERENT INDENT ALONE PASSES EVERY STRUCTURAL CHECK AND FAILS ONLY THE BYTE COMPARISON, which is what makes the byte comparison the arbiter',
    (f => f.length === 1 && names.bytes.test(f[0]))(failed(run(JSON.stringify(JSON.parse(got.text), null, 2)))), failed(run(JSON.stringify(JSON.parse(got.text), null, 2))).join(' | '))
  check('A FILE THAT IS NOT JSON IS CAUGHT AND NOTHING ELSE IS CLAIMED', (r => r.length === 1 && !r[0].pass && names.parse.test(r[0].name))(run('{ not json')), JSON.stringify(run('{ not json')))

  // The SQL that checks the transcription.
  const file = { sql: "SELECT venue, COUNT(*) AS games FROM t WHERE x = 'y' GROUP BY venue ORDER BY venue", rows: [row("Kid'minster Ground", { homes: "Kid'minster", games: 2 }), row('Plain Park')] }
  const sql = joinSql(file)
  check('the join SQL has one tuple per row, doubles an apostrophe, and carries the rows\' own SQL once without its ORDER BY',
    (sql.match(/\('(?:Kid''minster Ground|Plain Park)',\d,/g) ?? []).length === 2 && sql.includes("'Kid''minster'") && sql.includes("d1 AS (SELECT venue, COUNT(*) AS games FROM t WHERE x = 'y' GROUP BY venue)") && !/ORDER BY/.test(sql), sql.slice(0, 400))
  check('...and compares every column the rows carry, not only the name', ['games', 'first_date', 'last', 'first_created', 'sports', 'homes'].every(c => sql.includes(`d1.${c} = mine.${c}`)))
  refuses('SQL that does not end in ORDER BY venue is refused rather than wrapped wrongly', () => joinSql({ sql: 'SELECT 1', rows: [] }), /does not end in/)
  finish(summarize())
}

if (isMain(import.meta.url)) {
  const arg = process.argv[2]
  if (arg === '--self-test') selfTest()
  else if (arg === '--join-sql') console.log(joinSql(inputs().file))
  else if (arg === undefined || arg === '--write') {
    const i = inputs()
    const { check, summarize } = createChecks()
    check(`the table's names are read for every row counted (${i.tableNames.length} of ${i.tableCounted})`, i.tableNames.length === i.tableCounted, 'readTable skipped a row')
    const want = extend(i.baseText, i.tableNames, i.file.rows)
    console.log(summary(i, want))
    if (arg === '--write') { writeFileSync(LIST, want.text); console.log(`\nwrote ${LIST}: ${want.total} entries, ${Buffer.byteLength(want.text)} bytes`) }
    for (const r of verify(i.baseText, i.tableNames, i.file.rows, readFileSync(LIST, 'utf8'))) check(r.name, r.pass, r.detail)
    console.log()
    finish(summarize())
  } else { console.error('usage: node outbox/venue-candidates-extend-2026-11-10.mjs [--write | --join-sql | --self-test]'); process.exitCode = 2 }
}
