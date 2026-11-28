#!/usr/bin/env node
// Rule 90 (MUTATE-FIRST-A) for scripts/uefa-replication-data.mjs: its --self-test is shown red under each deliberate break of the collector before it is trusted. Every mutation puts one defect into a COPY of the script in a temp directory (the
// real file is never touched). A mutation counts as CAUGHT only when the self-test exits non-zero AND prints a FAIL line; a crash with no FAIL line is BROKE, a harness error and not a catch. An anchor that does not occur exactly once applies
// NOTHING and fails the harness by name; a mutant identical to its source is refused. The CONTROL (the unmutated copy) must pass first.
//
//   node scripts/mutate-uefa-replication-data.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const SRC = fs.readFileSync('scripts/uefa-replication-data.mjs', 'utf8')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uefa-repl-data-mut-'))
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130))

const M = (name, anchor, replacement) => ({ name, anchor, replacement })
const MUTANTS = [
  M('home and away taken from the order of the competitors array', "const homes = comp.competitors.filter(c => c?.homeAway === 'home'), aways = comp.competitors.filter(c => c?.homeAway === 'away')", 'const homes = [comp.competitors[0]], aways = [comp.competitors[1]]'),
  M('scheduled and postponed events are kept (completed filter dropped)', 'if (comp.status?.type?.completed !== true) { tally.nonCompleted++; continue }', ''),
  M('the winner flag reaches a row', "status: comp.status?.type?.name ?? null,\n    })", "status: comp.status?.type?.name ?? null,\n      winner: h.winner,\n    })"),
  M('the form string reaches a row', "status: comp.status?.type?.name ?? null,\n    })", "status: comp.status?.type?.name ?? null,\n      form: h.form,\n    })"),
  M('a missing score becomes 0', 'return SCORE_RE.test(t) ? Number(t) : null', 'return SCORE_RE.test(t) ? Number(t) : 0'),
  M('the last day of the window is not read', "t <= Date.parse(to + 'T00:00:00Z')", "t < Date.parse(to + 'T00:00:00Z')"),
  M('a 429 is retried like any other status', 'if (res.status === 403 || res.status === 429)', 'if (res.status === 403)'),
  M('a duplicate event is kept twice', 'if (seen.has(row.espn_event_id)) { duplicates++; continue }', 'if (false) { duplicates++; continue }'),
  M('a payload without events is read as an empty day', "if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.events)) return null", "if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.events)) return []"),
  M('a club is identified by its spelling, not its id', 'home: String(h.team.id),', 'home: String(h.team.shortDisplayName),'),
  M('an event with no team id is kept', ' || !idOk(h.team.id) || !idOk(a.team.id)', ''),
  M('an empty team id is kept as a club', 'idOk = v => v !== null && v !== undefined && String(v) !== \'\'', 'idOk = v => v !== null && v !== undefined'),
  M('an event with no event id is kept', 'if (!idOk(ev.id) || homes.length', 'if (homes.length'),
  M('a start time with no offset is read as a local time', '/(Z|[+-]\\d{2}:?\\d{2})$/.test(ev.date) ? Date.parse(ev.date)', 'true ? Date.parse(ev.date)'),
  M('a 500 is not retried', 'for (let attempt = 1; attempt <= 2; attempt++) {\n    try {\n      const res = await get(url)', 'for (let attempt = 2; attempt <= 2; attempt++) {\n    try {\n      const res = await get(url)'),
  M('the request date is not the day asked (one day early)', "const url = `${BASE}/${slug}/scoreboard?dates=${day.replaceAll('-', '')}`", "const url = `${BASE}/${slug}/scoreboard?dates=${day.replaceAll('-', '').slice(0, 7)}00`"),
  M('the leak scan finds nothing', 'export const leakedKeys = x => FORBIDDEN_KEYS.filter(k => allKeys(x).has(k))', 'export const leakedKeys = x => []'),
  M('the id drops the requested day', 'id: `${label}_${day}_e${ev.id}`,', 'id: `${label}_e${ev.id}`,'),
  M('a score is parsed leniently (2.5 is read as 2.5)', "return SCORE_RE.test(t) ? Number(t) : null", 'return Number.isFinite(Number(t)) && t !== \'\' ? Number(t) : null'),
  M('an event with two home competitors is read (first taken)', "if (!idOk(ev.id) || homes.length !== 1 || aways.length !== 1 ||", "if (!idOk(ev.id) || !h || !a ||"),
  M('a skipped completed event is not counted', "!idOk(a.team.id)) { tally.skipped++; continue }", "!idOk(a.team.id)) { continue }"),
  M('the status name is not counted', "tally.statusNames[name] = (tally.statusNames[name] ?? 0) + 1", ""),
  M('a day-after request is accepted (date check direction)', "(day !== utcDay && day !== dayBefore(utcDay))", "(day !== utcDay && day !== dayBefore(utcDay) && day !== new Date(Date.parse(utcDay + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10))"),
  M('the date check never fires', "(day !== utcDay && day !== dayBefore(utcDay))", "false"),
  M('an invalid score is not counted', "if (hs === null || as === null) tally.invalidScore++", ""),
  M('non-completed events are not counted', "if (comp.status?.type?.completed !== true) { tally.nonCompleted++; continue }", "if (comp.status?.type?.completed !== true) { continue }"),
  M('the status name is not a row field', "      status: comp.status?.type?.name ?? null,\n", ""),
  M('the FIELDS list lacks status', "'phase', 'status']", "'phase']"),
  M('the date check reads the first ten characters of the start text, not its UTC day', "const utcDay = Number.isFinite(startMs) ? new Date(startMs).toISOString().slice(0, 10) : null", "const utcDay = typeof ev.date === 'string' && /^\\d{4}-\\d{2}-\\d{2}/.test(ev.date) ? ev.date.slice(0, 10) : null"),
  M('a body without an events array is not read a second time', "if (attempt === 2) return { status: 200, payload: null, error: 'a body without an events array' }", "return { status: 200, payload: null, error: 'a body without an events array' }"),
  M('a non-JSON body stops at once (no second read)', "if (attempt === 2) return { status: 0, payload: null, error: String(e).slice(0, 120) }", "return { status: 0, payload: null, error: String(e).slice(0, 120) }"),
  M('the per-competition tally is not threaded into the bundle', "duplicateEventIds: duplicates, tallies },", "duplicateEventIds: duplicates, tallies: {} },"),
]

const run = (file) => new Promise((resolve) => {
  const p = spawn(process.execPath, [file, '--self-test'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
  const t = setTimeout(() => p.kill('SIGKILL'), 120000)
  p.on('close', code => { clearTimeout(t); resolve({ code, out }) })
})

const controlFile = path.join(dir, 'control.mjs')
fs.writeFileSync(controlFile, SRC)
const control = await run(controlFile)
if (control.code !== 0) { console.log('FAIL: the unmutated copy does not pass its own self-test; nothing was mutated.\n' + control.out.split('\n').slice(-6).join('\n')); process.exit(1) }
console.log('control: the unmutated copy passes its self-test\n')

let caught = 0, harnessErrors = 0
for (const [i, m] of MUTANTS.entries()) {
  const hits = SRC.split(m.anchor).length - 1
  if (hits !== 1) { console.log(`HARNESS ERROR  ${m.name}\n               anchor matched ${hits} times, expected 1: NOTHING MUTATED`); harnessErrors++; continue }
  if (m.anchor === m.replacement) { console.log(`HARNESS ERROR  ${m.name}\n               replacement equals the anchor`); harnessErrors++; continue }
  const f = path.join(dir, `m${i}.mjs`)
  fs.writeFileSync(f, SRC.replace(m.anchor, () => m.replacement))
  const r = await run(f)
  const fails = r.out.split('\n').filter(l => /^\s*FAIL\s/.test(l))
  const red = r.code !== 0 && fails.length > 0
  console.log(`${red ? 'CAUGHT    ' : r.code !== 0 ? 'BROKE     ' : 'NOT CAUGHT'} ${m.name}${red ? `\n            <- ${fails[0].trim().slice(0, 130)}` : r.code !== 0 ? `\n            ${r.out.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 130)}` : ''}`)
  if (red) caught++
}
console.log(`\n${caught} of ${MUTANTS.length} mutations caught${harnessErrors ? `, ${harnessErrors} harness errors` : ''}`)
process.exit(caught === MUTANTS.length && harnessErrors === 0 ? 0 : 1)
