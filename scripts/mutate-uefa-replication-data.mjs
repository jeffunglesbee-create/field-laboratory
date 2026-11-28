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
  M('home and away taken from the order of the competitors array', "const h = comp.competitors.find(c => c.homeAway === 'home'), a = comp.competitors.find(c => c.homeAway === 'away')", 'const h = comp.competitors[0], a = comp.competitors[1]'),
  M('scheduled and postponed events are kept (completed filter dropped)', 'if (comp.status?.type?.completed !== true) continue', ''),
  M('the winner flag reaches a row', "phase: ev.season?.slug ?? null,\n    })", "phase: ev.season?.slug ?? null,\n      winner: h.winner,\n    })"),
  M('the form string reaches a row', "phase: ev.season?.slug ?? null,\n    })", "phase: ev.season?.slug ?? null,\n      form: h.form,\n    })"),
  M('a missing score becomes 0', "return s === null || s === undefined || s === '' || !Number.isFinite(n) ? null : n", 'return Number.isFinite(n) ? n : 0'),
  M('the last day of the window is not read', "t <= Date.parse(to + 'T00:00:00Z')", "t < Date.parse(to + 'T00:00:00Z')"),
  M('a 429 is retried like any other status', 'if (res.status === 403 || res.status === 429)', 'if (res.status === 403)'),
  M('a duplicate event is kept twice', 'if (seen.has(row.espn_event_id)) { duplicates++; continue }', 'if (false) { duplicates++; continue }'),
  M('a payload without events is read as an empty day', "if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.events)) return null", "if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.events)) return []"),
  M('a club is identified by its spelling, not its id', 'home: String(h.team.id),', 'home: String(h.team.shortDisplayName),'),
  M('an event with no team id is kept', ' || h.team.id == null || a.team.id == null', ''),
  M('a 500 is not retried', 'for (let attempt = 1; attempt <= 2; attempt++) {\n    try {\n      const res = await get(url)', 'for (let attempt = 2; attempt <= 2; attempt++) {\n    try {\n      const res = await get(url)'),
  M('the request date is not the day asked (one day early)', "const url = `${BASE}/${slug}/scoreboard?dates=${day.replaceAll('-', '')}`", "const url = `${BASE}/${slug}/scoreboard?dates=${day.replaceAll('-', '').slice(0, 7)}00`"),
  M('the leak scan finds nothing', 'export const leakedKeys = x => FORBIDDEN_KEYS.filter(k => allKeys(x).has(k))', 'export const leakedKeys = x => []'),
  M('the id drops the requested day', 'id: `${label}_${day}_e${ev.id}`,', 'id: `${label}_e${ev.id}`,'),
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
