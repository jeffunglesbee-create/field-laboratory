// The page's `sameTeam` against the probe's `sameClub`.
//
// `Desk.sameTeam` and `Desk.sameFixture` (src/Desk.fs) decide when two archive rows are one match: the rule that stops a stub in the provider's own
// id scheme being drawn beside the row that carries the match's ESPN event id (docs/CC-CMD-2026-11-11-soccer-live-scores.md, Open question 3, owner
// ruling 2026-11-22). They are a PORT of `norm`, `tokens`, `sameTeam`, `initialsOf`, `sameClub` and `sameClubFixture` in scripts/probe-espn-id-collisions.mjs (`sameClub` is `sameTeam` or an
// abbreviation; the probe's `sameTeam` stays the subset test alone, because six other probes import it), which the archive-wide duplicate sweeps already use, because JavaScript in scripts/ cannot be imported into the compiled page. Two copies of a matching rule drift, and the
// drift is silent: one says two clubs are the same and the other says they are not, and nothing is red.
//
// This reads the COMPILED copy (build/Desk.js) and holds it to the probe's, and it asks the question over what the rule will actually be asked:
// every team name that appears in every committed capture, in every pair. It runs where `build/` exists (verify.yml).
//
// Rule 90: a check that has only ever passed has proven nothing. `--self-test` runs the comparison against a copy that is wrong on purpose (equality
// instead of subset, and no accent stripping) and requires it to disagree with the probe, and against the probe itself and requires it not to.
//
// Usage:  node scripts/check-same-fixture.mjs
//         node scripts/check-same-fixture.mjs --self-test

import { readFileSync, readdirSync } from 'node:fs'
import { createChecks, isMain, finish } from './checks.mjs'
import { sameTeam as probeSubsetOnly, sameClub as probeSameTeam, sameClubFixture as probeSameFixture, norm } from './probe-espn-id-collisions.mjs'

/** Names the rule has to get right by hand, each one a way a name has drifted between two writers in this archive. */
export const BATTERY = [
  ['New England', 'New England Revolution'],
  ['Philadelphia', 'Philadelphia Union'],
  ['Miami', 'Inter Miami CF'],
  ['Columbus', 'Columbus Crew'],
  ['Dallas', 'FC Dallas'],
  ['Portland', 'Portland Timbers'],
  ['St. Louis', 'St. Louis CITY SC'],
  ['Alavés', 'Alaves'],
  ['Málaga', 'Malaga CF'],
  ['FC', 'SC'],
  ['', 'Dallas'],
  ['', ''],
  ['Dallas', 'Portland'],
  ['Seattle Sounders FC', 'Real Salt Lake'],
  ['1. FC Köln', 'FC Cologne'],
  ['Atlético Madrid', 'Atletico de Madrid'],
  ['D.C. United', 'Atlanta United FC'],
  ['A B', 'a b'],
  ['Ünion', 'Union'],
  ['Straße', 'Strasse'],
  ['LAFC', 'Los Angeles Football Club'],
  ['NYCFC', 'New York City Football Club'],
  ['NYCFC', 'New York Red Bulls'],
  ['LAFC', 'Los Angeles Galaxy'],
  ['RSL', 'Real Salt Lake'],
  ['LA', 'Los Angeles'],
  ['SKC', 'Sporting Kansas City'],
  ['Sporting Kansas City', 'SKC'],
]

/** Every row of every committed capture that carries rows (`data/context-*.json`, `data/games-*.json`), with the file it came from. */
export const capturedRows = (dir = 'data') => {
  const files = readdirSync(dir).filter(f => /^(context|games)-.*\.json$/.test(f))
  const rows = []
  for (const f of files) {
    const p = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
    const g = p.games
    for (const r of Array.isArray(g) ? g : [...(g?.regular ?? []), ...(g?.postseason ?? [])]) rows.push({ ...r, file: f })
  }
  return { rows, files: files.length }
}

/** Every distinct team name of every committed capture. */
export const capturedNames = (dir = 'data') => {
  const { rows, files } = capturedRows(dir)
  const names = new Set()
  for (const r of rows) for (const n of [r.home, r.away]) if (typeof n === 'string') names.add(n)
  return { names: [...names].sort(), files }
}

/** Every pair the two copies of `sameTeam` disagree about, over `names` taken two at a time in both orders and each name with itself. */
export const disagreements = (a, b, names) => {
  const out = []
  for (const x of names) for (const y of names) if (a(x, y) !== b(x, y)) out.push([x, y, a(x, y), b(x, y)])
  return out
}

/** Wrong on purpose: equality after the probe's own normalising, so a short name is not its long name. */
export const equalityCopy = (x, y) => norm(x) === norm(y)
/** Wrong on purpose: subset, but with no accent stripping, so `Alavés` and `Alaves` are two clubs. */
export const accentBlindCopy = (x, y) => {
  const tok = t => new Set((t || '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().split(' ').filter(w => w.length > 2))
  const A = tok(x), B = tok(y)
  if (!A.size || !B.size) return false
  const [small, big] = A.size <= B.size ? [A, B] : [B, A]
  return [...small].every(w => big.has(w))
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const names = [...new Set(BATTERY.flat())]
  check('the probe agrees with itself on the battery', disagreements(probeSameTeam, probeSameTeam, names).length === 0)
  check('a copy that uses equality disagrees with the probe on the battery', disagreements(probeSameTeam, equalityCopy, names).length > 0,
    'the check could not fail on a rule that stopped being a subset test')
  check('a copy that does not strip accents disagrees with the probe on the battery', disagreements(probeSameTeam, accentBlindCopy, names).length > 0,
    'the check could not fail on a rule that stopped folding accents')
  check('a copy with the subset test alone (no abbreviations) disagrees with the probe on the battery', disagreements(probeSameTeam, probeSubsetOnly, names).length > 0,
    'the check could not fail on a rule that stopped reading LAFC and NYCFC')
  const d = disagreements(probeSameTeam, equalityCopy, ['Dallas', 'FC Dallas'])
  check('a disagreement names the pair and what each copy said', d.length === 2 && d[0].length === 4 && d[0][2] === true && d[0][3] === false, JSON.stringify(d))
  check('the captures hold names to compare', capturedNames().names.length > 100, String(capturedNames().names.length))
  finish(summarize())
} else if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const { sameTeam, sameFixture } = await import('../build/Desk.js')

  const battery = [...new Set(BATTERY.flat())]
  const batteryOut = disagreements(sameTeam, probeSameTeam, battery)
  check(`the page and the probe agree on ${battery.length * battery.length} ordered pairs of the hand battery`, batteryOut.length === 0, JSON.stringify(batteryOut.slice(0, 5)))

  const { names, files } = capturedNames()
  check(`the captures hold names to compare (${names.length} from ${files} files)`, names.length > 100 && files > 0)
  const t0 = Date.now()
  const out = disagreements(sameTeam, probeSameTeam, names)
  check(`the page and the probe agree on all ${names.length * names.length} ordered pairs of every team name in every committed capture`, out.length === 0,
    JSON.stringify(out.slice(0, 5)))
  console.log(`compared ${names.length * names.length} pairs in ${Date.now() - t0} ms; the clubs the two copies call the same: ${names.flatMap(x => names.filter(y => sameTeam(x, y))).length}`)

  // The same rule one level up: two rows are one fixture in either orientation. Every pair of rows of one sport in one capture on one date, which is the scope the page
  // asks it in. Rows as plain objects: the page reads only `Home` and `Away`, the probe `home` and `away`.
  const { rows } = capturedRows()
  const groups = new Map()
  for (const r of rows) if (typeof r.home === 'string' && typeof r.away === 'string') {
    const k = `${r.file}|${r.sport}|${r.date}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  let fixturePairs = 0, same = 0
  const fixtureOut = []
  for (const g of groups.values()) for (const x of g) for (const y of g) {
    fixturePairs++
    const page = sameFixture({ Home: x.home, Away: x.away }, { Home: y.home, Away: y.away })
    const probe = probeSameFixture({ home: x.home, away: x.away }, { home: y.home, away: y.away })
    if (probe) same++
    if (page !== probe) fixtureOut.push([x.home, x.away, y.home, y.away, page, probe])
  }
  check(`the page and the probe agree on all ${fixturePairs} ordered pairs of rows of one sport on one date in every capture (${groups.size} groups, ${same} the same fixture)`,
    fixtureOut.length === 0, JSON.stringify(fixtureOut.slice(0, 3)))
  finish(summarize())
}
