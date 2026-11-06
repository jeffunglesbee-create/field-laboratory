// Closes the network for the process it is loaded into, and for every node process that one starts.
//
//   NODE_OPTIONS="--import file:///…/scripts/no-network-preload.mjs" node scripts/some-script.mjs
//
// `network-exempt-check.mjs` loads it to RUN what `row-confidence.mjs` only reads. The scorer exempts three row scripts from the network half of its scan because they fetch only behind a flag the
// row does not pass (and one sanctioned wait); that is a claim about what the scripts DO, and reading cannot prove it. With this loaded, a script that reaches for the network is stopped at the
// first attempt, and the attempt is written down.
//
//   NO_NETWORK_MARK   a file. Every attempt appends one line, `<client> <target>`, before anything else happens. Unset, nothing is written.
//   NO_NETWORK_MODE   `exit` (the default): the first attempt ends the process with code 97, so no later code can swallow it and a row that passes BECAUSE a script died still leaves the mark.
//                     `record`: the attempt is written down and refused (fetch rejects, a builtin throws) and the process goes on, so one run shows every attempt it makes.
//
// What it closes: `fetch`, `WebSocket`, `http.request|get`, `https.request|get`, `http2.connect`, `net.connect|createConnection`, `tls.connect`; the named imports of those too (`syncBuiltinESMExports`).
// What it does not: a child process that is not node (`curl`, `gh`, `dotnet restore`), `dns`, `dgram`, and anything a native addon opens. The scorer's own scan lists the same limits.
import { appendFileSync } from 'node:fs'
import http from 'node:http'
import http2 from 'node:http2'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import tls from 'node:tls'

const MARK = process.env.NO_NETWORK_MARK
const RECORD = process.env.NO_NETWORK_MODE === 'record'

/** What an attempt was aimed at, on one line: a URL, a Request, the options of a request, or a port and a host. */
const targetOf = (first, second) => {
  const t = first === null || first === undefined ? '(none)'
    : typeof first === 'string' ? first
      : typeof first === 'number' ? `${typeof second === 'string' ? second : 'localhost'}:${first}`
        : first.href ?? first.url ?? `${first.protocol ?? ''}//${first.hostname ?? first.host ?? ''}:${first.port ?? ''}${first.path ?? ''}`
  return String(t).replace(/\s+/g, '_').slice(0, 200)
}

const refuse = (client, first, second) => {
  if (MARK) appendFileSync(MARK, `${client} ${targetOf(first, second)}\n`)
  if (!RECORD) process.exit(97)
  throw new Error(`no-network-preload: ${client} refused`)
}

globalThis.fetch = async (input) => refuse('fetch', input)
if (typeof globalThis.WebSocket === 'function') {
  globalThis.WebSocket = class { constructor(url) { refuse('WebSocket', url) } }
}
for (const [name, mod, members] of [['http', http, ['request', 'get']], ['https', https, ['request', 'get']], ['http2', http2, ['connect']], ['net', net, ['connect', 'createConnection']], ['tls', tls, ['connect']]]) {
  for (const member of members) mod[member] = (...args) => refuse(`${name}.${member}`, args[0], args[1])
}
syncBuiltinESMExports()
