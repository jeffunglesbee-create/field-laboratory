#!/usr/bin/env node
// The Lineups surface is PULL ONLY, and this is what says so after the session
// that built it has ended.
//
// docs/CC-CMD-2026-10-11-predicted-xi-render-decision.md, first stop condition:
//
//   "No cron, no watch, no diff-on-change. Rule A is not cleared. A lineup that
//    changes an hour before kickoff is the single most notification-shaped
//    object this feature introduces, and the relay deliberately serves it on
//    pull only."
//
// Its done condition 4 is "no cron, no watch, no diff-on-change anywhere in the
// diff" — a property of ONE diff, which nothing enforces a week later. A
// surface that fetches once is one `setInterval` away from a surface that
// polls, and the change would read as an improvement in review: the panel would
// stay fresh.
//
// WHAT THIS CAN AND CANNOT SEE, so a green result is not read as more than it
// is. It reads the F# SOURCE and the capture workflow. It does not read
// `build/` or `public/`, which are compiled copies, and it cannot see a timer
// introduced by a library this code calls. The claim is "nothing in the lineups
// source asks to be re-run", not "no timer can possibly fire".

import { readFileSync, existsSync } from 'node:fs'
import { createChecks, isMain, finish } from './checks.mjs'

/** The files that make up this surface. A file added here without being added
 *  to the list is the gap, so the list is asserted non-empty and present. */
export const SOURCES = [
  'src/Lineups.fs',
  'src/LineupsView.fs',
]

/** Program.fs is shared with every other surface, so only its lineups section
 *  is scanned — bounded by the two markers below rather than by line numbers,
 *  which rot. */
export const PROGRAM = 'src/Program.fs'
export const PROGRAM_FROM = 'let private RELAY_LINEUPS'
export const PROGRAM_TO = 'let mutable private verifyLoaded'

export const WORKFLOW = '.github/workflows/capture-lineups-fixture.yml'

/** The lineup disclosure on a game card (docs/CC-CMD-2026-10-27-lineups-on-game-
 *  cards.md). Scoreboard.fs is shared with every card, and it arms a Solid effect
 *  for the score, so it cannot be scanned whole the way LineupsView.fs is: only
 *  the region between these two markers is, and a renamed marker is a failure. */
export const SCOREBOARD = 'src/Scoreboard.fs'
export const SCOREBOARD_FROM = '// ── Lineup disclosure'
export const SCOREBOARD_TO = '// ── end lineup disclosure'

/** The relay base the card's per-event route is built from, and the one Program.fs
 *  builds the Lineups tab's from. They are the same string in two files because
 *  Program.fs is outside the card's scope; this is what holds them together. */
export const eventsBaseOf = src => /RELAY_EVENTS\s*=\s*"([^"]+)"/.exec(src)?.[1] ?? null
export const lineupsBaseOf = src => /RELAY_LINEUPS\s*=\s*"([^"]+)"/.exec(src)?.[1] ?? null

/** Anything that asks to be run again. */
export const RECURRENCE = [
  ['setInterval', /\bsetInterval\b/],
  ['setTimeout', /\bsetTimeout\b/],
  ['requestAnimationFrame', /\brequestAnimationFrame\b/],
  ['EventSource', /\bEventSource\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['window.setInterval', /\bwindow\.setInterval\b/],
  ['a visibility or focus listener', /addEventListener\s*\(?\s*"(visibilitychange|focus)"/],
  ['Solid createEffect on this surface', /\bcreateEffect\b/],
]

/** Code only — a comment saying "no interval" must not read as an interval.
 *  This repository has been bitten three separate times by a checker that
 *  matched its own prose, so the blanking happens before any scan. */
export const codeOnly = src =>
  src
    .replace(/\/\/\/?[^\n]*/g, '')
    .replace(/\(\*[\s\S]*?\*\)/g, '')

/** The lineups slice of a shared file, between two markers. Returns null when
 *  either marker is missing, which is a FAILURE rather than an empty scan: a
 *  renamed marker must not silently reduce the scanned region to nothing. */
export const sliceBetween = (src, from, to) => {
  const a = src.indexOf(from)
  if (a === -1) return null
  const b = src.indexOf(to, a + from.length)
  if (b === -1) return null
  return src.slice(a, b)
}

/** Every recurrence term present in a body. */
export const recurrencesIn = body =>
  RECURRENCE.filter(([, re]) => re.test(body)).map(([name]) => name)

/** A YAML workflow's schedule block. `on: schedule:` is the one that matters;
 *  `cron:` is matched too so a schedule written under any key is caught. */
export const scheduledIn = yaml => {
  const code = yaml.replace(/^\s*#[^\n]*$/gm, '')
  const hits = []
  if (/^\s*schedule\s*:/m.test(code)) hits.push('schedule:')
  if (/^\s*-?\s*cron\s*:/m.test(code)) hits.push('cron:')
  return hits
}

// --- self-test ---------------------------------------------------------------

const IS_MAIN = isMain(import.meta.url)
const SELF_TEST = IS_MAIN && process.argv.includes('--self-test')

if (SELF_TEST) {
  const { check, summarize } = createChecks()

  check('the term list is not empty, or this guard is vacuous', RECURRENCE.length >= 6)

  check('an interval is caught', recurrencesIn('let x = setInterval(f, 1000)').includes('setInterval'))
  check('a timeout is caught', recurrencesIn('setTimeout(go, 5)').includes('setTimeout'))
  check('an EventSource is caught', recurrencesIn('new EventSource(url)').includes('EventSource'))
  check('a WebSocket is caught', recurrencesIn('new WebSocket(u)').includes('WebSocket'))
  check('a visibility listener is caught',
    recurrencesIn('document.addEventListener("visibilitychange", f)')
      .includes('a visibility or focus listener'))
  check('ordinary code is not flagged', recurrencesIn('let load url = fetch url []').length === 0)

  // THE ONE THAT HAS BITTEN THIS REPOSITORY THREE TIMES. A comment about the
  // pattern is not the pattern.
  const prose = '/// No setInterval here, and no EventSource either.\nlet load () = fetch url []'
  check('A COMMENT NAMING setInterval IS NOT AN INTERVAL',
    recurrencesIn(codeOnly(prose)).length === 0, recurrencesIn(codeOnly(prose)).join(','))
  check('...but code after a comment on the same line still is',
    recurrencesIn(codeOnly('let go () = setInterval(f, 1) // once a second')).includes('setInterval'))
  check('a block comment is blanked too',
    recurrencesIn(codeOnly('(* setInterval *)\nlet x = 1')).length === 0)

  // Slicing.
  const shared = 'before\nMARK_A\nsetInterval(f,1)\nMARK_B\nafter setTimeout(g,1)\n'
  check('a slice contains what is between the markers',
    recurrencesIn(sliceBetween(shared, 'MARK_A', 'MARK_B')).includes('setInterval'))
  check('...and NOT what is outside them',
    !recurrencesIn(sliceBetween(shared, 'MARK_A', 'MARK_B')).includes('setTimeout'))
  check('A MISSING MARKER IS NULL, NOT AN EMPTY SCAN',
    sliceBetween(shared, 'MARK_A', 'NOT_THERE') === null &&
    sliceBetween(shared, 'NOT_THERE', 'MARK_B') === null)

  // Workflows.
  check('a scheduled workflow is caught',
    scheduledIn('on:\n  schedule:\n    - cron: "0 * * * *"\n').includes('schedule:'))
  check('a cron under any key is caught',
    scheduledIn('jobs:\n  x:\n    steps:\n      - cron: "* * * * *"\n').includes('cron:'))
  check('a dispatch-only workflow is not flagged',
    scheduledIn('on:\n  workflow_dispatch:\n    inputs:\n      state:\n').length === 0)
  check('THE WORD schedule IN A COMMENT IS NOT A SCHEDULE',
    scheduledIn('# Dispatch-only, NO schedule.\n#   schedule:\non:\n  workflow_dispatch:\n').length === 0,
    scheduledIn('# Dispatch-only, NO schedule.\n#   schedule:\non:\n  workflow_dispatch:\n').join(','))

  // The card's region of Scoreboard.fs, which also holds a Solid effect for the
  // score that must NOT be read as the lineup's.
  const board =
    'let stateNode () = Solid.createEffect (fun () -> ())\n' +
    '// ── Lineup disclosure ──\n' +
    'details.addEventListener("toggle", fun _ -> load ())\n' +
    '// ── end lineup disclosure ──\n' +
    'let later () = setInterval(f, 1)\n'
  const region = sliceBetween(board, SCOREBOARD_FROM, SCOREBOARD_TO)
  check('the card region is found between its two markers', region !== null)
  check('...a clean card region is not flagged, though the file around it arms an effect and a timer',
    recurrencesIn(codeOnly(region)).length === 0, recurrencesIn(codeOnly(region)).join(','))
  const dirty = board.replace('details.addEventListener("toggle", fun _ -> load ())',
    'window.setInterval((fun () -> load ()), 60000) |> ignore')
  check('MUTATION: a timer inside the card region IS caught',
    recurrencesIn(codeOnly(sliceBetween(dirty, SCOREBOARD_FROM, SCOREBOARD_TO))).includes('setInterval'))
  const effect = board.replace('details.addEventListener("toggle", fun _ -> load ())',
    'Solid.createEffect (fun () -> load ())')
  check('MUTATION: an effect inside the card region IS caught',
    recurrencesIn(codeOnly(sliceBetween(effect, SCOREBOARD_FROM, SCOREBOARD_TO))).includes('Solid createEffect on this surface'))
  check('MUTATION: a renamed start marker is null, never an empty scan',
    sliceBetween(board.replace('Lineup disclosure ──', 'Lineup panel ──'), SCOREBOARD_FROM, SCOREBOARD_TO) === null)

  // The two relay bases.
  check('both relay bases are read from their declarations',
    eventsBaseOf('let private RELAY_EVENTS = "https://r.example/bsd/events/"') === 'https://r.example/bsd/events/' &&
    lineupsBaseOf('let private RELAY_LINEUPS = "https://r.example/bsd/events/"') === 'https://r.example/bsd/events/')
  check('MUTATION: a base that moved is not equal to the other',
    eventsBaseOf('let private RELAY_EVENTS = "https://r.example/bsd/event/"') !==
    lineupsBaseOf('let private RELAY_LINEUPS = "https://r.example/bsd/events/"'))
  check('MUTATION: a declaration that is not there reads as null, which the live check treats as failure',
    eventsBaseOf('let x = 1') === null)

  process.exit(summarize() === 0 ? 0 : 1)
}

// --- live --------------------------------------------------------------------

if (IS_MAIN && !SELF_TEST) {
  const { check, summarize } = createChecks()
  let scanned = 0

  for (const path of SOURCES) {
    check(`${path} exists`, existsSync(path), 'the guard names a file this repo does not have')
    if (!existsSync(path)) continue
    scanned += 1
    const found = recurrencesIn(codeOnly(readFileSync(path, 'utf8')))
    check(`${path} asks to be run ONCE — no timer, no socket, no listener`,
      found.length === 0, found.join(', '))
  }

  const program = existsSync(PROGRAM) ? readFileSync(PROGRAM, 'utf8') : null
  const slice = program === null ? null : sliceBetween(program, PROGRAM_FROM, PROGRAM_TO)
  check(`${PROGRAM}'s lineups section is findable between its two markers`,
    slice !== null,
    `"${PROGRAM_FROM}" .. "${PROGRAM_TO}" — a renamed marker silently scans nothing, ` +
    'so this is a failure rather than a pass over an empty string')
  if (slice !== null) {
    scanned += 1
    const found = recurrencesIn(codeOnly(slice))
    check(`${PROGRAM}'s lineups section fetches once and never re-arms`,
      found.length === 0, found.join(', '))
    // The surface is loaded behind a `loaded` flag, which is what makes "once"
    // true even if the tab is clicked twenty times.
    check('...and it is gated on a once-only flag rather than on the tab click',
      /lineupsLoaded\s*<-\s*true/.test(slice) && /if not lineupsLoaded then/.test(slice),
      'the once-only gate is not in the lineups section')
  }

  // The game card's lineup disclosure, between its two markers in Scoreboard.fs.
  const board = existsSync(SCOREBOARD) ? readFileSync(SCOREBOARD, 'utf8') : null
  const card = board === null ? null : sliceBetween(board, SCOREBOARD_FROM, SCOREBOARD_TO)
  check(`${SCOREBOARD}'s lineup disclosure is findable between its two markers`,
    card !== null,
    `"${SCOREBOARD_FROM}" .. "${SCOREBOARD_TO}" — a renamed marker silently scans nothing`)
  if (card !== null) {
    scanned += 1
    const found = recurrencesIn(codeOnly(card))
    check(`${SCOREBOARD}'s lineup disclosure asks once and never re-arms`, found.length === 0, found.join(', '))
    // "Once" is the flag. Without it a close and a re-open is a second request.
    check('...and the request is gated on a once-only flag set before the call',
      /asked\.Value\s*<-\s*true/.test(card) && /if isOpen && not asked\.Value then/.test(card),
      'the once-only gate is not in the card region')
  }

  // The card builds its route from the same relay base the tab does.
  const viewSrc = existsSync('src/LineupsView.fs') ? readFileSync('src/LineupsView.fs', 'utf8') : null
  const eventsBase = viewSrc === null ? null : eventsBaseOf(viewSrc)
  const tabBase = program === null ? null : lineupsBaseOf(program)
  check('the card and the Lineups tab build their route from the same relay base',
    eventsBase !== null && tabBase !== null && eventsBase === tabBase,
    `LineupsView.RELAY_EVENTS ${eventsBase} vs Program.RELAY_LINEUPS ${tabBase}`)

  check(`${WORKFLOW} exists`, existsSync(WORKFLOW))
  if (existsSync(WORKFLOW)) {
    scanned += 1
    const hits = scheduledIn(readFileSync(WORKFLOW, 'utf8'))
    check(`${WORKFLOW} is dispatch-only — a scheduled capture is a watch by another name`,
      hits.length === 0, hits.join(', '))
  }

  // Rule 91: the denominator prints where the result is read. This guard covers
  // four source regions, not the whole repository, and a green line must not be
  // read as "nothing anywhere polls this".
  console.log(`\n  scanned ${scanned} of ${SOURCES.length + 3} lineups source region(s):`)
  console.log(`    ${SOURCES.join(', ')}, ${PROGRAM} (sliced), ${SCOREBOARD} (sliced), ${WORKFLOW}`)
  console.log(`  NOT scanned: build/ and public/ (compiled copies), and any timer a`)
  console.log(`               called library arms on its own.\n`)

  check('the scan was not vacuous', scanned === SOURCES.length + 3, `scanned ${scanned}`)
  finish(summarize())
}
