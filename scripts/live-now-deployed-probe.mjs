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

/** The sorted distinct tournament ids with a live match in a tennis body (null when it is not a bare array). Pure. */
export const relayLiveTournaments = body =>
  Array.isArray(body) ? [...new Set(body.filter(r => r && r.status === 'live' && r.tournament && Number.isInteger(r.tournament.id)).map(r => r.tournament.id))].sort((a, b) => a - b) : null

/** The sorted tournament ids the page links to, from the hrefs of `#live-now-draws a` (`...?draw=<id>&tab=draw`). Pure. */
export const pageLinkIds = hrefs => [...new Set((hrefs ?? []).map(h => (String(h).match(/[?&]draw=(\d+)/) ?? [])[1]).filter(Boolean).map(Number))].sort((a, b) => a - b)

/** The links' verdict: the page's linked ids equal the relay's live tournament ids on EITHER reading around the page read. Pure. */
export const linksVerdict = (linked, before, after) => {
  if (before === null || after === null) return 'RELAY-UNREADABLE'
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  return same(linked, before) || same(linked, after) ? 'AGREE' : 'DISAGREE'
}

/** Live matches of one tournament in a tennis body (null when it is not a bare array). Pure. */
export const relayLiveOf = (body, tid) =>
  Array.isArray(body) ? body.filter(r => r && r.status === 'live' && r.tournament && r.tournament.id === tid).length : null

/** One draw page's verdict. `panel` is what the page's #panel-draw said; `before`/`after` are the relay's live-match counts for that tournament around the read. Pure.
 *  Live: the panel must say live AND its sentence must carry a count equal to either reading. Not live: the panel must say not-live. */
export const drawPageVerdict = ({ panel, before, after }) => {
  if (!panel || !panel.loaded) return 'DRAW-NOT-LOADED'
  if (panel.live === null || panel.live === undefined) return 'NO-LIVENESS-LINE'
  if (before === null || after === null) return 'RELAY-UNREADABLE'
  const expectLive = before > 0 || after > 0
  if (!expectLive) return panel.live === 'not-live' ? 'AGREE' : 'DISAGREE'
  if (panel.live !== 'live') return 'DISAGREE'
  const n = Number((String(panel.line ?? '').match(/^Live now: (\d+) match/) ?? [])[1])
  return n === before || n === after ? 'AGREE' : 'DISAGREE'
}

/** One source's verdict. `before` and `after` are the relay's live counts around the page read. Pure. */
export const sourceVerdict = (shown, before, after) => {
  if (shown === null) return 'NOT-IN-LINE'
  if (shown === 'unknown' || shown === 'not read yet') return 'PAGE-' + String(shown).toUpperCase().replaceAll(' ', '-')
  if (before === null || after === null) return 'RELAY-UNREADABLE'
  return shown === before || shown === after ? 'AGREE' : 'DISAGREE'
}

/** The whole verdict. NOT-DEPLOYED when the line is absent; PASS only when BOTH sources, the draw links AND both draw pages (a live tournament, and a control with none in play) agree. Pure. */
export const verdictOf = ({ present, tennis, soccer, draws, drawLive, drawControl }) => {
  if (!present) return 'NOT-DEPLOYED'
  return [tennis, soccer, draws, drawLive, drawControl].every(v => v === 'AGREE') ? 'PASS' : 'NOT-PASS'
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
  eq('absent line', verdictOf({ present: false, tennis: 'AGREE', soccer: 'AGREE', draws: 'AGREE', drawLive: 'AGREE', drawControl: 'AGREE' }), 'NOT-DEPLOYED')
  eq('all three agree', verdictOf({ present: true, tennis: 'AGREE', soccer: 'AGREE', draws: 'AGREE', drawLive: 'AGREE', drawControl: 'AGREE' }), 'PASS')
  eq('a draw page that did not load is NOT-PASS', verdictOf({ present: true, tennis: 'AGREE', soccer: 'AGREE', draws: 'AGREE', drawLive: 'DRAW-NOT-LOADED', drawControl: 'AGREE' }), 'NOT-PASS')
  eq('a missing control page is NOT-PASS', verdictOf({ present: true, tennis: 'AGREE', soccer: 'AGREE', draws: 'AGREE', drawLive: 'AGREE', drawControl: undefined }), 'NOT-PASS')
  eq('relay live matches of one tournament', relayLiveOf([{ status: 'live', tournament: { id: 897 } }, { status: 'live', tournament: { id: 897 } }, { status: 'live', tournament: { id: 898 } }, { status: 'finished', tournament: { id: 897 } }], 897), 2)
  eq('a non-array body has no per-tournament count, not zero', relayLiveOf({ events: [] }, 897), null)
  const livePanel = { loaded: true, live: 'live', line: 'Live now: 2 matches of this tournament in play (BSD tennis)' }
  eq('a live draw page agrees when its count equals the relay', drawPageVerdict({ panel: livePanel, before: 2, after: 2 }), 'AGREE')
  eq('...or equals either reading', drawPageVerdict({ panel: livePanel, before: 3, after: 2 }), 'AGREE')
  eq('...and disagrees when it equals neither', drawPageVerdict({ panel: livePanel, before: 1, after: 1 }), 'DISAGREE')
  eq('a panel that says not-live while the relay has live matches disagrees', drawPageVerdict({ panel: { loaded: true, live: 'not-live', line: 'Not live now' }, before: 2, after: 2 }), 'DISAGREE')
  eq('a control with no live matches agrees when the panel says not-live', drawPageVerdict({ panel: { loaded: true, live: 'not-live', line: 'Not live now' }, before: 0, after: 0 }), 'AGREE')
  eq('a control the panel calls live disagrees', drawPageVerdict({ panel: { loaded: true, live: 'live', line: 'Live now: 1 match' }, before: 0, after: 0 }), 'DISAGREE')
  eq('a panel that never drew is DRAW-NOT-LOADED', drawPageVerdict({ panel: { loaded: false }, before: 2, after: 2 }), 'DRAW-NOT-LOADED')
  eq('a drawn panel with no liveness line is named, not guessed', drawPageVerdict({ panel: { loaded: true, live: null }, before: 2, after: 2 }), 'NO-LIVENESS-LINE')
  eq('one disagrees', verdictOf({ present: true, tennis: 'AGREE', soccer: 'DISAGREE', draws: 'AGREE', drawLive: 'AGREE', drawControl: 'AGREE' }), 'NOT-PASS')
  eq('the draw links disagreeing alone is NOT-PASS', verdictOf({ present: true, tennis: 'AGREE', soccer: 'AGREE', draws: 'DISAGREE', drawLive: 'AGREE', drawControl: 'AGREE' }), 'NOT-PASS')
  eq('relay live tournaments are sorted and distinct', relayLiveTournaments([{ status: 'live', tournament: { id: 904 } }, { status: 'live', tournament: { id: 215 } }, { status: 'live', tournament: { id: 904 } }, { status: 'finished', tournament: { id: 7 } }]), [215, 904])
  eq('a non-array tennis body has no tournaments, not an empty list', relayLiveTournaments({ events: [] }), null)
  eq('link ids come from the hrefs', pageLinkIds(['/?draw=904&tab=draw', '/x/?draw=215&tab=draw', '/?draw=904&tab=draw']), [215, 904])
  eq('no links is an empty list', pageLinkIds([]), [])
  eq('links agree on the first reading', linksVerdict([215, 904], [215, 904], [904]), 'AGREE')
  eq('links agree on the second reading', linksVerdict([904], [215, 904], [904]), 'AGREE')
  eq('links that match neither reading disagree', linksVerdict([904], [215, 904], [215]), 'DISAGREE')
  eq('an unreadable relay is never AGREE for the links', linksVerdict([904], null, [904]), 'RELAY-UNREADABLE')
  eq('no links and no live tournaments agree', linksVerdict([], [], []), 'AGREE')
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
  // THE DRAW PAGES. One for a tournament the relay says is in play (the lowest live id, found now), one control that the relay says has nothing in play: Roland Garros 2026,
  // id 77, a finished draw. Each is a real page load of `?draw=<id>&tab=draw`; nothing is mocked.
  const liveIds = relayLiveTournaments(afterT.body) ?? []
  const readDrawPage = async tid => {
    if (tid === undefined) return { tid: null, panel: { loaded: false }, note: 'no tournament has a live match at this moment' }
    const pg = await browser.newPage({ viewport: { width: 1000, height: 900 } })
    const errs = []
    pg.on('pageerror', e => errs.push(String(e)))
    const before = relayLiveOf((await readRelay('/bsd/tennis/matches/live')).body, tid)
    await pg.goto(`${URL}/?draw=${tid}${tid === 77 ? '&season=2026' : ''}&tab=draw`, { waitUntil: 'load', timeout: 60000 })
    await pg.waitForSelector('#panel-draw .dv-head', { timeout: 45000 }).catch(() => {})
    await pg.waitForFunction(() => document.getElementById('panel-draw').getAttribute('data-live') !== null, null, { timeout: 45000 }).catch(() => {})
    const panel = await pg.$eval('#panel-draw', e => ({ loaded: e.querySelector('.dv-head') !== null, live: e.getAttribute('data-live'), collapse: e.getAttribute('data-collapse'),
      finished: e.getAttribute('data-finished') !== null, line: (e.querySelector('.dv-live') || {}).textContent ?? null, title: (e.querySelector('.dv-head__title') || {}).textContent ?? null,
      head: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 220) }))
    const after = relayLiveOf((await readRelay('/bsd/tennis/matches/live')).body, tid)
    await pg.close()
    return { tid, relayBefore: before, relayAfter: after, panel, pageErrors: errs, verdict: drawPageVerdict({ panel, before, after }) }
  }
  const drawLive = await readDrawPage(liveIds[0])
  const drawControl = liveIds.includes(77) ? { tid: 77, panel: { loaded: false }, note: 'the control tournament is itself live: not a control', verdict: 'NOT-A-CONTROL' } : await readDrawPage(77)
  const linkHrefs = present ? await page.$$eval('#live-now-draws a', as => as.map(a => a.getAttribute('href'))) : []
  await page.screenshot({ path: 'outbox/live-now-deployed-latest.png' })
  await browser.close()
  const sources = {
    'BSD tennis': { shown: pageCount(text, 'BSD tennis'), relayBefore: relayLive(beforeT.body, 'BSD tennis'), relayAfter: relayLive(afterT.body, 'BSD tennis') },
    'BSD soccer': { shown: pageCount(text, 'BSD soccer'), relayBefore: relayLive(beforeS.body, 'BSD soccer'), relayAfter: relayLive(afterS.body, 'BSD soccer') },
  }
  for (const s of Object.values(sources)) s.verdict = sourceVerdict(s.shown, s.relayBefore, s.relayAfter)
  const drawLinks = { linkedIds: pageLinkIds(linkHrefs), relayBefore: relayLiveTournaments(beforeT.body), relayAfter: relayLiveTournaments(afterT.body) }
  drawLinks.verdict = linksVerdict(drawLinks.linkedIds, drawLinks.relayBefore, drawLinks.relayAfter)
  const verdict = verdictOf({ present, tennis: sources['BSD tennis'].verdict, soccer: sources['BSD soccer'].verdict, draws: drawLinks.verdict, drawLive: drawLive.verdict, drawControl: drawControl.verdict })
  const manifest = { generated_at: new Date().toISOString(), page: URL, liveNowPresent: present, kind, text, sources, drawLinks, drawLive, drawControl, pageErrors,
    coverage: 'checked 2 of 2 BSD sources in the line (tennis, soccer) and the live-tournament links against the relay; and two real draw pages (the lowest live tournament, and Roland Garros 2026 as a control with nothing in play); NOT checked: the scoreboard-card count, golf, staleness', verdict }
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
