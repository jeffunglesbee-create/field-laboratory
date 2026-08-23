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
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// The relay owns the vocabulary (Rule 60), and its games tables are where that
// vocabulary is declared. Briefs are deliberately NOT the source: a brief can
// carry a label no game row ever had, which is the defect the 2026-08-23
// migration corrected — reading it here would re-import the noise.
const SQL = `SELECT DISTINCT sport FROM regular_season_games WHERE sport IS NOT NULL
             UNION SELECT DISTINCT sport FROM postseason_games WHERE sport IS NOT NULL`

const out = {
  probed_at: new Date().toISOString(),
  relay_vocabulary: null, modelled: [], declared_unmodelled: [], missing: [], error: null,
}

try {
  const r = await fetch(`${RELAY}/d1/execute`, {
    method: 'POST',
    headers: { 'X-FIELD-Relay': 'field-relay-cron-2026', 'Content-Type': 'application/json', 'User-Agent': UA },
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
} catch (e) { out.error = String(e.message || e) }

mkdirSync('outbox', { recursive: true })
writeFileSync(`outbox/sport-vocabulary-${out.probed_at.replace(/[:.]/g, '-')}.json`,
  JSON.stringify(out, null, 2) + '\n')

console.log(`relay vocabulary: ${out.relay_vocabulary?.length ?? '?'} label(s)`)
console.log(`  modelled            ${out.modelled.length}: ${out.modelled.join(', ')}`)
console.log(`  declared unmodelled ${out.declared_unmodelled.length}: ${out.declared_unmodelled.map(d => d.label).join(', ')}`)
console.log(`  MISSING             ${out.missing.length}: ${out.missing.join(', ')}`)

if (out.error) { console.error(`\nPROBE FAILED — this says nothing about the registry.\n${out.error}`); process.exit(1) }
if (out.missing.length) {
  console.error(`\n${out.missing.length} competition(s) the relay archives are neither modelled nor declared.`)
  console.error(`Each will render as "UNMODELLED SPORT" the day it next appears on a slate.`)
  console.error(`Add a Sport case with its Matchup convention, or declare the omission with a reason.`)
  process.exit(1)
}
console.log('\nregistry covers the relay vocabulary')
process.exit(0)
