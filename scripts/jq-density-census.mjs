// Census of production's mlb_game brief corpus, either side of the JQ scoring
// redesign, using the REAL tokenizer from the relay's scoreProse.
//
// WHY THIS EXISTS
//
// `6aed3bb` (CC-CMD-2026-07-16-journalism-quality-gate-redesign, deployed
// 2026-07-16T01:36:49Z) rewrote two of the ten prose-scoring dimensions.
// Production's stored `mlb_game` scores fell from a ~225 mean to a ~129 mean
// across that boundary, and `/quality/report` has reported `failure_pct: 100`
// on every alerting brief_type ever since.
//
// A 12-brief sample established that the drop is entirely the formula: the same
// twelve texts, rescored under the current rubric, score 138.7 (pre-cutoff
// texts) vs 140.2 (post-cutoff texts) — a 1.5-point gap where the stored gap is
// 96. This script is that measurement at full corpus size, because a 6-per-era
// sample is enough to locate a cause and not enough to calibrate a fix.
//
// THE SPECIFIC CLAIM UNDER TEST
//
// Dim 1 (Specificity, weight 30) and Dim 4 (Density, weight 16) both count
// `properNouns + numbers` per sentence and both cite, in their own source
// comments, FIELD_PROSE_STYLE's rule — which governs NUMBERS ONLY:
//
//   "Each sentence in the brief gets AT MOST ONE number. If a sentence has two,
//    restructure or split. If a sentence has three, you have written a box
//    score with verbs."
//
// Sports prose is obligate proper-noun-dense, so the conflated unit runs far
// above the numbers-only ideal the rule states, and both dimensions saturate at
// their floor. This script measures how often that actually happens rather than
// arguing it from examples.
//
// WHAT IT DOES NOT DO
//
// It does not score. `scoreProse` is async, calls Datamuse, and lives in a repo
// this runner has no credential for. The tokenizer below is copied VERBATIM
// from `field-relay-nba/src/journalism-quality.js` (the `scoreProse` body,
// lines 354-386 at sha 597f410) so the intermediates are the same arithmetic
// the real scorer performs — but a full rescore needs the module, which is why
// this also writes the corpus to disk for a local run against the real import.
//
// Reading a copied tokenizer as "the real one" is exactly the assumption this
// project keeps getting burned by, so `--verify-tokenizer` re-derives the
// twelve hand-checked briefs from the sample run and fails if any count moved.

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// The deploy commit's timestamp, not the date it was specced. `created_at` is
// when the score was computed, so it is the correct partition key — a brief
// ABOUT a July 10 game that was archived on July 20 was scored by the new
// formula, and partitioning on `date` would file it under the old one.
const CUTOFF = '2026-07-16 01:36:49'

const args = new Set(process.argv.slice(2))
const VERIFY_ONLY = args.has('--verify-tokenizer')

// ── the tokenizer, verbatim from scoreProse ─────────────────────────────────
// Do not "clean this up". Any edit here silently decouples this census from the
// thing it claims to measure, and nothing downstream would notice.

function tokens(text) {
  const words = text.split(/\s+/).filter(Boolean)
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 3)
  const nSent = Math.max(1, sentences.length)
  const sentStarts = new Set(sentences.map(s => s.split(/\s+/)[0]))
  const properNouns = words.filter(w => /^[A-Z]/.test(w) && !sentStarts.has(w) && w.length > 1)
  const numbersAll = words.filter(w => /\d/.test(w))
  const factsPerSentence = sentences.map(s => {
    const sw = s.split(/\s+/).filter(Boolean)
    const first = sw[0]
    const nouns = sw.filter(w => /^[A-Z]/.test(w) && w !== first && w.length > 1).length
    const nums = sw.filter(w => /\d/.test(w)).length
    return nouns + nums
  })
  const specificity = factsPerSentence.length
    ? factsPerSentence.reduce((sum, f) => {
        if (f === 1) return sum + 1.0
        if (f === 2) return sum + 0.6
        if (f === 0) return sum + 0.3
        return sum + Math.max(0, 0.3 - (f - 3) * 0.1)
      }, 0) / factsPerSentence.length
    : 0
  const rawDensity = (properNouns.length + numbersAll.length) / nSent
  const density = Math.max(0, Math.min(1, 1 - Math.abs(rawDensity - 1) * 0.5))

  // The same curve on the unit FIELD_PROSE_STYLE actually names. Not shipped
  // anywhere — computed here so the proposal is measured rather than asserted.
  const numsPerSent = numbersAll.length / nSent
  const densityNumsOnly = Math.max(0, Math.min(1, 1 - Math.abs(numsPerSent - 1) * 0.5))

  return {
    nSent,
    properNouns: properNouns.length,
    numbers: numbersAll.length,
    factsPerSentence,
    specificity,
    rawDensity,
    density,
    numsPerSent,
    densityNumsOnly,
  }
}

// ── the twelve briefs already checked by hand, as a tokenizer fixture ────────
// Counts recorded from the local run that imported the real `scoreProse`. If
// the copy above ever drifts from the original, these move and the run fails.

const FIXTURES = [
  { id: 'mlb_game_2026-07-10_g19', nSent: 2, properNouns: 10, numbers: 3, rawDensity: 6.5 },
  { id: 'mlb_game_2026-07-10_g28', nSent: 2, properNouns: 9, numbers: 5, rawDensity: 7.0 },
  { id: 'mlb_game_2026-08-06_g13', nSent: 2, properNouns: 10, numbers: 3, rawDensity: 6.5 },
  { id: 'mlb_game_2026-08-06_g17', nSent: 3, properNouns: 10, numbers: 4, rawDensity: 14 / 3 },
]

// ── fetch ────────────────────────────────────────────────────────────────────
// Per-date rather than one big `limit=`, because the route's cap is unknown and
// a silently truncated corpus is the failure this whole line of work is about.

function dateRange(fromISO, toISO) {
  const out = []
  const d = new Date(fromISO + 'T00:00:00Z')
  const end = new Date(toISO + 'T00:00:00Z')
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

async function fetchDate(date) {
  const url = `${RELAY}/archive/query?date=${date}&brief_type=mlb_game&limit=100`
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!r.ok) return { date, ok: false, status: r.status, results: [] }
  const j = await r.json()
  return { date, ok: true, status: 200, results: j.results || [] }
}

// ── report helpers ───────────────────────────────────────────────────────────

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

function quantile(sorted, q) {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function describe(label, rows) {
  const stored = rows.map(r => r.quality_score).filter(s => typeof s === 'number')
  const nums = rows.map(r => r.t.numsPerSent).sort((a, b) => a - b)
  const raws = rows.map(r => r.t.rawDensity).sort((a, b) => a - b)
  const dim4Zero = rows.filter(r => r.t.density === 0).length
  const dim1Zero = rows.filter(r => r.t.specificity === 0).length
  const dim4NumsZero = rows.filter(r => r.t.densityNumsOnly === 0).length

  console.log('')
  console.log(`── ${label} ──  n=${rows.length}`)
  console.log(`   stored quality_score       mean ${mean(stored).toFixed(1)}   (n scored ${stored.length})`)
  console.log(`   proper nouns / brief       mean ${mean(rows.map(r => r.t.properNouns)).toFixed(2)}`)
  console.log(`   numbers / brief            mean ${mean(rows.map(r => r.t.numbers)).toFixed(2)}`)
  console.log(`   sentences / brief          mean ${mean(rows.map(r => r.t.nSent)).toFixed(2)}`)
  console.log(`   rawDensity (PN+NUM)/sent   mean ${mean(raws).toFixed(2)}   p10 ${quantile(raws, 0.1).toFixed(2)}  p50 ${quantile(raws, 0.5).toFixed(2)}  p90 ${quantile(raws, 0.9).toFixed(2)}  min ${raws[0]?.toFixed(2)}`)
  console.log(`   numbers/sent (house rule)  mean ${mean(nums).toFixed(2)}   p10 ${quantile(nums, 0.1).toFixed(2)}  p50 ${quantile(nums, 0.5).toFixed(2)}  p90 ${quantile(nums, 0.9).toFixed(2)}`)
  console.log(`   Dim 4 shipped   (0-16)     mean ${mean(rows.map(r => r.t.density * 16)).toFixed(2)}   at floor: ${dim4Zero}/${rows.length}  (${((dim4Zero / rows.length) * 100).toFixed(1)}%)`)
  console.log(`   Dim 4 numbers-only (0-16)  mean ${mean(rows.map(r => r.t.densityNumsOnly * 16)).toFixed(2)}   at floor: ${dim4NumsZero}/${rows.length}  (${((dim4NumsZero / rows.length) * 100).toFixed(1)}%)`)
  console.log(`   Dim 1 specificity  (0-30)  mean ${mean(rows.map(r => r.t.specificity * 30)).toFixed(2)}   at floor: ${dim1Zero}/${rows.length}  (${((dim1Zero / rows.length) * 100).toFixed(1)}%)`)

  // The rule's own three bands, counted rather than described.
  const band = n => (n <= 1 ? 'ok(<=1)' : n < 2 ? '1-2' : n < 3 ? '2-3' : '3+(box score)')
  const bands = {}
  for (const n of nums) bands[band(n)] = (bands[band(n)] || 0) + 1
  console.log(`   house-rule bands           ${JSON.stringify(bands)}`)
  return { label, n: rows.length, storedMean: mean(stored), dim4Zero, dim1Zero }
}

// ── main ─────────────────────────────────────────────────────────────────────

const FROM = process.env.FROM || '2026-06-10'
const TO = process.env.TO || new Date().toISOString().slice(0, 10)

console.log(`jq-density-census — mlb_game corpus, ${FROM} .. ${TO}`)
console.log(`cutoff (6aed3bb deploy): ${CUTOFF} UTC`)

const dates = dateRange(FROM, TO)
const all = []
let failed = 0
for (const d of dates) {
  const r = await fetchDate(d).catch(e => ({ date: d, ok: false, status: String(e), results: [] }))
  if (!r.ok) {
    failed++
    console.log(`   ${d}: FETCH FAILED (${r.status})`)
    continue
  }
  for (const row of r.results) all.push(row)
}

// A truncated corpus must be loud, not quiet — every silent cap in this repo's
// history looked exactly like a clean run.
if (failed) console.log(`::warning::${failed}/${dates.length} dates failed to fetch; corpus is incomplete`)
const atCap = all.length && dates.some(d => all.filter(r => r.date === d).length >= 100)
if (atCap) console.log('::warning::at least one date returned 100 rows — the limit may have truncated it')

const rows = all
  .filter(r => r.brief_text && r.created_at)
  .map(r => ({ ...r, t: tokens(r.brief_text) }))

console.log('')
console.log(`fetched ${all.length} rows across ${dates.length} dates; ${rows.length} usable`)

// Fixture check — does the copied tokenizer still agree with the hand-verified run?
let fixtureFail = 0
for (const f of FIXTURES) {
  const row = rows.find(r => r.id === f.id)
  if (!row) {
    console.log(`::warning::fixture ${f.id} not present in corpus — cannot verify tokenizer against it`)
    continue
  }
  const got = row.t
  const ok =
    got.nSent === f.nSent &&
    got.properNouns === f.properNouns &&
    got.numbers === f.numbers &&
    Math.abs(got.rawDensity - f.rawDensity) < 1e-9
  if (!ok) {
    fixtureFail++
    console.log(`FIXTURE MISMATCH ${f.id}: expected nSent=${f.nSent} PN=${f.properNouns} NUM=${f.numbers} raw=${f.rawDensity.toFixed(3)}`)
    console.log(`                        got      nSent=${got.nSent} PN=${got.properNouns} NUM=${got.numbers} raw=${got.rawDensity.toFixed(3)}`)
  } else {
    console.log(`fixture ok: ${f.id}`)
  }
}
if (fixtureFail) {
  console.log(`=== RESULT: FAIL — ${fixtureFail} tokenizer fixture(s) moved ===`)
  process.exit(1)
}
if (VERIFY_ONLY) process.exit(0)

const pre = rows.filter(r => r.created_at < CUTOFF)
const post = rows.filter(r => r.created_at >= CUTOFF)

const a = describe('PRE  6aed3bb (old formula)', pre)
const b = describe('POST 6aed3bb (current formula)', post)

console.log('')
console.log('── the question ──')
console.log(`   stored mean, pre  : ${a.storedMean.toFixed(1)}`)
console.log(`   stored mean, post : ${b.storedMean.toFixed(1)}`)
console.log(`   stored delta      : ${(b.storedMean - a.storedMean).toFixed(1)}`)
console.log('')
console.log('   Dim 4 is at its floor for both eras if the saturation counts above are ~100%.')
console.log('   A dimension that returns the same value for every input in a corpus is not')
console.log('   measuring that corpus. The numbers-only column is the same curve on the unit')
console.log('   FIELD_PROSE_STYLE actually specifies.')

// The corpus itself, so a local run can import the real scoreProse rather than
// re-deriving it here. The runner cannot: journalism-quality.js lives in a repo
// it holds no credential for.
const { writeFileSync } = await import('node:fs')
const out = rows.map(({ id, date, created_at, quality_score, word_count, source, brief_text }) => ({
  id, date, created_at, quality_score, word_count, source, brief_text,
}))
writeFileSync('data/jq-mlb-game-corpus.json', JSON.stringify(out, null, 1) + '\n')
console.log('')
console.log(`wrote data/jq-mlb-game-corpus.json (${out.length} briefs)`)
