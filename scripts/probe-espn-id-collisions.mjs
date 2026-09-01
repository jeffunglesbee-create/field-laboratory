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

/**
 * `safe` | `unsafe` | `not-observable`, from the classified groups.
 *
 * A ROW COUNT, NOT A RESPONSE COUNT, decides observability. Caught 2026-09-01 by
 * running this file against a stub that answered HTTP 200 with an empty slate on
 * every date: thirty dates "observed", zero games, and the verdict came back
 * `safe`. Nothing had been checked. `datesObserved` counts payloads that parsed;
 * only `rowsSeen` says whether any fixture was ever looked at.
 *
 * `rowsSeen` is required. Defaulting it would restore the hole in the one shape
 * that hides it — a caller that forgot to pass it and got a pass anyway.
 */
export const verdictFor = ({ datesObserved, rowsSeen, groups }) => {
  if (rowsSeen == null) throw new TypeError('verdictFor: rowsSeen is required')
  if (datesObserved === 0 || rowsSeen === 0) return 'not-observable'
  if (groups.some(g => !g.same)) return 'unsafe'
  return 'safe'
}

/**
 * Is this an id the relay actually got from ESPN?
 *
 * THE REFINEMENT THE FIRST SWEEP FORCED. That run came back `unsafe` on three
 * groups, all golf, all of this shape: `golf_401811962` is a per-TOURNAMENT
 * synthetic key, and R3 and R4 of the FedEx St. Jude are two archive rows under
 * it. Every safe group was a bare numeric ESPN event id. So the refined proposal
 * for field-relay-nba#1 is not "key on espn_event_id" but "key on it WHEN IT IS
 * ONE" — and this predicate is that scope, stated once.
 */
export const isEspnId = v => /^\d+$/.test(String(v ?? ''))

/**
 * The refined rule's verdict: same question, restricted to numeric ids.
 *
 * A group whose id is non-numeric is OUT OF SCOPE, not forgiven. Those rows keep
 * the name-derived id they have today, so a collision among them cannot be
 * caused by a change that never touches them.
 */
export const verdictForNumeric = ({ datesObserved, rowsSeen, groups }) => {
  if (rowsSeen == null) throw new TypeError('verdictForNumeric: rowsSeen is required')
  if (datesObserved === 0 || rowsSeen === 0) return 'not-observable'
  if (groups.some(g => isEspnId(g.id) && !g.same)) return 'unsafe'
  return 'safe'
}

/** Rows carrying an event id at all, and rows carrying a numeric one. */
export const coverageOf = (games) => {
  const rows = games ?? []
  const present = rows.filter(g => g?.espn_event_id != null && g.espn_event_id !== '')
  return {
    rows: rows.length,
    present: present.length,
    numeric: present.filter(g => isEspnId(g.espn_event_id)).length,
  }
}

/**
 * `measured` | `unreadable` | `not-observable` — three states, because the
 * middle one is the one that would otherwise be reported as a confident 0%.
 *
 * If rows came back and NOT ONE carries the field, the honest reading is that
 * this probe is looking at the wrong key, not that the relay stopped populating
 * it on every row of every sport for thirty days. Calling that "0% coverage"
 * would be a measurement of the probe, published as a measurement of the relay.
 */
export const coverageVerdict = ({ rows, present }) => {
  if (rows === 0) return 'not-observable'
  if (present === 0) return 'unreadable'
  return 'measured'
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
    verdictFor({ datesObserved: 30, rowsSeen: 1085, groups: [{ same: true }, { same: true }] }) === 'safe')
  check('ONE different-fixture group → unsafe, however many are fine',
    verdictFor({ datesObserved: 30, rowsSeen: 1085, groups: [{ same: true }, { same: false }] }) === 'unsafe',
    'a single collapsed game destroys data; a majority verdict would hide it')
  check('no dates observed is not a pass',
    verdictFor({ datesObserved: 0, rowsSeen: 0, groups: [] }) === 'not-observable')
  check('THIRTY 200s OVER AN EMPTY SLATE IS NOT A PASS',
    verdictFor({ datesObserved: 30, rowsSeen: 0, groups: [] }) === 'not-observable' &&
    verdictForNumeric({ datesObserved: 30, rowsSeen: 0, groups: [] }) === 'not-observable',
    'the responses arrived; no fixture was ever examined')
  check('omitting rowsSeen throws rather than passing', (() => {
    try { verdictFor({ datesObserved: 30, groups: [] }); return false } catch { return true }
  })())
  check('no collisions at all is safe, not not-observable',
    verdictFor({ datesObserved: 30, rowsSeen: 1085, groups: [] }) === 'safe')

  // ── the refined rule: numeric ids only ────────────────────────────────────
  check('a bare ESPN event id is in scope', isEspnId('401857186') === true)
  check("GOLF'S PER-TOURNAMENT KEY IS NOT, which is the whole refinement",
    isEspnId('golf_401811962') === false)
  check('a null or empty id is not an ESPN id',
    isEspnId(null) === false && isEspnId('') === false && isEspnId(undefined) === false)
  check('a numeric-looking id with a space is not one', isEspnId(' 401857186') === false)

  const OBSERVED = [
    { id: '401857186',      same: true  },  // WNBA, two spellings — the fix's target
    { id: 'golf_401811962', same: false },  // R3 + R4 of one tournament
  ]
  check('THE OBSERVED WINDOW IS UNSAFE UNDER THE ORIGINAL RULE',
    verdictFor({ datesObserved: 30, rowsSeen: 1085, groups: OBSERVED }) === 'unsafe')
  check('...AND SAFE UNDER THE REFINED ONE — this is the filter having teeth',
    verdictForNumeric({ datesObserved: 30, rowsSeen: 1085, groups: OBSERVED }) === 'safe',
    'if both verdicts agreed on this input the numeric filter would be decorative')
  check('a numeric id on two different games is still unsafe when refined',
    verdictForNumeric({ datesObserved: 30, rowsSeen: 1085, groups: [{ id: '401857186', same: false }] }) === 'unsafe',
    'the filter narrows scope; it must not forgive a collision inside that scope')
  check('no dates observed is not a pass under the refined rule either',
    verdictForNumeric({ datesObserved: 0, rowsSeen: 0, groups: [] }) === 'not-observable')

  // ── coverage ──────────────────────────────────────────────────────────────
  const cov = coverageOf([
    { espn_event_id: '401857186' },
    { espn_event_id: 'golf_401811962' },
    { espn_event_id: null },
    { espn_event_id: '' },
    {},
  ])
  check('coverage separates present-at-all from numeric',
    cov.rows === 5 && cov.present === 2 && cov.numeric === 1)
  check('an empty string is absent, not present',
    coverageOf([{ espn_event_id: '' }]).present === 0)
  check('rows but no field anywhere is UNREADABLE, not 0% coverage',
    coverageVerdict({ rows: 500, present: 0 }) === 'unreadable',
    'reporting that as 0% would publish a broken probe as a relay measurement')
  check('no rows at all is not-observable',
    coverageVerdict({ rows: 0, present: 0 }) === 'not-observable')
  check('one present row is enough to be measured',
    coverageVerdict({ rows: 500, present: 1 }) === 'measured')

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
  const gapBySport = new Map()
  let datesObserved = 0, rowsSeen = 0, idsPresent = 0, idsNumeric = 0
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
    const c = coverageOf(games)
    idsPresent += c.present; idsNumeric += c.numeric
    for (const g of games) {
      if (isEspnId(g?.espn_event_id)) continue
      const k = String(g?.sport ?? '?')
      gapBySport.set(k, (gapBySport.get(k) ?? 0) + 1)
    }
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

  const verdict = verdictFor({ datesObserved, rowsSeen, groups })
  const refined = verdictForNumeric({ datesObserved, rowsSeen, groups })
  const covState = coverageVerdict({ rows: rowsSeen, present: idsPresent })
  const bad = groups.filter(g => !g.same)
  const badNumeric = bad.filter(g => isEspnId(g.id))
  const pct = n => rowsSeen ? `${(100 * n / rowsSeen).toFixed(1)}%` : 'n/a'
  log('')
  log(`${datesObserved} date(s) observed, ${rowsSeen} row(s), ${groups.length} collision group(s)`)
  log(`same fixture: ${groups.length - bad.length}   DIFFERENT fixtures: ${bad.length}`)
  log('')

  // ── COVERAGE: how much of the archive the refined key could ever address ──
  log('COVERAGE of the proposed key')
  if (covState !== 'measured') {
    log(`  ${covState.toUpperCase()} — ${covState === 'not-observable'
      ? 'no rows returned; nothing to measure'
      : `${rowsSeen} row(s) returned and not one carries espn_event_id. That reads as a\n  probe pointed at the wrong field, not as a relay that stopped populating it.`}`)
  } else {
    log(`  any espn_event_id : ${idsPresent} / ${rowsSeen}  (${pct(idsPresent)})`)
    log(`  NUMERIC (in scope): ${idsNumeric} / ${rowsSeen}  (${pct(idsNumeric)})`)
    log(`  rows the refined key cannot address: ${rowsSeen - idsNumeric} (${pct(rowsSeen - idsNumeric)})`)
    const gaps = [...gapBySport.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    for (const [sport, n] of gaps) log(`      ${String(sport).padEnd(10)} ${String(n).padStart(4)}`)
    log('  Those rows keep their name-derived id. The refined proposal is a partial fix')
    log('  by construction, and this is the fraction it leaves alone.')
  }
  log('')
  log(`VERDICT (original, any id) : ${verdict}`)
  log(`VERDICT (refined, numeric) : ${refined}   [${badNumeric.length} numeric collision(s) on different fixtures]`)
  log('')
  log({
    safe: 'No NUMERIC event id was ever shared by two different games. Keying the archive\n' +
          'id on espn_event_id WHEN IT IS PURELY NUMERIC cannot collapse distinct fixtures\n' +
          'over this window — the Rule 39 step-2 check for field-relay-nba#1 passes for the\n' +
          'refined proposal. It does NOT pass for the proposal as originally filed; see the\n' +
          'original verdict above and the golf pairs listed below it.',
    unsafe: 'At least one NUMERIC event id is shared by two DIFFERENT games. The numeric\n' +
            'filter is not sufficient either. field-relay-nba#1 must not ship in any form\n' +
            'that keys the archive id on espn_event_id; the pairs are listed above.',
    'not-observable': 'No date returned a payload. Nothing was checked — this is neither a\n' +
            'pass nor a failure.',
  }[refined])
  log('')
  log('— for reference, the ORIGINAL (unfiltered) proposal —')
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
  // Exits on the REFINED verdict: that is the live question. The original
  // verdict is already answered (unsafe, a5641f8) and is reported, not gating.
  process.exit(refined === 'unsafe' ? 1 : 0)
}
