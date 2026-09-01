// Would keying the archive id on `espn_event_id` ever MERGE TWO DIFFERENT GAMES?
//
// THE QUESTION THIS ANSWERS, AND WHY IT IS NOT "are there duplicates"
//
// field-relay-nba#1 proposes composing the archive id from `espn_event_id`
// instead of team names, following the precedent that repo already set for
// `series_key`. Before that is committable, their Rule 39 wants the equivalent
// of the check they ran for the series fix — "verified live, zero (series_key,
// round, date) duplicates across all 501 real postseason_games rows".
//
// The equivalent here is NOT "does any event id appear twice". It appears twice
// on purpose: that is the bug. The question is what the two rows ARE.
//
//   SAME FIXTURE, two spellings   the duplicate bug. Merging them is the fix.
//   DIFFERENT FIXTURES            two real games sharing one event id. Keying
//                                 on it would COLLAPSE THEM, destroying a game.
//                                 One instance makes the proposal unsafe.
//
// A sweep that reported only a count would answer neither.
//
// CREDENTIAL-FREE ON PURPOSE. /d1/execute could answer this in one query and is
// gated by a shared secret; /context/date is a public read that already carries
// `espn_event_id` per row. Using the public path keeps a credential out of a
// question that does not need one.
//
// Usage:  node scripts/probe-espn-id-collisions.mjs [--days 30]
//         node scripts/probe-espn-id-collisions.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'
import { scanDuplicates } from './relay-duplicate-fixture-watch.mjs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'

/** Diacritics and punctuation out, so `Málaga` and `St. Louis` compare. */
export const norm = t => (t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

/** Words long enough to identify a club. `FC` and `SC` identify nothing. */
export const tokens = t => new Set(norm(t).split(' ').filter(w => w.length > 2))

/**
 * Are these two team names the same club under name drift?
 *
 * SUBSET, NOT EQUALITY. The whole defect is that one write path says `Lynx` and
 * another says `Minnesota Lynx`. Equality calls those different clubs and every
 * duplicate would be reported as a dangerous collision — the alarm would fire on
 * exactly the rows the fix is meant to merge.
 *
 * Subset in EITHER direction, because which spelling is the short one is not
 * knowable in advance.
 */
export const sameTeam = (a, b) => {
  const A = tokens(a), B = tokens(b)
  if (!A.size || !B.size) return false
  const [small, big] = A.size <= B.size ? [A, B] : [B, A]
  return [...small].every(w => big.has(w))
}

/**
 * Same fixture, or two different games wearing one event id?
 *
 * Checked BOTH WAYS ROUND. A row pair can disagree about which side is home —
 * the relay's own `HomeVersusAway` handling exists because feeds disagree about
 * that — and calling a home/away flip "two different games" would raise a false
 * alarm that blocks a correct fix.
 */
export const sameFixture = (x, y) =>
  (sameTeam(x.home, y.home) && sameTeam(x.away, y.away)) ||
  (sameTeam(x.home, y.away) && sameTeam(x.away, y.home))

/** `safe` | `unsafe` | `not-observable`, from the classified groups. */
export const verdictFor = ({ datesObserved, groups }) => {
  if (datesObserved === 0) return 'not-observable'
  if (groups.some(g => !g.same)) return 'unsafe'
  return 'safe'
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const g = (home, away) => ({ home, away })

  check('a short name is the same club as its long form',
    sameTeam('Lynx', 'Minnesota Lynx') === true)
  check('...and the other way round', sameTeam('Minnesota Lynx', 'Lynx') === true)
  check('EQUALITY WOULD HAVE FAILED THIS, and flagged the bug as a collision',
    sameTeam('Dream', 'Atlanta Dream') === true &&
    norm('Dream') !== norm('Atlanta Dream'))
  check('two real clubs are not the same club',
    sameTeam('Chelsea', 'Brighton') === false)
  check('FC AND SC IDENTIFY NOTHING, so they cannot make clubs match',
    sameTeam('FC Dallas', 'SC Dallas') === true && sameTeam('FC Dallas', 'FC Cincinnati') === false)
  check('the observed MLS pair is one fixture',
    sameFixture(g('St. Louis', 'Dallas'), g('St. Louis CITY SC', 'FC Dallas')) === true)
  check('A HOME/AWAY FLIP IS STILL ONE FIXTURE',
    sameFixture(g('Dream', 'Lynx'), g('Minnesota Lynx', 'Atlanta Dream')) === true,
    'feeds disagree about sides; calling that two games blocks a correct fix')
  check('two genuinely different games are NOT one fixture',
    sameFixture(g('Chelsea', 'Brighton'), g('Leeds', 'Brentford')) === false)

  check('every group same-fixture → safe',
    verdictFor({ datesObserved: 30, groups: [{ same: true }, { same: true }] }) === 'safe')
  check('ONE different-fixture group → unsafe, however many are fine',
    verdictFor({ datesObserved: 30, groups: [{ same: true }, { same: false }] }) === 'unsafe',
    'a single collapsed game destroys data; a majority verdict would hide it')
  check('no dates observed is not a pass',
    verdictFor({ datesObserved: 0, groups: [] }) === 'not-observable')
  check('no collisions at all is safe, not not-observable',
    verdictFor({ datesObserved: 30, groups: [] }) === 'safe')
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--days')
  const days = i >= 0 ? Number(process.argv[i + 1]) : 30
  mkdirSync('outbox', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = `outbox/espn-id-collisions-${stamp}.txt`
  const out = []
  const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

  log(`probe_at: ${new Date().toISOString()}`)
  log(`question: would keying the archive id on espn_event_id ever merge two DIFFERENT games?`)
  log(`method:   public GET /context/date, no credential. ${days} day(s) back from today (ET).`)
  log('')

  const groups = []
  let datesObserved = 0, rowsSeen = 0
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  for (let d = 1; d <= days; d++) {
    const day = new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10)
    let payload
    try {
      const r = await fetch(`${RELAY}/context/date/${day}`, { signal: AbortSignal.timeout(25000) })
      if (!r.ok) { log(`  ${day}  HTTP ${r.status} — not observed`); continue }
      payload = await r.json()
    } catch (e) { log(`  ${day}  ${String(e).slice(0, 50)} — not observed`); continue }

    const games = [...(payload.games?.regular ?? []), ...(payload.games?.postseason ?? [])]
    datesObserved++; rowsSeen += games.length
    const dupes = scanDuplicates(games)
    if (!dupes.length) { log(`  ${day}  ${String(games.length).padStart(3)} row(s)  —`); continue }

    const lines = []
    for (const dup of dupes) {
      const rows = games.filter(x => String(x.espn_event_id) === dup.id)
      const same = rows.every(r => sameFixture(rows[0], r))
      groups.push({ date: day, id: dup.id, same })
      lines.push(`      espn:${dup.id}  ${same ? 'same fixture' : '*** DIFFERENT FIXTURES ***'}`)
      for (const r of rows) lines.push(`        ${r.id}  ${r.away} @ ${r.home}`)
    }
    log(`  ${day}  ${String(games.length).padStart(3)} row(s)  ${dupes.length} collision(s)`)
    for (const l of lines) log(l)
  }

  const verdict = verdictFor({ datesObserved, groups })
  const bad = groups.filter(g => !g.same)
  log('')
  log(`${datesObserved} date(s) observed, ${rowsSeen} row(s), ${groups.length} collision group(s)`)
  log(`same fixture: ${groups.length - bad.length}   DIFFERENT fixtures: ${bad.length}`)
  log(`VERDICT: ${verdict}`)
  log('')
  log({
    safe: 'No event id was ever shared by two different games. Keying the archive id on\n' +
          'espn_event_id cannot collapse distinct fixtures over this window — the Rule 39\n' +
          'step-2 check for field-relay-nba#1 passes on the evidence available here.',
    unsafe: 'At least one event id is shared by two DIFFERENT games. Keying on it would\n' +
            'merge them and destroy a row. The proposal in field-relay-nba#1 must not ship\n' +
            'as written; the pairs are listed above.',
    'not-observable': 'No date returned a payload. Nothing was checked — this is neither a\n' +
            'pass nor a failure.',
  }[verdict])
  log('')
  log(`artifact: ${outPath}`)
  process.exit(verdict === 'unsafe' ? 1 : 0)
}
