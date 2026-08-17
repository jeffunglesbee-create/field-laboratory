// `briefs.game_id` is not one identifier. It is at least seven, in one column,
// with nothing recording which.
//
// WHAT THE CAPTURE FOUND
//
// `scripts/brief-join-capture.mjs` joined `brief.game_id` to `game.id` and
// reported a 6.2% join rate. The rate was real; the join was wrong. Joining on
// one key when the column holds seven key spaces finds only the rows that
// happen to be in that one.
//
// Measured over the committed capture (516 briefs carrying a game_id):
//
//   bare-espn-numeric        327   "761703"        -> games.espn_event_id
//   mlb-slate-ordinal         90   "g32"           -> nothing; see below
//   provider-composite        32   "MLS_MLS-COM-…" -> games.id
//   efl-team-composite        30   "s_engleague_cup_burtonalbion_blackburnrovers"
//   espn-prefixed             24   "espn:761698"   -> games.espn_event_id
//   sport-prefixed-external    8   "afl_38670"     -> nothing
//   test-fixture               5   "pl-verify-game"
//
// THE SAME SHAPE AS `Corpus.Attribution`
//
// There, a stored score could not say which rubric produced it, so the era had
// to be INFERRED from a timestamp, and the inference had to carry its basis so
// a guess could not be read as a fact. Here a stored id cannot say which key
// space it is in, so the scheme has to be inferred from its SHAPE — and the
// same rule applies. `schemeOf` returns a name, never a silent fallthrough, and
// `unrecognised` is a named case that gets counted rather than a bucket that
// gets dropped.
//
// WHY TWO SCHEMES JOIN NOTHING, AND WHY THAT IS NOT A BUG TO FIX HERE
//
//   `g32` is an ORDINAL WITHIN A DAY'S SLATE, not an identifier. It means "the
//   32nd game on this date". Outside its date it addresses nothing, and two
//   briefs a week apart both carrying `g8` refer to different games. No index
//   can join it, and inventing a (date, ordinal) lookup would be a guess about
//   which slate ordering production used. 90 briefs — 17% of the column — are
//   addressed this way.
//
//   `s_engleague_cup_burtonalbion_blackburnrovers` and `afl_38670` are external
//   provider ids for competitions the games table does not carry rows for. The
//   join fails because the row is absent, not because the key is wrong.
//
// `pl-verify-game` appears 5 times. It is a smoke-test fixture in the
// production briefs table.

/** Every scheme the column is known to hold. `unrecognised` is one of them. */
export const SCHEMES = [
  'bare-espn-numeric',
  'espn-prefixed',
  'mlb-slate-ordinal',
  'provider-composite',
  'efl-team-composite',
  'sport-prefixed-external',
  'test-fixture',
  'unrecognised',
]

/**
 * Which key space a `game_id` is in, inferred from its shape.
 *
 * INFERRED. The store records no discriminator, so this is a deduction from
 * the text and nothing more — the same standing as `Corpus.Attribution.Inferred`.
 * The day production adds a scheme column, this function is what it replaces.
 */
export function schemeOf(value) {
  if (value === null || value === undefined || value === '') return 'unrecognised'
  const v = String(value)
  if (v === 'pl-verify-game') return 'test-fixture'
  if (/^\d+$/.test(v)) return 'bare-espn-numeric'
  if (/^espn:\d+$/.test(v)) return 'espn-prefixed'
  if (/^g\d+$/.test(v)) return 'mlb-slate-ordinal'
  if (/^s_[a-z]/.test(v)) return 'efl-team-composite'
  if (/^[A-Z]{2,5}_/.test(v)) return 'provider-composite'
  if (/^[a-z]+_/.test(v)) return 'sport-prefixed-external'
  return 'unrecognised'
}

/**
 * Two lookups, because the games table is addressed two ways: its own `id` and
 * the ESPN id it carries alongside.
 */
export function indexGames(games) {
  const byId = new Map()
  const byEspn = new Map()
  for (const g of games) {
    if (g.id !== null && g.id !== undefined && g.id !== '') byId.set(String(g.id), g)
    if (g.espn_event_id !== null && g.espn_event_id !== undefined && g.espn_event_id !== '') {
      byEspn.set(String(g.espn_event_id), g)
    }
  }
  return { byId, byEspn }
}

/**
 * The game row a brief refers to, or null.
 *
 * Returns null rather than a near-match. A scoreline check built on a fuzzy
 * join would report fabricated stats that are really join errors, which is the
 * one failure mode Phase 4 exists to rule out.
 */
export function resolveGame(gameId, index) {
  const scheme = schemeOf(gameId)
  const v = String(gameId ?? '')
  switch (scheme) {
    case 'bare-espn-numeric':
      return index.byEspn.get(v) ?? null
    case 'espn-prefixed':
      return index.byEspn.get(v.slice('espn:'.length)) ?? null
    case 'provider-composite':
      return index.byId.get(v) ?? null
    // Addressed by a key the games table does not hold, or by no key at all.
    case 'mlb-slate-ordinal':
    case 'efl-team-composite':
    case 'sport-prefixed-external':
    case 'test-fixture':
    case 'unrecognised':
      return null
    default:
      throw new Error(`schemeOf returned an unhandled scheme: ${scheme}`)
  }
}

/**
 * Per-scheme join census.
 *
 * Deliberately NOT a single aggregate rate. One number hid this bug for a whole
 * dispatch: "6.2%" reads as a weak signal, while "92.4% of one scheme, 0% of
 * three others" names the problem. Every scheme in SCHEMES appears in the
 * result even at zero, so a scheme that stops occurring is visible as a change
 * rather than as an absent row.
 */
export function joinCensus(briefs, games) {
  const index = indexGames(games)
  const rows = new Map(SCHEMES.map(s => [s, { scheme: s, briefs: 0, joined: 0 }]))
  let withGameId = 0
  for (const b of briefs) {
    if (b.game_id === null || b.game_id === undefined || b.game_id === '') continue
    withGameId++
    const row = rows.get(schemeOf(b.game_id))
    row.briefs++
    if (resolveGame(b.game_id, index)) row.joined++
  }
  const census = [...rows.values()].sort((a, b) => b.briefs - a.briefs)
  const joined = census.reduce((n, r) => n + r.joined, 0)
  return { census, withGameId, joined }
}

/** Fixed-width census table, so a log line is comparable run to run. */
export function formatCensus({ census, withGameId, joined }) {
  const pct = (n, d) => (d === 0 ? '   —  ' : `${((n / d) * 100).toFixed(1).padStart(5)}%`)
  const lines = ['scheme                      briefs   joined    rate']
  for (const r of census) {
    lines.push(`${r.scheme.padEnd(26)}${String(r.briefs).padStart(6)}${String(r.joined).padStart(9)}   ${pct(r.joined, r.briefs)}`)
  }
  lines.push('-'.repeat(51))
  lines.push(`${'TOTAL'.padEnd(26)}${String(withGameId).padStart(6)}${String(joined).padStart(9)}   ${pct(joined, withGameId)}`)
  return lines.join('\n')
}
