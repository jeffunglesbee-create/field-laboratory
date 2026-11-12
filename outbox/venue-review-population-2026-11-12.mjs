#!/usr/bin/env node
// Which review names have no table row, commit by commit (Task 4, Step 1: why the population is 71 and not 66).
//
//   node outbox/venue-review-population-2026-11-12.mjs <commit> <commit> [<commit> ...]
//
// For each commit named on the command line, from git (not from the working tree):
//   - the `review` list of outbox/venue-source-results-latest.json at that commit,
//   - the rows of src/Venues.fs at that commit (`at "<name>" ...`, F# `\"` read as `"`),
//   - the review names with no row = review minus rows.
// Between each two consecutive commits it prints the names that entered or left the review list, the names that
// entered or left the "no row" set, and, for each name that left the "no row" set, whether it is a table row and in
// `accepted` of the later commit's results file.
//
// What it does not do: say why a name moved (a commit message says why; this reads membership). The commits are
// named by the caller, so the output says which commits were read; it does not know the history between them.
import { execFileSync } from 'node:child_process'

const commits = process.argv.slice(2)
if (commits.length < 2) { console.error('usage: node outbox/venue-review-population-2026-11-12.mjs <commit> <commit> [...]'); process.exit(2) }
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 })
const must = (ok, msg) => { if (!ok) { console.error('refused: ' + msg); process.exit(1) } }

function read(c) {
  const full = git('rev-parse', '--verify', c + '^{commit}').trim()
  const when = git('show', '-s', '--format=%cI', full).trim()
  const res = JSON.parse(git('show', `${full}:outbox/venue-source-results-latest.json`))
  const names = res.review.map(r => r.name)
  must(names.every(n => typeof n === 'string' && n.length > 0), `${c}: a review entry has no name`)
  must(new Set(names).size === names.length, `${c}: a name is on the review list twice`)
  const fs = git('show', `${full}:src/Venues.fs`)
  const lines = fs.split('\n').filter(l => /^\s*at "/.test(l))
  const rows = new Set()
  for (const l of lines) {
    const m = l.match(/^\s*at "((?:[^"\\]|\\.)*)"/)
    must(m, `${c}: a row line does not parse: ${l.slice(0, 80)}`)
    rows.add(m[1].replace(/\\"/g, '"'))
  }
  must(rows.size === lines.length, `${c}: a venue name is a row twice (${lines.length} row lines, ${rows.size} names)`)
  const accepted = new Set((res.accepted || []).map(r => r.name))
  const noRow = names.filter(n => !rows.has(n))
  return { c, full, when, run: res.run, runAt: res.at, names, rows, accepted, noRow, withRow: names.filter(n => rows.has(n)) }
}

const R = commits.map(read)
console.log('# Review names with no table row, by commit')
console.log('')
console.log(`Read from git: the \`review\` list of outbox/venue-source-results-latest.json and the \`at "<name>"\` rows of src/Venues.fs, at each of the ${R.length} commits named. Checked ${R.length} of ${R.length} commits named on the command line; the history between them is not read.`)
console.log('')
console.log('| commit | committed | results file: run, at | review names | rows in the table | review names with a row | review names with no row |')
console.log('|---|---|---|---|---|---|---|')
for (const r of R) console.log(`| \`${r.c}\` | ${r.when} | ${r.run}, ${r.runAt} | ${r.names.length} | ${r.rows.size} | ${r.withRow.length} | ${r.noRow.length} |`)
const list = a => a.length ? a.join('; ') : 'none'
for (let i = 1; i < R.length; i++) {
  const a = R[i - 1], b = R[i]
  const A = new Set(a.names), B = new Set(b.names), Au = new Set(a.noRow), Bu = new Set(b.noRow)
  const left = a.noRow.filter(n => !Bu.has(n)), entered = b.noRow.filter(n => !Au.has(n))
  console.log('')
  console.log(`## \`${a.c}\` to \`${b.c}\``)
  console.log('')
  console.log(`- Entered the review list (${b.names.filter(n => !A.has(n)).length}): ${list(b.names.filter(n => !A.has(n)))}`)
  console.log(`- Left the review list (${a.names.filter(n => !B.has(n)).length}): ${list(a.names.filter(n => !B.has(n)))}`)
  console.log(`- Left the no-row set (${left.length}): ${list(left.map(n => `${n} (a table row at \`${b.c}\`: ${b.rows.has(n) ? 'yes' : 'no'}; in \`accepted\` at \`${b.c}\`: ${b.accepted.has(n) ? 'yes' : 'no'})`))}`)
  console.log(`- Entered the no-row set (${entered.length}): ${list(entered)}`)
  console.log(`- No-row set: ${a.noRow.length}, less ${left.length}, plus ${entered.length}, is ${b.noRow.length} (read at \`${b.c}\`; this line restates the two above and checks nothing)`)
}
