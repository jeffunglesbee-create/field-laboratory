#!/usr/bin/env node
// Does the Sport registry cover every competition the relay ACTUALLY ARCHIVES —
// not just the ones playing today?
//
// WHY THIS EXISTS. `drift-check.mjs` already fails on an unmodelled sport, and
// it is right to. But it learns the vocabulary from ONE DAY'S SLATE, so it can
// only discover a competition on the day that competition next plays. The
// drift log shows the consequence: ten days, one red run each time a new
// competition first appeared, each fixed by hand afterwards.
//
//   2026-08-14  NFL                       2026-08-18  EFL Trophy
//   2026-08-15  CFL, golf                 2026-08-21  two UEFA qualifying comps
//   2026-08-16  La Liga, wnba             2026-08-22  Ligue 1, Serie A
//
// Every one of those labels was ALREADY in the relay's games table before it
// reached a slate. The information existed; nothing asked for it. This asks for
// it, so the registry gap is a CI signal on the day the relay starts carrying a
// label rather than an alarm on the morning that competition kicks off.
//
// It does not replace the sentinel's check. That one proves the desk renders
// today's games; this one proves the registry is not about to be surprised.
//
// Reads the same `sportOfString`/`sportMeta` the desk uses, from the Fable
// build — not a second copy of the vocabulary, which is the divergence this
// repository keeps finding in other people's code.

import { sportMeta, sportOfString } from '../build/Desk.js'
import { writeFileSync, mkdirSync } from 'node:fs'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// Read, never literal. This file carried the value inline until 2026-08-23,
// when check:secrets caught it against docs/exposed-secrets.sha256 and failed
// verify -- correctly. It gates POST /d1/execute, which is a write path to
// production briefs.
//
// No fallback. A default would make an unset secret indistinguishable from a
// set one until the relay rejected the request, and the relay's rejection is a
// 401 that this script would have reported as "the probe failed" -- the same
// silence this repo keeps deleting. Missing credential is its own state, named
// below and fatal, because a vocabulary check that cannot read the vocabulary
// has not checked anything.
const RELAY_SECRET = process.env.RELAY_SHARED_SECRET || ''
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// The relay owns the vocabulary (Rule 60), and its games tables are where that
// vocabulary is declared. Briefs are deliberately NOT the source: a brief can
// carry a label no game row ever had, which is the defect the 2026-08-23
// migration corrected — reading it here would re-import the noise.
const SQL = `SELECT DISTINCT sport FROM regular_season_games WHERE sport IS NOT NULL
             UNION SELECT DISTINCT sport FROM postseason_games WHERE sport IS NOT NULL`

const out = {
  probed_at: new Date().toISOString(),
  relay_vocabulary: null, modelled: [], declared_unmodelled: [], missing: [], samples: null, error: null,
}

try {
  if (!RELAY_SECRET) throw new Error(
    'RELAY_SHARED_SECRET is not set. This check reads the relay\'s games tables through ' +
    'POST /d1/execute, which is credentialled. Set it as a repository secret and pass it ' +
    'in .github/workflows/drift-sentinel.yml. Until then the registry gap this check ' +
    'exists to find is unobserved, which is a failure and not a skip.')
  const r = await fetch(`${RELAY}/d1/execute`, {
    method: 'POST',
    headers: { 'X-FIELD-Relay': RELAY_SECRET, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ sql: SQL }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`)
  const j = JSON.parse(t)
  if (j.ok === false) throw new Error(`relay error: ${j.error}`)
  const labels = (j.results || []).map(x => x.sport).filter(Boolean).sort()
  out.relay_vocabulary = labels

  for (const label of labels) {
    const meta = sportMeta(sportOfString(label))
    // Same three-way split the sentinel uses: modelled, declared-unmodelled
    // (a recorded decision), or a genuine registry gap. Only the third is a
    // failure — golf being unmodelled on purpose must not read as an omission.
    if (meta.Modelled) out.modelled.push(label)
    else if (meta.Omission) out.declared_unmodelled.push({ label, why: String(meta.Omission).slice(0, 120) })
    else out.missing.push(label)
  }

  // A sample row per UNMODELLED label — missing AND declared alike, because the
  // Matchup convention is not the only question a new Sport case has to answer.
  // Golf is the precedent: the relay packs a tournament and a round into
  // home/away (`golf_..._fedexstjudechampionship_r2`), so those two fields are
  // NOT opponents, and every Matchup case asserts a contest between two sides.
  // Modelling golf under one would have had the desk state that a tournament
  // played a round. So before adding a case, look at what home/away actually
  // hold for that competition.
  //
  // WHY `declared` IS SAMPLED TOO (added 2026-08-25). Until now this loop ran
  // over `out.missing` alone, which is exactly backwards. A `missing` label is
  // one nobody has looked at; a `declared` label is one whose entry already
  // states, per Rule 74, what would unblock it — and the row IS that evidence.
  // The consequence was measured: every run since 2026-08-23 has reported
  // `missing: []` and therefore `samples: null`, so the four labels actually
  // waiting on evidence (golf, PGA Tour, IPL, UFL) produced none, twice a day,
  // for as long as they stay declared. A probe that goes quiet precisely when
  // its subject stops being new is not a probe.
  //
  // SELECT * rather than the six columns this once named. The golf row is why:
  // `note` carries "Scottie Scheffler -11" and `home_score` carries -11, so the
  // columns that answer "what IS this row" were the ones not being read. Capped
  // at one row per declared label to keep the artifact readable; missing labels
  // keep three, since an unexamined label needs the spread more than the depth.
  for (const [label, limit] of [
    ...out.missing.map(l => [l, 3]),
    ...out.declared_unmodelled.map(d => [d.label, 1]),
  ]) {
    const res = await fetch(`${RELAY}/d1/execute`, {
      method: 'POST',
      headers: { 'X-FIELD-Relay': RELAY_SECRET, 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({
        sql: `SELECT * FROM regular_season_games
              WHERE sport = ? ORDER BY date DESC LIMIT ?`, params: [label, limit] }),
    })
    // `.then(r => r.json()).catch(() => null)` until 2026-08-28, which merged
    // three states into one: a network failure, a non-200 from /d1/execute (a
    // wrong or missing RELAY_SECRET returns one), and a genuine zero-row answer
    // all became `null` and then `[]`.
    //
    // The comment fifteen lines below already knew this mattered -- "an empty
    // array is a real answer and a different one from 'not asked'" -- and the
    // code merged them anyway. A sample of `[]` for UFL means "the day has not
    // come"; a sample of `[]` because the secret rotated means nothing, and the
    // artifact could not tell you which it was looking at.
    //
    // Found by scripts/fetch-silently-empty-probe.mjs, which swept 265 scripts
    // across three repos and returned exactly two sites. This was one.
    let q = null, qErr = null
    if (!res.ok) qErr = `HTTP ${res.status}`
    else { try { q = await res.json() } catch (e) { qErr = `unparseable body: ${e.message}` } }
    out.samples ??= {}
    out.sample_errors ??= {}
    if (qErr) {
      // Recorded by label, never folded into the sample array. A query that did
      // not run is not a competition with no rows.
      out.sample_errors[label] = qErr
      out.samples[label] = null
      continue
    }
    // Whole row, minus the two columns that are neither small nor informative
    // here. `drama_arc` is hundreds of integers and is a SEALED value in this
    // repo besides; `opening_odds`/`closing_odds` are double-encoded JSON blobs
    // with their own decoder. Dropping them is a size decision, stated, not a
    // claim that they are empty.
    out.samples[label] = (q?.results || []).map(r => {
      const { drama_arc, opening_odds, closing_odds, ...rest } = r
      return rest
    })
    // An empty array is a real answer and a different one from "not asked":
    // UFL's entry says it unblocks "the day a row appears", and [] is the
    // observation that the day has not come.
  }
} catch (e) { out.error = String(e.message || e) }

mkdirSync('outbox', { recursive: true })
writeFileSync(`outbox/sport-vocabulary-${out.probed_at.replace(/[:.]/g, '-')}.json`,
  JSON.stringify(out, null, 2) + '\n')

console.log(`relay vocabulary: ${out.relay_vocabulary?.length ?? '?'} label(s)`)
console.log(`  modelled            ${out.modelled.length}: ${out.modelled.join(', ')}`)
console.log(`  declared unmodelled ${out.declared_unmodelled.length}: ${out.declared_unmodelled.map(d => d.label).join(', ')}`)
console.log(`  MISSING             ${out.missing.length}: ${out.missing.join(', ')}`)
// Every non-null column, because the point of the sample is to see what the row
// actually holds -- and the columns that answered that for golf (`note`,
// `home_score`) were the ones the six-column projection did not select. Nulls
// are dropped from the LINE, not from the artifact: the JSON keeps the whole
// row, and a line listing twenty nulls hides the three values that matter.
for (const [label, rows] of Object.entries(out.samples || {})) {
  console.log(`\n  ${label}`)
  for (const r of rows) {
    const filled = Object.entries(r).filter(([, v]) => v !== null && v !== '')
    console.log(`    ${filled.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('  ')}`)
    const empty = Object.keys(r).length - filled.length
    if (empty) console.log(`      (${empty} column(s) null)`)
  }
  if (!rows.length) console.log('    (no regular_season_games rows — postseason or brief-only label)')
}

if (out.error) { console.error(`\nPROBE FAILED — this says nothing about the registry.\n${out.error}`); process.exit(1) }
if (out.missing.length) {
  console.error(`\n${out.missing.length} competition(s) the relay archives are neither modelled nor declared.`)
  console.error(`Each will render as "UNMODELLED SPORT" the day it next appears on a slate.`)
  console.error(`Add a Sport case with its Matchup convention, or declare the omission with a reason.`)
  process.exit(1)
}
console.log('\nregistry covers the relay vocabulary')
process.exit(0)
