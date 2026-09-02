// Generates src/TeamColours.fs — the club colours table.
//
// EXACT MATCH AT RUNTIME, FUZZY MATCH HERE. `Desk.fs` states this repo's
// position on normalisers outright:
//
//   "a normaliser is a place for two spellings to silently become one"
//   "accepting a spelling that has never been served is how a normaliser starts"
//
// and `Venues.fs` follows it — "Aliases are separate entries with the SAME
// coordinates". So the subset matching that pairs `Dream` with `Atlanta Dream`
// runs ONCE, here, and its output is a table a person can read. At runtime the
// lookup is string equality, and a spelling not in the table yields no colour
// rather than the nearest one.
//
// That is the difference between a generator and a normaliser: this file can be
// wrong in a way that shows up as a diff.
//
// THE PAYLOAD'S SPELLINGS ARE KEYS TOO. ESPN says `Atlanta Dream`; the relay
// serves `Dream` on some rows and `Atlanta Dream` on others — the drift this
// whole session is about. A table holding only ESPN's spelling would resolve
// half the desk, so a real slate is swept and every name it serves is emitted
// beside the ESPN ones.
//
// Usage:  node scripts/generate-team-colours.mjs [--date YYYY-MM-DD]
//         node scripts/generate-team-colours.mjs --self-test

import { writeFileSync } from 'node:fs'
import { LEAGUES, brandOf, findTeam } from './probe-team-colour-coverage.mjs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const ESPN = process.env.ESPN || 'https://site.api.espn.com/apis/site/v2/sports'

/** F# string literal escaping. Club names carry apostrophes and accents. */
export const fsStr = (s) => '"' + String(s).split('\\').join('\\\\').split('"').join('\\"') + '"'

/**
 * A colour that identifies two clubs in a league identifies neither.
 *
 * MEASURED 2026-09-01 on the first real table. ESPN's `color` for European
 * football is the KIT, not the club:
 *
 *   Bundesliga #ffffff  Augsburg, Monchengladbach, Cologne, Eintracht Frankfurt
 *   La Liga    #ffffff  Racing, Rayo Vallecano, Real Madrid, Sevilla
 *   EPL        #ffffff  Fulham, Leeds, Spurs
 *   MLB        #000000  White Sox, Giants, Pirates
 *
 * Real Madrid and Sevilla both play in white, so ESPN says white for both. That
 * is correct and useless: four clubs rendering the same tint tells a reader
 * nothing, and worse, implies a relationship that is not there.
 *
 * `alternateColor` is tried first, since a club whose primary is taken often has
 * a distinct secondary. A club whose BOTH colours are taken is dropped — it
 * renders as plain text, which is the same refusal `buildEntries` already makes
 * when one name carries two colours, applied to the other axis.
 *
 * The `canon` key is what decides "another club": spellings of one club must not
 * count as a collision with themselves.
 */
export const resolveCollisions = (candidates) => {
  const taken = new Map()          // `${league} ${hex}` -> canon
  const out = []
  const dropped = []
  for (const c of candidates) {
    const key = hex => `${c.league} ${String(hex).toLowerCase()}`
    const free = hex => hex && (!taken.has(key(hex)) || taken.get(key(hex)) === c.canon)
    const hex = free(c.hex) ? c.hex : free(c.alt) ? c.alt : null
    if (!hex) { dropped.push(c); continue }
    taken.set(key(hex), c.canon)
    for (const name of c.names) out.push({ league: c.league, name, hex })
  }
  return { rows: out, dropped }
}

/**
 * One entry per (league label, spelling). Duplicates collapse; a spelling that
 * resolves to TWO different colours is dropped and reported, never guessed —
 * two clubs sharing a name is exactly where a silent pick would be wrong.
 */
/**
 * Spellings no matcher can bridge, each carrying the evidence for it.
 *
 * WHY THESE ARE WRITTEN DOWN RATHER THAN INFERRED. `LAFC` and
 * `Los Angeles Football Club` share no token at all — `sameTeam` returns false
 * and should, because a rule that bridged an acronym to its expansion would be
 * inferring an identity rather than observing one. That is the class of mistake
 * that put Atlanta United's colours on D.C. United earlier today.
 *
 * So an alias is a FACT SOMEONE ASSERTS, with its evidence beside it, appearing
 * in the generated table as an ordinary readable row. `Desk.fs` objects to a
 * normaliser because it is "a place for two spellings to SILENTLY become one".
 * Nothing here is silent.
 *
 * The bar for adding one: the relay must be observed serving both spellings for
 * the same club, and the entry must say where.
 */
export const ALIASES = [
  {
    league: 'MLS',
    spelling: 'Los Angeles Football Club',
    espn: 'LAFC',
    why: 'the 2026-08-29 slate carries both spellings for the SAME fixture — '
       + 'id 2026-08-29-mls-dc-lafc (Los Angeles Football Club at D.C. United) and '
       + 'id MLS_2026-08-29_dcunited_lafc (LAFC at D.C. United). The two ids are '
       + 'the dash and underscore schemes, so the evidence is itself the MLS '
       + 'dual-writer duplicate.',
  },
]

/**
 * Attach each alias spelling to the club it names.
 *
 * EXACT MATCH ON THE TARGET, never a subset: `LAFC` must not reach `LAFC II`.
 * An alias whose target is absent is RETURNED, not skipped — a silently dropped
 * alias is one that rots the moment ESPN renames a club, and it would rot
 * invisibly because the only symptom is a card quietly rendering plain.
 */
export const applyAliases = (candidates, aliases) => {
  const missing = []
  for (const a of aliases) {
    const hit = candidates.filter(c => c.league === a.league &&
      [c.canon, ...(c.names ?? [])].some(n => String(n ?? '').toLowerCase() === a.espn.toLowerCase()))
    if (hit.length !== 1) { missing.push({ ...a, matched: hit.length }); continue }
    if (!hit[0].names.includes(a.spelling)) hit[0].names.push(a.spelling)
  }
  return { missing }
}

export const buildEntries = (rows) => {
  const by = new Map()
  const conflicts = []
  for (const { league, name, hex, alt } of rows) {
    if (!league || !name || !hex) continue
    const k = `${league}\u0000${name}`
    const prev = by.get(k)
    if (prev && prev.hex.toLowerCase() !== hex.toLowerCase()) {
      conflicts.push({ league, name, a: prev.hex, b: hex })
      by.delete(k)
      continue
    }
    // THE ALTERNATE IS DROPPED WHEN IT EQUALS THE PRIMARY. A club whose two
    // fields hold the same value has one colour, not a choice, and carrying it
    // twice would make "the alternate did not help" indistinguishable from
    // "there was no alternate" at render time exactly as it did in the probe.
    const a = (alt && alt.toLowerCase() !== hex.toLowerCase()) ? alt : ''
    if (!prev) by.set(k, { league, name, hex, alt: a })
  }
  const entries = [...by.values()].sort(
    (x, y) => x.league.localeCompare(y.league) || x.name.localeCompare(y.name))
  return { entries, conflicts }
}

export const renderModule = (entries, meta) => {
  const rows = entries
    .map(e => '    ' + fsStr(e.league) + ', ' + fsStr(e.name) + ', ' + fsStr(e.hex) +
              ', ' + fsStr(e.alt ?? ''))
    .join('\n')
  return `module TeamColours

// GENERATED by scripts/generate-team-colours.mjs — do not edit by hand.
//
// ${meta.count} entries across ${meta.leagues} league(s), read from ESPN's team
// endpoints on ${meta.at}, plus every spelling the relay served on ${meta.slate}.
//
// EXACT MATCH, and that is deliberate. Desk.fs records why: "a normaliser is a
// place for two spellings to silently become one". The subset matching that
// pairs "Dream" with "Atlanta Dream" ran in the generator, where its output is
// this readable table; here a spelling that is not listed yields None and the
// name renders in ordinary text. Adding a spelling is a visible diff.
//
// The hex is the CLUB's colour and is NOT what renders. Palette.teamTint derives
// a legible tint from it: thirteen of fifteen real club colours fail WCAG AA on
// this page's ground, and LAFC's black measures 1.04:1.

/// (league label, team name as the relay serves it, brand hex, alternate or "")
///
/// THE ALTERNATE IS THE CLUB'S OWN SECOND COLOUR, not a computed one. ESPN
/// serves exactly two colour fields and no more — measured 2026-09-02 across
/// every field name on a team object — so this is the whole of what a club can
/// offer, and a card neither colour can resolve renders plain rather than
/// borrowing one.
///
/// An empty alternate means the club has ONE colour: either no alternate was served, or the
/// two fields held the same value. Those are the same fact at render time.
let private entries : (string * string * string * string) list =
  [
${rows}
  ]

/// The club's brand colour, or None. None is the honest answer for a spelling
/// this table has never seen — never the nearest match, and never a default.
let tryBrand (league: string) (team: string) : string option =
    entries
    |> List.tryPick (fun (l, n, hex, _) -> if l = league && n = team then Some hex else None)

/// Every colour the club offers, PRIMARY FIRST, or an empty list.
///
/// The list is the input to Palette.choosePair, which reads it per card. An
/// empty list and a one-colour list are different: the first is a spelling this
/// table has never seen, the second is a club with no second colour.
let tryColours (league: string) (team: string) : string list =
    entries
    |> List.tryPick (fun (l, n, hex, alt) ->
        if l = league && n = team then Some (if alt = "" then [ hex ] else [ hex; alt ])
        else None)
    |> Option.defaultValue []

/// The legible tint, or None. The two Nones differ and both are correct: no
/// entry for this spelling, or an entry whose hex will not parse.
let tryTint (league: string) (team: string) : Palette.Token option =
    tryBrand league team |> Option.bind Palette.teamTint

/// Everything the table holds, for checks that must count it rather than trust it.
let all = entries
`
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('a plain name renders as an F# string', fsStr('Dream') === '"Dream"')
  check('an apostrophe survives untouched', fsStr("Nott'm Forest") === '"Nott\'m Forest"')
  check('A QUOTE IS ESCAPED, not emitted raw',
    fsStr('a"b') === '"a\\"b"', 'an unescaped quote would not compile')
  check('a backslash is escaped', fsStr('a\\b') === '"a\\\\b"')

  const r = (league, name, hex) => ({ league, name, hex })
  const one = buildEntries([r('WNBA', 'Dream', '#C8102E'), r('WNBA', 'Dream', '#C8102E')])
  check('the same entry twice collapses to one',
    one.entries.length === 1 && one.conflicts.length === 0)

  const clash = buildEntries([r('EPL', 'United', '#FF0000'), r('EPL', 'United', '#0000FF')])
  // ALIASES — the one remedy that is a written fact rather than a measurement.
  const club = (league, canon, names) => ({ league, canon, hex: '#111111', alt: '', names })
  const pool = () => [
    club('MLS', 'LAFC', ['LAFC']),
    club('MLS', 'LAFC II', ['LAFC II']),
    club('EPL', 'LAFC', ['LAFC']),
  ]
  check('an alias attaches its spelling to the named club', (() => {
    const cs = pool()
    applyAliases(cs, [{ league: 'MLS', spelling: 'Los Angeles Football Club', espn: 'LAFC' }])
    return cs[0].names.includes('Los Angeles Football Club')
  })())
  check('THE TARGET IS MATCHED EXACTLY — `LAFC` must not reach `LAFC II`', (() => {
    const cs = pool()
    applyAliases(cs, [{ league: 'MLS', spelling: 'X', espn: 'LAFC' }])
    return !cs[1].names.includes('X')
  })(), 'a subset match here would put one club\u2019s colour on another')
  check('an alias does not cross leagues', (() => {
    const cs = pool()
    applyAliases(cs, [{ league: 'MLS', spelling: 'X', espn: 'LAFC' }])
    return !cs[2].names.includes('X')
  })())
  check('AN ALIAS WHOSE TARGET IS ABSENT IS REPORTED, not silently skipped',
    applyAliases(pool(), [{ league: 'MLS', spelling: 'X', espn: 'Nobody' }]).missing.length === 1,
    'a dropped alias rots invisibly — the only symptom is a card quietly going plain')
  check('...and so is one whose target is ambiguous',
    applyAliases([club('MLS', 'A', ['LAFC']), club('MLS', 'B', ['LAFC'])],
      [{ league: 'MLS', spelling: 'X', espn: 'LAFC' }]).missing.length === 1)
  check('a spelling already present is not duplicated', (() => {
    const cs = [club('MLS', 'LAFC', ['LAFC', 'Los Angeles Football Club'])]
    applyAliases(cs, [{ league: 'MLS', spelling: 'Los Angeles Football Club', espn: 'LAFC' }])
    return cs[0].names.filter(n => n === 'Los Angeles Football Club').length === 1
  })())
  // THE PREDICATE, not just the list. Asserting only `ALIASES.every(...)` is
  // vacuous while every shipped alias happens to satisfy it — a mutation
  // replacing the whole condition with `true` passed 28/28. The counterexample
  // is what makes it a rule.
  const hasEvidence = a =>
    !!a.league && !!a.spelling && !!a.espn && typeof a.why === 'string' && a.why.length > 40
  check('AN ALIAS WITHOUT EVIDENCE IS REJECTED',
    hasEvidence(ALIASES[0]) &&
    !hasEvidence({ league: 'MLS', spelling: 'X', espn: 'LAFC' }) &&
    !hasEvidence({ league: 'MLS', spelling: 'X', espn: 'LAFC', why: 'because' }),
    'an alias without evidence is a guess with a commit hash')
  check('every shipped alias carries its evidence', ALIASES.every(hasEvidence))

  // THE ALTERNATE, which is what makes a per-card choice possible at all.
  const row = (name, hex, alt) => ({ league: 'EPL', name, hex, alt })
  const colsOf = (name, rows) => {
    const e = buildEntries(rows).entries.find(x => x.name === name)
    return e ? (e.alt === '' ? [e.hex] : [e.hex, e.alt]) : []
  }
  check('a distinct alternate is carried',
    JSON.stringify(colsOf('Spurs', [row('Spurs', '#ffffff', '#0b1426')])) ===
    JSON.stringify(['#ffffff', '#0b1426']))
  check('AN ALTERNATE EQUAL TO THE PRIMARY IS NOT A CHOICE',
    JSON.stringify(colsOf('X', [row('X', '#ffffff', '#FFFFFF')])) === JSON.stringify(['#ffffff']),
    'carrying it twice makes "the alternate did not help" and "there was no alternate" one state')
  check('a missing alternate leaves one colour',
    JSON.stringify(colsOf('Y', [row('Y', '#123456', null)])) === JSON.stringify(['#123456']))
  check('THE EMITTED TABLE IS A FOUR-TUPLE and carries the alternate',
    (() => {
      const m = renderModule([{ league: 'EPL', name: 'Spurs', hex: '#ffffff', alt: '#0b1426' }],
        { count: 1, leagues: 1, at: 'x', slate: 'y' })
      return m.includes('(string * string * string * string) list') &&
             m.includes('"EPL", "Spurs", "#ffffff", "#0b1426"') &&
             m.includes('let tryColours')
    })())
  check('a club with one colour emits an empty alternate, not a repeat',
    renderModule([{ league: 'EPL', name: 'Y', hex: '#123456', alt: '' }],
      { count: 1, leagues: 1, at: 'x', slate: 'y' }).includes('"EPL", "Y", "#123456", ""'))

  check('A NAME WITH TWO COLOURS IS DROPPED, NOT PICKED',
    clash.entries.length === 0 && clash.conflicts.length === 1,
    'two clubs sharing a name is exactly where a silent pick would be wrong')

  const both = buildEntries([r('WNBA', 'Dream', '#C8102E'), r('WNBA', 'Atlanta Dream', '#C8102E')])
  check('two spellings of one club are two entries', both.entries.length === 2,
    'exact match at runtime means every served spelling needs its own row')

  // ── a colour identifying two clubs identifies neither ─────────────────────
  const cand = (canon, hex, alt, names) => ({ league: 'EPL', canon, hex, alt, names: names ?? [canon] })
  const rc = resolveCollisions([
    cand('Real Madrid', '#ffffff', '#febe10', ['Real Madrid']),
    cand('Sevilla', '#ffffff', '#d40026', ['Sevilla']),
  ])
  check('THE SECOND CLUB TAKES ITS ALTERNATE, not the shared white',
    rc.rows.find(r => r.name === 'Sevilla').hex === '#d40026' &&
    rc.rows.find(r => r.name === 'Real Madrid').hex === '#ffffff')
  check('a club whose BOTH colours are taken is dropped, not forced',
    (r => r.rows.length === 2 && r.dropped.length === 1 && r.dropped[0].canon === 'C')(
      resolveCollisions([cand('A', '#fff', '#000'), cand('B', '#000', '#fff'),
                         cand('C', '#fff', '#000')])),
    'a third club sharing both is plain text, which is honest')
  check('SPELLINGS OF ONE CLUB ARE NOT A COLLISION WITH THEMSELVES',
    (r => r.rows.length === 2 && r.dropped.length === 0)(
      resolveCollisions([cand('Real Madrid', '#ffffff', '#febe10', ['Real Madrid', 'Madrid'])])),
    'without the canon key a club would collide with its own second spelling')
  check('the same colour in DIFFERENT leagues is not a collision',
    resolveCollisions([
      { league: 'EPL', canon: 'A', hex: '#fff', alt: null, names: ['A'] },
      { league: 'MLB', canon: 'B', hex: '#fff', alt: null, names: ['B'] },
    ]).dropped.length === 0)

  check('the same name in two leagues does not collide',
    buildEntries([r('EPL', 'United', '#FF0000'), r('MLS', 'United', '#0000FF')]).entries.length === 2)

  check('a row missing any field is skipped',
    buildEntries([r('WNBA', 'Dream', null), r(null, 'x', '#fff'), r('WNBA', null, '#fff')])
      .entries.length === 0)

  const src = renderModule(both.entries, { count: 2, leagues: 1, at: 'D', slate: 'S' })
  check('the module names both spellings',
    src.includes('"Dream"') && src.includes('"Atlanta Dream"'))
  check('and declares no mutable state and prints nothing',
    !/mutable|printfn|Console\./.test(src))
  check('entries are sorted, so a regenerate reads as a diff',
    both.entries[0].name === 'Atlanta Dream')
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--date')
  const slate = i >= 0 ? process.argv[i + 1]
    : new Date(new Date(Date.now() - 86400000).toLocaleString('en-US', { timeZone: 'America/New_York' }))
        .toISOString().slice(0, 10)

  const candidates = []
  const pools = new Map()
  let leaguesWithColour = 0

  for (const [name, path, labels] of LEAGUES) {
    let teams = []
    try {
      // `limit` IS NOT OPTIONAL. ESPN's teams endpoint pages at 50 by default,
      // and a league that stops at exactly 50 looks identical to a league with
      // fifty teams. Measured 2026-09-02: college football returns 50 bare and
      // 760 with `limit=900`, 690 of them carrying a colour. Six cards were
      // filed as "ESPN does not serve the club" on the strength of that number.
      const r = await fetch(`${ESPN}/${path}/teams?limit=900`, { signal: AbortSignal.timeout(20000) })
      if (r.ok) {
        const d = await r.json()
        teams = (d?.sports?.[0]?.leagues?.[0]?.teams ?? []).map(t => t.team).filter(Boolean)
      }
    } catch { teams = [] }
    const coloured = teams.filter(t => brandOf(t))
    if (coloured.length) leaguesWithColour++
    for (const label of labels) pools.set(label, teams)
    // ONE CANDIDATE PER CLUB, carrying every spelling, so the collision rule
    // sees clubs rather than strings. Pushing spellings directly would make a
    // club collide with itself.
    for (const label of labels) {
      for (const t of coloured) {
        const names = [t.displayName, t.shortDisplayName].filter(Boolean)
        if (!names.length) continue
        candidates.push({
          league: label, canon: t.displayName || names[0],
          hex: brandOf(t), alt: brandOf({ color: t.alternateColor }), names,
        })
      }
    }
    console.log(`  ${name.padEnd(28)} ${String(teams.length).padStart(4)} team(s)  ${String(coloured.length).padStart(4)} coloured`)
  }

  // THE SLATE'S OWN SPELLINGS. Without this the table resolves ESPN's names and
  // not the relay's, which is half the desk — `Dream` vs `Atlanta Dream`.
  let slateRows = 0, slateNamed = 0
  try {
    const r = await fetch(`${RELAY}/context/date/${slate}`, { signal: AbortSignal.timeout(25000) })
    if (r.ok) {
      const p = await r.json()
      const games = [...(p.games?.regular ?? []), ...(p.games?.postseason ?? [])]
      for (const g of games) {
        slateRows++
        const label = pools.has(String(g.sport)) ? String(g.sport)
          : pools.has(String(g.league)) ? String(g.league) : null
        if (!label) continue
        for (const side of [g.home, g.away]) {
          const t = findTeam(String(side ?? ''), pools.get(label) ?? [])
          if (!t) continue
          // The slate spelling joins the club's OWN candidate rather than
          // becoming a separate one, so it inherits whichever colour the
          // collision rule gave that club — and cannot collide with it.
          const canon = t.displayName || t.shortDisplayName
          const c = candidates.find(x => x.league === label && x.canon === canon)
          if (c && !c.names.includes(String(side))) { c.names.push(String(side)); slateNamed++ }
        }
      }
    }
  } catch { /* the slate is an ENRICHMENT, not a prerequisite */ }

  // Aliases, after the slate sweep so a spelling the relay actually served wins
  // on its own and an alias is only ever the fallback-free last resort.
  const { missing } = applyAliases(candidates, ALIASES)
  if (missing.length) {
    console.error(`\nREFUSING TO WRITE: ${missing.length} alias(es) name a club this run cannot resolve:`)
    for (const m of missing) console.error(`  ${m.league} "${m.espn}" matched ${m.matched} candidate(s)`)
    console.error('An alias is a written fact. If ESPN renamed the club, the fact changed and')
    console.error('the alias must be rewritten — not quietly dropped, which is how a card goes')
    console.error('plain for a reason nobody can find.')
    process.exit(1)
  }
  console.log(`\naliases applied: ${ALIASES.length}`)

  // GLOBAL COLLISION RESOLUTION IS DELIBERATELY NOT APPLIED.
  //
  // `resolveCollisions` is kept and still tested, because the reasoning behind
  // it was right and the code may be needed. What was wrong was its SCOPE: it
  // dropped a club from EVERY matchup to fix the handful where it actually
  // collides. Bundesliga lost four clubs permanently so that Augsburg and
  // Eintracht Frankfurt would not both render white — on cards they never share.
  //
  // Two clubs sharing a colour only confuse a reader when they appear TOGETHER.
  // The desk shows matchups, never a league table, so colour is read in pairs
  // and the constraint is pairwise. `Palette.distinguishable` applies it at
  // render time, per card, and the table keeps every club's real colour.
  //
  // Cost of the global rule, measured: 1702 entries -> 1453, roughly a hundred
  // clubs rendering plain forever to fix a collision most of them never had.
  const rows = candidates.flatMap(c =>
    c.names.map(name => ({ league: c.league, name, hex: c.hex, alt: c.alt })))
  const dropped = []
  const { entries, conflicts } = buildEntries(rows)
  const leagues = new Set(entries.map(e => e.league)).size

  console.log('')
  console.log(`slate ${slate}: ${slateRows} row(s), ${slateNamed} side(s) resolved to a colour`)
  if (dropped.length) {
    console.log(`\n${dropped.length} club(s) DROPPED — both their colours already identify another club`)
    const byL = new Map()
    for (const d of dropped) byL.set(d.league, (byL.get(d.league) ?? 0) + 1)
    for (const [l, n] of [...byL.entries()].sort((a, b) => b[1] - a[1]))
      console.log(`  ${String(l).padEnd(30)} ${String(n).padStart(3)}`)
    console.log('  These render as plain text. A colour identifying two clubs identifies neither.')
  }
  if (conflicts.length) {
    console.log(`\n${conflicts.length} name(s) DROPPED for resolving to two colours:`)
    for (const c of conflicts) console.log(`  ${c.league}  ${c.name}  ${c.a} vs ${c.b}`)
  }

  // A table that lost its data is worse than no change: it would compile, render
  // nothing, and read as "no team has a colour". Refuse rather than write it.
  const FLOOR = 300
  if (entries.length < FLOOR) {
    console.error(`\nREFUSING TO WRITE: ${entries.length} entries, below the ${FLOOR} floor.`)
    console.error('A near-empty table compiles and renders nothing, which looks exactly')
    console.error('like a design decision. Something upstream failed; fix that instead.')
    process.exit(1)
  }

  writeFileSync('src/TeamColours.fs', renderModule(entries, {
    count: entries.length, leagues,
    at: new Date().toISOString().slice(0, 10), slate,
  }))

  // THE OUTBOX ENTRY IS PART OF THE GENERATION, not an afterthought.
  //
  // `src/TeamColours.fs` is source by `history-check`'s definition
  // (`/^(src|scripts)\//`), and that rule is per-commit and settled at commit
  // time. The first two runs of this generator committed the table alone and
  // put two permanent violations into main's history — the fourth boundary move
  // this repo has had to make.
  //
  // `.githooks/pre-commit` is the guard for this class and it CANNOT cover a CI
  // runner: it is a local hook, and a workflow's `git commit` never consults
  // `core.hooksPath`. So the guard has to travel with the artifact, and the
  // entry has to be written by the thing that writes the table.
  const provenance = [
    `# Generated: team colours, ${new Date().toISOString().slice(0, 10)}`,
    '',
    `- **${entries.length} entries** across ${leagues} league(s)`,
    `- ESPN team endpoints read ${new Date().toISOString().slice(0, 10)}`,
    `- slate swept for the relay's own spellings: ${slate} (${slateRows} row(s), ${slateNamed} resolved)`,
    '',
    'The hex is the CLUB\'s colour and is not what renders — `Palette.teamTint`',
    'derives a legible tint, because thirteen of fifteen real club colours fail',
    'WCAG AA on this page and LAFC\'s black measures 1.04:1.',
    '',
    'Collisions are resolved PER CARD at render time, not globally here: two clubs',
    'sharing a colour only confuse a reader when they appear together, and the desk',
    'shows matchups rather than a league table.',
    '',
    conflicts.length
      ? `## ${conflicts.length} name(s) dropped for resolving to two colours\n\n` +
        conflicts.map(c => `- \`${c.league}\` **${c.name}** — ${c.a} vs ${c.b}`).join('\n')
      : 'No name resolved to two different colours.',
    '',
  ].join('\n')
  writeFileSync(`outbox/generated-team-colours-${new Date().toISOString().slice(0, 10)}.md`, provenance)

  console.log(`\nsrc/TeamColours.fs: ${entries.length} entries across ${leagues} league(s)`)
}
