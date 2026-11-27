// The Live now line, on the DEPLOYED page, against the relay's own live feeds read in the same minute.
// docs/CC-CMD-2026-11-26-single-page-composition.md, Task 6b done condition; outbox/cc-session-2026-11-26-live-now-line.md ("Not verified").
// CI-as-proxy: the authoring sandbox cannot reach *.workers.dev. A real Chromium against the live page; a manifest of counts and booleans, not prose.
//
// WHAT IT ASKS. Does `#live-now` exist on the deployed page (NOT-DEPLOYED if not), and does the tennis count it shows equal the number of `status:"live"`
// rows the relay serves? The relay is read BEFORE and AFTER the page read, and the page agrees if it equals EITHER reading: both feeds are cached 25 s and
// a match can end between the two reads, so one reading would call a true page wrong.
// WHAT IT DOES NOT ASK. Whether the BSD soccer feed agrees: it is reported and compared the same way, but a soccer game's end is not a tennis match's end, and
// the verdict names both separately. Not asked: golf, the draw, staleness.
//
// Usage: node scripts/live-now-deployed-probe.mjs --self-test
//        URL=https://field-laboratory.jeffunglesbee.workers.dev node scripts/live-now-deployed-probe.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

/** The count the page shows for one source: a number, 'unknown', 'not read yet', or null (the source is not in the line at all). Pure. */
export const pageCount = (text, source) => {
  const m = (text ?? '').match(new RegExp(`${source}: (\\d+) live|${source}: (unknown)|${source}: (not read yet)`))
  if (!m) return null
  return m[1] !== undefined ? Number(m[1]) : (m[2] ?? m[3])
}

/** Live rows in a relay body. Tennis is a bare array with `status`; soccer is `{events:[...]}` with `status:"inprogress"`. Null when the body is not either shape. Pure. */
export const relayLive = (body, source) => {
  const rows = source === 'BSD tennis' ? (Array.isArray(body) ? body : null) : (body && Array.isArray(body.events) ? body.events : null)
  if (rows === null) return null
  return rows.filter(r => r && r.status === (source === 'BSD tennis' ? 'live' : 'inprogress')).length
}

/** One source's verdict. `before` and `after` are the relay's live counts around the page read. Pure. */
export const sourceVerdict = (shown, before, after) => {
  if (shown === null) return 'NOT-IN-LINE'
  if (shown === 'unknown' || shown === 'not read yet') return 'PAGE-' + String(shown).toUpperCase().replaceAll(' ', '-')
  if (before === null || after === null) return 'RELAY-UNREADABLE'
  return shown === before || shown === after ? 'AGREE' : 'DISAGREE'
}

/** The whole verdict. NOT-DEPLOYED when the line is absent; PASS only when BOTH sources agree. Pure. */
export const verdictOf = ({ present, tennis, soccer }) => {
  if (!present) return 'NOT-DEPLOYED'
  return tennis === 'AGREE' && soccer === 'AGREE' ? 'PASS' : 'NOT-PASS'
}

const selfTest = () => {
  const bad = []
  const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) bad.push(`${n}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`) }
  const line = 'Live now — scoreboard cards: 2 live · BSD tennis: 3 live · BSD soccer: unknown (the feed did not answer: x)'
  eq('count', pageCount(line, 'BSD tennis'), 3)
  eq('unknown', pageCount(line, 'BSD soccer'), 'unknown')
  eq('not read yet', pageCount('BSD tennis: not read yet', 'BSD tennis'), 'not read yet')
  eq('absent source', pageCount('scoreboard cards: 0 live', 'BSD tennis'), null)
  eq('tennis rows', relayLive([{ status: 'live' }, { status: 'finished' }, { status: 'live' }], 'BSD tennis'), 2)
  eq('soccer rows', relayLive({ events: [{ status: 'inprogress' }, { status: 'finished' }] }, 'BSD soccer'), 1)
  eq('soccer wrong shape is null, not 0', relayLive([], 'BSD soccer'), null)
  eq('tennis wrong shape is null, not 0', relayLive({ events: [] }, 'BSD tennis'), null)
  eq('agree on the first reading', sourceVerdict(3, 3, 2), 'AGREE')
  eq('agree on the second reading', sourceVerdict(3, 4, 3), 'AGREE')
  eq('disagree', sourceVerdict(3, 4, 5), 'DISAGREE')
  eq('an unknown page is never AGREE', sourceVerdict('unknown', 3, 3), 'PAGE-UNKNOWN')
  eq('a source not read yet is never AGREE, and its verdict has no space in it', sourceVerdict('not read yet', 1, 1), 'PAGE-NOT-READ-YET')
  eq('an unreadable relay is never AGREE', sourceVerdict(3, null, null), 'RELAY-UNREADABLE')
  eq('a page that shows 0 when the relay says 0 agrees', sourceVerdict(0, 0, 0), 'AGREE')
  eq('absent line', verdictOf({ present: false, tennis: 'AGREE', soccer: 'AGREE' }), 'NOT-DEPLOYED')
  eq('both agree', verdictOf({ present: true, tennis: 'AGREE', soccer: 'AGREE' }), 'PASS')
  eq('one disagrees', verdictOf({ present: true, tennis: 'AGREE', soccer: 'DISAGREE' }), 'NOT-PASS')
  // Rule 90: a wrong expectation must be refused, or this self-test cannot fail.
  const n0 = bad.length; eq('MUST-FAIL', sourceVerdict(3, 4, 5), 'AGREE')
  if (bad.length === n0 + 1) bad.pop(); else bad.push('the deliberately wrong expectation was accepted')
  if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
  console.log('live-now-deployed-probe self-test: ok (the deliberately wrong expectation was refused)')
}

const readRelay = async path => {
  try { const r = await fetch(RELAY + path, { signal: AbortSignal.timeout(25000) }); return { status: r.status, body: await r.json() } }
  catch (e) { return { status: null, body: null, error: String(e && e.message || e) } }
}

const main = async () => {
  const URL = process.env.URL
  if (!URL) { console.error('URL is required'); process.exit(2) }
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e)))
  await page.goto(URL + '/', { waitUntil: 'load', timeout: 60000 })
  const present = (await page.$('#live-now')) !== null
  let text = null, kind = null
  const beforeT = await readRelay('/bsd/tennis/matches/live'), beforeS = await readRelay('/bsd/events/live')
  if (present) {
    // `data-kind` flips to polled on the FIRST answer, so wait until NO source is still "not read yet" (a feed that never answers is read as it stands after the timeout and reported, not waited on forever).
    await page.waitForFunction(() => { const e = document.getElementById('live-now'); return e.getAttribute('data-kind') === 'polled' && !/not read yet/.test(e.textContent) }, null, { timeout: 40000 }).catch(() => {})
    ;({ text, kind } = await page.$eval('#live-now', e => ({ text: e.textContent, kind: e.getAttribute('data-kind') })))
  }
  const afterT = await readRelay('/bsd/tennis/matches/live'), afterS = await readRelay('/bsd/events/live')
  await page.screenshot({ path: 'outbox/live-now-deployed-latest.png' })
  await browser.close()
  const sources = {
    'BSD tennis': { shown: pageCount(text, 'BSD tennis'), relayBefore: relayLive(beforeT.body, 'BSD tennis'), relayAfter: relayLive(afterT.body, 'BSD tennis') },
    'BSD soccer': { shown: pageCount(text, 'BSD soccer'), relayBefore: relayLive(beforeS.body, 'BSD soccer'), relayAfter: relayLive(afterS.body, 'BSD soccer') },
  }
  for (const s of Object.values(sources)) s.verdict = sourceVerdict(s.shown, s.relayBefore, s.relayAfter)
  const verdict = verdictOf({ present, tennis: sources['BSD tennis'].verdict, soccer: sources['BSD soccer'].verdict })
  const manifest = { generated_at: new Date().toISOString(), page: URL, liveNowPresent: present, kind, text, sources, pageErrors,
    coverage: 'checked 2 of 2 BSD sources in the line (tennis, soccer); NOT checked: the scoreboard-card count, golf, the draw, staleness', verdict }
  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/live-now-deployed-manifest-latest.json', JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify(manifest, null, 2))
  console.log(`verdict: ${verdict}`)
  process.exit(verdict === 'PASS' ? 0 : 1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else main().catch(e => { console.error(e); process.exit(1) })
}
