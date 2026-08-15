// The relay's prose tokeniser, copied VERBATIM, in one place.
//
// Copied from `field-relay-nba/src/journalism-quality.js` — the body of
// `scoreProse`, lines 354-386 at sha 597f410. Do not "clean this up". Any edit
// here silently decouples every consumer from the thing they claim to measure,
// and nothing downstream would notice.
//
// It lives in its own module because two scripts need it — `jq-density-census`
// counts the corpus with it, and `prose-check` uses it as the oracle that
// `src/Prose.fs` is checked against. Two copies of a verbatim reproduction is
// two things to keep in sync with an original neither of them can see, which is
// the failure this repo keeps finding in other people's code.
//
// FIXTURES pins four briefs whose counts were hand-verified against a local run
// that imported the real `scoreProse`. If this copy ever drifts from the
// original, those four move and every consumer fails rather than reporting a
// confident wrong census.

export function tokens(text) {
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
  // anywhere — computed here so the proposal stays measured rather than argued.
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

/// Four briefs whose counts were hand-verified against a run that imported the
/// real `scoreProse`. Consumers assert these before trusting anything else.
export const FIXTURES = [
  { id: 'mlb_game_2026-07-10_g19', nSent: 2, properNouns: 10, numbers: 3, rawDensity: 6.5 },
  { id: 'mlb_game_2026-07-10_g28', nSent: 2, properNouns: 9, numbers: 5, rawDensity: 7.0 },
  { id: 'mlb_game_2026-08-06_g13', nSent: 2, properNouns: 10, numbers: 3, rawDensity: 6.5 },
  { id: 'mlb_game_2026-08-06_g17', nSent: 3, properNouns: 10, numbers: 4, rawDensity: 14 / 3 },
]
