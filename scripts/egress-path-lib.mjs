// The runner's path to a host, named, for a failure text that cannot otherwise say why a request got no answer.
//
// docs/CC-CMD-2026-11-14-weather-failure-cause.md. render-check's late node probe kept `e.message`, which for Node's fetch is "fetch failed"
// whatever happened: the code (DNS, connect, a reset, a budget) is in `e.cause`. This renders that whole chain, and describes NODE's own
// path to the host at that moment: DNS and one TCP connect per address family, the address the world sees, and the runner it ran on.
//
// WHAT IT IS NOT. It describes Node's network stack at a moment later than the page's window. It is not evidence about what Chromium saw
// (in run 42136439023 Chromium was answered 15 times while this stack said "fetch failed"), and the sentence that prints it says so.
//
// The pure parts are functions of plain data, so every clause has a must-fail input (Rule 90). The live parts take their dependencies by
// injection, never throw, and are bounded in time: a diagnostic on a failing path must not become a second failure or a long wait.
// Nothing here is guessed: a source that says nothing prints as `unreadable (<reason>)`, and no key is ever left out.
//
// Usage:  node scripts/egress-path-lib.mjs --self-test
//         node scripts/egress-path-lib.mjs --live <file>      four real shapes from this machine, written to <file>

import dns from 'node:dns'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createChecks, finish, isMain } from './checks.mjs'

export const BOUNDS = {
  depth: 6,       // links of a cause chain followed
  attempts: 8,    // entries read from one AggregateError
  message: 160,   // characters of one message kept
  chain: 500,     // characters of the whole rendered chain kept
  dnsMs: 3000, connectMs: 3000, egressMs: 3000,
  budgetMs: 8000, // the whole description, whatever its parts do
}

/** Every key a description carries, in order. A source that says nothing still prints its key. */
export const LINE_KEYS = ['probe-error', 'cause', 'stage', 'node', 'dns-v4', 'dns-v6', 'connect-v4', 'connect-v6', 'egress-v4', 'egress-v6', 'runner']

export const unreadable = reason => `unreadable (${reason})`

const isObj = x => x !== null && (typeof x === 'object' || typeof x === 'function')
const get = (o, k) => { try { return o[k] } catch { return undefined } }
const text = v => { try { return String(v) } catch { return '(unprintable)' } }
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s)
const guard = (fn, onError) => { try { return fn() } catch (e) { return onError(e) } }

// ── the cause chain ─────────────────────────────────────────────────────────

const hostPort = (address, port) => {
  if (typeof address !== 'string' || address === '') return ''
  const a = net.isIP(address) === 6 ? `[${address}]` : address
  return port === undefined || port === null ? a : `${a}:${port}`
}

// A message is kept only where the code leaves something unsaid: no code at all, or an undici code, because undici writes the attempted
// addresses into the message of UND_ERR_CONNECT_TIMEOUT. Everywhere else the code, syscall and address already say it.
const renderLink = e => {
  const name = text(get(e, 'name') || get(get(e, 'constructor'), 'name') || 'Error')
  const rawCode = get(e, 'code')
  const code = typeof rawCode === 'string' ? rawCode : ''
  const message = get(e, 'message')
  const showMessage = typeof message === 'string' && message !== '' && (code === '' || code.startsWith('UND_ERR_'))
  return [
    name, code, get(e, 'syscall') ?? '', get(e, 'hostname') ?? '', hostPort(get(e, 'address'), get(e, 'port')),
    showMessage ? JSON.stringify(clip(message, BOUNDS.message)) : '',
  ].map(text).filter(x => x !== '').join(' ')
}

const render = (e, depth, seen) => {
  if (!isObj(e)) return `${typeof e} ${JSON.stringify(clip(text(e), BOUNDS.message))}`
  if (seen.has(e)) return '(cycle)'
  seen.add(e)
  let out = renderLink(e)
  const errors = get(e, 'errors')
  if (Array.isArray(errors) && errors.length > 0) {
    if (depth >= BOUNDS.depth) out += ' […]'
    else {
      const shown = errors.slice(0, BOUNDS.attempts).map(x => render(x, depth + 1, seen))
      const more = errors.length > BOUNDS.attempts ? ` ; +${errors.length - BOUNDS.attempts} more` : ''
      out += ` [${shown.join(' ; ')}${more}]`
    }
  }
  const cause = get(e, 'cause')
  if (cause !== undefined && cause !== null) out += depth >= BOUNDS.depth ? ' < …' : ` < ${render(cause, depth + 1, seen)}`
  return out
}

/** The whole chain of an error, one line, bounded. `null` is "the probe answered", not an error. Never throws. */
export const describeError = e => (e === null || e === undefined ? 'none' : clip(render(e, 0, new Set()), BOUNDS.chain))

// Error objects in the chain, depth-first, same bounds and cycle guard as the renderer.
const links = root => {
  const out = []
  const seen = new Set()
  const walk = (e, depth) => {
    if (!isObj(e) || seen.has(e) || out.length >= 64) return
    seen.add(e)
    out.push(e)
    if (depth >= BOUNDS.depth) return
    const errors = get(e, 'errors')
    if (Array.isArray(errors)) for (const x of errors.slice(0, BOUNDS.attempts)) walk(x, depth + 1)
    walk(get(e, 'cause'), depth + 1)
  }
  walk(root, 0)
  return out
}

// A closed table. A code outside it is `unclassified` and printed as it is; nothing is guessed from a message.
const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NODATA', 'EAI_NONAME'])
const CONNECT_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EADDRNOTAVAIL'])
const RESET_CODES = new Set(['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET'])
const RESPONSE_CODES = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'])
const TLS_CODE = /^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_|UNABLE_TO_|SELF_SIGNED_)/

const stageOfLink = l => {
  const c = get(l, 'code')
  const sc = get(l, 'syscall')
  const nm = get(l, 'name')
  if (typeof c === 'string') {
    if (DNS_CODES.has(c)) return { code: c, stage: 'dns' }
    // A bare ETIMEDOUT can be a read; only the connect syscall (or an aggregate, which names none) is the connect stage.
    if (CONNECT_CODES.has(c) && (typeof sc !== 'string' || sc === 'connect')) return { code: c, stage: 'connect' }
    // undici's connect budget covers lookup, connect and TLS together, so the code cannot say which of the three.
    if (c === 'UND_ERR_CONNECT_TIMEOUT') return { code: c, stage: 'connect-budget' }
    if (RESET_CODES.has(c)) return { code: c, stage: 'reset' }
    if (RESPONSE_CODES.has(c)) return { code: c, stage: 'response-budget' }
    if (TLS_CODE.test(c)) return { code: c, stage: 'tls' }
    return undefined
  }
  if (nm === 'TimeoutError' || nm === 'AbortError') return { code: nm, stage: 'own-abort' }
  return undefined
}

/** `{ chain, code, stage }` for what a probe threw. The code and stage come from the FIRST link the table can place. */
export const probeFacts = error => {
  const chain = describeError(error)
  if (error === null || error === undefined) return { chain, code: 'none', stage: 'none' }
  const ls = links(error)
  if (ls.length === 0) return { chain, code: typeof error, stage: 'unclassified' }
  for (const l of ls) {
    const st = stageOfLink(l)
    if (st) return { chain, ...st }
  }
  const firstCode = ls.map(l => get(l, 'code')).find(c => typeof c === 'string')
  return { chain, code: firstCode ?? text(get(ls[0], 'name') || 'unknown'), stage: 'unclassified' }
}

const shortCause = e => probeFacts(e).code

// ── the runner ──────────────────────────────────────────────────────────────

/** `Region` and `Cloud` out of the runner's `.setup_info`: a JSON list of `{ group, detail }`, or the same lines as plain text. */
export const parseSetupInfo = raw => {
  let body = text(raw)
  try {
    const j = JSON.parse(body)
    if (Array.isArray(j)) body = j.map(x => text(get(x, 'detail') ?? '')).join('\n')
  } catch { /* plain text: read as it is */ }
  const pick = k => {
    const m = new RegExp(`^\\s*${k}:\\s*(\\S+)\\s*$`, 'mi').exec(body)
    return m ? m[1] : unreadable(`no ${k} line`)
  }
  return { region: pick('Region'), cloud: pick('Cloud') }
}

/** The directory the runner agent lives in, from the process ancestry (`[{ pid, args }]`): the parent of `bin/Runner.Worker`. */
export const findRunnerRoot = ancestry => {
  for (const a of ancestry) {
    const m = /(\/\S*?)\/bin\/Runner\.(?:Worker|Listener)/.exec(text(get(a, 'args') ?? ''))
    if (m) return m[1]
  }
  return null
}

const readProc = p => fs.readFileSync(p, 'utf8')

/** This process and its ancestors, read from /proc. Throws where /proc is not there; the caller names that. */
export const procAncestry = (read = readProc, start = process.pid) => {
  const out = []
  let pid = start
  for (let i = 0; i < 16 && pid > 1; i++) {
    const stat = read(`/proc/${pid}/stat`)
    out.push({ pid, args: read(`/proc/${pid}/cmdline`).replace(/\0/g, ' ').trim() })
    pid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
  }
  return out
}

const setupInfoFacts = deps => {
  const ancestry = deps.ancestry()
  const root = findRunnerRoot(ancestry)
  if (root === null) { const r = unreadable(`no Runner.Worker among ${ancestry.length} ancestor(s)`); return { region: r, cloud: r } }
  const file = path.join(root, '.setup_info')
  let raw
  try { raw = deps.readFile(file) } catch (e) { const r = unreadable(`${shortCause(e)} reading ${file}`); return { region: r, cloud: r } }
  return parseSetupInfo(raw)
}

const runnerLine = (env, deps) => {
  const image = typeof env.ImageOS === 'string' && env.ImageOS !== ''
    ? `${env.ImageOS}@${env.ImageVersion || unreadable('ImageVersion not set')}`
    : unreadable('ImageOS not set')
  const f = guard(() => setupInfoFacts(deps), e => { const r = unreadable(shortCause(e)); return { region: r, cloud: r } })
  return `runner=image ${image} region ${f.region} cloud ${f.cloud}`
}

// ── Node's own network settings ─────────────────────────────────────────────

const nodeFactsReal = () => {
  const call = (fn, ...a) => { try { return typeof fn === 'function' ? fn(...a) : undefined } catch { return undefined } }
  return {
    version: process.version,
    autoSelectFamily: call(net.getDefaultAutoSelectFamily),
    attemptTimeoutMs: call(net.getDefaultAutoSelectFamilyAttemptTimeout),
    resultOrder: call(dns.getDefaultResultOrder),
    resolvers: call(dns.getServers),
  }
}

const nodeLine = n => {
  const v = (x, suffix = '') => (x === undefined || x === null ? unreadable('not exposed') : `${x}${suffix}`)
  const resolvers = Array.isArray(n.resolvers) ? (n.resolvers.length === 0 ? 'none' : n.resolvers.slice(0, 3).join(',')) : unreadable('not exposed')
  return `node=${v(n.version)} autoSelectFamily=${v(n.autoSelectFamily)} attemptTimeout=${v(n.attemptTimeoutMs, 'ms')} resultOrder=${v(n.resultOrder)} resolvers=${resolvers}`
}

// ── DNS, connect, egress ────────────────────────────────────────────────────

const raced = (promise, ms) => {
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`no answer in ${ms}ms`), { code: `no-answer-in-${ms}ms` })), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const codeOf = e => { const c = get(e, 'code'); return typeof c === 'string' ? c : text(get(e, 'name') || 'error') }

// `dns.lookup` with `all`, per family, because that is the call Node's fetch makes. c-ares (`dns.resolve`) is a different path.
const dnsFamily = async (host, family, deps) => {
  const t0 = deps.now()
  try {
    const r = await raced(Promise.resolve(deps.lookup(host, { family, all: true })), BOUNDS.dnsMs)
    // Node returns an IP literal as it is, whatever family was asked for (measured 2026-11-14: lookup('192.0.2.1', { family: 6, all: true }) gives the v4 address).
    // An address of the other family is not this family's answer, and the first live run here printed `dns-v6=ok 192.0.2.1` before this filter.
    const mine = r.filter(x => x.family === family)
    return { ok: true, addrs: mine.map(x => x.address), other: r.filter(x => x.family !== family).map(x => x.address), ms: deps.now() - t0 }
  } catch (e) { return { ok: false, code: codeOf(e), ms: deps.now() - t0 } }
}

const dnsLine = d => {
  if (!d.ok) return `${d.code} ${d.ms}ms`
  if (d.addrs.length === 0) return d.other.length ? `ok no address of this family (the lookup returned ${d.other.slice(0, 2).join(',')}) ${d.ms}ms` : `ok no address ${d.ms}ms`
  const more = d.addrs.length > 2 ? ` (+${d.addrs.length - 2})` : ''
  return `ok ${d.addrs.slice(0, 2).join(',')}${more} ${d.ms}ms`
}

const connectFamily = async (family, d, port, deps) => {
  if (!d.ok) return `not attempted (no v${family} address: ${d.code})`
  if (d.addrs.length === 0) return `not attempted (the v${family} lookup returned no address)`
  const host = d.addrs[0]
  try {
    const r = await deps.connect({ host, port, timeoutMs: BOUNDS.connectMs })
    return `${hostPort(host, port)} ${r.ok ? 'ok' : r.code} ${r.ms}ms`
  } catch (e) { return `${hostPort(host, port)} ${codeOf(e)}` }
}

// One source for the address the world sees: Cloudflare's trace endpoint, by IP literal so it needs no DNS. It is the address THAT
// endpoint sees, at that moment.
const EGRESS_URL = { 4: 'https://1.1.1.1/cdn-cgi/trace', 6: 'https://[2606:4700:4700::1111]/cdn-cgi/trace' }
const egressFamily = async (family, deps) => {
  try {
    const r = await deps.fetchText(EGRESS_URL[family], BOUNDS.egressMs)
    const m = /^ip=(\S+)$/m.exec(text(r.text))
    if (r.status !== 200 || !m) return unreadable(`HTTP ${r.status}, no ip= line`)
    return net.isIP(m[1]) === family ? m[1] : unreadable(`ip= is not a v${family} address`)
  } catch (e) { return unreadable(shortCause(e)) }
}

export const realDeps = {
  now: () => Date.now(),
  lookup: (host, opts) => dns.promises.lookup(host, opts),
  connect: ({ host, port, timeoutMs }) => new Promise(resolve => {
    const t0 = Date.now()
    const socket = net.createConnection({ host, port })
    let done = false
    const settle = r => { if (done) return; done = true; clearTimeout(timer); socket.destroy(); resolve({ ...r, ms: Date.now() - t0 }) }
    const timer = setTimeout(() => settle({ ok: false, code: `no-connect-in-${timeoutMs}ms` }), timeoutMs)
    socket.on('error', e => settle({ ok: false, code: codeOf(e) }))
    socket.once('connect', () => settle({ ok: true }))
  }),
  fetchText: async (url, ms) => { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); return { status: r.status, text: await r.text() } },
  nodeFacts: nodeFactsReal,
  ancestry: () => procAncestry(),
  readFile: p => fs.readFileSync(p, 'utf8'),
}

/**
 * One line: what the probe threw, and Node's own path to `host` right now. Never throws, never waits past `budgetMs`, always carries every
 * key of LINE_KEYS. `error` is what the caller's probe caught (null when it was answered); `port` is the connect port.
 */
export async function describeEgressPath({ host, error = null, port = 443, env = process.env, deps = realDeps, budgetMs = BOUNDS.budgetMs } = {}) {
  const f = {}
  f.probe = guard(() => probeFacts(error), e => ({ chain: unreadable(shortCause(e)), code: 'unreadable', stage: 'unreadable' }))
  f.node = guard(() => nodeLine(deps.nodeFacts()), e => `node=${unreadable(shortCause(e))}`)
  f.runner = guard(() => runnerLine(env, deps), e => `runner=${unreadable(shortCause(e))}`)
  const work = (async () => {
    const [d4, d6] = await Promise.all([dnsFamily(host, 4, deps), dnsFamily(host, 6, deps)])
    f.dns4 = dnsLine(d4)
    f.dns6 = dnsLine(d6)
    await Promise.all([
      connectFamily(4, d4, port, deps).then(v => { f.connect4 = v }),
      connectFamily(6, d6, port, deps).then(v => { f.connect6 = v }),
      egressFamily(4, deps).then(v => { f.egress4 = v }),
      egressFamily(6, deps).then(v => { f.egress6 = v }),
    ])
  })()
  work.catch(() => {})
  await raced(work, budgetMs).catch(() => {})
  const late = unreadable(`not finished in ${budgetMs}ms`)
  return `egress-path: probe-error=${f.probe.chain} | cause=${f.probe.code} stage=${f.probe.stage} | ${f.node} | dns-v4=${f.dns4 ?? late} | dns-v6=${f.dns6 ?? late}`
    + ` | connect-v4=${f.connect4 ?? late} | connect-v6=${f.connect6 ?? late} | egress-v4=${f.egress4 ?? late} | egress-v6=${f.egress6 ?? late} | ${f.runner}`
}

/** Which of LINE_KEYS a line carries, as `key=` tokens. */
export const keysIn = line => LINE_KEYS.filter(k => new RegExp(`(^|[ |])${k}=`).test(line))

// ── the live shapes (a runner: the CC-CMD's Task 3) ─────────────────────────

const closedPort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })

const attemptFetch = async (url, abortMs) => {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(abortMs) }); return { status: r.status, error: null } } catch (error) { return { status: 0, error } }
}

async function runLive(outFile) {
  const refused = await closedPort()
  const shapes = [
    { id: 'real', url: 'https://api.open-meteo.com/v1/forecast?latitude=42.3467&longitude=-71.0972&current=temperature_2m', abortMs: 15000,
      expect: 'HTTP 200, or a failure whose stage the table places', ok: r => r.status === 200 || r.facts.stage !== 'unclassified' },
    { id: 'nxdomain', url: 'https://api.open-meteo.invalid/', abortMs: 15000,
      expect: 'stage dns, code ENOTFOUND or EAI_AGAIN', ok: r => r.facts.stage === 'dns' && ['ENOTFOUND', 'EAI_AGAIN'].includes(r.facts.code) },
    { id: 'blackhole', url: 'https://192.0.2.1/', abortMs: 15000,
      expect: 'a connect-stage cause (connect, connect-budget or own-abort), whichever this network gives', ok: r => ['connect', 'connect-budget', 'own-abort'].includes(r.facts.stage) },
    { id: 'refused', url: `http://127.0.0.1:${refused}/`, abortMs: 15000, port: refused,
      expect: 'stage connect, code ECONNREFUSED', ok: r => r.facts.stage === 'connect' && r.facts.code === 'ECONNREFUSED' },
  ]
  const results = await Promise.all(shapes.map(async s => {
    const t0 = Date.now()
    const got = await attemptFetch(s.url, s.abortMs)
    const u = new URL(s.url)
    const line = await describeEgressPath({ host: u.hostname, error: got.error, port: s.port ?? (u.port ? Number(u.port) : 443) })
    const facts = probeFacts(got.error)
    return { s, got, facts, line, ms: Date.now() - t0 }
  }))
  const judged = results.map(r => ({ ...r, pass: r.s.ok(r) && keysIn(r.line).length === LINE_KEYS.length }))
  const failed = judged.filter(r => !r.pass)
  const out = [`checked ${judged.length} of ${shapes.length} shapes; node ${process.version}; ${new Date().toISOString()}`]
  for (const r of judged) {
    out.push('', `## ${r.s.id}: ${r.pass ? 'as expected' : 'NOT AS EXPECTED'} (${r.ms}ms)`, `   expected: ${r.s.expect}`,
      `   observed: ${r.got.error === null ? `HTTP ${r.got.status}` : `stage ${r.facts.stage}, code ${r.facts.code}`}`, `   ${r.line}`)
  }
  out.push('', failed.length === 0 ? `VERDICT: pass, ${judged.length} of ${shapes.length} shapes as expected` : `VERDICT: FAIL, ${failed.length} of ${shapes.length} shapes not as expected: ${failed.map(r => r.s.id).join(', ')}`)
  fs.writeFileSync(outFile, `${out.join('\n')}\n`)
  console.log(out.join('\n'))
  return failed.length === 0 ? 0 : 1
}

// ── the end-to-end verdict (the CC-CMD's Task 3, third step) ────────────────

const CHIP_CHECK = 'every card whose venue the table knows carries a live chip'

/**
 * What render-check's output says about its weather chip check, as one verdict. Pure, and it never throws.
 *   observed        that check FAILED, and the failing text carries the description (`egress-path:`), a probe error with a cause, and `dns-v4=`.
 *   incomplete      it failed but the text lacks one of those: the wiring or a source did not deliver. Names what is missing.
 *   not-observable  that check did not fail, so there was no failing message to read. "Not measured", never a pass.
 * render-check prints a failure as `FAIL  <name>` then `      → <detail>`; the block runs to the next PASS or FAIL line, so a later check's text is not read as this one's.
 */
export const judgeE2E = (output, exitCode) => {
  const lines = String(output ?? '').split('\n')
  const start = lines.findIndex(l => l.startsWith(`FAIL  ${CHIP_CHECK}`))
  if (start < 0) {
    const why = lines.find(l => l.startsWith('::warning::') && /skipped|no card on this slate/.test(l))
    return { verdict: 'not-observable', excerpt: why ? [clip(why, 400)] : [], detail: `the chip check did not fail (render-check exited ${exitCode}); ${why ? 'its warning says why, above' : 'no warning explains it'}` }
  }
  const next = lines.findIndex((l, i) => i > start && /^(PASS|FAIL)  /.test(l))
  const block = lines.slice(start, next < 0 ? lines.length : next).join('\n')
  const missing = []
  if (!block.includes('egress-path:')) missing.push('egress-path:')
  if (!/probe-error=\S/.test(block) || !/cause=(?!none\b|unreadable\b)\S+ stage=\S+/.test(block)) missing.push('probe-error= with a cause')
  if (!/dns-v4=\S/.test(block)) missing.push('dns-v4=')
  const around = lines.filter(l => l.startsWith('attribution:') || l.startsWith('open-meteo (start+duration):'))
  return {
    verdict: missing.length === 0 ? 'observed' : 'incomplete',
    excerpt: [...around.map(l => clip(l, 600)), ...block.split('\n').map(l => clip(l, 1800))],
    detail: missing.length === 0 ? "the chip check's FAIL carries egress-path:, a probe-error with a cause, and dns-v4=" : `the chip check failed and its text lacks: ${missing.join(', ')}`,
  }
}

/** The artifact the `--judge` mode writes: its coverage first, then what was read, then the verdict. */
const judgeArtifact = (rawFile, exitCode, note) => {
  const j = judgeE2E(fs.readFileSync(rawFile, 'utf8'), exitCode)
  const out = [`checked 1 of 1 end-to-end run; render-check exit ${exitCode}; node ${process.version}; ${new Date().toISOString()}`, ...(note ? [`fault: ${note}`] : []), '', ...j.excerpt, '', `VERDICT: ${j.verdict} — ${j.detail}`]
  return { text: `${out.join('\n')}\n`, ok: j.verdict === 'observed' }
}

// ── self-test ───────────────────────────────────────────────────────────────

if (isMain(import.meta.url) && process.argv.includes('--judge')) {
  const [rawFile, exitCode, outFile, note] = process.argv.slice(process.argv.indexOf('--judge') + 1)
  if (!rawFile || !exitCode || !outFile) { console.error('usage: node scripts/egress-path-lib.mjs --judge <render-check output file> <its exit code> <artifact file> [<note on the fault>]'); process.exit(2) }
  const a = judgeArtifact(rawFile, exitCode, note)
  fs.writeFileSync(outFile, a.text)
  console.log(a.text)
  process.exit(a.ok ? 0 : 1)
}

if (isMain(import.meta.url) && process.argv.includes('--live')) {
  const outFile = process.argv[process.argv.indexOf('--live') + 1]
  if (!outFile || outFile.startsWith('--')) { console.error('usage: node scripts/egress-path-lib.mjs --live <file>'); process.exit(2) }
  process.exit(await runLive(outFile))
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const here = path.dirname(fileURLToPath(import.meta.url))
  const err = (message, props = {}) => Object.assign(new Error(message), props)

  // ── describeError / probeFacts on the shapes Node 22 really throws (outbox/node-fetch-failure-shapes-2026-11-14.txt) ──
  const dnsMiss = new TypeError('fetch failed', { cause: err('getaddrinfo ENOTFOUND api.open-meteo.invalid', { code: 'ENOTFOUND', errno: -3008, syscall: 'getaddrinfo', hostname: 'api.open-meteo.invalid' }) })
  check('a DNS miss is named by its code, syscall and host, and the outer message is kept', describeError(dnsMiss) === 'TypeError "fetch failed" < Error ENOTFOUND getaddrinfo api.open-meteo.invalid', describeError(dnsMiss))
  check('a DNS miss is placed at the dns stage', probeFacts(dnsMiss).stage === 'dns' && probeFacts(dnsMiss).code === 'ENOTFOUND')
  const refused = new TypeError('fetch failed', { cause: err('connect ECONNREFUSED 127.0.0.1:4', { code: 'ECONNREFUSED', errno: -111, syscall: 'connect', address: '127.0.0.1', port: 4 }) })
  check('a refusal carries the address and port it was refused at', describeError(refused).endsWith('Error ECONNREFUSED connect 127.0.0.1:4'), describeError(refused))
  check('a refusal is placed at the connect stage', probeFacts(refused).stage === 'connect')
  const reset = new TypeError('fetch failed', { cause: err('other side closed', { name: 'SocketError', code: 'UND_ERR_SOCKET' }) })
  check('an undici code keeps its message, because undici puts the detail there', describeError(reset) === 'TypeError "fetch failed" < SocketError UND_ERR_SOCKET "other side closed"', describeError(reset))
  check('a reset is placed at the reset stage', probeFacts(reset).stage === 'reset')
  // shape G of the shapes file: the hang, as observed
  const hang = new TypeError('fetch failed', { cause: err('Connect Timeout Error (attempted address: 127.0.0.1:38501, timeout: 10000ms)', { name: 'ConnectTimeoutError', code: 'UND_ERR_CONNECT_TIMEOUT' }) })
  check('a connect hang keeps the attempted addresses undici wrote into its message', /attempted address: 127\.0\.0\.1:38501/.test(describeError(hang)), describeError(hang))
  check('a connect hang is placed at connect-budget, never at connect: the budget covers lookup, connect and TLS', probeFacts(hang).stage === 'connect-budget')
  const abort = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
  check('a probe aborted by its own signal has no cause and says so', describeError(abort) === 'TimeoutError "The operation was aborted due to timeout"', describeError(abort))
  check('...and is placed at own-abort, with the name as its code', probeFacts(abort).stage === 'own-abort' && probeFacts(abort).code === 'TimeoutError')
  const badPort = new TypeError('fetch failed', { cause: err('bad port') })
  check('an error the table cannot place is "unclassified" and printed, not guessed from its message', probeFacts(badPort).stage === 'unclassified' && /bad port/.test(describeError(badPort)))
  const attempt = (code, address) => err(`connect ${code} ${address}:443`, { code, errno: -1, syscall: 'connect', address, port: 443 })
  const agg = Object.assign(new AggregateError([attempt('ENETUNREACH', '2606:4700::6810:84e5'), attempt('ETIMEDOUT', '104.18.132.229')], ''), { code: 'ETIMEDOUT' })
  const aggErr = new TypeError('fetch failed', { cause: agg })
  check('a two-address failure lists EACH attempt, the IPv6 one bracketed', describeError(aggErr).includes('[Error ENETUNREACH connect [2606:4700::6810:84e5]:443 ; Error ETIMEDOUT connect 104.18.132.229:443]'), describeError(aggErr))
  check('...and is placed at connect, from the aggregate\'s own code', probeFacts(aggErr).stage === 'connect' && probeFacts(aggErr).code === 'ETIMEDOUT')
  const readTimeout = new TypeError('fetch failed', { cause: err('read ETIMEDOUT', { code: 'ETIMEDOUT', syscall: 'read' }) })
  check('an ETIMEDOUT from a READ is not the connect stage', probeFacts(readTimeout).stage === 'unclassified')

  // ── must-fail inputs: the renderer is bounded and never throws ──
  check('null is "none", not an error', describeError(null) === 'none' && probeFacts(null).stage === 'none')
  check('undefined is "none" too', describeError(undefined) === 'none')
  check('a thrown string is described as one', describeError('boom') === 'string "boom"' && probeFacts('boom').stage === 'unclassified')
  const a = err('a'); const b = err('b'); a.cause = b; b.cause = a
  check('a circular cause terminates and says so', /\(cycle\)/.test(describeError(a)), describeError(a))
  check('a megabyte message cannot blow the line', describeError(new Error('x'.repeat(1e6))).length <= BOUNDS.chain + 1)
  const wide = Object.assign(new AggregateError(Array.from({ length: 1000 }, () => err('e', { code: 'ETIMEDOUT', syscall: 'connect', address: '1.2.3.4', port: 443 })), ''), { code: 'ETIMEDOUT' })
  check('a thousand attempts print eight and count the rest', /\+992 more/.test(describeError(wide)) && describeError(wide).length <= BOUNDS.chain + 1, describeError(wide).slice(-60))
  let deep = err('leaf'); for (let i = 0; i < 100; i++) deep = err(`l${i}`, { cause: deep })
  check('a hundred-deep chain stops at the depth bound', /< …$/.test(describeError(deep)) || describeError(deep).length <= BOUNDS.chain + 1)
  const hostile = Object.defineProperty(err('h'), 'code', { get() { throw new Error('getter') } })
  check('a property getter that throws cannot throw out of the renderer', typeof describeError(hostile) === 'string' && probeFacts(hostile).stage === 'unclassified')

  // ── the real shapes, on loopback (fast ones; the hang is the outbox script and Task 3's blackhole) ──
  const real = async (url, abortMs = 5000) => attemptFetch(url, abortMs)
  const closed = await closedPort()
  const rClosed = await real(`http://127.0.0.1:${closed}/`)
  check('REAL closed port: ECONNREFUSED at the connect stage, with the port', probeFacts(rClosed.error).code === 'ECONNREFUSED' && probeFacts(rClosed.error).stage === 'connect' && describeError(rClosed.error).includes(`127.0.0.1:${closed}`), describeError(rClosed.error))
  const rInvalid = await real('https://api.open-meteo.invalid/')
  check('REAL unresolvable name: the dns stage, ENOTFOUND or EAI_AGAIN', probeFacts(rInvalid.error).stage === 'dns' && ['ENOTFOUND', 'EAI_AGAIN'].includes(probeFacts(rInvalid.error).code), describeError(rInvalid.error))
  const resetServer = net.createServer(s => s.destroy()); await new Promise(r => resetServer.listen(0, '127.0.0.1', r))
  const rReset = await real(`http://127.0.0.1:${resetServer.address().port}/`)
  resetServer.close()
  check('REAL accept-then-destroy: UND_ERR_SOCKET at the reset stage', probeFacts(rReset.error).code === 'UND_ERR_SOCKET' && probeFacts(rReset.error).stage === 'reset', describeError(rReset.error))
  const silent = http.createServer(() => {}); await new Promise(r => silent.listen(0, '127.0.0.1', r))
  const rSilent = await real(`http://127.0.0.1:${silent.address().port}/`, 300)
  silent.close()
  check('REAL silent host aborted by its own signal: own-abort, and NO cause beneath it', probeFacts(rSilent.error).stage === 'own-abort' && get(rSilent.error, 'cause') === undefined, describeError(rSilent.error))
  const rPort1 = await real('http://127.0.0.1:1/')
  check('REAL port 1 is refused by undici itself, before any network: unclassified', probeFacts(rPort1.error).stage === 'unclassified', describeError(rPort1.error))

  // ── the runner ──
  const setup = JSON.stringify([{ group: 'Operating System', detail: 'Ubuntu\n26.04.1\nLTS' }, { group: 'Runner Image Provisioner', detail: 'Hosted Compute Agent\nVersion: 20261103.629\nWorker ID: {x}\nRegion: westus2\nCloud: Azure' }])
  check('Region and Cloud are read out of a JSON .setup_info', JSON.stringify(parseSetupInfo(setup)) === '{"region":"westus2","cloud":"Azure"}', JSON.stringify(parseSetupInfo(setup)))
  check('...and out of plain lines', parseSetupInfo('Region: eastus\nCloud: Azure').region === 'eastus')
  check('a .setup_info with no Region says so, rather than inventing one', /unreadable \(no Region line\)/.test(parseSetupInfo('Cloud: Azure').region) && parseSetupInfo('Cloud: Azure').cloud === 'Azure')
  check('Region is not read out of a longer key (Subregion: x)', /unreadable/.test(parseSetupInfo('Subregion: x\nCloud: Azure').region))
  check('the runner root is the parent of bin/Runner.Worker', findRunnerRoot([{ pid: 9, args: 'node a.mjs' }, { pid: 4, args: '/home/runner/runners/2.338.2/bin/Runner.Worker spawnclient 1 2' }]) === '/home/runner/runners/2.338.2')
  check('...and is null when no ancestor is the agent', findRunnerRoot([{ pid: 9, args: 'node a.mjs' }, { pid: 1, args: '/sbin/init' }]) === null)
  const procTable = { 30: ['(node)', 20], 20: ['(bash)', 10], 10: ['(Runner.Worker)', 1] }
  const fakeProc = p => { const m = /^\/proc\/(\d+)\/(stat|cmdline)$/.exec(p); const row = procTable[m[1]]; return m[2] === 'stat' ? `${m[1]} ${row[0]} S ${row[1]} 0 0` : `prog${m[1]}\0arg` }
  check('the ancestry is read from /proc/<pid>/stat up to pid 1, by the parent field after the closing paren', JSON.stringify(procAncestry(fakeProc, 30).map(x => x.pid)) === '[30,20,10]')
  check('a comm that contains ") " cannot misplace the parent field', procAncestry(p => (p.endsWith('stat') ? '7 (a) b) S 1 0 0' : 'x'), 7).length === 1)

  // ── describeEgressPath with the dependencies injected ──
  const healthy = {
    now: () => Date.now(),
    lookup: async (_h, { family }) => (family === 4 ? [{ address: '104.18.1.1', family: 4 }, { address: '104.18.2.1', family: 4 }, { address: '104.18.3.1', family: 4 }] : [{ address: '2606:4700::1', family: 6 }]),
    connect: async () => ({ ok: true, ms: 5 }),
    fetchText: async url => ({ status: 200, text: url.includes('[') ? 'fl=1\nip=2603:1030::9\nloc=US\n' : 'fl=1\nip=20.1.2.3\nloc=US\n' }),
    nodeFacts: () => ({ version: 'v22.0.0', autoSelectFamily: true, attemptTimeoutMs: 250, resultOrder: 'verbatim', resolvers: ['127.0.0.53'] }),
    ancestry: () => [{ pid: 1, args: '/home/runner/runners/2.338.2/bin/Runner.Worker spawnclient 1 2' }],
    readFile: () => setup,
  }
  const envOk = { ImageOS: 'ubuntu26', ImageVersion: '20261111.196.1' }
  // Every description below goes through `ask`, so a description that THROWS or NEVER RETURNS fails the named checks that follow instead of killing the run. Measured by mutation
  // (2026-11-14): with the throw guard removed the self-test died on an uncaught exception, and with the budget removed it exited 13 on an unsettled await. Both were red, and
  // neither named a check, and the checks after the crash never ran. The timer is a real one, cleared when the call settles, so a hang costs 3 s here and a pass costs nothing.
  const ask = args => new Promise(resolve => {
    const timer = setTimeout(() => resolve('<<HUNG: no description in 3000ms>>'), 3000)
    ;(async () => describeEgressPath(args))().then(v => { clearTimeout(timer); resolve(v) }, e => { clearTimeout(timer); resolve(`<<THREW: ${String(e?.message ?? e).slice(0, 100)}>>`) })
  })
  const line = await ask({ host: 'h.example', error: hang, env: envOk, deps: healthy })
  check('a healthy description carries EVERY key', keysIn(line).length === LINE_KEYS.length, `missing: ${LINE_KEYS.filter(k => !keysIn(line).includes(k)).join(',')}`)
  check('it names the cause and the stage', /cause=UND_ERR_CONNECT_TIMEOUT stage=connect-budget/.test(line), line)
  check('DNS lists two addresses and counts the rest, per family', /dns-v4=ok 104\.18\.1\.1,104\.18\.2\.1 \(\+1\) \d+ms/.test(line) && /dns-v6=ok 2606:4700::1 \d+ms/.test(line), line)
  check('connect is per family, the IPv6 address bracketed', /connect-v4=104\.18\.1\.1:443 ok 5ms/.test(line) && /connect-v6=\[2606:4700::1\]:443 ok 5ms/.test(line), line)
  check('the egress address is read per family', /egress-v4=20\.1\.2\.3 /.test(line) && /egress-v6=2603:1030::9 /.test(line), line)
  check('the runner line carries image, version, region and cloud', /runner=image ubuntu26@20261111\.196\.1 region westus2 cloud Azure$/.test(line), line)
  check('the node line carries its address-selection settings', /node=v22\.0\.0 autoSelectFamily=true attemptTimeout=250ms resultOrder=verbatim resolvers=127\.0\.0\.53/.test(line), line)

  const noV6 = await ask({ host: 'h.example', error: null, env: envOk, deps: { ...healthy,
    lookup: async (_h, { family }) => { if (family === 6) throw err('getaddrinfo ENOTFOUND', { code: 'ENOTFOUND' }); return [{ address: '104.18.1.1', family: 4 }] },
    fetchText: async url => { if (url.includes('[')) throw new TypeError('fetch failed', { cause: err('connect ENETUNREACH', { code: 'ENETUNREACH', syscall: 'connect' }) }); return { status: 200, text: 'ip=20.1.2.3\n' } } } })
  check('a family with no address says why, and does not attempt a connect', /dns-v6=ENOTFOUND \d+ms/.test(noV6) && /connect-v6=not attempted \(no v6 address: ENOTFOUND\)/.test(noV6), noV6)
  check('an egress lookup that failed names its cause, not "fetch failed"', /egress-v6=unreadable \(ENETUNREACH\)/.test(noV6), noV6)
  check('an answered probe is "none", not an error', /probe-error=none \| cause=none stage=none/.test(noV6), noV6)
  check('every key is present on that branch too', keysIn(noV6).length === LINE_KEYS.length)

  const garbage = await ask({ host: 'h', env: envOk, deps: { ...healthy, fetchText: async () => ({ status: 200, text: '<html>captive portal</html>' }) } })
  check('an egress body with no ip= line is unreadable, not parsed', /egress-v4=unreadable \(HTTP 200, no ip= line\)/.test(garbage), garbage)
  const wrongFamily = await ask({ host: 'h', env: envOk, deps: { ...healthy, fetchText: async () => ({ status: 200, text: 'ip=20.1.2.3\n' }) } })
  check('a v4 address answered at the v6 endpoint is refused as a v6 address', /egress-v6=unreadable \(ip= is not a v6 address\)/.test(wrongFamily), wrongFamily)

  const literal = await ask({ host: '192.0.2.1', env: envOk, deps: { ...healthy, lookup: async () => [{ address: '192.0.2.1', family: 4 }] } })
  check("an IP literal answered for the other family is not reported as that family's address", /dns-v4=ok 192\.0\.2\.1 \d+ms/.test(literal) && /dns-v6=ok no address of this family \(the lookup returned 192\.0\.2\.1\) \d+ms/.test(literal) && /connect-v6=not attempted/.test(literal), literal)
  check('Node does return an IP literal whatever family is asked, which is the premise of that filter', JSON.stringify(await realDeps.lookup('127.0.0.1', { family: 6, all: true })) === '[{"address":"127.0.0.1","family":4}]', JSON.stringify(await realDeps.lookup('127.0.0.1', { family: 6, all: true })))

  const throwing = await ask({ host: 'h', env: {}, deps: { ...healthy, lookup: () => { throw new Error('sync boom') }, nodeFacts: () => { throw new Error('nf') }, ancestry: () => { throw err('no proc', { code: 'ENOENT' }) } } })
  check('a dependency that throws synchronously yields text, not a throw, and every key stays', keysIn(throwing).length === LINE_KEYS.length, throwing)
  check('...lookup failure is named', /dns-v4=Error \d+ms/.test(throwing) || /dns-v4=\S+ \d+ms/.test(throwing), throwing)
  check('...node facts that throw are unreadable with their code', /node=unreadable \(Error\)/.test(throwing), throwing)
  check('...an unreadable ancestry and missing ImageOS are named', /runner=image unreadable \(ImageOS not set\) region unreadable \(ENOENT\) cloud unreadable \(ENOENT\)/.test(throwing), throwing)

  const t0 = Date.now()
  const stuck = await ask({ host: 'h', env: envOk, budgetMs: 250, deps: { ...healthy, connect: () => new Promise(() => {}), fetchText: () => new Promise(() => {}) } })
  check('a dependency that never returns is bounded by the budget', !stuck.startsWith('<<') && Date.now() - t0 < 1500, `${Date.now() - t0}ms ${stuck.slice(0, 60)}`)
  check('...what it never returned is named as unfinished, and what did finish is kept', /connect-v4=unreadable \(not finished in 250ms\)/.test(stuck) && /dns-v4=ok /.test(stuck) && keysIn(stuck).length === LINE_KEYS.length, stuck)

  // ── the end-to-end verdict, read from output that checks.mjs itself produced (a hand-typed copy of its format would be a copy of the source) ──
  const realRun = (chipDetail, laterDetail = 'a later check') => {
    const code = `import { createChecks } from ${JSON.stringify(pathToFileURL(path.join(here, 'checks.mjs')).href)}
const { check, summarize } = createChecks()
check('the chips all filled within the wait', false, 'timed out')
check(${JSON.stringify(CHIP_CHECK)}, false, ${JSON.stringify(chipDetail)})
check('every live chip reads as a temperature and nothing else', false, ${JSON.stringify(laterDetail)})
summarize()`
    return spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }).stdout
  }
  const chipText = d => `13 known venue(s) on this slate, 0 chip(s) filled. A late node probe saw: unreachable — fetch failed (a later moment). ${d} The page reported: nothing`
  const seen = judgeE2E(realRun(chipText(`${line} (Node's own network stack at that later moment, not Chromium's).`)), 1)
  check('a failing chip check that carries the description is observed', seen.verdict === 'observed', JSON.stringify(seen).slice(0, 300))
  const noDescription = judgeE2E(realRun(chipText('')), 1)
  check('a failing chip check WITHOUT the description is incomplete, and names egress-path:', noDescription.verdict === 'incomplete' && /lacks: .*egress-path:/.test(noDescription.detail), JSON.stringify(noDescription).slice(0, 300))
  const noCause = judgeE2E(realRun(chipText(noV6)), 1)
  check('a description whose probe did not fail is incomplete: it names no cause', noCause.verdict === 'incomplete' && /probe-error= with a cause/.test(noCause.detail) && !/dns-v4=/.test(noCause.detail), JSON.stringify(noCause).slice(0, 300))
  const noDns = judgeE2E(realRun(chipText(line.replace(/ \| dns-v4=[^|]*/, ''))), 1)
  check('a description without dns-v4= is incomplete, and names dns-v4=', noDns.verdict === 'incomplete' && /lacks: dns-v4=$/.test(noDns.detail), JSON.stringify(noDns).slice(0, 300))
  const bleed = judgeE2E(realRun(chipText(''), line), 1)
  check("a LATER check's text is not read as the chip check's", bleed.verdict === 'incomplete', JSON.stringify(bleed).slice(0, 300))
  const wrongCheck = judgeE2E(`FAIL  the chips all filled within the wait\n      → ${line}\n\n0/1 checks passed\n`, 1)
  check("another check's failure, even with the description in it, is not the chip check", wrongCheck.verdict === 'not-observable', JSON.stringify(wrongCheck).slice(0, 300))
  const warned = judgeE2E(`PASS  ${CHIP_CHECK}\n::warning::no card on this slate names a real venue (3 card(s): TBD) — the venue-table and weather-chip checks are skipped.\n`, 0)
  check('a slate with no known ground is not-observable, and carries the warning that says so', warned.verdict === 'not-observable' && warned.excerpt.some(l => l.includes('no card on this slate')), JSON.stringify(warned).slice(0, 300))
  check('a passing run with no warning is not-observable, never observed', judgeE2E('PASS  a\n', 0).verdict === 'not-observable' && judgeE2E('', 0).verdict === 'not-observable')
  check('must-fail input: null, undefined, a number and an object do not throw', [null, undefined, 42, {}].every(x => judgeE2E(x, 1).verdict === 'not-observable'))
  // Built by replacing a marker in real output, not by passing a megabyte to a child: a command line over 128 KB is refused (E2BIG), which made the first version of this check read nothing.
  const big = realRun(chipText(`${line} MARK`)).replace('MARK', 'x'.repeat(1_000_000))
  const bigJudged = judgeE2E(big, 1)
  check('a megabyte of output is read, and its excerpt is bounded', big.length > 1_000_000 && bigJudged.verdict === 'observed' && bigJudged.excerpt.every(l => l.length <= 1801), `${big.length} chars, ${bigJudged.verdict}, longest line ${Math.max(...bigJudged.excerpt.map(l => l.length))}`) // clip() keeps n characters and appends one ellipsis

  // The `--judge` mode: the artifact's coverage first, the verdict last, and the exit status the verdict's (observed 0, anything else 1).
  const judgeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-judge-'))
  try {
    const runJudge = (raw, code) => {
      fs.writeFileSync(path.join(judgeDir, 'raw.txt'), raw)
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--judge', path.join(judgeDir, 'raw.txt'), String(code), path.join(judgeDir, 'out.txt'), 'api.open-meteo.com -> 192.0.2.1'], { encoding: 'utf8' })
      const art = fs.existsSync(path.join(judgeDir, 'out.txt')) ? fs.readFileSync(path.join(judgeDir, 'out.txt'), 'utf8').trimEnd().split('\n') : []
      return { status: r.status, first: art[0] ?? '', last: art[art.length - 1] ?? '', fault: art[1] ?? '' }
    }
    const jo = runJudge(realRun(chipText(`${line} (Node's own network stack).`)), 1)
    check('--judge on an observed run exits 0, opens with its coverage, notes the fault and closes on the verdict', jo.status === 0 && /^checked 1 of 1 end-to-end run; render-check exit 1; node v/.test(jo.first) && jo.fault === 'fault: api.open-meteo.com -> 192.0.2.1' && /^VERDICT: observed — /.test(jo.last), JSON.stringify(jo))
    const ji = runJudge(realRun(chipText('')), 1)
    check('--judge on an incomplete run exits 1 and says so', ji.status === 1 && /^VERDICT: incomplete — /.test(ji.last), JSON.stringify(ji))
    const jn = runJudge('PASS  a\n', 0)
    check('--judge on a run with nothing to read exits 1: not measured is not a pass', jn.status === 1 && /^VERDICT: not-observable — /.test(jn.last), JSON.stringify(jn))
    check('--judge with no arguments exits 2 and writes nothing', spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--judge'], { encoding: 'utf8' }).status === 2)
  } finally { fs.rmSync(judgeDir, { recursive: true, force: true }) }

  // ── the wiring in render-check, asserted on its source (the page-side half is the Task 3 run) ──
  const rc = fs.readFileSync(path.join(here, 'render-check.mjs'), 'utf8')
  const probeBlockStart = rc.indexOf('if (!pinned && (waitErr !== null || filled.length < expected)) {')
  const probeBlock = probeBlockStart < 0 ? '' : rc.slice(probeBlockStart, rc.indexOf('await browser.close()', probeBlockStart))
  const chipCheckStart = rc.indexOf("check('every card whose venue the table knows carries a live chip'")
  const chipCheck = chipCheckStart < 0 ? '' : rc.slice(chipCheckStart, chipCheckStart + 2500)
  check('render-check imports describeEgressPath from this module', /import\s*\{[^}]*\bdescribeEgressPath\b[^}]*\}\s*from\s*'\.\/egress-path-lib\.mjs'/.test(rc))
  check('the late probe block is where it was (the wiring below is read from it)', probeBlock !== '')
  // `[^\n]*`, not `[^}]*`: the catch body holds a template literal, `${e.message}`, whose closing brace ends a `[^}]*` run before `probeErr`.
  check('the probe keeps the error it caught', /catch\s*\(e\)\s*\{[^\n]*\bprobeErr\s*=\s*e\b/.test(probeBlock))
  check('the description is computed inside that block, from the error and the probe URL\'s own host', /pathSaw\s*=\s*await describeEgressPath\(\{[^}]*\berror:\s*probeErr\b/.test(probeBlock) && /new global\.URL\(forecastUrl\(probe\)\)\.hostname/.test(probeBlock))
  check('the failing chip check prints it, after the late-probe sentence and before "The page reported"',
    chipCheck.includes('${pathSaw}') && chipCheck.indexOf('A late node probe saw:') < chipCheck.indexOf('${pathSaw}') && chipCheck.indexOf('${pathSaw}') < chipCheck.indexOf('The page reported:'))

  // Rule 91: the denominator is printed with the claim. These are the six descriptions built above, not "every branch".
  const described = [line, noV6, garbage, wrongFamily, throwing, stuck]
  const complete = described.filter(l => keysIn(l).length === LINE_KEYS.length).length
  check('every description built above carries every key', complete === described.length, `${complete} of ${described.length}`)
  console.log(`checked ${complete} of ${described.length} described lines for all ${LINE_KEYS.length} keys`)
  finish(summarize())
}
