#!/usr/bin/env node
// The live-score poll is the laboratory's ONLY timer, and this is what says what its conditions are after the session that
// built it has ended.
//
// docs/CC-CMD-2026-11-11-soccer-live-scores.md. The owner ruled on 2026-11-11 "Auto-poll while a match is live". Every other
// surface of this page asks once and never again. Two of them have their own check that fails if a timer appears: the forecast
// (`check-forecast-pull-only.mjs`) and the lineups tab (`check-lineups-pull-only.mjs`). The weather has none: a weather timer
// would be caught only by claim 7 below, the one that says this is the only timer in `src/*.fs` (review 2026-11-11, S13: this
// header said all three had one). This one has a timer on purpose, so the claim is not "no timer" but "THIS timer, and only these
// conditions", and each condition is a scan of the F# source:
//
//   1. one region, marked, in src/Program.fs;
//   2. exactly ONE setInterval in it, and no other recurrence term (a timeout, an animation frame, a socket, an event source,
//      a listener, a Solid effect);
//   3. its period is `LiveScore.LivePollMs`, and that is 60000 (the arithmetic is in the CC-CMD, fact 6: each request costs the
//      relay one uncached BSD call whether or not a game is live, and the relay's own poller already makes up to 720 per key per 3 h);
//   4. a request only while the tab is visible, only for a key that has a card in its window (`liveKeysAt`), the timer stops
//      when no window is ahead (`liveWorkAheadAt`), one request per key at a time (`inFlight`), ONE fetch in the region;
//   5. none on a page pinned to a capture (`?data=`), which must not reach the network;
//   6. the timer is stopped when the slate is re-rendered (`disposePrevious`);
//   7. it is the ONLY timer in `src/*.fs`: no other setInterval, setTimeout or animation frame, no socket or event source.
//
// REVIEW 2026-11-11 (wf_584a08a5-824, poll lens and defence lens). This is a text scan and each claim below was shown to survive a one-line break the
// scan could not see: a timer whose id was never stored, one cleared by the wrong id, a period written `60000 / 4`, a sleep loop made with
// `Promise.sleep`, a raw `fetch`, an `online` listener. The BEHAVIOURS (one live timer across re-renders, the named period as the page really gives
// it, one request per key while one is unanswered, each league's cards told its own league's answer) are now observed by
// `scripts/live-score-render-check.mjs`, which wraps the page's own `setInterval`. What stays here is what a render cannot show: that nothing else
// in the source schedules or fetches, and that the named pieces are written.
//
// WHAT THIS CAN AND CANNOT SEE (Rule 91). It reads F# SOURCE, in the files printed at the end of every run, with comments
// removed by the shared scanner (so a comment that says "no timeout" is not read as one). It does not read `build/` or `public/`,
// and it cannot see a timer a called library arms on its own. It says THESE conditions are what is written; that the page
// holds to them in a browser is `scripts/live-score-render-check.mjs`, which counts the requests it makes.
//
// Usage: node scripts/check-live-score-poll.mjs [--self-test]

import { readFileSync, readdirSync } from 'node:fs'
import { createChecks, isMain, finish } from './checks.mjs'
import { RECURRENCE, codeOnly, sliceBetween } from './check-lineups-pull-only.mjs'

/** More than the shared recurrence terms: every other way F# in a browser schedules work, listens or reaches the network, none of which the lineups check
 *  needed to name. `tryFetchTextWithin` is the poll's ONE fetch and is counted separately; a bare `fetch`, `Fetch.` or the older request objects are not it. */
export const EXTRA_TERMS = [
  ['Promise.sleep', /\bPromise\.sleep\b/], ['Async.Sleep', /\bAsync\.Sleep\b/], ['requestIdleCallback', /\brequestIdleCallback\b/],
  ['queueMicrotask', /\bqueueMicrotask\b/], ['addEventListener', /\.addEventListener\b/], ['an on<event> handler', /\.on[a-z]+\s*<-/],
  ['fetch', /\bfetch\b/], ['Fetch.', /\bFetch\./], ['XMLHttpRequest', /\bXMLHttpRequest\b/], ['sendBeacon', /\bsendBeacon\b/],
]

export const PROGRAM = 'src/Program.fs'
export const LIVE_SCORE = 'src/LiveScore.fs'
export const FROM = '// ── live score poll: begin'
export const TO = '// ── live score poll: end'
export const PERIOD_MS = 60000

const count = (re, text) => (text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length

/** The region's text, or null when it is absent or its begin marker occurs more than once. */
export const regionOf = program =>
  program.split(FROM).length === 2 ? sliceBetween(program, FROM, TO) : null

/** Every claim, as { name, ok, detail }. Pure: it is handed the text of the files. */
export const claimsOf = ({ program, liveScore, sources }) => {
  const out = []
  const claim = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail })

  const region = regionOf(program)
  claim('the poll is one marked region of src/Program.fs', region !== null, region === null ? `markers "${FROM}" and "${TO}" not found exactly once` : '')
  const code = region === null ? '' : codeOnly(region)

  claim('the region holds exactly one setInterval', count(/\bwindow\.setInterval\b/, code) === 1 && count(/\bsetInterval\b/, code) === 1,
    `setInterval x${count(/\bsetInterval\b/, code)}`)
  const others = [...RECURRENCE.filter(([name]) => name !== 'setInterval' && name !== 'window.setInterval'), ...EXTRA_TERMS].filter(([, re]) => re.test(code)).map(([name]) => name)
  claim('...and no other recurrence or network term: no timeout, sleep, animation frame, idle callback, socket, event source, listener, handler, bare fetch or effect', others.length === 0, others.join(', '))
  claim('...and one clearInterval, in the stop function, given the id the timer was stored under',
    count(/\bwindow\.clearInterval\b/, code) === 1 && /let private stopLivePoll \(\) =[\s\S]*?\| Some id ->\s*window\.clearInterval id\b/.test(code) && /livePollTimer <- Some\(window\.setInterval\b/.test(code))

  // Anchored to the end of the line: `let LivePollMs = 60000 / 4` read as 60000 before (review S22). The delay the page really gives is observed by the render check.
  const period = (liveScore.match(/\[<Literal>\]\s*let LivePollMs\s*=\s*(\d+)[ \t]*(?:\r?\n|$)/) ?? [])[1]
  claim(`the period is LiveScore.LivePollMs and that is ${PERIOD_MS} ms`,
    /setInterval\s*\(\s*\(fun \(\) -> tick \(\)\)\s*,\s*LiveScore\.LivePollMs\s*\)/.test(code) && Number(period) === PERIOD_MS,
    `LivePollMs = ${period}; call: ${(code.match(/setInterval[^\n]*/) ?? ['none'])[0].trim()}`)

  claim('a request is made only while the tab is visible', /\(string document\?visibilityState\)\s*=\s*"visible"/.test(code))
  claim('...only for a key with a card to ask about (`liveKeysAt`), and an answer is told only the cards `answersTo` selects: the key\'s sport, in its window', /LiveScore\.liveKeysAt\b/.test(code) && /Seq\.filter \(fun h -> LiveScore\.answersTo key now h\.Game\)/.test(code))
  claim('...and the timer stops when no window is ahead', /LiveScore\.liveWorkAheadAt\b[\s\S]*?stopLivePoll \(\)/.test(code))
  claim('...one request per key at a time: a key is held by `if inFlight.Add key then` and released first thing in the answer callback',
    /if inFlight\.Add key then/.test(code) && /Promise\.iter \(fun result ->\s*\n\s*inFlight\.Remove key \|> ignore/.test(code) && count(/inFlight\.Remove key\b/, code) === 1)
  claim('...and one fetch in the region, with a deadline: `tryFetchTextWithin LiveScore.LivePollTimeoutMs`, and no fetch without one',
    count(/\btryFetchTextWithin LiveScore\.LivePollTimeoutMs\b/, code) === 1 && count(/\btryFetchText\b/, code) === 0 && count(/\btryFetchTextWithin\b/, code) === 1,
    `tryFetchTextWithin x${count(/\btryFetchTextWithin\b/, code)}, tryFetchText x${count(/\btryFetchText\b/, code)}`)
  const timeout = (liveScore.match(/\[<Literal>\]\s*let LivePollTimeoutMs\s*=\s*(\d+)[ \t]*(?:\r?\n|$)/) ?? [])[1]
  claim('...and the deadline is longer than the period (so the in-flight guard can hold a key across a tick) and at most three periods (the render check observes it)',
    Number(timeout) > PERIOD_MS && Number(timeout) <= 3 * PERIOD_MS, `LivePollTimeoutMs = ${timeout}, period ${PERIOD_MS}`)

  const outside = region === null ? codeOnly(program) : codeOnly(program.replace(region, ''))
  const calls = outside.split('\n').filter(l => /\bstartLivePoll\b/.test(l) && !/let private startLivePoll/.test(l))
  claim('a page pinned to a capture starts no poll: the one call is guarded by (queryParam "data").IsNone, and asks for the day of the cards just drawn (`payload.Date`)',
    calls.length === 1 && /\(queryParam "data"\)\.IsNone/.test(calls[0]) && /startLivePoll cardHandles\.Value payload\.Date\b/.test(calls[0]), JSON.stringify(calls))
  const dispose = (outside.match(/let private disposePrevious \(\) =[\s\S]*?\n\n/) ?? [''])[0]
  claim('re-rendering the slate stops the timer: disposePrevious calls stopLivePoll', /\bstopLivePoll \(\)/.test(dispose))

  const all = Object.entries(sources).map(([file, text]) => [file, codeOnly(text)])
  const timers = all.flatMap(([file, text]) => [...text.matchAll(/\b(setInterval|setTimeout|requestAnimationFrame|requestIdleCallback|Promise\.sleep|Async\.Sleep)\b/g)].map(m => `${file}: ${m[1]}`))
  claim('it is the only timer or sleep in src/*.fs', timers.length === 1 && timers[0].startsWith('src/Program.fs'), timers.join(' | '))
  const sockets = all.flatMap(([file, text]) => [...text.matchAll(/\b(EventSource|WebSocket)\b/g)].map(m => `${file}: ${m[1]}`))
  claim('...and there is no socket or event source anywhere in src/*.fs', sockets.length === 0, sockets.join(' | '))
  return out
}

/** The files and what was read, printed with every run so a green result is not read as more than it is. */
export const coverageOf = ({ program, sources }) => {
  const region = regionOf(program)
  return `scanned ${Object.keys(sources).length} F# source file(s); the poll region is ${region === null ? 'ABSENT' : region.split('\n').length + ' lines of ' + PROGRAM}`
}

// --- self-test ---------------------------------------------------------------

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')

/** A minimal program that satisfies every claim, and variants that each break exactly one. */
const GOOD = `module Program
let private queryParam (n: string) = None
${FROM} ──────
let private stopLivePoll () =
    match livePollTimer with
    | Some id ->
        window.clearInterval id
        livePollTimer <- None
    | None -> ()
let private startLivePoll (handles) (etDay: string) =
    let inFlight = HashSet<string>()
    let tick () =
        if not (LiveScore.liveWorkAheadAt now (games ())) then stopLivePoll ()
        elif (string document?visibilityState) = "visible" then
            for key in LiveScore.liveKeysAt now (games ()) do
                if inFlight.Add key then
                    tryFetchTextWithin LiveScore.LivePollTimeoutMs (RELAY_BASE + path)
                    |> Promise.iter (fun result ->
                        inFlight.Remove key |> ignore
                        let cards = handles |> Seq.filter (fun h -> LiveScore.answersTo key now h.Game)
                        ())
    livePollTimer <- Some(window.setInterval ((fun () -> tick ()), LiveScore.LivePollMs))
${TO} ────────

let private disposePrevious () =
    stopLivePoll ()
    ()

let go () =
    if (queryParam "data").IsNone && payload.Date <> "" then startLivePoll cardHandles.Value payload.Date
`
const GOOD_SCORE = '[<Literal>]\nlet LivePollMs = 60000\n\n[<Literal>]\nlet LivePollTimeoutMs = 90000\n'
const run = (program, liveScore = GOOD_SCORE, sources = { 'src/Program.fs': program, 'src/LiveScore.fs': liveScore }) =>
  claimsOf({ program, liveScore, sources })
const failing = (program, liveScore, sources) => run(program, liveScore, sources).filter(c => !c.ok).map(c => c.name)

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  const bad = failing(GOOD)
  check('the good fixture satisfies every claim', bad.length === 0, bad.join(' | '))
  const one = (name, program, liveScore, sources) => {
    const f = failing(program, liveScore, sources)
    check(name, f.length >= 1, `nothing failed; claims: ${run(program, liveScore, sources).map(c => c.name).length}`)
  }

  one('a missing begin marker is caught', GOOD.replace(FROM, '// ── something else'))
  one('a second timer in the region is caught', GOOD.replace('    livePollTimer <- Some', '    window.setInterval ((fun () -> ()), 1000) |> ignore\n    livePollTimer <- Some'))
  one('a setTimeout in the region is caught', GOOD.replace('    livePollTimer <- Some', '    window.setTimeout ((fun () -> ()), 1000) |> ignore\n    livePollTimer <- Some'))
  one('a timer whose id is never stored is caught (the next render could not clear it)', GOOD.replace('    livePollTimer <- Some(window.setInterval ((fun () -> tick ()), LiveScore.LivePollMs))', '    window.setInterval ((fun () -> tick ()), LiveScore.LivePollMs) |> ignore'))
  one('a timer cleared by the wrong id is caught', GOOD.replace('        window.clearInterval id\n', '        window.clearInterval 0.0\n'))
  one('a period written as an expression is caught, not read as its first number', GOOD, '[<Literal>]\nlet LivePollMs = 60000 / 4\n\n[<Literal>]\nlet LivePollTimeoutMs = 90000\n')
  one('a sleep loop made with Promise.sleep is caught', GOOD.replace('    livePollTimer <- Some', '    Promise.sleep 15000 |> Promise.iter (fun () -> tick ())\n    livePollTimer <- Some'))
  one('Async.Sleep is caught', GOOD.replace('    livePollTimer <- Some', '    async { do! Async.Sleep 15000 } |> ignore\n    livePollTimer <- Some'))
  one('an online listener is caught', GOOD.replace('    livePollTimer <- Some', '    window.addEventListener("online", fun _ -> tick ())\n    livePollTimer <- Some'))
  one('an onfocus handler is caught', GOOD.replace('    livePollTimer <- Some', '    window.onfocus <- (fun _ -> tick ())\n    livePollTimer <- Some'))
  one('a raw fetch in the region is caught', GOOD.replace('    livePollTimer <- Some', '    fetch "https://x" [] |> ignore\n    livePollTimer <- Some'))
  one('a Promise.sleep anywhere in src is caught, not only in the region', GOOD, GOOD_SCORE, { 'src/Program.fs': GOOD, 'src/Other.fs': 'let w = Promise.sleep 5000' })
  one('an in-flight guard that is always open is caught', GOOD.replace('if inFlight.Add key then', 'if inFlight.Add key || true then'))
  one('a key released before its answer arrives is caught', GOOD.replace('                    tryFetchTextWithin LiveScore.LivePollTimeoutMs (RELAY_BASE + path)\n', '                    inFlight.Remove key |> ignore\n                    tryFetchTextWithin LiveScore.LivePollTimeoutMs (RELAY_BASE + path)\n').replace('                        inFlight.Remove key |> ignore\n', ''))
  one('an answer told every card of the window, whatever its league, is caught', GOOD.replace('LiveScore.answersTo key now h.Game', 'LiveScore.inLiveWindowAt now h.Game'))
  one('a poll that asks for the URL\'s day is caught', GOOD.replace('startLivePoll cardHandles.Value payload.Date', 'startLivePoll cardHandles.Value (viewedDate ())'))
  one('a 15 s period is caught', GOOD.replace('LiveScore.LivePollMs))', '15000))'))
  one('a LivePollMs of 15000 is caught', GOOD, '[<Literal>]\nlet LivePollMs = 15000\n\n[<Literal>]\nlet LivePollTimeoutMs = 30000\n')
  // Review 2026-11-11 (poll S4, S18): the fixtures below keep every other claim satisfied, so only the deadline claims can be the reason they fail.
  one('a request with no deadline is caught', GOOD.replace('tryFetchTextWithin LiveScore.LivePollTimeoutMs (RELAY_BASE + path)', 'tryFetchText (RELAY_BASE + path)'))
  one('a deadline written as a number rather than the named constant is caught', GOOD.replace('tryFetchTextWithin LiveScore.LivePollTimeoutMs', 'tryFetchTextWithin 999999'))
  one('a deadline shorter than the period is caught (the in-flight guard could never fire)', GOOD, '[<Literal>]\nlet LivePollMs = 60000\n\n[<Literal>]\nlet LivePollTimeoutMs = 15000\n')
  one('a deadline longer than three periods is caught', GOOD, '[<Literal>]\nlet LivePollMs = 60000\n\n[<Literal>]\nlet LivePollTimeoutMs = 300000\n')
  one('a deadline of zero is caught', GOOD, '[<Literal>]\nlet LivePollMs = 60000\n\n[<Literal>]\nlet LivePollTimeoutMs = 0\n')
  one('no visibility gate is caught', GOOD.replace('elif (string document?visibilityState) = "visible" then', 'else'))
  one('no in-flight guard is caught', GOOD.replace('if inFlight.Add key then', 'if true then'))
  one('a poll on a pinned page is caught', GOOD.replace('if (queryParam "data").IsNone && payload.Date <> "" then startLivePoll', 'startLivePoll'))
  one('a poll that is never stopped on re-render is caught', GOOD.replace('let private disposePrevious () =\n    stopLivePoll ()', 'let private disposePrevious () ='))
  one('a timer outside the region is caught', GOOD + '\nlet private stray = window.setInterval ((fun () -> ()), 1000)\n')
  one('a socket anywhere in src is caught', GOOD, GOOD_SCORE, { 'src/Program.fs': GOOD, 'src/Other.fs': 'let s = WebSocket("x")' })
  one('a second fetch in the region is caught', GOOD.replace('                        ())', '                        tryFetchTextWithin 1000 "x" |> ignore\n                        ())'))
  check('a comment that names a timeout is not read as one',
    failing(GOOD.replace('    let inFlight', '    // no setTimeout here\n    let inFlight')).length === 0)
  check('the coverage line names what was read', coverageOf({ program: GOOD, sources: { a: '', b: '' } }).startsWith('scanned 2 F# source file(s)'))
  finish(summarize())
}

// --- the live scan -----------------------------------------------------------

if (isMain(import.meta.url) && !SELF_TEST) {
  const { check, summarize } = createChecks()
  const files = readdirSync('src').filter(f => f.endsWith('.fs')).map(f => `src/${f}`)
  const sources = Object.fromEntries(files.map(f => [f, readFileSync(f, 'utf8')]))
  const program = sources[PROGRAM]
  const liveScore = sources[LIVE_SCORE]
  for (const c of claimsOf({ program, liveScore, sources })) check(c.name, c.ok, c.detail)
  console.log(coverageOf({ program, sources }))
  finish(summarize())
}
