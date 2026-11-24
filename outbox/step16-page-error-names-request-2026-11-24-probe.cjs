// Premise behind scripts/schedule-live-check.mjs's describeConsoleError (Rule 100):
// for a "Failed to load resource" console error, does Playwright's ConsoleMessage.location().url
// name the request that failed, and is it NOT the request for the two shapes the helper leaves alone?
//
// Local servers only: the app, a third party that answers 429 (one path with CORS headers, one without,
// like Open-Meteo and like a host that sends none), and a port with nothing listening.
// Launches the way scripts/schedule-live-check.mjs does, so it reads the pin and the Chromium that
// script gets. Run from the repo root:   node outbox/step16-page-error-names-request-2026-11-24-probe.cjs
// Exit 0 when all seven expectations hold. The count is printed with the verdict (Rule 91).
const http = require('node:http')
const fs = require('node:fs')
const { chromium } = require('playwright')

const listen = (handler) => new Promise(res => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)) })

;(async () => {
  const third = await listen((req, res) => {
    const cors = req.url.startsWith('/with-cors')
    res.writeHead(429, { 'content-type': 'application/json', ...(cors ? { 'access-control-allow-origin': '*' } : {}) })
    res.end('{"error":true,"reason":"Too Many Requests"}')
  })
  const thirdPort = third.address().port
  const dead = await listen(() => {}); const deadPort = dead.address().port; await new Promise(r => dead.close(r))
  const app = await listen((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<!doctype html><button id="tab-stats"></button><script>
        fetch('http://127.0.0.1:${thirdPort}/with-cors/v1/forecast?latitude=1&longitude=2').catch(()=>{})
        fetch('http://127.0.0.1:${thirdPort}/no-cors/v1/forecast?latitude=3&longitude=4').catch(()=>{})
        fetch('/same-origin-429').catch(()=>{})
        fetch('http://127.0.0.1:${deadPort}/refused').catch(()=>{})
        console.error('app-level console.error call')
      </script>`)
    } else { res.writeHead(429); res.end('slow down') }
  })
  const appPort = app.address().port
  const page0 = `http://127.0.0.1:${appPort}/`

  const sessionChromium = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(fs.existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
  const page = await browser.newPage()
  const seen = []
  page.on('console', m => { if (m.type() === 'error') seen.push({ text: m.text(), url: m.location().url }) })
  await page.goto(page0, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await browser.close()
  for (const s of [app, third]) s.close()

  console.log('playwright', require('playwright/package.json').version, '| ports app', appPort, 'third', thirdPort, 'dead', deadPort)
  console.log(`checked ${seen.length} console error(s)`)
  for (const s of seen) console.log(JSON.stringify(s))
  console.log('')

  const FAILED = 'Failed to load resource'
  const failedAt = u => seen.filter(s => s.text.startsWith(FAILED) && s.url === u).length
  const expect = [
    ['a 429 with CORS headers is named by its URL', failedAt(`http://127.0.0.1:${thirdPort}/with-cors/v1/forecast?latitude=1&longitude=2`) === 1],
    ['a same-origin 429 is named by its URL', failedAt(`http://127.0.0.1:${appPort}/same-origin-429`) === 1],
    ['a refused connection is named by its URL', failedAt(`http://127.0.0.1:${deadPort}/refused`) === 1],
    ['a response with no CORS headers (net::ERR_FAILED) is named by its URL', failedAt(`http://127.0.0.1:${thirdPort}/no-cors/v1/forecast?latitude=3&longitude=4`) === 1],
    ['a CORS refusal names the request in its text', seen.some(s => /blocked by CORS policy/.test(s.text) && s.text.includes(`:${thirdPort}/no-cors/v1/forecast?latitude=3&longitude=4`))],
    ['a CORS refusal carries the PAGE as its location, not the request', seen.some(s => /blocked by CORS policy/.test(s.text) && s.url === page0)],
    ['an app-level console.error carries the page that called it as its location', seen.some(s => s.text === 'app-level console.error call' && s.url === page0)],
  ]
  for (const [name, ok] of expect) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  const bad = expect.filter(e => !e[1]).length
  console.log(`\nchecked ${expect.length} expectation(s): ${expect.length - bad} held, ${bad} did not`)
  process.exit(bad === 0 ? 0 : 1)
})().catch(e => { console.error('PROBE FAILED', e); process.exit(1) })
