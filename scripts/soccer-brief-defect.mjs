// The soccer-brief defect scanner, in one place.
//
// `CC-CMD-2026-08-22-brief-sport-contamination` names three mechanical defects a
// soccer brief must not carry. Two callers scan for them — the CC-CMD follow-up
// (`cc-cmd-followup.mjs`) and the cross-repo evidence runner
// (`relay-brief-watch.mjs`) — so the logic lives here rather than being copied
// and drifting. These regexes mirror what the F# desk catches on the card
// (`Journalism.crossSportTokens`, `Scoreline.contradictoryLevelClaim`),
// re-expressed in plain JS so the scanners stay standalone and need no build.

/// A strict-lead scoreline is present, AFTER won-drawn-lost records are removed.
///
/// The distinction the Brentford card turned on: `0-0-0` is a record, not a
/// score, so any run of three-or-more hyphenated numbers is stripped before a
/// two-part scoreline is read. Without this, `0-0-0` would read as a 0-0 score
/// and the check would fire on the record it is supposed to ignore.
export const hasStrictLeadScore = t => {
  const withoutRecords = t.replace(/\b\d+(?:-\d+){2,}\b/g, ' ')
  const scores = withoutRecords.match(/\b\d+\s*-\s*\d+\b/g) || []
  return scores.some(s => {
    const [a, b] = s.split(/\s*-\s*/).map(Number)
    return a !== b
  })
}

/// The defect a single soccer `brief_text` carries, or null if it is clean.
/// Named so the state is a reason, not a bare boolean, in the report and the
/// self-tests.
export const soccerBriefDefect = t => {
  if (!t || !t.trim()) return null
  // Defect 1: a soccer brief naming a non-soccer league or a basketball metric.
  // Word-boundaried so "MLS" never trips "MLB".
  if (/\b(DRTG|ORTG|NBA|NHL|NFL|MLB|WNBA)\b/.test(t)) return 'cross-sport vocabulary'
  // Defect 2, the wrong-stat-model symptom: a 0-0-0 won-drawn-lost record cited
  // as season context. Vacuous in the opening weeks (every side is 0-0-0) and
  // the wrong stat for European soccer regardless — the table, not the record,
  // is the season context. A discriminating record (e.g. 5-2-1) is NOT flagged.
  if (/\b0-0-0\b/.test(t)) return 'vacuous 0-0-0 record cited as season context'
  // Defect 2's contradiction form: a stated lead called a stalemate.
  if (/\bstalemate\b/i.test(t) && hasStrictLeadScore(t)) return 'stalemate beside a stated lead'
  return null
}
