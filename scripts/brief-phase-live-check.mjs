// A finished game shows the brief written after it finished — on the DEPLOYED page.
//
// WHY THIS EXISTS SEPARATELY FROM THE FIXTURE CHECKS
//
// `briefsByGame` gained a phase rule on 2026-08-29: when a game is final, prefer
// the after-play brief over the during-play one. It was measured against
// `data/brief-recency-corpus.json` and proven by rebuilding with and without the
// change (189 -> 200 of 239 final games showing `game_recap`). Every one of
// those numbers came from a captured file.
//
// A captured file is a copy. The rule that produced it lives in F# that has to
// compile, bundle, deploy, and then run in a real browser against a live payload
// whose shape this repo does not control. `verify` asserts the rule against a
// pinned fixture on a local server; nothing asserted it against the page a
// person actually opens. The stale-build incident on this repo is exactly that
// gap: `Sport.Bundesliga` was correct in source, compiled 71/71, and rendered
// UNMODELLED SPORT, because only half of `npm run build` had run.
//
// So this fetches the SAME payload the page fetches, computes what the rule says
// each card should show, and asserts the DOM agrees. Relay -> decode -> render
// -> DOM, end to end (Rule 61), with a per-game input/output table as the
// artifact rather than "looks right" (Rule 90).
//
// THREE STATES, and the middle one is not a pass
//
//   NOT OBSERVABLE  no final game on today's slate carries more than one brief.
//                   Nothing to prefer, so the rule is untested — reported as
//                   such, never as green. On a heartbeat that is neutral; on a
//                   dispatch it means the day was wrong, not the code.
//   FAIL            a card shows a during-play kind while an after-play brief
//                   for that same game exists in the payload.
//   PASS            every such game shows its after-play brief.
//
// Usage:  URL=https://… node scripts/brief-phase-live-check.mjs

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createChecks, isMain } from './checks.mjs'

const URL = process.env.URL || 'http://localhost:8080/'
const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'

// The phases, duplicated from Journalism.fs ON PURPOSE and narrowly.
//
// Importing `build/Journalism.js` would make this check agree with the source by
// construction — it would pass even if the compiled bundle on the live site were
// stale, because both sides would come from the same freshly-built local tree.
// That is the exact failure this file exists to catch, so the expectation is
// written independently and a divergence between the two is a real finding.
const DURING_PLAY = new Set(['pre_game', 'game_live'])
const AFTER_PLAY = new Set(['game_recap'])

/**
 * Team-name normalisation, for the DIAGNOSTIC only — never for the verdict.
 *
 * The verdict still uses exact substring matching, deliberately. Loosening it
 * would make the check agree with the page more often without anyone learning
 * why it disagreed, which is how a red turns into a shrug.
 */
export const norm = t => (t || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // Málaga -> Malaga
  .replace(/[^A-Za-z0-9 ]/g, ' ')                      // St. Louis -> St Louis
  .replace(/\s+/g, ' ').trim().toLowerCase()

/** Significant words, so `FC` and `SC` do not make every club match every club. */
export const tokens = t => norm(t).split(' ').filter(w => w.length > 2)

/** How many significant words of `name` appear in a card's team line. */
export const overlap = (cardTeams, name) =>
  tokens(name).filter(w => norm(cardTeams).includes(w)).length

/** Brief `game_id` values resolve to a game by its own id or its ESPN event id. */
export const briefMatches = (game, brief) => {
  if (!brief.game_id) return false
  const stripped = brief.game_id.startsWith('espn:') ? brief.game_id.slice(5) : brief.game_id
  return brief.game_id === game.id ||
    (game.espn_event_id != null && String(game.espn_event_id) === stripped)
}

/** What the rule says this game's card should show, or null if it does not apply. */
export const expectedKind = (game, briefs) => {
  if (!game.finalized_at) return null
  const mine = briefs.filter(b => briefMatches(game, b) && (b.brief_text || '').trim())
  if (mine.length < 2) return null
  const after = mine.find(b => AFTER_PLAY.has(b.brief_type))
  const during = mine.find(b => DURING_PLAY.has(b.brief_type))
  if (!after || !during) return null
  return after.brief_type
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const g = { id: 'G1', espn_event_id: 999, finalized_at: '2026-08-29 20:00:00' }
  const live = { game_id: 'G1', brief_type: 'game_live', brief_text: 'in the 60th minute' }
  const recap = { game_id: 'espn:999', brief_type: 'game_recap', brief_text: 'finished 3-3' }

  check('a final game with both phases expects the after-play kind',
    expectedKind(g, [live, recap]) === 'game_recap')
  check('the espn: prefix resolves to the same game',
    briefMatches(g, recap) === true)
  check('an UNFINISHED game expects nothing, whatever it carries',
    expectedKind({ ...g, finalized_at: null }, [live, recap]) === null)
  check('a final game with only ONE phase expects nothing — no preference to test',
    expectedKind(g, [live]) === null && expectedKind(g, [recap]) === null)
  check('an empty brief is not a brief to prefer',
    expectedKind(g, [live, { ...recap, brief_text: '   ' }]) === null)
  check('diacritics normalise so a name is comparable',
    norm('Málaga') === 'malaga')
  check('punctuation normalises — St. Louis and St Louis are one name',
    norm('St. Louis') === norm('St Louis'))
  check('SHORT WORDS ARE NOT TOKENS, or FC would match every club',
    tokens('FC Dallas').join() === 'dallas')
  check('overlap finds a short name inside a long one',
    overlap('Minnesota Lynx v Atlanta Dream', 'Lynx') === 1,
    'the 2026-08-30 payload carried this fixture under both names')
  check('overlap is 0 for an unrelated card',
    overlap('Red Sox v Yankees', 'FC Dallas') === 0,
    'a non-zero floor here would print nonsense as the nearest card')

  check('THE BUG IS DETECTED: a during-play kind on a final game is not the expectation',
    expectedKind(g, [live, recap]) !== 'game_live',
    'the screenshot that prompted this showed GAME_LIVE on a 3-3 final')
  process.exit(summarize() === 0 ? 0 : 1)
}


// EXECUTABLE HALF, GUARDED. This file exports `briefMatches` and `expectedKind`
// so the self-test and any future consumer can reuse them, and an exporting
// module that does its work at import time terminates whatever imports it --
// caught here by check:import-purity at the pre-commit door, one commit after
// that check was added to the hook for exactly this.
if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()

  // The date the page itself is showing, read off the page rather than computed
  // here. A check that picks its own date can disagree with the page about which
  // slate it is looking at and never notice.
  const sessionChromium = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(
    existsSync(sessionChromium) ? { executablePath: sessionChromium } : {})
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.desk-card', { timeout: 30000 })

  // `#viewed-date`, an element id written by `report "viewed-date"`
  // (src/Program.fs:200) — NOT a class. The first draft guessed
  // `.date-nav__label`, which exists nowhere in this codebase, and the check would
  // have silently fallen back to today's date and still passed.
  //
  // It does not always hold a date: with `?data=` pinned to a committed capture it
  // reads "pinned to a committed capture" (src/Program.fs:407). So the shape is
  // asserted rather than trusted, and anything else means this check is pointed at
  // a fixture and should say so instead of fetching a nonsense URL.
  const rawDate = (await page.textContent('#viewed-date').catch(() => null))?.trim() ?? ''
  const shownDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null
  check('the page reports a real viewed date, not a pinned capture',
    shownDate !== null,
    `#viewed-date reads ${JSON.stringify(rawDate)} — this check needs a live slate, not ?data=`)
  if (shownDate === null) { await browser.close(); console.log(''); process.exit(1) }

  // Every card's venue/teams line and, where present, its brief kind.
  const cards = await page.$$eval('.desk-card', els => els.map(el => ({
    teams: el.querySelector('.desk-card__teams')?.textContent?.trim() ?? '',
    status: el.querySelector('.desk-card__status')?.textContent?.trim() ?? '',
    kind: el.querySelector('.desk-card__brief-kind')?.textContent?.trim() ?? null,
  })))

  check('the deployed page rendered cards at all', cards.length > 0, `${cards.length} card(s)`)
  check('the page logged no errors while rendering', errors.length === 0, errors.slice(0, 3).join(' | '))

  await browser.close()

  const res = await fetch(`${RELAY}/context/date/${shownDate}`, { signal: AbortSignal.timeout(30000) })
  check(`the relay served /context/date/${shownDate}`, res.ok, `HTTP ${res.status}`)
  const payload = res.ok ? await res.json() : {}
  const games = [...(payload.games?.regular ?? []), ...(payload.games?.postseason ?? [])]
  const briefs = Array.isArray(payload.briefs) ? payload.briefs : []

  // The population the rule can be tested on, named before it is counted — an
  // empty one is NOT OBSERVABLE, and saying so is the whole point of the state.
  const testable = games
    .map(g => ({ g, want: expectedKind(g, briefs) }))
    .filter(x => x.want !== null)

  console.log(`\n  slate ${shownDate} — ${games.length} game(s), ${briefs.length} brief(s), ${cards.length} card(s)`)
  console.log(`  final games carrying BOTH a during-play and an after-play brief: ${testable.length}\n`)

  if (testable.length === 0) {
    console.log('  NOT OBSERVABLE — no game on this slate carries both phases, so the')
    console.log('  preference has nothing to choose between. This is not a pass.\n')
    console.log(`::warning::brief-phase rule NOT OBSERVABLE on ${shownDate}`)
    process.exit(summarize() === 0 ? 0 : 1)
  }

  // The artifact: one row per game, the expectation beside what the DOM shows.
  //
  // `(no card / no kind)` USED TO BE ONE STRING FOR TWO FAILURES, and it cost a
  // diagnosis. live-check went red on 2026-08-31 with
  //
  //     Dallas @ St. Louis: expected game_recap, shown (no card / no kind)
  //
  // and that message cannot distinguish "the desk did not render this game"
  // from "the desk rendered it and this matcher did not find it". Those have
  // opposite fixes -- one is a rendering bug in the app, the other is a bug in
  // this file -- and the run reported neither. Same collapse this session has
  // now found six times, here in a check written to catch collapses.
  //
  // So the states are separated and the row carries its own evidence: when no
  // card matches, the closest team lines the page actually rendered are printed
  // beside it, because the next run has to be able to tell which of the two it
  // is without anyone opening a browser.
  const wrong = []
  console.log('  game'.padEnd(42) + 'expected'.padEnd(14) + 'shown')
  for (const { g, want } of testable) {
    const label = `${g.away} @ ${g.home}`
    // FILTER, NOT FIND. `find` takes the first match and says nothing about the
    // rest, which is how this check spent three rounds blaming the wrong thing.
    //
    // The 2026-08-30 payload carries `Dallas @ St. Louis` TWICE: once finalized
    // (id MLS_2026-08-30_stlouis_dallas, espn 761769, finalized_at set, and
    // carrying pre_game/game_live/game_recap) and once as an unplayed stub the
    // desk renders as "Scheduled — no start time" with no brief. Both cards say
    // "St. Louis CITY SC v FC Dallas", so matching on BOTH teams instead of
    // either would not have separated them.
    //
    // `find` silently picked the stub and reported "NO KIND rendered", which
    // reads as a rendering defect in the desk. The desk is right: it rendered
    // both rows the relay served. Taking the first of two and describing it as
    // "the" card is this file's bug.
    const matching = cards.filter(c => c.teams.includes(g.away) || c.teams.includes(g.home))
    const card = matching[0]
    let shown
    if (matching.length > 1) {
      shown = `(AMBIGUOUS — ${matching.length} cards match: ` +
              matching.map(c => `${JSON.stringify(c.status)}/${JSON.stringify(c.kind)}`).join(' ') + ')'
    } else if (card) {
      shown = card.kind ?? '(card found, NO KIND rendered)'
    } else {
      // Not "no card". Either the game is absent from the page, or it is there
      // under a name this exact-substring matcher cannot see.
      const near = cards
        .map(c => ({ c, n: Math.max(overlap(c.teams, g.away), overlap(c.teams, g.home)) }))
        .filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2)
      shown = near.length
        ? `(NO EXACT MATCH; page has: ${near.map(x => JSON.stringify(x.c.teams)).join(', ')})`
        : '(NOT RENDERED — no card on the page shares a word with either team)'
    }
    const ok = shown === want
    if (!ok) {
      wrong.push(`${label}: expected ${want}, shown ${shown}`)
      // THE ROW PRINTS ITS OWN EVIDENCE.
      //
      // The previous round narrowed this from "(no card / no kind)" to "(card
      // found, NO KIND rendered)", which eliminated both hypotheses at once:
      // the desk DOES render the game, and this matcher DOES find its card. The
      // card simply carries no brief, while the payload carries a game_recap
      // that `expectedKind` resolved to it.
      //
      // So the divergence is between two implementations of one rule — this
      // file's `briefMatches`, transcribed independently, and `briefKeyMatches`
      // in src/Desk.fs. That is precisely what this check's header says it
      // exists to catch, and the next step needs the keys both sides are
      // matching on, not another guess at the source.
      const mine = briefs.filter(b => briefMatches(g, b))
      console.log(`      evidence: game.id=${JSON.stringify(g.id)} espn_event_id=${JSON.stringify(g.espn_event_id)}`)
      console.log(`                finalized_at=${JSON.stringify(g.finalized_at)} sport=${JSON.stringify(g.sport)}`)
      for (const b of mine.slice(0, 6)) {
        console.log(`                brief game_id=${JSON.stringify(b.game_id)} type=${JSON.stringify(b.brief_type)} text=${(b.brief_text || '').length}ch`)
      }
      if (card) console.log(`                card teams=${JSON.stringify(card.teams)} status=${JSON.stringify(card.status)} kind=${JSON.stringify(card.kind)}`)
    }
    console.log(`  ${label.slice(0, 40).padEnd(40)}${want.padEnd(14)}${shown}${ok ? '' : '   <-- '}`)
  }
  console.log('')

  // The payload carried the SAME fixture twice on 2026-08-30 under two naming
  // conventions -- `Lynx @ Dream` and `Minnesota Lynx @ Atlanta Dream`, and the
  // same for Sparks/Storm. That is a relay-side observation, not this repo's
  // bug, and it is counted rather than asserted on: a duplicate inflates the
  // testable population and makes one card satisfy two rows.
  // KEYED ON espn_event_id FIRST. The name-based key missed the MLS duplicate
  // entirely: it took the last significant word of each side, which turns
  // `Dallas @ St. Louis` into dallas|louis and `FC Dallas @ St. Louis CITY SC`
  // into dallas|sc. Two keys, one fixture, no note. An event id names a fixture
  // exactly and needs no convention to agree with itself.
  const seen = new Map()
  for (const g of games) {
    const k = g.espn_event_id != null
      ? `espn:${g.espn_event_id}`
      : `${norm(g.away)}|${norm(g.home)}`.split('|').map(x => x.split(' ').pop()).join('|')
    if (!seen.has(k)) seen.set(k, [])
    seen.get(k).push(`${g.away} @ ${g.home}${g.finalized_at ? ' (final)' : ' (not final)'}`)
  }
  const dupes = [...seen].filter(([, v]) => v.length > 1).map(([k, v]) => [`${k} → ${v.join(' | ')}`, v.length])
  if (dupes.length) {
    console.log(`  NOTE: ${dupes.length} fixture(s) appear more than once in the payload under`)
    console.log(`  different naming conventions: ${dupes.map(([k, n]) => `${k} x${n}`).join(', ')}`)
    console.log('  Relay-side. Counted, not asserted on.\n')
  }

  check(`every final game with both phases shows its after-play brief (${testable.length} testable)`,
    wrong.length === 0,
    wrong.slice(0, 5).join(' | '))

  process.exit(summarize() === 0 ? 0 : 1)
}
