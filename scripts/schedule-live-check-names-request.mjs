// Does step 16 name the request behind a page error, on the browser this job installed?
//
// scripts/schedule-live-check.mjs prints every page error it saw when its "no page errors"
// check fails. Chromium words a failed request "Failed to load resource: ... 429 ..." and
// puts the URL on the message's location, not in its text, so that script appends it
// (`describeConsoleError`, in scripts/console-error-text.mjs). The checks below come in two
// parts, in one tally.
//
// THE FIRST FIVE call that helper directly with strings and URLs typed by hand, which are a
// copy of what Playwright passes it. They need no browser, and they reach the shapes a stub
// page does not produce.
//
// THE REST run scripts/schedule-live-check.mjs, unmodified, against a stub page on 127.0.0.1
// that fires two requests answered 429 and one app-level console.error, and read what it
// printed. A real browser, the lab's pinned Playwright, the script's own handler: the only
// thing replaced is the page, which is the part that cannot be made to 429 on demand. This is
// the part that sees the handler pass the helper the wrong field or not call it at all, and
// the one reading on the Chromium revision the runner installs rather than the one the
// authoring sandbox has. Which mutation each part catches: outbox/step16-exit-drains-regression-2026-11-24.txt, section 6b.
//
// WHY IT RUNS WITHOUT THE DEPLOY. It reads a stub, not the deployed page, so nothing it
// asserts depends on what has been published. On 2026-11-24 a stuck deploy kept step 16
// itself from running on three consecutive live-check runs; this does not wait behind it.
//
// Usage:  node scripts/schedule-live-check-names-request.mjs [--script path/to/variant.mjs]
//         (--script is how the mutation matrix in the outbox points it at a broken copy)
import http from 'node:http'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createChecks, finish } from './checks.mjs'
import { describeConsoleError } from './console-error-text.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const at = process.argv.indexOf('--script')
const script = at > -1
  ? path.resolve(process.argv[at + 1])
  : path.resolve(here, 'schedule-live-check.mjs')

// The records row appears only AFTER both 429s have landed and a further 300 ms have passed,
// so the script's bounded wait for `.st-card [data-row="records"]` cannot return before the
// console messages exist. Without that delay the page is complete at DOMContentLoaded and
// the script could close the browser first.
const PAGE = `<!doctype html><meta charset="utf-8"><title>stub</title>
<button id="tab-stats">stats</button>
<div class="desk-card"></div>
<script>
  Promise.all([fetch('/stub-429?venue=a'), fetch('/stub-429?venue=b')]).then(() => {
    console.error('stub app error')
    setTimeout(() => {
      document.body.insertAdjacentHTML('beforeend',
        '<div class="st-card"><div class="st-row" data-row="records">' +
        '<span class="st-row__value">A: 10\\u20135, B: 4\\u201311</span></div></div>')
    }, 300)
  })
</script>`

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/stub-429')) { res.writeHead(429, { 'content-type': 'text/plain' }); return res.end('slow down') }
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end() }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(PAGE)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

// GITHUB_ACTIONS is blanked for the child: on a runner its `summarize()` prints every
// failure a second time as an ::error annotation, which would double the line counts below.
let exitCode = 0
let out = ''
try {
  const r = await promisify(execFile)(process.execPath, [script], {
    env: { ...process.env, URL: `${base}/`, GITHUB_ACTIONS: '' }, timeout: 90_000, maxBuffer: 1 << 22,
  })
  out = r.stdout + r.stderr
} catch (e) {
  exitCode = typeof e.code === 'number' ? e.code : 1
  out = (e.stdout || '') + (e.stderr || '')
}
server.close()

const lines = out.split('\n')
const detail = lines.filter(l => l.trimStart().startsWith('→'))
const naming = url => lines.filter(l => l.includes('status of 429') && l.includes(url))

console.log(`script under test: ${path.relative(process.cwd(), script) || script}`)
console.log('what it printed for the failing check:')
for (const l of detail) console.log(`  ${l.trim()}`)
console.log('')

const { check, summarize } = createChecks()

// The helper on its own, five cases. A refused request, a connection that never opened, a message
// with no URL, a CORS refusal and an app-level console.error: the last three are the shapes where
// appending a URL would be wrong or would dangle.
const FAILED = 'Failed to load resource: the server responded with a status of 429 (Too Many Requests)'
const REFUSED = 'Failed to load resource: net::ERR_CONNECTION_REFUSED'
const FORECAST = 'https://api.open-meteo.com/v1/forecast?latitude=40.8296&longitude=-73.9262'
const CORS = "Access to fetch at 'https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2' from origin " +
  "'https://field-laboratory.jeffunglesbee.workers.dev' has been blocked by CORS policy: No " +
  "'Access-Control-Allow-Origin' header is present on the requested resource."

check('a refused request is named by its URL, with Chromium\'s own words first',
  describeConsoleError(FAILED, FORECAST) === `${FAILED} — ${FORECAST}`,
  JSON.stringify(describeConsoleError(FAILED, FORECAST)))
check('a connection that never opened is named too',
  describeConsoleError(REFUSED, 'http://127.0.0.1:1/refused') === `${REFUSED} — http://127.0.0.1:1/refused`,
  JSON.stringify(describeConsoleError(REFUSED, 'http://127.0.0.1:1/refused')))
check('no URL on the message adds nothing, not a dangling dash',
  describeConsoleError(FAILED, '') === FAILED && describeConsoleError(FAILED, undefined) === FAILED,
  JSON.stringify([describeConsoleError(FAILED, ''), describeConsoleError(FAILED, undefined)]))
check('a CORS refusal names the request already, and its location is the PAGE: left alone',
  describeConsoleError(CORS, 'https://field-laboratory.jeffunglesbee.workers.dev/') === CORS,
  JSON.stringify(describeConsoleError(CORS, 'https://field-laboratory.jeffunglesbee.workers.dev/')))
check('an app-level console.error carries its script as location: left alone',
  describeConsoleError('stub app error', 'https://field-laboratory.jeffunglesbee.workers.dev/app.js') === 'stub app error',
  JSON.stringify(describeConsoleError('stub app error', 'https://field-laboratory.jeffunglesbee.workers.dev/app.js')))

check('the script failed, because the stub produces page errors',
  exitCode === 1 && out.includes('FAIL  no page errors during the schedule fetch'),
  `exit ${exitCode}`)
check('that was its ONLY failing check, so nothing else about the stub page drifted',
  lines.filter(l => l.startsWith('FAIL')).length === 1,
  `failing checks: ${JSON.stringify(lines.filter(l => l.startsWith('FAIL')))}`)
check('the first 429 is named by its URL',
  naming(`${base}/stub-429?venue=a`).length === 1,
  `lines naming it: ${naming(`${base}/stub-429?venue=a`).length}`)
check('the second 429 is named by its URL',
  naming(`${base}/stub-429?venue=b`).length === 1,
  `lines naming it: ${naming(`${base}/stub-429?venue=b`).length}`)
check("Chromium's own words come first on the line",
  detail.filter(l => /→\s+Failed to load resource: the server responded with a status of 429 \(Too Many Requests\)/.test(l)).length === 2,
  `detail lines: ${JSON.stringify(detail)}`)
check('an app-level console.error is printed as it was, with no URL added',
  detail.filter(l => /→\s+stub app error\s*$/.test(l)).length === 1,
  `detail lines: ${JSON.stringify(detail)}`)
check('exactly three page errors reach the check, none dropped or duplicated',
  detail.length === 3,
  `detail lines: ${detail.length}`)

finish(summarize())
