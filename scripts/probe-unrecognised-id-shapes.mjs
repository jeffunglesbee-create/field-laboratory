// What ARE the 956 `unrecognised` ids?
//
// THE GAP THIS CLOSES. The relay's provenance census called 591 rows `dash`;
// `schemeOf` calls 1007 (now 956) `unrecognised`. Different predicates over the
// same rows — `idScheme` requires a leading ISO date AND no underscore anywhere,
// `schemeOf` calls `unrecognised` everything matching none of seven shapes — so
// `unrecognised` is the wider set and roughly 416 rows sit in neither the dash
// shape nor any recognised one. That difference was recorded as "its own
// question" on 2026-09-03 and never measured. This measures it.
//
// THE FAMILIES ARE DERIVED, NOT ENUMERATED. Listing the shapes I expect and
// counting them would find exactly the shapes I thought of, and the whole reason
// this bucket exists is that the column holds key spaces nobody enumerated. So
// each id is reduced to a SIGNATURE — digit runs to `9`, letter runs to `a`,
// separators kept — and the families are whatever the signatures group into.
// A shape nobody has ever seen shows up as its own row.
//
// AND THE RECONCILIATION IS A PREDICTION, NOT A RESTATEMENT. This restates the
// relay's dash rule so the two counts can be compared, which is a second copy of
// a predicate and would normally be the defect. It is made safe by being
// falsifiable: the census measured 591 dash rows over 2777, and 51 dash rows
// were merged away on 2026-09-03, so this must now report 540. A restatement
// that drifted would not land on the number the other repo measured minus the
// number this repo deleted.
//
// Usage:  node scripts/probe-unrecognised-id-shapes.mjs
//         node scripts/probe-unrecognised-id-shapes.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'
import { schemeOf } from './game-id-scheme.mjs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const RELAY_SECRET = process.env.RELAY_SHARED_SECRET || ''
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/**
 * An id reduced to its shape: digit runs become `9`, letter runs become `a`,
 * everything else is kept verbatim.
 *
 * RUNS, NOT CHARACTERS. `2026-08-30-mls-stl-dal` and `2026-08-30-mls-stlouis-dallas`
 * are the same shape and differ only in how long the abbreviations are; per-character
 * substitution would split them into two families and bury the real grouping under
 * length noise.
 */
export const signature = (id) =>
  String(id ?? '').replace(/[0-9]+/g, '9').replace(/[A-Za-z]+/g, 'a')

/**
 * The relay's `idScheme` dash rule, restated for cross-checking.
 *
 * A SECOND COPY OF A PREDICATE, which this project normally refuses. It is here
 * because the two repos cannot import from each other on a runner, and it is
 * made safe by the prediction above rather than by care: if this drifts from
 * `src/d1-provenance.js`'s rule, the count will not land on 540.
 */
export const isDashScheme = (id) => {
  const s = String(id ?? '').trim()
  if (!s || s.includes('_')) return false
  return /^\d{4}-\d{2}-\d{2}-/.test(s)
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('a date-led dash id reduces to its shape',
    signature('2026-08-30-mls-stl-dal') === '9-9-9-a-a-a')
  check('DIFFERENT ABBREVIATION LENGTHS ARE ONE SHAPE',
    signature('2026-08-30-mls-stl-dal') === signature('2026-08-30-mls-stlouis-dallas'),
    'per-character substitution would split these and bury the grouping in length noise')
  check('a round label is a different shape from a dated one',
    signature('nba-ecf-2026-g1') !== signature('2026-08-30-mls-stl-dal'))
  check('...and it is this one', signature('nba-ecf-2026-g1') === 'a-a-9-a9')
  check('separators survive', signature('a_b-c.d') === 'a_a-a.a')
  check('an empty id has an empty signature', signature('') === '' && signature(null) === '')

  // The two shapes the relay measured, and the two it did not.
  check('the observed dash ids are dash-scheme',
    isDashScheme('2026-08-30-mls-stl-dal') && isDashScheme('2026-05-09-epl-bright-wolver'))
  check('AN UNDERSCORE ANYWHERE DISQUALIFIES, even after a leading date',
    !isDashScheme('2026-08-30-mls-stl_dal'),
    'this is the half of the relay rule a restatement most easily loses')
  check('a round label is not dash-scheme', !isDashScheme('nba-ecf-2026-g1'))
  check('a bare date with no trailing hyphen is not', !isDashScheme('2026-08-30'))
  // THE ANCHOR, WITH A COUNTEREXAMPLE. Removing `^` from the date test left this
  // file at 12/12 until this case existed: an id carrying a date somewhere other
  // than the start would then have been counted as dash-scheme, and the
  // reconciliation would have over-counted without any test noticing.
  check('A DATE THAT IS NOT AT THE START DOES NOT MAKE IT DASH-SCHEME',
    !isDashScheme('mls-2026-08-30-stl-dal'),
    'the relay rule anchors the date; an unanchored restatement over-counts')
  check('...nor one buried mid-id', !isDashScheme('round-of-16-2026-08-30-a'))
  check('a two-digit year is not a date', !isDashScheme('26-08-30-mls-stl-dal'))
  check('empty is not dash-scheme', !isDashScheme('') && !isDashScheme(null))

  process.exit(summarize() === 0 ? 0 : 1)
}

// ─── the sweep ────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  if (!RELAY_SECRET) {
    console.error('RELAY_SHARED_SECRET is not set. This reads the games tables through '
      + 'POST /d1/execute and will not guess it.')
    process.exit(1)
  }
  const d1 = async (sql) => {
    const r = await fetch(`${RELAY}/d1/execute`, {
      method: 'POST',
      headers: { 'X-FIELD-Relay': RELAY_SECRET, 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ sql, params: [] }),
    })
    const t = await r.text()
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`)
    const j = JSON.parse(t)
    if (j.ok === false) throw new Error(`relay error: ${j.error}`)
    return j.results || []
  }

  const rows = await d1(`SELECT id, sport, date FROM regular_season_games
                         UNION ALL
                         SELECT id, sport, date FROM postseason_games`)
  const unrec = rows.filter(r => schemeOf(r.id) === 'unrecognised')
  console.log(`\n${rows.length} row(s), ${unrec.length} classified \`unrecognised\`\n`)

  const fams = new Map()
  for (const r of unrec) {
    const sig = signature(r.id)
    if (!fams.has(sig)) fams.set(sig, { sig, n: 0, dash: 0, sports: new Map(), ex: [] })
    const f = fams.get(sig)
    f.n++
    if (isDashScheme(r.id)) f.dash++
    f.sports.set(r.sport, (f.sports.get(r.sport) ?? 0) + 1)
    if (f.ex.length < 3) f.ex.push(r.id)
  }
  const families = [...fams.values()].sort((a, b) => b.n - a.n)

  console.log(`${families.length} distinct shape(s):\n`)
  for (const f of families) {
    const sports = [...f.sports.entries()].sort((a, b) => b[1] - a[1])
    console.log(`  ${String(f.n).padStart(4)}  ${f.sig.padEnd(28)} ${f.dash === f.n ? 'DASH' : f.dash ? `${f.dash} dash` : '    '}`)
    console.log(`        ${f.ex.join(', ')}`)
    console.log(`        ${sports.slice(0, 6).map(([s, n]) => `${s} ${n}`).join(' · ')}${sports.length > 6 ? ` · +${sports.length - 6} more` : ''}`)
  }

  const dash = unrec.filter(r => isDashScheme(r.id)).length
  const gap = unrec.length - dash
  console.log(`\n  dash-scheme      ${String(dash).padStart(4)}`)
  console.log(`  THE GAP          ${String(gap).padStart(4)}  — unrecognised but not dash-scheme`)

  const gapRows = unrec.filter(r => !isDashScheme(r.id))
  const gapSports = new Map()
  for (const r of gapRows) gapSports.set(r.sport, (gapSports.get(r.sport) ?? 0) + 1)
  console.log('\n  the gap by sport:')
  for (const [s, n] of [...gapSports.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`    ${String(n).padStart(4)}  ${s}`)

  let fatal = 0
  const say = (ok, name, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
    if (!ok) { fatal++; if (detail) console.log(`      ${detail}`) }
  }
  console.log('')
  say(unrec.length > 0, 'there were unrecognised ids to classify')
  say(families.length > 1, 'more than one shape was found',
    'one family means the signature collapsed everything and measured nothing')
  // THE PREDICTION. The relay census measured 591 dash rows over 2777 on
  // 2026-09-03T03:40Z; 51 dash rows were merged away later that day.
  const PREDICTED_DASH = 591 - 51
  say(dash === PREDICTED_DASH,
    `the dash count is ${PREDICTED_DASH}, reconciling with the relay census`,
    `measured ${dash}. The census counted 591 over 2777 rows and the MLS merge removed 51. `
    + `A miss means this restatement of the dash rule has drifted from src/d1-provenance.js, `
    + `or rows changed between the two runs — either is a finding, not a rounding error.`)

  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/unrecognised-id-shapes-latest.json', JSON.stringify({
    probed_at: new Date().toISOString(), rows_seen: rows.length, unrecognised: unrec.length,
    dash, gap, predicted_dash: PREDICTED_DASH,
    families: families.map(f => ({ sig: f.sig, n: f.n, dash: f.dash, examples: f.ex,
      sports: Object.fromEntries(f.sports) })),
    gap_by_sport: Object.fromEntries(gapSports),
  }, null, 2))
  console.log('\nwrote outbox/unrecognised-id-shapes-latest.json')
  process.exit(fatal ? 1 : 0)
}
