#!/usr/bin/env node
// The model's forecast on an EPL card is PULL ONLY and carries NO MARKET INPUT,
// and this is what says so after the session that built it has ended.
//
// docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md, the ruling for this feature:
//
//   Rule F cleared for a modelled forecast. Rule A NOT cleared: pull only, stop
//   and report if the design drifts toward notification or badge-on-change.
//   A difference between the model and the market is never rendered as an edge
//   or a delta. Agreement is as visible as disagreement.
//
// Those are properties of the diff that built the feature, which nothing
// enforces a week later. A card that draws a number is one `setInterval` from a
// card that refreshes it, one `Notification` from a card that announces it, and
// one `winProbability` call from a card that subtracts the market from it — and
// each of those would read in review as a small improvement.
//
// FOUR CLAIMS, each a different scan:
//   1. ASKS ONCE      no timer, socket, listener or animation frame anywhere on
//                     the surface; the one request is made in one place, once,
//                     and only for a slate that has an EPL card.
//   2. NEVER PUSHES   no notification, push, beacon, broadcast or worker-message
//                     API in the surface.
//   3. NO MARKET IN   the code that decides and words the line mentions no price:
//                     `CardForecast.lineFor` has no market parameter, so a
//                     rendering built on divergence would not compile unchanged,
//                     and this fails the day someone changes the signature.
//   4. NO DIFFERENCE  no word for a difference from the market in the code that
//                     words the line (strings are code to this scan; comments are
//                     not, so the header's prose may name the forbidden words).
//
// WHAT THIS CAN AND CANNOT SEE, so a green result is not read as more than it is
// (Rule 91). It reads F# SOURCE, in the files and marker-bounded regions printed
// at the end of every run. It does not read `build/` or `public/`, which are
// compiled copies, and it cannot see a timer a called library arms on its own.
// "Nothing in this source asks to be re-run" is the claim; "no timer can possibly
// fire" is not. The page-level half — one request however long the page sits —
// is `scripts/forecast-render-check.mjs`, which observes it in a browser.
//
// BUILT ON, NOT COPIED. The comment scanner is `check-lineups-pull-only.mjs`'s,
// imported: it was rewritten from two regular expressions into a real F# scanner
// after a `//` inside a string hid code from it, and a second scanner would be
// the first one's bug in a new file.

import { readFileSync, existsSync } from 'node:fs'
import { createChecks, isMain, finish } from './checks.mjs'
import { RECURRENCE, codeOnly, recurrencesIn, sliceBetween } from './check-lineups-pull-only.mjs'

/** Files read whole. Pure: not even an effect belongs in any of them. */
export const PURE = [
  'src/Forecast.fs',
  'src/Standings.fs',
  'src/CardForecast.fs',
]

/** The files that WORD the line. Claims 3 and 4 are scanned here, and not in
 *  Forecast.fs, whose goal-difference arithmetic legitimately says "diff". */
export const WORDING = ['src/CardForecast.fs']

export const SCOREBOARD = 'src/Scoreboard.fs'
export const SCOREBOARD_FROM = '// ── Forecast line'
export const SCOREBOARD_TO = '// ── end forecast line'

export const PROGRAM = 'src/Program.fs'
export const PROGRAM_FROM = '// ── Standings request'
export const PROGRAM_TO = '// ── end standings request'

/** The one effect the card's line is allowed: it keeps the line a function of the
 *  card's own state and the table. Every other recurrence term is forbidden in
 *  the region, and this one only exactly once and only with `apply`. */
export const EFFECT = 'Solid createEffect on this surface'

export const PUSH = [
  ['Notification', /\bNotification\b/],
  ['showNotification', /\bshowNotification\b/],
  ['PushManager', /\bPushManager\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['BroadcastChannel', /\bBroadcastChannel\b/],
  ['postMessage', /\bpostMessage\b/],
  ['serviceWorker', /\bserviceWorker\b/],
]

/** A market price, in any spelling this codebase has for one. The line is the
 *  model alone; a price reaching the code that words it is the first step of an
 *  edge. `Market.threeWayHome` and friends are the MODEL's own accessors on
 *  `Market.ThreeWay`, which is why `Market` itself is not on the list. */
export const MARKET_INPUT = [
  ['an odds field or function', /\b\w*[Oo]dds\w*\b/],
  ['a moneyline', /\b\w*[Mm]oneyline\w*\b/],
  ['winProbability', /\bwinProbability\w*\b/],
  ['MarketImplied', /\bMarketImplied\b/],
]

/** A word for how the model differs from the market. */
export const DIFFERENCE = [
  ['edge', /\bedge\b/i],
  ['delta', /\bdelta\b/i],
  ['diverge', /\bdiverg\w*\b/i],
  ['disagree', /\bdisagree\w*\b/i],
  ['gap', /\bgap\b/i],
  ['value', /\bvalue\b/i],
  ['vs market', /\bvs\.? market\b/i],
]

const named = (list, body) => list.filter(([, re]) => re.test(body)).map(([name]) => name)

export const pushIn = body => named(PUSH, body)
export const marketIn = body => named(MARKET_INPUT, body)
export const differenceIn = body => named(DIFFERENCE, body)

/** Recurrence terms other than the one effect. */
export const recurrencesExceptEffect = body => recurrencesIn(body).filter(n => n !== EFFECT)

/** How many effects a body arms. */
export const effectsIn = body => (body.match(/\bcreateEffect\b/g) ?? []).length

/** How many times a body asks for the table. */
export const tableRequestsIn = body => (body.match(/\btryFetchText\s*\(\s*standingsUrl\s*\(\s*\)\s*\)/g) ?? []).length

/** Any fetch at all, by any of the names this codebase fetches with. */
export const fetchesIn = body => (body.match(/\b(fetch|tryFetchText|XMLHttpRequest)\b/g) ?? []).length

// --- self-test ---------------------------------------------------------------

const IS_MAIN = isMain(import.meta.url)
const SELF_TEST = IS_MAIN && process.argv.includes('--self-test')

if (SELF_TEST) {
  const { check, summarize } = createChecks()
  const caught = (list, text) => named(list, text)

  check('the lists are not empty, or this guard is vacuous',
    RECURRENCE.length >= 6 && PUSH.length >= 5 && MARKET_INPUT.length >= 3 && DIFFERENCE.length >= 5)

  // Claim 1 — the effect is allowed exactly once; everything else is not.
  check('a timer is caught even though an effect is allowed',
    recurrencesExceptEffect('Solid.createEffect apply\nlet t = setInterval(f, 1)').includes('setInterval'))
  check('...the one allowed effect alone is not a recurrence term',
    recurrencesExceptEffect('Solid.createEffect apply').length === 0)
  check('two effects are counted as two', effectsIn('Solid.createEffect apply\nSolid.createEffect (fun () -> ())') === 2)
  check('no effect is counted as none', effectsIn('let node = el "div" "x" ""') === 0)
  check('an EventSource, a WebSocket and a listener are caught',
    ['new EventSource(u)', 'new WebSocket(u)', 'document.addEventListener("visibilitychange", f)']
      .every(src => recurrencesExceptEffect(src).length === 1))
  check('A COMMENT NAMING setInterval IS NOT AN INTERVAL',
    recurrencesExceptEffect(codeOnly('/// no setInterval here\nlet x = 1')).length === 0)

  // Claim 1 — one request.
  const ask = 'tryFetchText (standingsUrl ()) |> Promise.iter ignore'
  check('one request for the table is counted as one', tableRequestsIn(ask) === 1)
  check('two requests are counted as two', tableRequestsIn(ask + '\n' + ask) === 2)
  check('a request for something else is not the table\'s', tableRequestsIn('tryFetchText (otherUrl ())') === 0)
  check('a fetch is counted by every name this codebase has for one',
    fetchesIn('fetch url []') === 1 && fetchesIn('tryFetchText u') === 1 && fetchesIn('new XMLHttpRequest()') === 1)
  check('...and a body that fetches nothing is counted as zero', fetchesIn('node.textContent <- compute ()') === 0)

  // Claim 2 — no push.
  for (const src of ['new Notification("x")', 'reg.showNotification("x")', 'new PushManager()',
    'navigator.sendBeacon(u)', 'new BroadcastChannel("c")', 'w.postMessage(1)', 'navigator.serviceWorker.ready']) {
    check(`push is caught: ${src}`, pushIn(src).length === 1, JSON.stringify(pushIn(src)))
  }
  check('ordinary code is not push', pushIn('node.textContent <- text game line').length === 0)

  // Claim 3 — no market in.
  for (const src of ['game.OpeningOdds', 'game.ClosingOdds', 'let o = oddsText game', 'winProbability game',
    'winProbabilityText game', 'MarketImplied m', 'o.MoneylineHome']) {
    check(`a market input is caught: ${src}`, marketIn(src).length >= 1, JSON.stringify(marketIn(src)))
  }
  check('the MODEL\'s own accessors on Market.ThreeWay are not a market input',
    marketIn('Market.threeWayHome m.Market + Market.threeWayDraw m.Market').length === 0,
    JSON.stringify(marketIn('Market.threeWayHome m.Market')))
  check('a market input in a COMMENT is not one',
    marketIn(codeOnly('/// never reads winProbability or OpeningOdds\nlet x = 1')).length === 0)

  // Claim 4 — no word for a difference.
  for (const w of ['edge', 'delta', 'diverges', 'disagreement', 'gap', 'value', 'vs market']) {
    check(`a word for a difference is caught: "${w}"`,
      differenceIn(`sprintf "model %s +3" "${w}"`).length >= 1, JSON.stringify(differenceIn(w)))
  }
  check('the word in a COMMENT is not one — the header may name what it forbids',
    differenceIn(codeOnly('// never an "edge", never a delta\nlet x = "model"')).length === 0)
  check('a word that merely contains one is not one ("knowledge", "valued")',
    differenceIn('knowledge valued ledge').length === 0, JSON.stringify(differenceIn('knowledge valued ledge')))

  // Slicing, with this guard's own markers.
  const board =
    'let stateNode () = Solid.createEffect (fun () -> ())\n' +
    '// ── Forecast line ──\n' +
    'Solid.createEffect apply\n' +
    '// ── end forecast line ──\n' +
    'let later () = setInterval(f, 1)\n'
  const region = sliceBetween(board, SCOREBOARD_FROM, SCOREBOARD_TO)
  check('the card region is found between its markers', region !== null)
  check('...a clean region is clean though the file around it arms an effect and a timer',
    recurrencesExceptEffect(codeOnly(region)).length === 0 && effectsIn(codeOnly(region)) === 1,
    JSON.stringify([recurrencesExceptEffect(codeOnly(region)), effectsIn(codeOnly(region))]))
  const timer = board.replace('Solid.createEffect apply', 'window.setInterval((fun () -> apply ()), 60000) |> ignore')
  check('MUTATION: a timer inside the region IS caught',
    recurrencesExceptEffect(codeOnly(sliceBetween(timer, SCOREBOARD_FROM, SCOREBOARD_TO))).includes('setInterval'))
  const second = board.replace('Solid.createEffect apply', 'Solid.createEffect apply\nSolid.createEffect (fun () -> notify ())')
  check('MUTATION: a second effect inside the region IS counted',
    effectsIn(codeOnly(sliceBetween(second, SCOREBOARD_FROM, SCOREBOARD_TO))) === 2)
  check('MUTATION: a renamed start marker is null, never an empty scan',
    sliceBetween(board.replace('Forecast line ──', 'Forecast row ──'), SCOREBOARD_FROM, SCOREBOARD_TO) === null)
  check('MUTATION: a renamed end marker is null, never an empty scan',
    sliceBetween(board.replace('end forecast line', 'end forecast row'), SCOREBOARD_FROM, SCOREBOARD_TO) === null)

  finish(summarize())
}

// --- live --------------------------------------------------------------------

if (IS_MAIN && !SELF_TEST) {
  const { check, summarize } = createChecks()
  const scanned = []
  const read = path => existsSync(path) ? readFileSync(path, 'utf8') : null

  // Whole files: pure.
  for (const path of PURE) {
    const src = read(path)
    check(`${path} exists`, src !== null, 'the guard names a file this repo does not have')
    if (src === null) continue
    scanned.push(path)
    const code = codeOnly(src)
    const found = [...recurrencesIn(code), ...pushIn(code)]
    check(`${path} asks to be run ONCE — no timer, socket, listener, effect or push API`,
      found.length === 0, found.join(', '))
  }

  // The files that word the line: no price, no difference.
  for (const path of WORDING) {
    const src = read(path)
    if (src === null) continue
    const code = codeOnly(src)
    check(`${path} takes no market price`, marketIn(code).length === 0, marketIn(code).join(', '))
    check(`${path} has no word for a difference from the market`,
      differenceIn(code).length === 0, differenceIn(code).join(', '))
  }

  // The card's region in Scoreboard.fs.
  const board = read(SCOREBOARD)
  const card = board === null ? null : sliceBetween(board, SCOREBOARD_FROM, SCOREBOARD_TO)
  check(`${SCOREBOARD}'s forecast line is findable between its two markers`,
    card !== null,
    `"${SCOREBOARD_FROM}" .. "${SCOREBOARD_TO}" — a renamed marker silently scans nothing, so this is a failure and not a pass over an empty string`)
  if (card !== null) {
    scanned.push(`${SCOREBOARD} (sliced)`)
    const code = codeOnly(card)
    check(`${SCOREBOARD}'s forecast line arms no timer, socket or listener`,
      recurrencesExceptEffect(code).length === 0, recurrencesExceptEffect(code).join(', '))
    check('...arms exactly ONE effect, and it is the one that keeps the line a function of the card\'s state and the table',
      effectsIn(code) === 1 && /Solid\.createEffect\s+apply\b/.test(code), `${effectsIn(code)} effect(s)`)
    check('...makes no request of its own — the one request is Program.fs\'s', fetchesIn(code) === 0, `${fetchesIn(code)} fetch(es)`)
    check('...pushes nothing', pushIn(code).length === 0, pushIn(code).join(', '))
    check('...takes no market price', marketIn(code).length === 0, marketIn(code).join(', '))
    check('...has no word for a difference from the market', differenceIn(code).length === 0, differenceIn(code).join(', '))
  }

  // The request, in Program.fs.
  const program = read(PROGRAM)
  const request = program === null ? null : sliceBetween(program, PROGRAM_FROM, PROGRAM_TO)
  check(`${PROGRAM}'s standings request is findable between its two markers`,
    request !== null,
    `"${PROGRAM_FROM}" .. "${PROGRAM_TO}" — a renamed marker silently scans nothing`)
  if (request !== null) {
    scanned.push(`${PROGRAM} (sliced)`)
    const code = codeOnly(request)
    check(`${PROGRAM}'s standings request arms no timer, socket, listener or effect`,
      recurrencesIn(code).length === 0, recurrencesIn(code).join(', '))
    check('...pushes nothing', pushIn(code).length === 0, pushIn(code).join(', '))
    check('...asks for the table exactly once, and for nothing else',
      tableRequestsIn(code) === 1 && fetchesIn(code) === 1, `${tableRequestsIn(code)} table request(s), ${fetchesIn(code)} fetch(es)`)
    check('...and only for a slate that has an EPL card on it',
      /if\s+games\s*\|>\s*List\.exists\s*\(\s*fun\s+g\s*->\s*g\.Sport\s*=\s*Sport\.EPL\s*\)\s*then\s+tryFetchText\s*\(\s*standingsUrl/.test(code),
      'the EPL gate is not directly in front of the request')
    check('...with the table held as one signal for the whole slate, starting Pending',
      /let\s+table\s*,\s*setTable\s*=\s*Solid\.createSignal\s+CardForecast\.Pending/.test(code),
      'the single signal is not in the region')
  }

  // Rule 91: the denominator prints where the result is read.
  const total = PURE.length + 2
  console.log(`\n  scanned ${scanned.length} of ${total} forecast source(s):`)
  console.log(`    ${scanned.join(', ')}`)
  console.log(`  wording claims (no market, no difference) apply to ${WORDING.join(', ')} and the Scoreboard region only;`)
  console.log(`  Forecast.fs is scanned for recurrence and push but not for the word "diff", which goal difference needs.`)
  console.log(`  NOT scanned: build/ and public/ (compiled copies), and any timer a called library arms on its own.\n`)

  check('the scan was not vacuous', scanned.length === total, `scanned ${scanned.length} of ${total}`)
  finish(summarize())
}
