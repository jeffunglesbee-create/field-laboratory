// Gravity Well over every play of the committed BDB frames capture.
//
// WHY THIS IS A SCRIPT AND NOT SUITE ROWS
//
// The Suite tests Gravity on inline envelopes of a few plays each, on purpose:
// a 1.8 MB capture in `Fixtures.paths` would be fetched on every Verify-tab
// open, and a must-hold input built from it would print derived counts in the
// panel's visible text, which the 2026-10-15 ADR-002 ruling keeps to
// aria-label. What only the whole capture can answer lives here instead:
//
//   accounting    every play is measured or refused for exactly one reason,
//                 and the refusals agree with row counts read from the raw
//                 text, not from the decoder
//   conservation  drawn sums to zero on every measured play
//   the labels    every receiver's accessible name has the one sanctioned form
//
// NO SECOND COPY OF THE METRIC. Every number comes from the compiled F#
// (build/Gravity.js); the only arithmetic here is a mean of two F# counts.
//
// THE SEASON IS A LITERAL. It is read from the data file's NAME and passed to
// `gravityCensus` and `archivedAt`, which refuse it unless the capture's own
// envelope says the same season. Reading it back from the decoded value would
// make that refusal unable to fire.
//
// No network: the capture is committed (data/PROVENANCE.md says why it was
// copied rather than captured). Needs the Fable build: `npm run build` first.
//
// Usage:  node scripts/gravity-census.mjs [--file data/bdb-event-frames-2022-w2.json]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createChecks, finish, isMain, runIdentity, fieldDay, toArray } from './checks.mjs'
import { decodeFrames } from '../build/Gridiron.js'
import { gravityCensus, archivedAt, measuredAt, accessibleName, encodeWell } from '../build/Gravity.js'
import { nflSeasonOf } from '../build/Vintage.js'

if (isMain(import.meta.url)) {
  const GENERATED_AT = new Date()
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name)
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
  }
  const FILE = arg('--file', 'data/bdb-event-frames-2022-w2.json')
  const OUT = 'outbox/gravity-census-latest.json'
  const { check: record, summarize } = createChecks()
  // Every result is also kept for the artifact, which records what was checked
  // and not only the verdict.
  const results = []
  const check = (name, pass, detail) => {
    results.push(pass ? { name, pass: true } : { name, pass: false, detail })
    record(name, pass, detail)
  }

  // The season and week the file NAME states. Not the envelope's: the decoder
  // compares the two, and that comparison is the point.
  const named = /-(\d{4})-w(\d+)\.json$/.exec(FILE)
  check('the data file name states a season and a week', named !== null, FILE)
  const SEASON = named ? Number(named[1]) : NaN

  const text = readFileSync(FILE, 'utf8')
  const bytes = Buffer.byteLength(text, 'utf8')
  const sha256 = createHash('sha256').update(text).digest('hex')

  // The bytes measured are the bytes data/PROVENANCE.md names, or every number
  // below describes a file nobody recorded.
  const provenance = readFileSync('data/PROVENANCE.md', 'utf8')
  const base = FILE.split('/').pop()
  const section = provenance.split(/\n## /).find(s => s.startsWith(`\`${base}\``)) ?? ''
  const recorded = /sha256\s+([0-9a-f]{64})/.exec(section)?.[1] ?? null
  check(`the capture's sha256 is the one data/PROVENANCE.md records for ${base}`,
    recorded === sha256, `recorded ${recorded ?? '(no section or no sha256)'}, file ${sha256}`)

  // What "current" means today, by the relay's August rule, from the Eastern
  // field day. The F# reads no clock; this is the one place a clock enters.
  const [year, month] = fieldDay(GENERATED_AT).split('-').map(Number)
  const current = nflSeasonOf(year, month)

  const decoded = decodeFrames(current, text)
  check('the capture decodes', decoded.tag === 0,
    decoded.tag === 0 ? '' : `DecodeError tag ${decoded.fields?.[0]?.tag}: ${String(decoded.fields?.[0]?.fields?.[0] ?? '')}`)
  const tracked = decoded.tag === 0 ? decoded.fields[0] : null

  const censusResult = tracked ? gravityCensus(SEASON, tracked) : null
  check(`the census is released at the named season ${SEASON}`, censusResult?.tag === 0,
    'gravityCensus refused the season the file name states: the envelope describes another season')
  const c = censusResult?.tag === 0 ? censusResult.fields[0] : null

  const archived = tracked ? archivedAt(SEASON, tracked) : undefined
  check(`the ${SEASON} capture yields the archive witness, because ${SEASON} is before the current season ${current}`,
    archived !== undefined, 'archivedAt returned None')
  check(`...and the witness is refused at the current season ${current}`,
    tracked !== null && archivedAt(current, tracked) === undefined,
    'a current-season witness was granted to an archive capture')

  // Row counts read from the raw text: an oracle the decoder does not share.
  const occurrences = needle => text.split(needle).length - 1
  const snapRows = occurrences('"event":"ball_snap"')
  const releaseRows = occurrences('"event":"pass_forward"')

  const reasons = c ? {
    noReleaseFrame: c.NoReleaseFramePlays,
    noSnapFrame: c.NoSnapFramePlays,
    noSnapper: c.NoSnapperPlays,
    noRouteRunner: c.NoRouteRunnerPlays,
    noCoverage: c.NoCoveragePlays,
    soleRouteRunner: c.SoleRouteRunnerPlays,
    missingAtSnap: c.MissingAtSnapPlays,
  } : {}
  const refused = Object.values(reasons).reduce((a, b) => a + b, 0)

  if (c) {
    check(`every play is measured or refused for exactly one reason: ${c.MeasuredPlays} + ${refused} = ${c.Plays}`,
      c.MeasuredPlays + refused === c.Plays, JSON.stringify(reasons))
    check(`the decoder kept every row: ${c.SnapInstants} snap and ${c.ReleaseInstants} release instants, ` +
      `${snapRows} and ${releaseRows} in the raw text`,
      c.SnapInstants === snapRows && c.ReleaseInstants === releaseRows)
    check('a play with no release instant is refused as NoReleaseFrame, one with no snap as NoSnapFrame',
      c.NoReleaseFramePlays === c.Plays - c.ReleaseInstants && c.NoSnapFramePlays === c.Plays - c.SnapInstants,
      `NoReleaseFrame ${c.NoReleaseFramePlays} against ${c.Plays - c.ReleaseInstants}; ` +
      `NoSnapFrame ${c.NoSnapFramePlays} against ${c.Plays - c.SnapInstants}`)
    check('at least one play is measured', c.MeasuredPlays > 0, 'nothing measured')
    check(`drawn sums to zero on every measured play: ${c.MeasuredPlays - c.ConservationFailures} of ${c.MeasuredPlays}`,
      c.ConservationFailures === 0, `${c.ConservationFailures} play(s) where defenders were gained or lost, not moved`)
  }

  // The one string site, over every receiver of every measured play.
  const LABEL = /^(Drawing|Level|Ceding) state active, defenders drawn -?\d+ of \d+$|^NotRouteRunner state active$/
  let receivers = 0, wellFormed = 0, encoded = 0, unencoded = 0, opacityInRange = 0
  const measured = tracked ? measuredAt(SEASON, tracked) : null
  if (archived !== undefined && measured?.tag === 0) {
    for (const m of toArray(measured.fields[0])) {
      if (m.Result.tag !== 0) continue
      for (const r of toArray(m.Result.fields[0])) {
        receivers += 1
        const name = accessibleName(archived, m.GameId, m.PlayId, r.NflId)
        if (typeof name === 'string' && LABEL.test(name)) wellFormed += 1
        const e = encodeWell(archived, m.GameId, m.PlayId, r.NflId)
        if (e === undefined) unencoded += 1
        else {
          encoded += 1
          if (e.Opacity >= 0 && e.Opacity <= 1) opacityInRange += 1
        }
      }
    }
  }
  const byPos = c ? toArray(c.ByPos) : []
  const routeRunners = byPos.reduce((a, p) => a + p.RouteRunners, 0)
  const notRouteRunners = byPos.reduce((a, p) => a + p.NotRouteRunnerCount, 0)
  check(`every receiver's accessible name has the sanctioned form: ${wellFormed} of ${receivers}`,
    receivers > 0 && wellFormed === receivers, `${receivers - wellFormed} malformed or missing`)
  check(`every route runner is encoded and every NotRouteRunner is not: ${encoded} of ${routeRunners}, ` +
    `${unencoded} of ${notRouteRunners}`,
    receivers > 0 && encoded === routeRunners && unencoded === notRouteRunners && opacityInRange === encoded,
    `${opacityInRange} of ${encoded} opacities in [0, 1]`)

  const envelope = JSON.parse(text)
  const scope = envelope.scope ?? {}
  const coverage = c
    ? `${c.MeasuredPlays + refused} of ${c.Plays} plays accounted for (${c.MeasuredPlays} measured, ` +
      Object.entries(reasons).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ') + '); ' +
      `${scope.gamesKept} of ${scope.gamesInWeek} games of ${SEASON} week ${envelope.week}; ` +
      'per receiver per play; no per-player roll-up'
    : 'no census: the capture did not decode at its named season'

  mkdirSync('outbox', { recursive: true })
  writeFileSync(OUT, JSON.stringify({
    census: 'gravity-well',
    generated: GENERATED_AT.toISOString(),
    run: runIdentity(),
    source: { file: FILE, bytes, sha256, season: SEASON, week: envelope.week,
              games: `${scope.gamesKept} of ${scope.gamesInWeek}`, currentSeason: current },
    coverage,
    definition: {
      instant: 'pass_forward (the release); the same play\'s ball_snap supplies the line and the counterfactual',
      line: 'the forward-most offensive player labelled C, at ball_snap',
      routeRunner: 'offense WR/TE/RB/FB strictly past the line at the release (a line-geometry proxy: wasRunningRoute is not in the artifact)',
      coverage: 'defense strictly past the line at the release (the same proxy: wasInitialPassRusher is not in the artifact)',
      drawn: 'defenders nearest him at the release minus defenders nearest him at the snap, over the same defenders and runners',
      tie: 'the lower nflId',
      adjustment: 'NOT position-adjusted: relative to the receiver\'s own snap alignment on the play, not to players at his position',
    },
    accounting: { plays: c?.Plays, measured: c?.MeasuredPlays, ...reasons,
                  snapRows, releaseRows },
    invariants: { conservationFailures: c?.ConservationFailures, tiesAtSnap: c?.TiesAtSnap,
                  tiesAtRelease: c?.TiesAtRelease },
    premises: {
      twoCentrePlays: c?.TwoCentrePlays,
      twoCentreDenominator: `${c?.SnapInstants} snap instants`,
      coverageDefenders: c?.CoverageDefenders,
      reassigned: c?.Reassigned,
      lineLabelledInCoverage: c?.LineLabelledInCoverage,
      lineLabelledReassigned: c?.LineLabelledReassigned,
      lineLabelledNote: 'DE/DT/NT labels only: a LOWER BOUND on linemen in the coverage proxy; edge rushers labelled OLB and anyone just past the line are in pastLine below',
      pastLine: c ? toArray(c.PastLine).map(p => ({ role: p.Role, pos: p.Pos, underOneYard: p.UnderOneYard,
        oneToTwoYards: p.OneToTwoYards, twoYardsOrMore: p.TwoYardsOrMore })) : [],
    },
    byPos: byPos.map(p => ({ pos: p.Pos, routeRunners: p.RouteRunners, drawing: p.DrawingCount,
      level: p.LevelCount, ceding: p.CedingCount, notRouteRunner: p.NotRouteRunnerCount,
      drawnSum: p.DrawnSum, meanDrawn: p.RouteRunners > 0 ? Number((p.DrawnSum / p.RouteRunners).toFixed(3)) : null })),
    notRouteRunnerByPos: Object.fromEntries(byPos.map(p => [p.Pos, p.NotRouteRunnerCount])),
    labels: { receivers, wellFormed },
    encodings: { encoded, unencoded, opacityInRange },
    held: results.filter(r => r.pass).length,
    of: results.length,
    results,
  }, null, 2) + '\n')
  console.log(`wrote ${OUT}`)
  // The coverage sentence is printed beside the verdict, so a PASS is never
  // read as more than it is over (Rule 91).
  console.log(`coverage: ${coverage}\n`)

  finish(summarize())
}
