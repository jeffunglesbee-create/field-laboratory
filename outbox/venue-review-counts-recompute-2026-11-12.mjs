#!/usr/bin/env node
// A second path to the figures in outbox/venue-review-counts-2026-11-12.md (Task 4, Step 1).
//
//   node outbox/venue-review-counts-recompute-2026-11-12.mjs <record.md> <rows.json>
//
// The record is written by outbox/venue-review-counts-2026-11-12.mjs. This script does not import it. It runs that
// script's `sql` mode once, only to get the statement's text, and checks that text against the hash the rows file
// records; the review names are then read out of the text with this script's own pattern. The counts come from the rows
// file, the table rows from src/Venues.fs and the hold reasons from the results file. Every total and every table row is
// computed again here with its own loops, then the record's text is read and compared. It refuses at the first figure
// that differs, and prints how many it compared in each part.
//
// What it does not do: re-run the statement against the archive (the rows file is what that run returned), or say
// whether the rows file is the connector's output (outbox/venue-review-counts-2026-11-12.mjs checks that the rows are
// consistent with the database's own sums; this script only checks the record against them).
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [recordPath, rowsPath] = process.argv.slice(2)
if (!recordPath || !rowsPath) { console.error('usage: node outbox/venue-review-counts-recompute-2026-11-12.mjs <record.md> <rows.json>'); process.exit(2) }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let compared = 0, part = 'start'
const by = new Map()
const fail = msg => { console.error(`refused: ${msg}`); process.exit(1) }
const same = (what, got, want) => { compared++; by.set(part, (by.get(part) || 0) + 1); if (String(got) !== String(want)) fail(`${what}: recomputed ${want}, the record says ${got}`) }

const rowsFile = JSON.parse(fs.readFileSync(rowsPath, 'utf8'))
const md = fs.readFileSync(recordPath, 'utf8')

// 1. The names, from the statement's text.
const stmt = execFileSync('node', [path.join(ROOT, 'outbox/venue-review-counts-2026-11-12.mjs'), 'sql', rowsFile.from, rowsFile.to], { encoding: 'utf8' }).replace(/\n$/, '')
const hash = createHash('sha256').update(stmt).digest('hex')
if (hash !== rowsFile.statementSha256) fail(`the statement printed now hashes to ${hash}, the rows file records ${rowsFile.statementSha256}`)
const pairs = [...stmt.matchAll(/^\((\d+), '((?:[^']|'')*)'\),?$/gm)].map(m => [Number(m[1]), m[2].replace(/''/g, "'")])
if (pairs.length !== 75 || pairs.some(([i], k) => i !== k + 1)) fail(`the statement embeds ${pairs.length} names, not 75 numbered 1..75`)
const nameOf = new Map(pairs)

// 2. The counts, per name, from the rows file.
const venue = new Map()
for (const r of rowsFile.rows) if (r[0] === 'venue') venue.set(nameOf.get(r[1]), { games: r[2], days: r[4], first: r[7], last: r[8] })
if (venue.size !== 75) fail(`the rows file has ${venue.size} venue rows for 75 names`)

// 3. Which names have a table row; why each is held.
const fsSrc = fs.readFileSync(path.join(ROOT, 'src/Venues.fs'), 'utf8')
const tableRows = new Set([...fsSrc.matchAll(/^\s*at "((?:[^"\\]|\\.)*)"/gm)].map(m => m[1].replace(/\\"/g, '"')))
const results = JSON.parse(fs.readFileSync(path.join(ROOT, 'outbox/venue-source-results-latest.json'), 'utf8'))
const why = new Map(results.review.map(r => [r.name, r.why]))
for (const n of venue.keys()) if (!why.has(n)) fail(`${n} is in the statement but not on the results file's review list`)
const unc = [...venue.keys()].filter(n => !tableRows.has(n)), cov = [...venue.keys()].filter(n => tableRows.has(n))
const G = unc.reduce((a, n) => a + venue.get(n).games, 0), D = unc.reduce((a, n) => a + venue.get(n).days, 0)
const win = rowsFile.rows.find(r => r[0] === 'win')

// 4. The record's headline.
part = 'headline'
same('names with no row', (md.match(/\*\*Checked 75 of 75 review names\*\* \((\d+) with no table row, (\d+) with one\)/) || [])[1], unc.length)
same('names with a row', (md.match(/\*\*Checked 75 of 75 review names\*\* \((\d+) with no table row, (\d+) with one\)/) || [])[2], cov.length)
const head = md.match(/(\d+) calendar days, (\d+) with games, (\d+) games in all\. The (\d+) names with no row carry \*\*(\d+) games on (\d+) venue-days\*\*.*?, (\d+\.\d)% of the window's games/)
if (!head) fail('the headline sentence is not where it was')
same('calendar days', head[1], Math.round((Date.parse(rowsFile.to) - Date.parse(rowsFile.from)) / 86400000) + 1); same('names in the sentence', head[4], unc.length); same('games in the window', head[3], win[2]); same('days with games', head[2], win[4]); same('games at the 71', head[5], G); same('venue-days at the 71', head[6], D)
same('share of the window', head[7], (100 * G / win[2]).toFixed(1))

// 5. The bands.
part = 'bands'
const BANDS = [['1 day', 1, 1], ['2 to 4 days', 2, 4], ['5 to 9 days', 5, 9], ['10 to 19 days', 10, 19], ['20 or more days', 20, 1e9]]
for (const [label, lo, hi] of BANDS) {
  const b = unc.filter(n => venue.get(n).days >= lo && venue.get(n).days <= hi), g = b.reduce((a, n) => a + venue.get(n).games, 0)
  const line = md.split('\n').find(l => l.startsWith(`| ${label} |`))
  if (!line) fail(`no band row for "${label}"`)
  const c = line.split('|').map(s => s.trim())
  same(`${label}: names`, c[2], b.length); same(`${label}: games`, c[3], g); same(`${label}: share`, c[4], (100 * g / G).toFixed(1) + '%')
}

// 6. The reasons.
part = 'reasons'
const kind = r => /^roof:/.test(r) ? 'roof not settled (position agreed)' : /^ambiguous name/.test(r) ? 'ambiguous name' : /^no source answered/.test(r) ? 'no source answered with a point' : /^no two independent families agree/.test(r) ? 'no two independent families agree on the position' : fail(`a hold reason this script does not know: ${r}`)
const groups = new Map()
for (const n of unc) { const k = kind(why.get(n)); const g = groups.get(k) || { names: 0, games: 0, days: 0 }; g.names++; g.games += venue.get(n).games; g.days += venue.get(n).days; groups.set(k, g) }
for (const [k, g] of groups) {
  const line = md.split('\n').find(l => l.startsWith(`| ${k} |`))
  if (!line) fail(`no reason row for "${k}"`)
  const c = line.split('|').map(s => s.trim())
  same(`${k}: names`, c[2], g.names); same(`${k}: games`, c[3], g.games); same(`${k}: venue-days`, c[4], g.days)
}

// 7. The table of the 71, and the 4 with a row.
part = 'table of the 71'
const section = (from, to) => { const a = md.indexOf(from), b = md.indexOf(to, a); if (a < 0 || b < 0) fail(`the section "${from}" is not where it was`); return md.slice(a, b).split('\n').filter(l => /^\| (\d+|[^|]+) \|/.test(l) && !/^\| (#|venue|---)/.test(l) && !l.startsWith('|---')) }
const t71 = section('## The 71, most days first', '## The 4 review names')
same('rows in the table of the 71', t71.length, unc.length)
for (const l of t71) {
  const c = l.split('|').map(s => s.trim())
  const n = c[2], v = venue.get(n)
  if (!v || !unc.includes(n)) fail(`the table of the 71 lists "${n}", which is not a review name without a row`)
  same(`${n}: games`, c[5], v.games); same(`${n}: days`, c[6], v.days); same(`${n}: first`, c[7], v.first); same(`${n}: last`, c[8], v.last)
}
same('distinct names in the table of the 71', new Set(t71.map(l => l.split('|')[2].trim())).size, unc.length)
part = 'table of the 4'
const t4 = section('## The 4 review names', '## Controls')
same('rows in the table of the 4', t4.length, cov.length)
for (const l of t4) {
  const c = l.split('|').map(s => s.trim())
  const v = venue.get(c[1])
  if (!v || !cov.includes(c[1])) fail(`the table of the 4 lists "${c[1]}", which is not a review name with a row`)
  same(`${c[1]}: games`, c[4], v.games); same(`${c[1]}: days`, c[5], v.days); same(`${c[1]}: first`, c[6], v.first); same(`${c[1]}: last`, c[7], v.last)
}

const ge5 = unc.filter(n => venue.get(n).days >= 5)
console.log(`recomputed from the statement's ${pairs.length} names, the ${rowsFile.rows.length} saved rows, src/Venues.fs and the results file; compared ${compared} figures with the record: all equal (${[...by].map(([k, v]) => `${k} ${v}`).join(', ')}).`)
console.log(`${unc.length} names with no row: ${G} games on ${D} venue-days of ${win[2]} games on ${win[4]} days (${(100 * G / win[2]).toFixed(1)}%); ${cov.length} with a row.`)
console.log(`${ge5.length} names on 5 or more days carry ${ge5.reduce((a, n) => a + venue.get(n).games, 0)} of the ${G} games (${(100 * ge5.reduce((a, n) => a + venue.get(n).games, 0) / G).toFixed(1)}%).`)
