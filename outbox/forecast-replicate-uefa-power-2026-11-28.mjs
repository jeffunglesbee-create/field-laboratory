// THE POWER AND SIZE FIGURES OF THE REPLICATION RULE (outbox/forecast-replicate-uefa-2026-11-28.mjs, section POWER), as a committed, seeded script, so no figure in the rule is a number from nowhere. It changes nothing in src/ and reads no data.
//   node outbox/forecast-replicate-uefa-power-2026-11-28.mjs   (prints the table; the committed output is outbox/forecast-replicate-uefa-power-2026-11-28.txt)
// MODEL. D, the per-forecast Brier difference (U minus the base rate; negative favours U), is drawn independent normal with mean -gain and standard deviation sd: n 234 at Look 1, then 144 more at Look 2. z is the paired z of the rule with the SAMPLE
// standard deviation: Look 1 on the first 234, Look 2 on all 378. "Cross" is z at or below the boundary (Look 1 -2.241402728, Look 2 -1.780464342). The decision uses this iid z.
// DEPENDENCE (the sensitivity, not a measurement). Matches share clubs, so the true standard error of mean(D) can exceed the iid one. c is the factor by which the true standard error of each block's mean exceeds the iid standard error; c = 1 is independence.
// It is added to the block means as an independent normal shock of standard deviation sqrt(c^2 - 1) * sd / sqrt(n), leaving the sample standard deviation unchanged, which is what the iid z uses. THE SIZE FOR c ABOVE 1 IS NOT MEASURED ANYWHERE in this project: c = 1.12 and
// 1.15 are the stated range of a 10 to 15% understatement of the standard error that an earlier synthetic-league-phase simulation suggested and that was NOT kept as an artifact. They are sensitivity rows, not findings.
const Z1 = -2.241402728, Z2 = -1.780464342, N1 = 234, N2 = 144, REPS = 100000
let s = 0x9E3779B9 >>> 0
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
let spare = null
const normal = () => { if (spare !== null) { const v = spare; spare = null; return v } let u = 0; while (u === 0) u = rnd(); const r = Math.sqrt(-2 * Math.log(u)), a = 2 * Math.PI * rnd(); spare = r * Math.sin(a); return r * Math.cos(a) }
function experiment(gain, sd, c) {
  const k = Math.sqrt(c * c - 1)
  let s1 = 0, ss1 = 0, s2 = 0, ss2 = 0
  for (let i = 0; i < N1; i++) { const d = -gain + sd * normal(); s1 += d; ss1 += d * d }
  for (let i = 0; i < N2; i++) { const d = -gain + sd * normal(); s2 += d; ss2 += d * d }
  const m1 = s1 / N1, v1 = (ss1 - N1 * m1 * m1) / (N1 - 1)
  const n = N1 + N2, m = (s1 + s2) / n, v = (ss1 + ss2 - n * m * m) / (n - 1)
  // the extra shock moves the mean only (the sample standard deviation stays the iid one)
  const e1 = k * sd / Math.sqrt(N1) * normal(), e2 = k * sd / Math.sqrt(N2) * normal()
  const z1 = (m1 + e1) / Math.sqrt(v1 / N1)
  const z2 = ((s1 + s2 + N1 * e1 + N2 * e2) / n) / Math.sqrt(v / n)
  return { look1: z1 <= Z1, either: z1 <= Z1 || z2 <= Z2 }
}
console.log(`reps ${REPS} per row, seed 0x9E3779B9, n ${N1} then ${N2} more; boundaries ${Z1} and ${Z2}`)
console.log('sd     gain    c     P(cross at either look)  P(cross at Look 1)')
for (const c of [1, 1.12, 1.15]) for (const sd of [0.212, 0.315]) for (const gain of [0, 0.0158, 0.0316, 0.072]) {
  let a = 0, b = 0
  for (let i = 0; i < REPS; i++) { const r = experiment(gain, sd, c); if (r.either) a++; if (r.look1) b++ }
  console.log(`${sd.toFixed(3)}  ${gain.toFixed(4)}  ${c.toFixed(2)}  ${(a / REPS).toFixed(3)}                    ${(b / REPS).toFixed(3)}`)
}
