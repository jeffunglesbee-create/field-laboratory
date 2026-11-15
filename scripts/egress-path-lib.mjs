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
import tls from 'node:tls'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createChecks, finish, isMain } from './checks.mjs'

export const BOUNDS = {
  depth: 6,       // links of a cause chain followed
  attempts: 8,    // entries read from one AggregateError
  message: 160,   // characters of one message kept
  chain: 500,     // characters of the whole rendered chain kept
  dnsMs: 3000, connectMs: 3000, egressMs: 3000,
  dohMs: 3000, tlsMs: 3000,
  addresses: 6,   // addresses given a TLS handshake; the rest are counted and not probed
  budgetMs: 8000, // the whole description, whatever its parts do: the lookups run together (3000), then the handshakes (3000)
}

/** Every key a description carries, in order. A source that says nothing still prints its key. */
export const LINE_KEYS = ['probe-error', 'cause', 'stage', 'node', 'dns-v4', 'dns-v6', 'public-v4', 'view-west-v4', 'view-east-v4', 'connect-v4', 'connect-v6', 'tls', 'egress-v4', 'egress-v6', 'runner']

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

/**
 * `Region` and `Cloud` out of the runner's `.setup_info`. The shape is the one read on a runner on 2026-11-14 (`outbox/egress-path-survey-20261114T171939Z.txt`): a JSON list of
 * `{ "Group": ..., "Detail": ... }`, the Detail text holding `Key: value` lines. Any other shape is named as unreadable. None is guessed at: the first version of this parser guessed
 * lowercase keys, and every line the live runs printed said `region unreadable (no Region line)`.
 */
export const parseSetupInfo = raw => {
  let list
  try { list = JSON.parse(text(raw)) } catch (e) { const r = unreadable(`not JSON: ${shortCause(e)}`); return { region: r, cloud: r } }
  if (!Array.isArray(list)) { const r = unreadable('JSON but not a list'); return { region: r, cloud: r } }
  const body = list.map(x => text(get(x, 'Detail') ?? '')).join('\n')
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

// ── every address, and a TLS handshake to each ──────────────────────────────

// docs/CC-CMD-2026-11-14-weather-failure-tls-stage.md. The host is delegated to a zone that answers by the client's subnet, so the system resolver shows one of its addresses and a
// request that stalls on that one says nothing about the other. Google's DoH JSON takes `edns_client_subnet`, which asks the zone what it answers for another place. Measured from 8
// runners: the two west /24s were answered 51.81.167.44 16 of 16 times and the two east /24s 167.114.211.86 16 of 16 times, whatever region the asking runner was in. Each /24 below is
// the one around an egress address a committed artifact records, so none is invented: westus2 20.80.173.98 (live-check 43620118846) and eastus2 68.220.172.168 (probe 43638310999),
// both in the Observed table of docs/CC-CMD-2026-11-14-weather-failure-cause.md. The subnet is printed in each value, so a label gone stale shows.
export const VANTAGES = [{ id: 'west', subnet: '20.80.173.0/24' }, { id: 'east', subnet: '68.220.172.0/24' }]

const DOH_URL = 'https://8.8.8.8/resolve'

/** Google's DoH JSON request for the A records of `host`, as a client in `subnet` (none: as the resolver itself). By IP literal, so it needs no DNS. */
export const dohUrl = (host, subnet) => `${DOH_URL}?name=${encodeURIComponent(host)}&type=A${subnet ? `&edns_client_subnet=${encodeURIComponent(subnet)}` : ''}`

const RCODES = { 2: 'SERVFAIL', 3: 'NXDOMAIN', 5: 'REFUSED' }

/**
 * `{ ok: true, addrs }` or `{ ok: false, code }` for one Google DoH JSON response. Pure. The shape is the one in run 43665722193: `Status` is the DNS rcode and `Answer` (absent
 * when there is nothing to answer) lists records of every type, so a CNAME ahead of the A record is dropped by its type and the A record kept. A response that is not that shape is named.
 */
export const parseDoh = (status, body) => {
  if (status !== 200) return { ok: false, code: `HTTP-${text(status)}` }
  let j
  try { j = JSON.parse(text(body)) } catch { return { ok: false, code: 'not-JSON' } }
  const rcode = isObj(j) ? get(j, 'Status') : undefined
  if (typeof rcode !== 'number') return { ok: false, code: 'no-Status' }
  if (rcode !== 0) return { ok: false, code: RCODES[rcode] ?? `rcode-${rcode}` }
  const answer = get(j, 'Answer')
  const addrs = Array.isArray(answer) ? answer.filter(a => isObj(a) && get(a, 'type') === 1 && typeof get(a, 'data') === 'string' && net.isIP(a.data) === 4).map(a => a.data) : []
  return { ok: true, addrs }
}

// What the zone answers for `subnet`, as one DoH call. An IP literal has nothing to ask, and says so. Never throws.
const viewFamily = async (host, subnet, deps) => {
  if (net.isIP(host) !== 0) return { skipped: 'the host is an IP literal' }
  const t0 = deps.now()
  try {
    // Bounded here and not left to the dependency: the handshakes wait for this, so one call that never answers must not hold them to the budget.
    const r = await raced(Promise.resolve(deps.fetchText(dohUrl(host, subnet), BOUNDS.dohMs)), BOUNDS.dohMs)
    return { ...parseDoh(r.status, r.text), other: [], ms: deps.now() - t0 }
  } catch (e) { return { ok: false, code: shortCause(e), other: [], ms: deps.now() - t0 } }
}

const viewLine = (v, subnet) => (v.skipped ? `not attempted (${v.skipped})` : `doh 8.8.8.8${subnet ? ` ecs ${subnet}` : ''} ${dnsLine(v)}`)

/** Every address any source named, once, in the order first seen, with the names of the sources that gave it. Pure; what is not an IP literal is not an address. */
export const unionOf = sources => {
  const seen = new Map()
  for (const s of Array.isArray(sources) ? sources : []) {
    const addrs = get(s, 'addrs')
    if (!Array.isArray(addrs)) continue
    for (const a of addrs) {
      if (typeof a !== 'string' || net.isIP(a) === 0) continue
      const e = seen.get(a.toLowerCase()) ?? { addr: a, from: [] }
      if (!e.from.includes(s.name)) e.from.push(s.name)
      seen.set(a.toLowerCase(), e)
    }
  }
  return [...seen.values()]
}

/**
 * One TCP connect and TLS handshake to `host`:`port`: `{ ok, code, tcpMs, tlsMs }`. `tcpMs` is there once the connect completed, so a stall can be told from a refusal: a code of
 * `no-tls-in-<ms>ms` means the connect completed and no handshake did, `no-connect-in-<ms>ms` that not even the connect did. ALPN is `http/1.1`, as fetch sends it (the two send the same
 * ClientHello: outbox/tls-stage-premise-2026-11-14.txt). `extra` is merged into the TLS options, so a test can give a certificate its CA. Never throws.
 */
export const makeTlsConnect = (extra = {}) => ({ host, port, servername, timeoutMs }) => new Promise(resolve => {
  const t0 = Date.now()
  let tcpMs
  let socket
  let done = false
  const settle = r => {
    if (done) return
    done = true
    clearTimeout(timer)
    try { socket?.destroy() } catch { /* nothing left to close */ }
    resolve({ ...r, tcpMs, tlsMs: tcpMs === undefined ? undefined : Date.now() - t0 - tcpMs })
  }
  const timer = setTimeout(() => settle({ ok: false, code: tcpMs === undefined ? `no-connect-in-${timeoutMs}ms` : `no-tls-in-${timeoutMs}ms` }), timeoutMs)
  try {
    socket = tls.connect({ host, port, ...(servername ? { servername } : {}), ALPNProtocols: ['http/1.1'], ...extra })
    socket.once('connect', () => { tcpMs = Date.now() - t0 })
    socket.once('secureConnect', () => settle({ ok: true }))
    socket.on('error', e => settle({ ok: false, code: codeOf(e) }))
  } catch (e) { settle({ ok: false, code: codeOf(e) }) }
})

const tlsFamily = async (addr, host, port, deps) => {
  try { return await deps.tlsConnect({ host: addr, port, servername: net.isIP(host) === 0 ? host : undefined, timeoutMs: BOUNDS.tlsMs }) } catch (e) { return { threw: true, code: shortCause(e) } }
}

/** Whether a handshake's result is a verdict: it completed, or it names how it did not. A result that threw, or that says neither, is not one. */
export const settledTls = r => isObj(r) && get(r, 'threw') !== true && (get(r, 'ok') === true || (typeof get(r, 'code') === 'string' && get(r, 'code') !== ''))

/** One handshake's result as text. Pure. A stall carries its own wait in its code, so it prints no second time; a number nobody measured is not printed. */
export const tlsVerdict = r => {
  if (!isObj(r)) return unreadable('no result')
  if (get(r, 'threw') === true) return unreadable(text(get(r, 'code')))
  if (!settledTls(r)) return unreadable('the result has neither ok nor a code')
  const tcpMs = get(r, 'tcpMs')
  const tlsMs = get(r, 'tlsMs')
  const tcp = typeof tcpMs === 'number' ? `tcp ${tcpMs}ms` : (get(r, 'ok') === true ? 'tcp not timed' : 'tcp not completed')
  if (get(r, 'ok') === true) return `ok (${tcp}, handshake ${typeof tlsMs === 'number' ? `${tlsMs}ms` : 'not timed'})`
  const code = text(get(r, 'code'))
  return /^no-/.test(code) || typeof tcpMs !== 'number' || typeof tlsMs !== 'number' ? `${code} (${tcp})` : `${code} (${tcp}, failed after ${tlsMs}ms)`
}

// `entries` are the addresses that were given a handshake (`{ addr, from, r }`, `r` absent while it runs); `notProbed` is how many more there were.
const tlsLine = (entries, port, notProbed, late) => {
  if (entries.length === 0) return 'none (no address from any source)'
  const shown = entries.map(e => `${hostPort(e.addr, port)} ${e.r === undefined ? late : tlsVerdict(e.r)} from ${e.from.join(',')}`)
  return `${shown.join(' ; ')}${notProbed > 0 ? ` ; +${notProbed} not probed` : ''}`
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
  tlsConnect: makeTlsConnect(),
  nodeFacts: nodeFactsReal,
  ancestry: () => procAncestry(),
  readFile: p => fs.readFileSync(p, 'utf8'),
}

// The sources that are asked what the host's addresses are, besides the system resolver: the public one (no subnet) and one per vantage. `key` is the key the line prints.
const VIEWS = [{ id: 'public', key: 'public-v4', subnet: undefined }, ...VANTAGES.map(v => ({ id: v.id, key: `view-${v.id}-v4`, subnet: v.subnet }))]

/**
 * What `describeEgressPath` prints, as data: `line`, and `addresses`, which says how many addresses any source named (`found`, undefined while the sources had not all answered), how many of
 * them were given a handshake (`probed`: at most BOUNDS.addresses) and how many of those have a verdict (`settled`: a handshake that completed, was refused or stalled; one still running
 * at the budget, or whose dependency threw, has none). Never throws, never waits past `budgetMs`, and the line always carries every key of LINE_KEYS.
 */
export async function describeEgressFacts({ host, error = null, port = 443, env = process.env, deps = realDeps, budgetMs = BOUNDS.budgetMs } = {}) {
  const f = { views: {} }
  f.probe = guard(() => probeFacts(error), e => ({ chain: unreadable(shortCause(e)), code: 'unreadable', stage: 'unreadable' }))
  f.node = guard(() => nodeLine(deps.nodeFacts()), e => `node=${unreadable(shortCause(e))}`)
  f.runner = guard(() => runnerLine(env, deps), e => `runner=${unreadable(shortCause(e))}`)
  const work = (async () => {
    // The lookups and the views start together, so the slower of the two sets the wait and not their sum.
    const viewsDone = Promise.all(VIEWS.map(v => viewFamily(host, v.subnet, deps).then(r => { f.views[v.id] = r })))
    const [d4, d6] = await Promise.all([dnsFamily(host, 4, deps), dnsFamily(host, 6, deps)])
    f.dns4 = dnsLine(d4)
    f.dns6 = dnsLine(d6)
    // The connects and the egress lookups do not wait for the views: a view that is slow must not delay what it has nothing to do with.
    const rest = Promise.all([
      connectFamily(4, d4, port, deps).then(v => { f.connect4 = v }),
      connectFamily(6, d6, port, deps).then(v => { f.connect6 = v }),
      egressFamily(4, deps).then(v => { f.egress4 = v }),
      egressFamily(6, deps).then(v => { f.egress6 = v }),
    ])
    await viewsDone
    // Read in this fixed order whatever order they finished in, so two runs name the same address from the same sources.
    const union = unionOf([
      { name: 'system', addrs: [...(d4.ok ? d4.addrs : []), ...(d6.ok ? d6.addrs : [])] },
      ...VIEWS.map(v => ({ name: v.id, addrs: f.views[v.id]?.ok ? f.views[v.id].addrs : [] })),
    ])
    f.found = union.length
    f.entries = union.slice(0, BOUNDS.addresses).map(e => ({ ...e }))
    await Promise.all([rest, ...f.entries.map(e => tlsFamily(e.addr, host, port, deps).then(r => { e.r = r }))])
  })()
  work.catch(() => {})
  await raced(work, budgetMs).catch(() => {})
  const late = unreadable(`not finished in ${budgetMs}ms`)
  const view = v => (f.views[v.id] === undefined ? late : viewLine(f.views[v.id], v.subnet))
  const entries = f.entries ?? []
  const tlsText = f.entries === undefined ? late : tlsLine(entries, port, f.found - entries.length, late)
  const line = `egress-path: probe-error=${f.probe.chain} | cause=${f.probe.code} stage=${f.probe.stage} | ${f.node} | dns-v4=${f.dns4 ?? late} | dns-v6=${f.dns6 ?? late}`
    + ` | ${VIEWS.map(v => `${v.key}=${view(v)}`).join(' | ')}`
    + ` | connect-v4=${f.connect4 ?? late} | connect-v6=${f.connect6 ?? late} | tls=${tlsText} | egress-v4=${f.egress4 ?? late} | egress-v6=${f.egress6 ?? late} | ${f.runner}`
  return { line, addresses: { found: f.found, probed: entries.length, settled: entries.filter(e => settledTls(e.r)).length } }
}

/**
 * One line: what the probe threw, and Node's own path to `host` right now, with every address any source names for it and a TLS handshake to each. Never throws, never waits past
 * `budgetMs`, always carries every key of LINE_KEYS. `error` is what the caller's probe caught (null when it was answered); `port` is the connect port.
 */
export async function describeEgressPath(args = {}) {
  return (await describeEgressFacts(args)).line
}

/** Which of LINE_KEYS a line carries, as `key=` tokens. */
export const keysIn = line => LINE_KEYS.filter(k => new RegExp(`(^|[ |])${k}=`).test(line))

// ── the live shapes (a runner: the CC-CMD's Task 3) ─────────────────────────

const closedPort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })

const attemptFetch = async (url, abortMs) => {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(abortMs) }); return { status: r.status, error: null } } catch (error) { return { status: 0, error } }
}

/** The count line of a shape in the live artifact, from the facts the description was built from and not from its printed text. */
export const addressesLine = a => `addresses: ${a.found === undefined ? unreadable('the sources had not all answered') : a.found} found, ${a.settled} with a settled TLS verdict${a.found !== undefined && a.probed < a.found ? ` (${a.probed} probed)` : ''}`

/**
 * What each live shape must show of the addresses, on the counts a description's facts give. Pure, so each can be failed on purpose (the self-test does).
 * The real host: at least one address named, and every one probed has a verdict. A name that cannot exist: none. A documentation address and a closed loopback port are literals: one address, with a verdict.
 */
export const LIVE_ADDRESSES = {
  real: a => typeof a.found === 'number' && a.found >= 1 && a.settled === a.probed,
  nxdomain: a => a.found === 0,
  blackhole: a => a.found === 1 && a.settled === 1,
  refused: a => a.found === 1 && a.settled === 1,
}

/** What `runLive` reaches the network with, replaceable so the self-test can drive the whole mode on known results. The runner's own run is the only other thing that calls it. */
const liveIO = { attemptFetch, describeEgressFacts }

async function runLive(outFile, io = liveIO, log = console.log) {
  const refused = await closedPort()
  const shapes = [
    { id: 'real', url: 'https://api.open-meteo.com/v1/forecast?latitude=42.3467&longitude=-71.0972&current=temperature_2m', abortMs: 15000,
      expect: 'HTTP 200, or a failure whose stage the table places', ok: r => r.status === 200 || r.facts.stage !== 'unclassified',
      expectAddresses: 'at least one found, and every probed one with a settled TLS verdict', addresses: LIVE_ADDRESSES.real },
    { id: 'nxdomain', url: 'https://api.open-meteo.invalid/', abortMs: 15000,
      expect: 'stage dns, code ENOTFOUND or EAI_AGAIN', ok: r => r.facts.stage === 'dns' && ['ENOTFOUND', 'EAI_AGAIN'].includes(r.facts.code),
      expectAddresses: 'none found: no source has an address for a name that does not exist', addresses: LIVE_ADDRESSES.nxdomain },
    { id: 'blackhole', url: 'https://192.0.2.1/', abortMs: 15000,
      expect: 'a connect-stage cause (connect, connect-budget or own-abort), whichever this network gives', ok: r => ['connect', 'connect-budget', 'own-abort'].includes(r.facts.stage),
      expectAddresses: 'one found (the literal), with a settled TLS verdict', addresses: LIVE_ADDRESSES.blackhole },
    { id: 'refused', url: `http://127.0.0.1:${refused}/`, abortMs: 15000, port: refused,
      expect: 'stage connect, code ECONNREFUSED', ok: r => r.facts.stage === 'connect' && r.facts.code === 'ECONNREFUSED',
      expectAddresses: 'one found (the literal), with a settled TLS verdict', addresses: LIVE_ADDRESSES.refused },
  ]
  const results = await Promise.all(shapes.map(async s => {
    const t0 = Date.now()
    const got = await io.attemptFetch(s.url, s.abortMs)
    const u = new URL(s.url)
    const described = await io.describeEgressFacts({ host: u.hostname, error: got.error, port: s.port ?? (u.port ? Number(u.port) : 443) })
    const facts = probeFacts(got.error)
    return { s, got, facts, line: described.line, addresses: described.addresses, ms: Date.now() - t0 }
  }))
  const judged = results.map(r => ({ ...r, pass: r.s.ok(r) && r.s.addresses(r.addresses) && keysIn(r.line).length === LINE_KEYS.length }))
  const failed = judged.filter(r => !r.pass)
  const out = [`checked ${judged.length} of ${shapes.length} shapes; node ${process.version}; ${new Date().toISOString()}`]
  for (const r of judged) {
    out.push('', `## ${r.s.id}: ${r.pass ? 'as expected' : 'NOT AS EXPECTED'} (${r.ms}ms)`, `   expected: ${r.s.expect}`,
      `   observed: ${r.got.error === null ? `HTTP ${r.got.status}` : `stage ${r.facts.stage}, code ${r.facts.code}`}`,
      `   expected addresses: ${r.s.expectAddresses}`, `   ${addressesLine(r.addresses)}`, `   ${r.line}`)
  }
  out.push('', failed.length === 0 ? `VERDICT: pass, ${judged.length} of ${shapes.length} shapes as expected` : `VERDICT: FAIL, ${failed.length} of ${shapes.length} shapes not as expected: ${failed.map(r => r.s.id).join(', ')}`)
  fs.writeFileSync(outFile, `${out.join('\n')}\n`)
  log(out.join('\n'))
  return failed.length === 0 ? 0 : 1
}

// ── the end-to-end verdict (the CC-CMD's Task 3, third step) ────────────────

const CHIP_CHECK = 'every card whose venue the table knows carries a live chip'

/**
 * What render-check's output says about its weather chip check, as one verdict. Pure, and it never throws.
 *   observed        that check FAILED, and the failing text carries the description (`egress-path:`), a probe error with a cause, `dns-v4=` and `tls=`.
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
  if (!/(^|[ |])tls=\S/.test(block)) missing.push('tls=')
  const around = lines.filter(l => l.startsWith('attribution:') || l.startsWith('open-meteo (start+duration):'))
  return {
    verdict: missing.length === 0 ? 'observed' : 'incomplete',
    excerpt: [...around.map(l => clip(l, 600)), ...block.split('\n').map(l => clip(l, 1800))],
    detail: missing.length === 0 ? "the chip check's FAIL carries egress-path:, a probe-error with a cause, dns-v4= and tls=" : `the chip check failed and its text lacks: ${missing.join(', ')}`,
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
  // The runner's own file, byte for byte: the 761 bytes the survey step printed from `/home/runner/actions-runner/cached/2.338.2/.setup_info` on 2026-11-14 (`outbox/egress-path-survey-20261114T171939Z.txt`).
  // The first version of this check used a file I had written from a guess, with lowercase keys, and passed while the runner's own keys are `Group` and `Detail`: every line the live runs printed said `region unreadable (no Region line)`.
  const REAL_SETUP_INFO = String.raw`[{"Group":"Runner Image Provisioner","Detail":"Hosted Compute Agent\nVersion: 20261103.629\nCommit: 15dbd9ccb5dbf34fae002b6ed1a2670f52df37bc\nBuild Date: 2026-11-03T17:26:59Z\nWorker ID: {05042ee8-72bd-43e7-8cc3-c0c425b25dce}\nRegion: southcentralus\nCloud: Azure"},{"Group":"_internal_runner_telemetry","Detail":"ProcessLifetimeId: c3de2b4d-267c-4c0c-9559-f0dff553edae\nAzure Region: southcentralus"},{"Group":"Operating System","Detail":"Ubuntu\n26.04.1\nLTS"},{"Group":"Runner Image","Detail":"Image: ubuntu-26.04\nVersion: 20261111.196.1\nIncluded Software: https://github.com/actions/runner-images/blob/ubuntu26/20261111.196/images/ubuntu/Ubuntu2604-Readme.md\nImage Release: https://github.com/actions/runner-images/releases/tag/ubuntu26%2F20261111.196"}]`
  check('Region and Cloud are read out of the runner\'s own .setup_info, the bytes captured on a runner', JSON.stringify(parseSetupInfo(REAL_SETUP_INFO)) === '{"region":"southcentralus","cloud":"Azure"}', JSON.stringify(parseSetupInfo(REAL_SETUP_INFO)))
  check('the telemetry group\'s "Azure Region:" line is not taken for Region', /unreadable \(no Region line\)/.test(parseSetupInfo(REAL_SETUP_INFO.replace('\\nRegion: southcentralus', '')).region), parseSetupInfo(REAL_SETUP_INFO.replace('\\nRegion: southcentralus', '')).region)
  const notJson = parseSetupInfo('Region: eastus\nCloud: Azure')
  check('a file that is not JSON is named as such; its lines are not read as if they were the shape', /^unreadable \(not JSON: SyntaxError\)$/.test(notJson.region) && /^unreadable \(not JSON: SyntaxError\)$/.test(notJson.cloud), JSON.stringify(notJson))
  const notList = parseSetupInfo('{"Region":"x"}')
  check('JSON that is not a list is named as such', /^unreadable \(JSON but not a list\)$/.test(notList.region) && /^unreadable \(JSON but not a list\)$/.test(notList.cloud), JSON.stringify(notList))
  const noCloud = parseSetupInfo(REAL_SETUP_INFO.replace('\\nCloud: Azure', ''))
  check('a .setup_info with no Cloud line says so, and still reads the Region', /^unreadable \(no Cloud line\)$/.test(noCloud.cloud) && noCloud.region === 'southcentralus', JSON.stringify(noCloud))
  const subregion = parseSetupInfo(REAL_SETUP_INFO.replace('\\nRegion: southcentralus', '\\nSubregion: x'))
  check('Region is not read out of a longer key (Subregion: x)', /^unreadable \(no Region line\)$/.test(subregion.region), JSON.stringify(subregion))
  check('the runner root is the parent of bin/Runner.Worker', findRunnerRoot([{ pid: 9, args: 'node a.mjs' }, { pid: 4, args: '/home/runner/runners/2.338.2/bin/Runner.Worker spawnclient 1 2' }]) === '/home/runner/runners/2.338.2')
  check('...and is null when no ancestor is the agent', findRunnerRoot([{ pid: 9, args: 'node a.mjs' }, { pid: 1, args: '/sbin/init' }]) === null)
  const procTable = { 30: ['(node)', 20], 20: ['(bash)', 10], 10: ['(Runner.Worker)', 1] }
  const fakeProc = p => { const m = /^\/proc\/(\d+)\/(stat|cmdline)$/.exec(p); const row = procTable[m[1]]; return m[2] === 'stat' ? `${m[1]} ${row[0]} S ${row[1]} 0 0` : `prog${m[1]}\0arg` }
  check('the ancestry is read from /proc/<pid>/stat up to pid 1, by the parent field after the closing paren', JSON.stringify(procAncestry(fakeProc, 30).map(x => x.pid)) === '[30,20,10]')
  check('a comm that contains ") " cannot misplace the parent field', procAncestry(p => (p.endsWith('stat') ? '7 (a) b) S 1 0 0' : 'x'), 7).length === 1)

  // ── describeEgressPath with the dependencies injected ──
  // ── Google's DoH JSON, byte for byte as run 43665722193 printed it (outbox/tls-stage-premise-2026-11-14.txt). Each size is the one that run printed for the body: a fixture typed from a reading of it
  // would be a copy of the source, and the size is what says it is the source. ──
  const DOH = {
    west: { size: 285, body: '{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"api.open-meteo.com.","type":1}],"Answer":[{"name":"api.open-meteo.com.","type":1,"TTL":1800,"data":"51.81.167.44"}],"edns_client_subnet":"20.80.173.0/24","Comment":"Response from 2400:52e0:fff0::1."}' },
    east: { size: 242, body: '{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"api.open-meteo.com.","type":1}],"Answer":[{"name":"api.open-meteo.com.","type":1,"TTL":258,"data":"167.114.211.86"}],"edns_client_subnet":"68.220.172.0/24"}' },
    plain: { size: 245, body: '{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"api.open-meteo.com.","type":1}],"Answer":[{"name":"api.open-meteo.com.","type":1,"TTL":1800,"data":"167.114.211.86"}],"Comment":"Response from 109.104.147.1."}' },
    nxdomain: { size: 255, body: '{"Status":3,"TC":false,"RD":true,"RA":true,"AD":true,"CD":false,"Question":[{"name":"api.open-meteo.invalid.","type":1}],"Authority":[{"name":".","type":6,"TTL":86278,"data":"a.root-servers.net. nstld.verisign-grs.com. 2026111401 1800 900 604800 86400"}]}' },
    noAnswer: { size: 317, body: '{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"api.open-meteo.com.","type":28}],"Authority":[{"name":"api.open-meteo.com.","type":6,"TTL":900,"data":"geo-ns01.open-meteo.com. info.open-meteo.com. 2022067441 7200 900 1209600 86400"}],"Comment":"Response from 2400:52e0:fff0::1."}' },
    cname: { size: 297, body: '{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,"Question":[{"name":"www.github.com.","type":1}],"Answer":[{"name":"www.github.com.","type":5,"TTL":1666,"data":"github.com."},{"name":"github.com.","type":1,"TTL":60,"data":"140.82.114.3"}],"Comment":"Response from 205.251.197.3."}' },
  }
  const WEST = '51.81.167.44'
  const EAST = '167.114.211.86'
  const DOH_BASE = 'https://8.8.8.8/resolve?'
  // What Google answers for a URL this module asked: the subnet picks the body, as the zone does. `plain` is what a call with no subnet gets (EAST on the run that printed it; a west runner got WEST on 4 of 5).
  const dohAnswer = (url, plain = DOH.plain.body) => {
    const m = /[?&]edns_client_subnet=([^&]+)/.exec(url)
    const subnet = m ? decodeURIComponent(m[1]) : null
    if (subnet === null) return { status: 200, text: plain }
    if (subnet === '20.80.173.0/24') return { status: 200, text: DOH.west.body }
    if (subnet === '68.220.172.0/24') return { status: 200, text: DOH.east.body }
    return { status: 400, text: '<!DOCTYPE html>\n<html lang=en>\n  <title>Error 400 (Bad Request)!!1</title>' }
  }

  const healthy = {
    now: () => Date.now(),
    lookup: async (_h, { family }) => (family === 4 ? [{ address: '104.18.1.1', family: 4 }, { address: '104.18.2.1', family: 4 }, { address: '104.18.3.1', family: 4 }] : [{ address: '2606:4700::1', family: 6 }]),
    connect: async () => ({ ok: true, ms: 5 }),
    fetchText: async url => (url.startsWith(DOH_BASE) ? dohAnswer(url) : { status: 200, text: url.includes('[') ? 'fl=1\nip=2603:1030::9\nloc=US\n' : 'fl=1\nip=20.1.2.3\nloc=US\n' }),
    tlsConnect: async () => ({ ok: true, tcpMs: 5, tlsMs: 9 }),
    nodeFacts: () => ({ version: 'v22.0.0', autoSelectFamily: true, attemptTimeoutMs: 250, resultOrder: 'verbatim', resolvers: ['127.0.0.53'] }),
    ancestry: () => [{ pid: 1, args: '/home/runner/runners/2.338.2/bin/Runner.Worker spawnclient 1 2' }],
    readFile: () => REAL_SETUP_INFO,
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
  check('the runner line carries image, version, region and cloud', /runner=image ubuntu26@20261111\.196\.1 region southcentralus cloud Azure$/.test(line), line)
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

  // ── the new stage: every address any source names, and a TLS handshake to each (docs/CC-CMD-2026-11-14-weather-failure-tls-stage.md) ──
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const withinMs = (promise, ms) => new Promise(resolve => { const t = setTimeout(() => resolve(false), ms); promise.then(() => { clearTimeout(t); resolve(true) }) })
  const askFacts = args => new Promise(resolve => {
    const timer = setTimeout(() => resolve({ line: '<<HUNG: no description in 3000ms>>', addresses: {} }), 3000)
    ;(async () => describeEgressFacts(args))().then(v => { clearTimeout(timer); resolve(v) }, e => { clearTimeout(timer); resolve({ line: `<<THREW: ${String(e?.message ?? e).slice(0, 100)}>>`, addresses: {} }) })
  })
  const positions = l => LINE_KEYS.map(k => l.search(new RegExp(`(^|[ |])${k}=`)))
  const inKeyOrder = l => { const p = positions(l); return p.every((x, i) => x >= 0 && (i === 0 || x > p[i - 1])) }
  const tlsOf = l => (/ \| tls=([^|]*) \| /.exec(l) ?? [])[1]
  const viewOf = (l, key) => (new RegExp(`(?:^|[ |])${key}=([^|]*?) \\| `).exec(l) ?? [])[1]

  check('each DoH fixture is the byte count run 43665722193 printed for it', Object.entries(DOH).every(([, d]) => Buffer.byteLength(d.body) === d.size), Object.entries(DOH).map(([k, d]) => `${k} ${Buffer.byteLength(d.body)}/${d.size}`).join(' '))
  check('dohUrl is the URL that run asked, with and without a subnet (the slash escaped)', dohUrl('api.open-meteo.com') === 'https://8.8.8.8/resolve?name=api.open-meteo.com&type=A' && dohUrl('api.open-meteo.com', '20.80.173.0/24') === 'https://8.8.8.8/resolve?name=api.open-meteo.com&type=A&edns_client_subnet=20.80.173.0%2F24', dohUrl('api.open-meteo.com', '20.80.173.0/24'))

  // parseDoh on the real bytes, then on inputs it must refuse by name.
  const pd = (status, body) => JSON.stringify(parseDoh(status, body))
  check('parseDoh: the west view is WEST', pd(200, DOH.west.body) === `{"ok":true,"addrs":["${WEST}"]}`, pd(200, DOH.west.body))
  check('parseDoh: the east view is EAST', pd(200, DOH.east.body) === `{"ok":true,"addrs":["${EAST}"]}`, pd(200, DOH.east.body))
  check('parseDoh: a name that does not exist is NXDOMAIN, not an empty answer', pd(200, DOH.nxdomain.body) === '{"ok":false,"code":"NXDOMAIN"}', pd(200, DOH.nxdomain.body))
  check('parseDoh: a name with no A record is an answer of no address, not a failure', pd(200, DOH.noAnswer.body) === '{"ok":true,"addrs":[]}', pd(200, DOH.noAnswer.body))
  check('parseDoh: a CNAME ahead of the A record is dropped by its type and the A record kept', pd(200, DOH.cname.body) === '{"ok":true,"addrs":["140.82.114.3"]}', pd(200, DOH.cname.body))
  check('parseDoh: an HTTP 400 (a malformed subnet) is named by its status', pd(400, '<!DOCTYPE html>') === '{"ok":false,"code":"HTTP-400"}', pd(400, '<!DOCTYPE html>'))
  check('parseDoh: a 200 whose body is not JSON is named', pd(200, '<html>captive portal</html>') === '{"ok":false,"code":"not-JSON"}', pd(200, '<html>captive portal</html>'))
  check('parseDoh: JSON with no Status is named, and so is JSON that is not an object', pd(200, '{}') === '{"ok":false,"code":"no-Status"}' && pd(200, 'null') === '{"ok":false,"code":"no-Status"}' && pd(200, '[]') === '{"ok":false,"code":"no-Status"}', `${pd(200, '{}')} ${pd(200, 'null')} ${pd(200, '[]')}`)
  check('parseDoh: a Status that is not a number is not read as one', pd(200, '{"Status":"0"}') === '{"ok":false,"code":"no-Status"}', pd(200, '{"Status":"0"}'))
  check('parseDoh: SERVFAIL and REFUSED are named, any other rcode as rcode-N', pd(200, '{"Status":2}') === '{"ok":false,"code":"SERVFAIL"}' && pd(200, '{"Status":5}') === '{"ok":false,"code":"REFUSED"}' && pd(200, '{"Status":9}') === '{"ok":false,"code":"rcode-9"}', `${pd(200, '{"Status":2}')} ${pd(200, '{"Status":5}')} ${pd(200, '{"Status":9}')}`)
  check('parseDoh: an Answer that is not a list, and entries that are not A records of an IPv4 literal, give no address', pd(200, '{"Status":0,"Answer":"x"}') === '{"ok":true,"addrs":[]}'
    && pd(200, '{"Status":0,"Answer":[null,7,{"type":1,"data":"not-an-ip"},{"type":1,"data":"::1"},{"type":28,"data":"1.2.3.4"},{"type":1}]}') === '{"ok":true,"addrs":[]}', pd(200, '{"Status":0,"Answer":[null,7,{"type":1,"data":"not-an-ip"},{"type":1,"data":"::1"},{"type":28,"data":"1.2.3.4"},{"type":1}]}'))
  check('parseDoh: no status and no body is named, not thrown', pd(undefined, undefined) === '{"ok":false,"code":"HTTP-undefined"}' && pd(200, undefined) === '{"ok":false,"code":"not-JSON"}', `${pd(undefined, undefined)} ${pd(200, undefined)}`)

  // unionOf: every address any source named, once, in the order first seen, with the sources that named it.
  const un = unionOf([{ name: 'system', addrs: ['1.1.1.1', '2.2.2.2', '1.1.1.1'] }, { name: 'public', addrs: ['2.2.2.2'] }, { name: 'west', addrs: ['3.3.3.3', '1.1.1.1', 'not-an-ip', 7, null] }, { name: 'east', addrs: 'nope' }, null, { addrs: ['4.4.4.4'], name: 'x' }])
  check('unionOf: order first seen, each address once, the sources that named it in the order they were read', JSON.stringify(un) === '[{"addr":"1.1.1.1","from":["system","west"]},{"addr":"2.2.2.2","from":["system","public"]},{"addr":"3.3.3.3","from":["west"]},{"addr":"4.4.4.4","from":["x"]}]', JSON.stringify(un))
  check('unionOf: what is not an IP literal is not an address, and an IPv6 literal is one address however it is cased', unionOf([{ name: 'a', addrs: ['FE80::1'] }, { name: 'b', addrs: ['fe80::1'] }]).length === 1 && unionOf([{ name: 'a', addrs: ['host.example', '1.2.3'] }]).length === 0)
  check('unionOf: must-fail input (null, undefined, a number, an object) is an empty union', [null, undefined, 42, {}].every(x => unionOf(x).length === 0))

  // tlsVerdict, settledTls, tlsLine and addressesLine: every branch, from plain data.
  const tv = tlsVerdict
  check('tlsVerdict: a completed handshake carries both times', tv({ ok: true, tcpMs: 68, tlsMs: 71 }) === 'ok (tcp 68ms, handshake 71ms)', tv({ ok: true, tcpMs: 68, tlsMs: 71 }))
  check('tlsVerdict: a stall after a completed connect says where it stalled, with its wait once', tv({ ok: false, code: 'no-tls-in-3000ms', tcpMs: 12 }) === 'no-tls-in-3000ms (tcp 12ms)', tv({ ok: false, code: 'no-tls-in-3000ms', tcpMs: 12 }))
  check('tlsVerdict: no connect says the connect did not complete', tv({ ok: false, code: 'no-connect-in-3000ms' }) === 'no-connect-in-3000ms (tcp not completed)' && tv({ ok: false, code: 'ECONNREFUSED' }) === 'ECONNREFUSED (tcp not completed)', `${tv({ ok: false, code: 'no-connect-in-3000ms' })} ${tv({ ok: false, code: 'ECONNREFUSED' })}`)
  check('tlsVerdict: an error after a completed connect says how long the handshake ran', tv({ ok: false, code: 'ECONNRESET', tcpMs: 12, tlsMs: 40 }) === 'ECONNRESET (tcp 12ms, failed after 40ms)', tv({ ok: false, code: 'ECONNRESET', tcpMs: 12, tlsMs: 40 }))
  check('tlsVerdict: a number nobody measured is not printed', tv({ ok: true }) === 'ok (tcp not timed, handshake not timed)' && tv({ ok: false, code: 'EPROTO', tcpMs: 5 }) === 'EPROTO (tcp 5ms)', `${tv({ ok: true })} ${tv({ ok: false, code: 'EPROTO', tcpMs: 5 })}`)
  check('tlsVerdict: a dependency that threw, and results that are not verdicts, are unreadable', tv({ threw: true, code: 'EBOOM' }) === 'unreadable (EBOOM)' && [undefined, null, 'x', 5].every(x => tv(x) === 'unreadable (no result)') && tv({}) === 'unreadable (the result has neither ok nor a code)', `${tv({ threw: true, code: 'EBOOM' })} | ${tv({})}`)
  check('settledTls: a completed handshake and a named failure are verdicts; a throw, an empty result, no code and an empty code are not', settledTls({ ok: true }) && settledTls({ ok: false, code: 'x' }) && ![{ threw: true, code: 'x' }, {}, undefined, null, { ok: false }, { ok: false, code: '' }, { ok: 1 }].some(settledTls))
  const sampleEntries = [{ addr: WEST, from: ['system', 'west'], r: { ok: false, code: 'no-tls-in-3000ms', tcpMs: 12 } }, { addr: '2606:4700::1', from: ['system'], r: { ok: true, tcpMs: 3, tlsMs: 9 } }, { addr: EAST, from: ['east'] }]
  check('tlsLine: each address with its port (an IPv6 one bracketed), its verdict and its sources; one still running is named late', tlsLine(sampleEntries, 443, 0, 'LATE') === `${WEST}:443 no-tls-in-3000ms (tcp 12ms) from system,west ; [2606:4700::1]:443 ok (tcp 3ms, handshake 9ms) from system ; ${EAST}:443 LATE from east`, tlsLine(sampleEntries, 443, 0, 'LATE'))
  check('tlsLine: the addresses left unprobed are counted, and no address at all is said', tlsLine(sampleEntries.slice(0, 1), 443, 4, 'LATE').endsWith(' ; +4 not probed') && tlsLine([], 443, 0, 'LATE') === 'none (no address from any source)')
  check('addressesLine: the counts, a cap shown, and an unknown total named', addressesLine({ found: 2, probed: 2, settled: 2 }) === 'addresses: 2 found, 2 with a settled TLS verdict' && addressesLine({ found: 9, probed: 6, settled: 6 }) === 'addresses: 9 found, 6 with a settled TLS verdict (6 probed)' && addressesLine({ found: undefined, probed: 0, settled: 0 }) === 'addresses: unreadable (the sources had not all answered) found, 0 with a settled TLS verdict', `${addressesLine({ found: 9, probed: 6, settled: 6 })} | ${addressesLine({ found: undefined, probed: 0, settled: 0 })}`)
  const A = (found, probed, settled) => ({ found, probed, settled })
  check('LIVE_ADDRESSES.real: one address found (one is enough) or more, and every probed one settled, passes; none found, an unknown total, or one unsettled does not', LIVE_ADDRESSES.real(A(1, 1, 1)) && LIVE_ADDRESSES.real(A(2, 2, 2)) && LIVE_ADDRESSES.real(A(9, 6, 6)) && !LIVE_ADDRESSES.real(A(0, 0, 0)) && !LIVE_ADDRESSES.real(A(undefined, 0, 0)) && !LIVE_ADDRESSES.real(A(2, 2, 1)))
  check('LIVE_ADDRESSES.nxdomain: none found passes, one found does not', LIVE_ADDRESSES.nxdomain(A(0, 0, 0)) && !LIVE_ADDRESSES.nxdomain(A(1, 1, 1)) && !LIVE_ADDRESSES.nxdomain(A(undefined, 0, 0)))
  check('LIVE_ADDRESSES.blackhole and .refused: exactly one literal with a verdict passes; none, two, or an unsettled one does not', ['blackhole', 'refused'].every(k => LIVE_ADDRESSES[k](A(1, 1, 1)) && !LIVE_ADDRESSES[k](A(0, 0, 0)) && !LIVE_ADDRESSES[k](A(2, 2, 2)) && !LIVE_ADDRESSES[k](A(1, 1, 0))))
  check('the view keys the line prints are the vantages\' keys, in order, and every vantage is a /24 with a unique id', JSON.stringify(LINE_KEYS.filter(k => /^view-/.test(k))) === JSON.stringify(VANTAGES.map(v => `view-${v.id}-v4`)) && new Set(VANTAGES.map(v => v.id)).size === VANTAGES.length && VANTAGES.every(v => /^\d{1,3}(\.\d{1,3}){2}\.0\/24$/.test(v.subnet)), JSON.stringify(VANTAGES))

  // runLive, whole, with its two network calls injected. Each shape's address expectation, the clause that applies it and the two lines it prints are shown to be what decides, each by an input that makes exactly that one fail.
  // Until these, the pass predicate's address clause could be deleted and this file stayed at "all passed": it had only ever been run on a runner, and there it passes.
  const liveFile = path.join(os.tmpdir(), `egress-path-live-selftest-${process.pid}.txt`)
  const wholeLine = LINE_KEYS.map(k => `${k}=x`).join(' | ')
  const liveFetches = { 'api.open-meteo.com': null, 'api.open-meteo.invalid': dnsMiss, '192.0.2.1': hang, '127.0.0.1': refused }
  const liveAddresses = { 'api.open-meteo.com': A(2, 2, 2), 'api.open-meteo.invalid': A(0, 0, 0), '192.0.2.1': A(1, 1, 1), '127.0.0.1': A(1, 1, 1) }
  const whole = async (describedOver = {}, fetchedOver = {}) => {
    const io = {
      attemptFetch: async url => { const h = new URL(url).hostname; const e = h in fetchedOver ? fetchedOver[h] : liveFetches[h]; return { status: e ? 0 : 200, error: e } },
      describeEgressFacts: async ({ host }) => ({ line: wholeLine, addresses: liveAddresses[host], ...(describedOver[host] ?? {}) }),
    }
    const code = await runLive(liveFile, io, () => {})
    const text = fs.readFileSync(liveFile, 'utf8')
    return { code, text, last: text.trimEnd().split('\n').pop() }
  }
  const onlyFails = (w, shape) => w.code === 1 && w.last === `VERDICT: FAIL, 1 of 4 shapes not as expected: ${shape}`
  const wAll = await whole()
  check('runLive: four shapes as expected pass with exit 0, and the artifact prints the expected addresses and the counts of the real shape', wAll.code === 0 && wAll.last === 'VERDICT: pass, 4 of 4 shapes as expected' && wAll.text.includes('   expected addresses: at least one found, and every probed one with a settled TLS verdict\n') && wAll.text.includes('   addresses: 2 found, 2 with a settled TLS verdict\n'), wAll.last)
  check('runLive: each shape prints its own expected addresses, four lines', ['at least one found, and every probed one with a settled TLS verdict', 'none found: no source has an address for a name that does not exist', 'one found (the literal), with a settled TLS verdict'].every(t => wAll.text.includes(`   expected addresses: ${t}\n`)) && wAll.text.split('\n').filter(l => l.startsWith('   expected addresses: ')).length === 4)
  check('runLive: the real shape with no address found fails, and only it', onlyFails(await whole({ 'api.open-meteo.com': { addresses: A(0, 0, 0) } }), 'real'))
  check('runLive: the real shape with one probed address unsettled fails, and only it', onlyFails(await whole({ 'api.open-meteo.com': { addresses: A(2, 2, 1) } }), 'real'))
  check('runLive: the name that cannot exist fails when an address was found for it, and only it', onlyFails(await whole({ 'api.open-meteo.invalid': { addresses: A(1, 1, 1) } }), 'nxdomain'))
  check('runLive: the documentation address fails when its handshake has no verdict, and only it', onlyFails(await whole({ '192.0.2.1': { addresses: A(1, 1, 0) } }), 'blackhole'))
  check('runLive: the closed loopback port fails when two addresses were found, and only it', onlyFails(await whole({ '127.0.0.1': { addresses: A(2, 2, 2) } }), 'refused'))
  check('runLive: a description missing a key fails its shape (the clause that was there before the addresses)', onlyFails(await whole({ 'api.open-meteo.com': { line: wholeLine.replace(/ \| tls=x/, '') } }), 'real'))
  check('runLive: a shape that fails in the wrong way fails its shape (the clause that was there before the addresses)', onlyFails(await whole({}, { '127.0.0.1': dnsMiss }), 'refused'))
  fs.rmSync(liveFile, { force: true })

  // The orchestration, with the dependencies injected. A west runner as measured: the system resolver and the public one both gave WEST, the west view WEST, the east view EAST; WEST answers TCP and no handshake.
  const westCalls = []
  const westRed = { ...healthy,
    lookup: async (_h, { family }) => { if (family === 6) throw err('queryAaaa ENODATA', { code: 'ENODATA' }); return [{ address: WEST, family: 4 }] },
    fetchText: async url => (url.startsWith(DOH_BASE) ? dohAnswer(url, DOH.west.body) : healthy.fetchText(url)),
    tlsConnect: async a => { westCalls.push(a); return a.host === WEST ? { ok: false, code: 'no-tls-in-3000ms', tcpMs: 12 } : { ok: true, tcpMs: 30, tlsMs: 70 } },
  }
  const red = await askFacts({ host: 'api.open-meteo.com', error: hang, env: envOk, deps: westRed })
  check('a west red carries every key, in the order the line prints them', keysIn(red.line).length === LINE_KEYS.length && inKeyOrder(red.line), red.line.slice(0, 200))
  check('...each source says what it answered, with the subnet printed in the view it was asked as', /public-v4=doh 8\.8\.8\.8 ok 51\.81\.167\.44 \d+ms \| /.test(red.line) && /view-west-v4=doh 8\.8\.8\.8 ecs 20\.80\.173\.0\/24 ok 51\.81\.167\.44 \d+ms \| /.test(red.line) && /view-east-v4=doh 8\.8\.8\.8 ecs 68\.220\.172\.0\/24 ok 167\.114\.211\.86 \d+ms \| /.test(red.line), red.line)
  check('...tls= lists WEST stalled after its connect and EAST completed, each with the sources that named it', tlsOf(red.line) === `${WEST}:443 no-tls-in-3000ms (tcp 12ms) from system,public,west ; ${EAST}:443 ok (tcp 30ms, handshake 70ms) from east`, tlsOf(red.line))
  check('...each handshake was asked of the ADDRESS, with the HOST as the name, on the port, within the bound', westCalls.length === 2 && westCalls.every(a => a.port === 443 && a.servername === 'api.open-meteo.com' && a.timeoutMs === BOUNDS.tlsMs) && westCalls.map(a => a.host).join() === `${WEST},${EAST}`, JSON.stringify(westCalls))
  check('...and the facts count the addresses from those same entries', JSON.stringify(red.addresses) === '{"found":2,"probed":2,"settled":2}', JSON.stringify(red.addresses))
  check('a system IPv6 address is probed too: bracketed, with the system as its source', /\[2606:4700::1\]:443 ok \(tcp 5ms, handshake 9ms\) from system(?: ;|$)/.test(tlsOf(line) ?? ''), tlsOf(line))

  // A host that is an IP literal has nothing to ask a resolver, and no name to send.
  const litCalls = []
  const lit = await askFacts({ host: '192.0.2.1', env: envOk, deps: { ...healthy, lookup: async () => [{ address: '192.0.2.1', family: 4 }],
    fetchText: async url => { litCalls.push(url); return healthy.fetchText(url) }, tlsConnect: async a => { litCalls.push(a); return { ok: false, code: 'no-connect-in-3000ms' } } } })
  check('an IP-literal host asks no resolver and says so in each view', litCalls.filter(x => typeof x === 'string' && x.startsWith(DOH_BASE)).length === 0 && ['public-v4', 'view-west-v4', 'view-east-v4'].every(k => viewOf(lit.line, k) === 'not attempted (the host is an IP literal)'), lit.line)
  check('...and its handshake is to the literal with no name sent', litCalls.filter(x => typeof x === 'object').length === 1 && litCalls.find(x => typeof x === 'object').host === '192.0.2.1' && litCalls.find(x => typeof x === 'object').servername === undefined && tlsOf(lit.line) === '192.0.2.1:443 no-connect-in-3000ms (tcp not completed) from system', `${tlsOf(lit.line)} ${JSON.stringify(litCalls.find(x => typeof x === 'object'))}`)

  // A source that fails is named by what it did, and what the others gave is kept.
  const dohFails = async fetch => askFacts({ host: 'h.example', env: envOk, deps: { ...westRed, fetchText: async url => (url.startsWith(DOH_BASE) ? fetch(url) : healthy.fetchText(url)) } })
  const f400 = await dohFails(async () => ({ status: 400, text: '<html>' }))
  check('a resolver that answers HTTP 400 is named in each view, and the system\'s address is still probed', ['public-v4', 'view-west-v4', 'view-east-v4'].every(k => /^doh 8\.8\.8\.8( ecs \S+)? HTTP-400 \d+ms$/.test(viewOf(f400.line, k) ?? '')) && /^51\.81\.167\.44:443 .* from system$/.test(tlsOf(f400.line) ?? '') && keysIn(f400.line).length === LINE_KEYS.length, f400.line)
  const fNet = await dohFails(async () => { throw new TypeError('fetch failed', { cause: err('connect ETIMEDOUT 8.8.8.8:443', { code: 'ETIMEDOUT', syscall: 'connect' }) }) })
  check('a resolver that cannot be reached is named by its cause, not by "fetch failed"', /^doh 8\.8\.8\.8 ETIMEDOUT \d+ms$/.test(viewOf(fNet.line, 'public-v4') ?? ''), viewOf(fNet.line, 'public-v4'))
  const fNx = await dohFails(async () => ({ status: 200, text: DOH.nxdomain.body }))
  check('a resolver that says NXDOMAIN is named, and a body that is not JSON is named', /^doh 8\.8\.8\.8 NXDOMAIN \d+ms$/.test(viewOf(fNx.line, 'public-v4') ?? '') && /^doh 8\.8\.8\.8 not-JSON \d+ms$/.test(viewOf((await dohFails(async () => ({ status: 200, text: 'x' }))).line, 'public-v4') ?? ''))

  // A call that never answers is cut at its own bound, so the handshakes do not wait for the budget behind it.
  const keepDoh = BOUNDS.dohMs
  BOUNDS.dohMs = 150
  const tHung = Date.now()
  let fHung
  try { fHung = await dohFails(() => new Promise(() => {})) } finally { BOUNDS.dohMs = keepDoh }
  check('a resolver that never answers is named at its bound, the handshake to the system\'s address still runs, and the whole waits for no more', ['public-v4', 'view-west-v4', 'view-east-v4'].every(k => /^doh 8\.8\.8\.8( ecs \S+)? no-answer-in-150ms \d+ms$/.test(viewOf(fHung.line, k) ?? '')) && /^51\.81\.167\.44:443 no-tls-in-3000ms \(tcp 12ms\) from system$/.test(tlsOf(fHung.line) ?? '') && Date.now() - tHung < 1500, `${Date.now() - tHung}ms ${fHung.line.slice(0, 160)}`)

  // The lookups and the views start together; the connects do not wait for the views. Each is a latch, not a clock: the thing waited for can only happen if the other has started.
  let markDoh
  const dohStarted = new Promise(r => { markDoh = r })
  let sawDohWhileDnsWaited = null
  await askFacts({ host: 'h.example', env: envOk, deps: { ...westRed,
    lookup: async (h, o) => { if (sawDohWhileDnsWaited === null) sawDohWhileDnsWaited = await withinMs(dohStarted, 500); return westRed.lookup(h, o) },
    fetchText: async url => { if (url.startsWith(DOH_BASE)) markDoh(); return westRed.fetchText(url) } } })
  check('the lookups and the views start together: a view had started while the lookup waited for one', sawDohWhileDnsWaited === true, String(sawDohWhileDnsWaited))
  let markConnect
  const connectStarted = new Promise(r => { markConnect = r })
  BOUNDS.dohMs = 400
  let indep
  try { indep = await askFacts({ host: 'h.example', env: envOk, deps: { ...westRed, connect: async () => { markConnect(); return { ok: true, ms: 5 } },
    fetchText: async url => { if (url.startsWith(DOH_BASE)) { await connectStarted; return dohAnswer(url) } return healthy.fetchText(url) } } }) } finally { BOUNDS.dohMs = keepDoh }
  check('the connects do not wait for the views: every view answered, though each waited for a connect to start', ['public-v4', 'view-west-v4', 'view-east-v4'].every(k => /^doh 8\.8\.8\.8( ecs \S+)? ok /.test(viewOf(indep.line, k) ?? '')), indep.line.slice(0, 300))

  // More addresses than the cap: the first ones in the order seen are probed, the rest counted, and the total is the union's.
  const nine = Array.from({ length: 9 }, (_, i) => ({ address: `10.0.0.${i + 1}`, family: 4 }))
  const capHosts = []
  const capped = await askFacts({ host: 'h.example', env: envOk, deps: { ...healthy, lookup: async (_h, { family }) => (family === 4 ? nine : []), tlsConnect: async a => { capHosts.push(a.host); return { ok: true, tcpMs: 1, tlsMs: 2 } } } })
  check('nine system addresses and two more from the views: six are probed, the first six, and five are counted', capHosts.join() === nine.slice(0, 6).map(a => a.address).join() && / ; \+5 not probed$/.test(tlsOf(capped.line) ?? '') && JSON.stringify(capped.addresses) === '{"found":11,"probed":6,"settled":6}', `${capHosts.join()} ${tlsOf(capped.line)?.slice(-40)} ${JSON.stringify(capped.addresses)}`)

  // A handshake that never returns, and one that throws.
  const hungTls = await askFacts({ host: 'h.example', env: envOk, budgetMs: 300, deps: { ...westRed, tlsConnect: () => new Promise(() => {}) } })
  check('a handshake that never returns is named unfinished at the budget, is not a verdict, and the other keys are kept', /^51\.81\.167\.44:443 unreadable \(not finished in 300ms\) from system,public,west ; 167\.114\.211\.86:443 unreadable \(not finished in 300ms\) from east$/.test(tlsOf(hungTls.line) ?? '') && JSON.stringify(hungTls.addresses) === '{"found":2,"probed":2,"settled":0}' && keysIn(hungTls.line).length === LINE_KEYS.length && /connect-v4=\S+ ok /.test(hungTls.line), `${tlsOf(hungTls.line)} ${JSON.stringify(hungTls.addresses)}`)
  const throwsSync = await askFacts({ host: 'h.example', env: envOk, deps: { ...westRed, tlsConnect: () => { throw err('sync', { code: 'EBOOM' }) } } })
  const throwsAsync = await askFacts({ host: 'h.example', env: envOk, deps: { ...westRed, tlsConnect: async () => { throw new Error('async') } } })
  check('a handshake dependency that throws, synchronously or not, is named by its code and is not a verdict', / unreadable \(EBOOM\) from /.test(tlsOf(throwsSync.line) ?? '') && / unreadable \(Error\) from /.test(tlsOf(throwsAsync.line) ?? '') && throwsSync.addresses.settled === 0 && throwsAsync.addresses.settled === 0 && keysIn(throwsSync.line).length === LINE_KEYS.length, `${tlsOf(throwsSync.line)} | ${tlsOf(throwsAsync.line)}`)
  const noSources = await askFacts({ host: 'h.example', env: envOk, deps: { ...westRed, lookup: async () => { throw err('getaddrinfo ENOTFOUND', { code: 'ENOTFOUND' }) }, fetchText: async url => (url.startsWith(DOH_BASE) ? { status: 200, text: DOH.nxdomain.body } : healthy.fetchText(url)) } })
  check('no source naming an address says so, and counts none: found 0 is a measurement, not an unknown', tlsOf(noSources.line) === 'none (no address from any source)' && JSON.stringify(noSources.addresses) === '{"found":0,"probed":0,"settled":0}', `${tlsOf(noSources.line)} ${JSON.stringify(noSources.addresses)}`)
  BOUNDS.dohMs = 250
  let unknownFound
  try { unknownFound = await askFacts({ host: 'h.example', env: envOk, budgetMs: 200, deps: { ...healthy, fetchText: () => new Promise(() => {}) } }) } finally { BOUNDS.dohMs = keepDoh }
  check('sources that had not all answered at the budget leave the total unknown, and tls= says it is unfinished', unknownFound.addresses.found === undefined && /^unreadable \(not finished in 200ms\)$/.test(tlsOf(unknownFound.line) ?? '') && /public-v4=unreadable \(not finished in 200ms\)/.test(unknownFound.line), `${JSON.stringify(unknownFound.addresses)} ${tlsOf(unknownFound.line)}`)

  // ── makeTlsConnect itself, on loopback: the shapes it has to tell apart (the real network's are the runner's, in Task 5). ──
  const held = []
  const loopServers = []
  const listen = server => new Promise(r => { server.listen(0, '127.0.0.1', () => r(server.address().port)) })
  const tlsc = makeTlsConnect()
  const loopbackPlanned = 7
  let loopbackRan = 0
  const silentTcp = net.createServer(s => held.push(s)); loopServers.push(silentTcp)
  const rSilentTls = await tlsc({ host: '127.0.0.1', port: await listen(silentTcp), timeoutMs: 300 }); loopbackRan++
  check('REAL loopback, a listener that accepts and says nothing: the connect completed and no handshake did, and the verdict says so', rSilentTls.ok === false && rSilentTls.code === 'no-tls-in-300ms' && typeof rSilentTls.tcpMs === 'number' && /^no-tls-in-300ms \(tcp \d+ms\)$/.test(tlsVerdict(rSilentTls)), JSON.stringify(rSilentTls))
  const rClosedTls = await tlsc({ host: '127.0.0.1', port: await closedPort(), timeoutMs: 1000 }); loopbackRan++
  check('REAL loopback, a closed port: ECONNREFUSED, and the connect did not complete', rClosedTls.ok === false && rClosedTls.code === 'ECONNREFUSED' && rClosedTls.tcpMs === undefined && tlsVerdict(rClosedTls) === 'ECONNREFUSED (tcp not completed)', JSON.stringify(rClosedTls))
  // The one shape that needs no listener: tls.connect throws before any connect, and that must come back as a named failure.
  const rBadPort = await tlsc({ host: '127.0.0.1', port: 70000, timeoutMs: 1000 }); loopbackRan++
  check('REAL makeTlsConnect, a port out of range: tls.connect throws before any connect, and that is a named failure and not a completed handshake', rBadPort.ok === false && rBadPort.code === 'ERR_SOCKET_BAD_PORT' && rBadPort.tcpMs === undefined && tlsVerdict(rBadPort) === 'ERR_SOCKET_BAD_PORT (tcp not completed)', JSON.stringify(rBadPort))
  const plainTcp = net.createServer(s => { held.push(s); s.on('error', () => {}); s.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n') }); loopServers.push(plainTcp)
  const rNotTls = await tlsc({ host: '127.0.0.1', port: await listen(plainTcp), timeoutMs: 2000 }); loopbackRan++
  check('REAL loopback, a listener that answers in bytes that are not TLS: the connect completed and the handshake failed with a code, not by the clock', rNotTls.ok === false && typeof rNotTls.tcpMs === 'number' && settledTls(rNotTls) && !/^no-/.test(rNotTls.code), JSON.stringify(rNotTls))
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-tls-'))
  try {
    const gen = spawnSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(certDir, 'k.pem'), '-out', path.join(certDir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { encoding: 'utf8' })
    check('openssl is installed: the three TLS-server shapes below need a certificate made for the test, and without one they are not run', gen.status === 0, `exit ${gen.status}, ${String(gen.error?.code ?? gen.stderr).slice(0, 120)}`)
    if (gen.status === 0) {
      const key = fs.readFileSync(path.join(certDir, 'k.pem'))
      const cert = fs.readFileSync(path.join(certDir, 'c.pem'))
      // What the server was sent is read where the ClientHello is processed (ALPNCallback gets the SNI name and the offered protocols), not after the handshake: the client closes the moment it is done, and a
      // server-side `secureConnection` may then never fire (the first version of this check waited for it and saw nothing).
      let clientHello = null
      const tlsServer = tls.createServer({ key, cert, ALPNCallback: ({ servername, protocols }) => { clientHello = { sni: servername, offered: protocols }; return protocols.includes('http/1.1') ? 'http/1.1' : undefined } }, s => { s.on('error', () => {}); s.end() }); loopServers.push(tlsServer)
      const tlsPort = await listen(tlsServer)
      const rTlsOk = await makeTlsConnect({ ca: cert })({ host: '127.0.0.1', port: tlsPort, servername: 'localhost', timeoutMs: 3000 }); loopbackRan++
      check('REAL TLS on loopback: the handshake completes with both times, and the server was sent the name as SNI and exactly http/1.1 as ALPN', rTlsOk.ok === true && typeof rTlsOk.tcpMs === 'number' && typeof rTlsOk.tlsMs === 'number' && clientHello?.sni === 'localhost' && JSON.stringify(clientHello?.offered) === '["http/1.1"]', JSON.stringify({ rTlsOk, clientHello }))
      const rNoCa = await makeTlsConnect()({ host: '127.0.0.1', port: tlsPort, servername: 'localhost', timeoutMs: 3000 }); loopbackRan++
      check('REAL TLS on loopback, a certificate nobody vouched for: refused by its code after the connect completed', rNoCa.ok === false && /^(DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN)$/.test(rNoCa.code) && typeof rNoCa.tcpMs === 'number' && /^\S+ \(tcp \d+ms, failed after \d+ms\)$/.test(tlsVerdict(rNoCa)), `${JSON.stringify(rNoCa)} ${tlsVerdict(rNoCa)}`)
      const rWrongName = await makeTlsConnect({ ca: cert })({ host: '127.0.0.1', port: tlsPort, servername: 'wrong.example', timeoutMs: 3000 }); loopbackRan++
      check('REAL TLS on loopback, the certificate is checked against the NAME given and not the address: another name is refused', rWrongName.ok === false && rWrongName.code === 'ERR_TLS_CERT_ALTNAME_INVALID' && typeof rWrongName.tcpMs === 'number', JSON.stringify(rWrongName))
    }
  } finally {
    for (const s of held) s.destroy()
    for (const s of loopServers) s.close()
    fs.rmSync(certDir, { recursive: true, force: true })
  }

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
  const noTlsKey = judgeE2E(realRun(chipText(line.replace(/ \| tls=[^|]*/, ''))), 1)
  check('a description without tls= is incomplete, and names tls=', noTlsKey.verdict === 'incomplete' && /lacks: tls=$/.test(noTlsKey.detail), JSON.stringify(noTlsKey).slice(0, 300))
  const lookalike = judgeE2E(realRun(chipText(line.replace(' | tls=', ' | xtls='))), 1)
  check('a key that only ends in tls= is not tls=', lookalike.verdict === 'incomplete' && /lacks: tls=$/.test(lookalike.detail), JSON.stringify(lookalike).slice(0, 300))
  // The artifact's excerpt is the failing line clipped at 1800 characters. The description sits behind the page's own text (333 characters in the committed artifact of 2026-11-14) and ahead of a long list of venues,
  // so a description that grew past what is left would lose its LAST key, `runner=`, and the artifact would still say observed. This is the longest real one: the end-to-end fault's three addresses, every source answering.
  const fault = await ask({ host: 'api.open-meteo.com', error: hang, env: envOk, deps: { ...westRed, lookup: async (_h, { family }) => { if (family === 6) throw err('getaddrinfo ENOTFOUND', { code: 'ENOTFOUND' }); return [{ address: '192.0.2.1', family: 4 }] },
    tlsConnect: async a => (a.host === '192.0.2.1' ? { ok: false, code: 'no-connect-in-3000ms' } : westRed.tlsConnect(a)) } })
  const behind = judgeE2E(realRun(`${'p'.repeat(400)} ${fault} (Node's own network stack at that later moment, not Chromium's). ${'v'.repeat(3000)}`), 1)
  check('the excerpt keeps the whole description, to its last key, behind 400 characters of the page\'s own text', behind.verdict === 'observed' && behind.excerpt.some(l => l.includes(fault)) && fault.endsWith('cloud Azure'), `${fault.length} characters of description; excerpt lines ${behind.excerpt.map(l => l.length).join(',')}`)
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

  // Rule 91: the denominator is printed with the claim. These are the descriptions built above, not "every branch".
  const described = [line, noV6, garbage, wrongFamily, throwing, stuck, red.line, lit.line, f400.line, fNet.line, fHung.line, indep.line, capped.line, hungTls.line, throwsSync.line, noSources.line, unknownFound.line, fault]
  const complete = described.filter(l => keysIn(l).length === LINE_KEYS.length).length
  check('every description built above carries every key', complete === described.length, `${complete} of ${described.length}`)
  console.log(`checked ${complete} of ${described.length} described lines for all ${LINE_KEYS.length} keys`)
  console.log(`checked ${loopbackRan} of ${loopbackPlanned} loopback TLS shapes`)
  finish(summarize())
}
