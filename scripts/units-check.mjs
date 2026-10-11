// The unit conversions, exercised rather than asserted.
//
// `toProb` and `devig` were public, documented, and read by nothing. `devig` is
// worse than merely unused: docs/ODDS-PROOF.md calls it "the only sanctioned
// route from `implied` to `prob`" — a claim about a function no assertion had
// ever run. That is the sharpest form of the shape jubilant-bassoon's gate
// account docks for: a value set without proof.
//
// The numbers below come from the real captured market recorded in
// docs/ODDS-PROOF.md, not from values chosen to agree with the code.
//
// Usage:  node scripts/units-check.mjs

import { createChecks, finish } from './checks.mjs'
import { toPct, toProb, devig, formatWinProbability } from '../build/Units.js'

const { check, summarize } = createChecks()
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

// --- pct <-> prob ------------------------------------------------------------

check('toPct scales a probability to a percentage', near(toPct(0.62), 62), `${toPct(0.62)}`)
check('toProb is its inverse', near(toProb(62), 0.62), `${toProb(62)}`)
check('the round trip is stable across the range',
  [0, 0.005, 0.5, 0.999, 1].every(p => near(toProb(toPct(p)), p)),
  'a value changed on the way out and back')

check('formatWinProbability goes through toPct, not a bare multiply',
  formatWinProbability(0.62) === '62%', formatWinProbability(0.62))

// --- devig -------------------------------------------------------------------

// cardinals_phillies, 2026-08-09 — the market ODDS-PROOF.md records as
// implied 0.5305 / 0.5169 with an overround of 0.0474.
const [home, away] = [0.5305, 0.5169]
// Fable compiles `option` to the bare value, with `undefined` for None — not a
// tagged union. Worth stating: the first version read `.tag`, which is the shape
// `Result` compiles to, and threw on the None case it was written to check.
const devigged = devig(home, away)

check('devig returns a pair for a real market', devigged !== undefined, 'got None on live odds')

if (devigged !== undefined) {
  const [h, a] = devigged
  check('the devigged pair sums to exactly 1', near(h + a, 1, 1e-12), `${h} + ${a} = ${h + a}`)
  check('the overround is what ODDS-PROOF says it is',
    near(home + away - 1, 0.0474, 5e-5), `${(home + away - 1).toFixed(6)}`)
  // The favourite must stay the favourite. Normalising cannot reorder a market,
  // and a devig that did would be worse than none.
  check('devig preserves which side is favoured', h > a === home > away, `${h} vs ${a}`)
  console.log(`\n  implied ${home}/${away} -> devigged ${h.toFixed(4)}/${a.toFixed(4)}\n`)
}

check('devig refuses a market that sums to zero', devig(0, 0) === undefined,
  `a zero market produced ${JSON.stringify(devig(0, 0))}`)
check('devig refuses a negative total', devig(-0.5, 0.4) === undefined,
  `a negative total produced ${JSON.stringify(devig(-0.5, 0.4))}`)

finish(summarize())
