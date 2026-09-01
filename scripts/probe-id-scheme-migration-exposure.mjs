// How many rows would the numeric-id upsert key ORPHAN on the day it ships?
//
// THE HAZARD THIS MEASURES, AND WHY THE SPEC WAS INCOMPLETE WITHOUT IT
//
// docs/CC-CMD-2026-09-01-... proposes building the archive id from a numeric
// `source_id`. The 2026-07-15 series fix made the same shape of change and
// disclosed the same residual: a row seeded under the OLD id, then resolved
// under the NEW one, duplicates exactly once and self-heals.
//
// The relay's own 2026-08-08 CC-CMD corrected that, in a comment above the id
// composition it still carries at HEAD:
//
//   "then self-heals" is true of the ID and false of the ROW ... Because those
//   imports carried FUTURE-dated fixtures, the old-scheme row was never the
//   thing that got resolved: resolution wrote the new id and the old row was
//   never touched again. It stays permanently unscored.
//
// Measured cost there: 55 duplicate groups, 110 rows, all MLS. Not a handful.
//
// So the number that decides whether the numeric key can ship is not "are
// numeric ids unique" — that is answered, safe — but HOW MANY UNSCORED,
// FUTURE-DATED ROWS ALREADY CARRY A NUMERIC EVENT ID. Every one of them is a
// row that will be written again under a new id and stranded under its old one.
//
// A backward sweep cannot see them. This one runs FORWARD.
//
// Usage:  node scripts/probe-id-scheme-migration-exposure.mjs [--forward 21]
//         node scripts/probe-id-scheme-migration-exposure.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'
import { isEspnId } from './probe-espn-id-collisions.mjs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'

/**
 * A row this change would strand: unscored, so a later write is still coming,
 * and carrying a numeric event id, so that write lands on a different id.
 *
 * A SCORED row is not exposed. Nothing writes to it again, so the id it holds
 * is the id it keeps. Counting it would inflate the number with rows that are
 * already finished — the same conflation as calling every future-dated row a
 * duplicate-in-waiting regardless of whether anything will ever touch it.
 */
export const isExposed = (g) =>
  g?.home_score == null && isEspnId(g?.espn_event_id)

export const exposureOf = (games) => {
  const rows = games ?? []
  return {
    rows: rows.length,
    scored: rows.filter(g => g?.home_score != null).length,
    exposed: rows.filter(isExposed).length,
  }
}

/**
 * `measured` | `unreadable` | `not-observable`.
 *
 * THE CONTROL DAY IS WHAT MAKES THIS HONEST. A forward sweep legitimately sees
 * no scores — every fixture is unplayed — so "zero scored rows" cannot
 * distinguish "the future has no results yet" from "this probe is reading a
 * field the payload does not have", and under the second reading EVERY row
 * counts as exposed and the number is fabricated.
 *
 * A past date resolves it. Yesterday must contain scored rows. If it does not,
 * `home_score` is not being read, and the forward count means nothing.
 */
export const exposureVerdict = ({ forwardRows, controlRows, controlScored }) => {
  if (forwardRows === 0 && controlRows === 0) return 'not-observable'
  if (controlRows === 0 || controlScored === 0) return 'unreadable'
  return 'measured'
}

/**
 * `clear` | `quiet-window` | `cleanup-required` — what to actually do.
 *
 * TODAY AND THE FUTURE ARE NOT THE SAME EXPOSURE, and collapsing them produces
 * the wrong instruction. Measured 2026-09-01: 5 exposed rows, all MLB, all on
 * TODAY, and zero on all 21 forward dates. The first version of this probe read
 * that as "ship only with a paired cleanup" — the remedy for the 2026-08-08
 * disaster, which was a bulk import of FUTURE fixtures that sat unresolved for
 * weeks.
 *
 * Today's rows are not that. They are tonight's in-flight games, seeded at
 * first pitch and resolving within hours on their own. The remedy is a deploy
 * window, not a cleanup — and telling someone to write a cleanup for rows that
 * will fix themselves before they finish writing it is worse than useless: it
 * makes the real signal, a future backlog, indistinguishable from routine.
 *
 * A future-dated exposed row IS the 2026-08-08 shape: nothing resolves it on a
 * schedule anyone is waiting for, so it strands.
 */
export const shipAdvice = ({ todayExposed, futureExposed }) => {
  if (futureExposed > 0) return 'cleanup-required'
  if (todayExposed > 0) return 'quiet-window'
  return 'clear'
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const row = (hs, eid) => ({ home_score: hs, espn_event_id: eid })

  check('an unscored row with a numeric id is exposed',
    isExposed(row(null, '401857186')) === true)
  check('A SCORED ROW IS NOT EXPOSED, however numeric its id',
    isExposed(row(101, '401857186')) === false,
    'nothing writes to it again, so its id is the id it keeps')
  check('a zero score is scored, not unscored',
    isExposed(row(0, '401857186')) === false,
    '0 == null is false but a falsy check would call this unscored')
  check('an unscored row with no id is not exposed',
    isExposed(row(null, null)) === false)
  check("an unscored GOLF row is not exposed — it keeps the name scheme",
    isExposed(row(null, 'golf_401811962')) === false)

  const e = exposureOf([
    row(null, '401857186'), row(null, '401857187'),
    row(12, '401857188'), row(null, 'golf_1'), row(null, null),
  ])
  check('exposure counts rows, scored and exposed separately',
    e.rows === 5 && e.scored === 1 && e.exposed === 2)

  check('a forward count with a scored control day is measured',
    exposureVerdict({ forwardRows: 300, controlRows: 40, controlScored: 12 }) === 'measured')
  check('NO SCORED ROW ON THE CONTROL DAY IS UNREADABLE, NOT ZERO EXPOSURE',
    exposureVerdict({ forwardRows: 300, controlRows: 40, controlScored: 0 }) === 'unreadable',
    'without it, a forward sweep that cannot read home_score reports every row as exposed')
  check('no control day at all is also unreadable',
    exposureVerdict({ forwardRows: 300, controlRows: 0, controlScored: 0 }) === 'unreadable')
  check('nothing anywhere is not-observable',
    exposureVerdict({ forwardRows: 0, controlRows: 0, controlScored: 0 }) === 'not-observable')

  // ── today is not the future ───────────────────────────────────────────────
  check('THE REAL 2026-09-01 READING IS A DEPLOY WINDOW, NOT A CLEANUP',
    shipAdvice({ todayExposed: 5, futureExposed: 0 }) === 'quiet-window',
    "5 in-flight MLB games resolve within hours; a cleanup for them is worse than useless")
  check('one future-dated exposed row IS the 2026-08-08 shape',
    shipAdvice({ todayExposed: 0, futureExposed: 1 }) === 'cleanup-required',
    'nothing resolves it on a schedule anyone is waiting for')
  check('future wins over today when both are non-zero',
    shipAdvice({ todayExposed: 5, futureExposed: 1 }) === 'cleanup-required')
  check('nothing exposed anywhere is clear',
    shipAdvice({ todayExposed: 0, futureExposed: 0 }) === 'clear')
  check('COLLAPSING THE TWO WOULD HAVE GIVEN ONE ANSWER FOR BOTH',
    shipAdvice({ todayExposed: 5, futureExposed: 0 }) !==
    shipAdvice({ todayExposed: 0, futureExposed: 5 }),
    'the same total, opposite remedies — this is the distinction the probe missed')

  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--forward')
  const days = i >= 0 ? Number(process.argv[i + 1]) : 21
  mkdirSync('outbox', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = `outbox/id-scheme-migration-exposure-${stamp}.txt`
  const out = []
  const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

  const fetchDay = async (day) => {
    try {
      const r = await fetch(`${RELAY}/context/date/${day}`, { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return null
      const p = await r.json()
      return [...(p.games?.regular ?? []), ...(p.games?.postseason ?? [])]
    } catch { return null }
  }

  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const dayAt = n => new Date(today.getTime() + n * 86400000).toISOString().slice(0, 10)

  log(`probe_at: ${new Date().toISOString()}`)
  log(`question: how many rows would the numeric-id upsert key strand on the day it ships?`)
  log(`method:   public GET /context/date. ${days} day(s) FORWARD from today (ET),`)
  log(`          plus yesterday as a readability control.`)
  log('')

  const control = await fetchDay(dayAt(-1)) ?? []
  const c = exposureOf(control)
  log(`control ${dayAt(-1)}  ${c.rows} row(s), ${c.scored} scored`)
  log('')

  let forwardRows = 0, exposed = 0, todayExposed = 0, futureExposed = 0
  const bySport = new Map()
  for (let d = 0; d <= days; d++) {
    const day = dayAt(d)
    const games = await fetchDay(day)
    if (games === null) { log(`  ${day}  not observed`); continue }
    const e = exposureOf(games)
    forwardRows += e.rows; exposed += e.exposed
    if (d === 0) todayExposed += e.exposed; else futureExposed += e.exposed
    for (const g of games) {
      if (!isExposed(g)) continue
      const k = String(g?.sport ?? '?')
      bySport.set(k, (bySport.get(k) ?? 0) + 1)
    }
    log(`  ${day}  ${String(e.rows).padStart(3)} row(s)  ${String(e.exposed).padStart(3)} exposed${d === 0 ? '   <- today (ET)' : ''}`)
  }

  const verdict = exposureVerdict({ forwardRows, controlRows: c.rows, controlScored: c.scored })
  log('')
  log(`VERDICT: ${verdict}`)
  log('')
  if (verdict !== 'measured') {
    log(verdict === 'not-observable'
      ? 'No date returned a payload. Nothing was measured.'
      : `The control day returned ${c.rows} row(s) and ${c.scored} scored. Without a scored\n` +
        'row on a past date, home_score is not being read, and every forward row would\n' +
        'count as exposed for the wrong reason. The forward count below is NOT a result.')
  } else {
    const advice = shipAdvice({ todayExposed, futureExposed })
    log(`${forwardRows} forward row(s), ${exposed} EXPOSED`)
    log(`  today (in flight, resolves on its own): ${todayExposed}`)
    log(`  future-dated (strands)                : ${futureExposed}`)
    for (const [s, n] of [...bySport.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      log(`    ${String(s).padEnd(10)} ${String(n).padStart(4)}`)
    }
    log('')
    log(`SHIP ADVICE: ${advice}`)
    log('')
    log({
      clear:
        'Nothing is exposed. Shipping the numeric key strands nothing — no unscored row\n' +
        'anywhere in this window carries a numeric event id, so no resolution write can\n' +
        'land on a new id and leave an old row behind. Ship now rather than after the\n' +
        'next bulk forward-schedule import; that import is what made the 55 groups.',
      'quiet-window':
        `${todayExposed} exposed row(s), ALL on today and NONE future-dated. These are\n` +
        'in-flight games seeded at start and resolving within hours on their own. This is\n' +
        'NOT the 2026-08-08 shape — that was a bulk import of future fixtures nothing was\n' +
        'waiting to resolve. There is no backlog to clean up.\n' +
        '\n' +
        'Deploy after tonight\'s slate finalizes and this count is zero. A deploy landing\n' +
        `mid-slate strands exactly these ${todayExposed} row(s) — bounded, nameable, and\n` +
        'avoidable by waiting a few hours rather than by writing a cleanup.',
      'cleanup-required':
        `${futureExposed} FUTURE-DATED unscored row(s) carry a numeric event id (plus\n` +
        `${todayExposed} in flight today). The future-dated ones are the 2026-08-08 shape:\n` +
        'nothing resolves them on a schedule anyone is waiting for, so each gets rewritten\n' +
        'under a new id and stranded under its old one, permanently unscored. Ship the\n' +
        'numeric key only with a paired cleanup for them. The breakdown above names the\n' +
        'sports; a bulk forward-schedule import is the usual cause.',
    }[advice])
  }
  log('')
  log(`artifact: ${outPath}`)
  process.exit(verdict === 'measured' ? 0 : 1)
}
