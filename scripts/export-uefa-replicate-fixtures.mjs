#!/usr/bin/env node
// Writes the synthetic fixtures of the replication's independent implementation: SYNTHETIC seasons (seeded, through the real collector against a stubbed ESPN) with the scoring tooling's expected values beside them, so a second implementation written from the rule's text
// alone can be compared with the first to 1e-9 before it sees any real 2024-25 row. The expected values come from scripts/uefa-replicate-run.mjs, whose own known answers (the 2026-11-27 fit's numbers) are checked in scripts/check-uefa-replicate.mjs: an
// agreement on these fixtures shows two readings of the rule agree, the known answers show the first is right where a committed answer exists.
//   node scripts/export-uefa-replicate-fixtures.mjs            (writes outbox/uefa-replication-synthetic-*.json; deterministic, byte-identical on every run)
import fs from 'node:fs'
import { RULE, decide } from './uefa-replicate-score.mjs'
import * as T from './uefa-replicate-run.mjs'
import { synthEvents, bundleOf, forwardEvents } from './uefa-replicate-synth.mjs'
import { CLUB_ALIASES } from '../outbox/forecast-fit-uefa-2026-11-27.mjs'

const canon = c => CLUB_ALIASES[c] ?? c
const stats = (fs_, look) => {
  const s = T.scoreForecasts(fs_), d = decide(look, { integrityOk: true, z: s.z, folds: s.folds, slope: s.slope, slopeSE: s.slopeSE })
  return { look, n: s.n, brierU: s.brierU, brierBase: s.brierBase, meanD: s.meanD, sdD: s.sdD, z: s.z, folds: s.folds.map(f => ({ name: f.name, n: f.n, z: f.z })), slope: s.slope, slopeSE: s.slopeSE, verdict: d.verdict, failed: d.failed }
}
const write = (f, o) => { fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n'); console.log(`${f}: ${fs.statSync(f).size} bytes`) }
const NOTE = 'SYNTHETIC. Goals are seeded Poisson draws (club strengths uniform in +-sigma where sigma is given); rows are what the real collector makes from stubbed ESPN payloads. Not real data. The expected values were computed by scripts/uefa-replicate-run.mjs (G3 assumed passed).'

// Look 1 fixtures: three seasons of the 2024-25 shape (189 / 189 / 153 events, 144 / 144 / 108 league-phase), chosen to reach different rows of the verdict table
const L1 = [
  { name: 'a-no-strength', seed: 24, sigma: 0 },
  { name: 'b-moderate', seed: 31, sigma: 0.3 },
  { name: 'c-strong', seed: 41, sigma: 0.6 },
  { name: 'd-one-competition-without-strength', seed: 56, sigma: [0.6, 0.6, 0] },
]
const kept = {}
for (const f of L1) {
  const { bundle } = await bundleOf(synthEvents({ seed: f.seed, starts: ['2024-09-17', '2024-09-19', '2024-09-26'], spacing: [14, 14, 14], knockout: true, sigma: f.sigma }), RULE.look1.from, RULE.look1.to)
  const expected = stats(T.forecastsOf(bundle.rows).filter(x => x.eligible), 1)
  kept[f.name] = { bundle, expected }
  write(`outbox/uefa-replication-synthetic-look1-${f.name}.json`, { what: NOTE, seed: f.seed, sigma: f.sigma, bundle, expected })
}
// Look 2 fixture: the pinned frozen bundle's 252 rows (real, burned) plus synthetic forward matches; pooled with the Look 1 fixture b
const frozenDoc = JSON.parse(fs.readFileSync('outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json', 'utf8'))
const { bundle: b26 } = await bundleOf(forwardEvents(frozenDoc, canon, T.LABELS), RULE.look2.seasonFrom, '2027-01-20')
const fs24 = T.forecastsOf(kept['b-moderate'].bundle.rows).filter(x => x.eligible)
const fwd = T.forecastsOf(b26.rows).filter(x => x.eligible && x.date >= RULE.look2.forwardFrom)
write('outbox/uefa-replication-synthetic-look2.json', { what: NOTE + ' The frozen part (252 rows) is the pinned frozen 2026-27 bundle with one id per canonical club; the forward part is synthetic. Pooled with the Look 1 fixture b-moderate.', look1Fixture: 'outbox/uefa-replication-synthetic-look1-b-moderate.json', bundle26: b26, expected: stats(fs24.concat(fwd), 2), forwardN: fwd.length })
console.log(Object.entries(kept).map(([k, v]) => `${k}: n ${v.expected.n}, z ${v.expected.z.toFixed(3)}, verdict ${v.expected.verdict}${v.expected.failed.length ? ' [' + v.expected.failed.join('; ') + ']' : ''}`).join('\n'))
