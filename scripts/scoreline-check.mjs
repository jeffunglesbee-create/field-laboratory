// Does a scoreline in a brief describe a game that could have ended the way
// this one did?
//
// This is the first check in the project that tests a claim in generated prose
// against the data it was generated from. It is possible because
// `data/brief-join-corpus.json` carries `game_id` and the game rows it joins to,
// and it is narrow on purpose: it checks scorelines and nothing else.
//
// THE PLAN'S ACCEPTANCE CRITERION WAS WRONG, AND THE DATA SAYS SO
//
// `docs/JLAYER-PLAN.md` promised "no false positives: a brief saying 'Orioles
// lead 4-2' must match home_score/away_score on its game row." Briefs are
// written mid-game; rows carry finals. Matching would flag almost every brief.
// `src/Scoreline.fs` carries the correction and the three disproving rows.
//
// The relation that holds is DOMINANCE, per side, in either assignment — scores
// do not decrease. See that module; this file is the extractor and the census.
//
// THE EXTRACTOR IS THE HARD PART, AND IT WAS WRONG FOUR TIMES
//
// A bare /(\d+)-(\d+)/ over the joined corpus reports 554 "scorelines" and 157
// of them not dominated by the final — 28.3%, which would read as mass
// fabrication. It is not. Measured, the matches were:
//
//   `5-5-7`, `8-2-6`, `10-4-3`   three-part soccer records (W-D-L). A two-number
//                                regex eats the first two components.
//   `an 11-6 record`             a pitcher's win-loss record
//   `(23-9)`                     a team's record in parentheses
//   `96-79 win`                  a real scoreline, but WNBA — larger by an order
//                                of magnitude than the baseball rows beside it
//
// Filtering on a scoreline CUE and refusing record-shaped numbers left one
// reported finding, and it was the extractor's fourth mistake rather than a
// fabrication:
//
//   "The Yankees edged the Braves 5-4 on 08-08"  -> 5-4 correct, `08-08` a DATE
//
// So a fifth rule: a zero-padded component is a calendar date, not a score.
// Every exclusion is a regex with the measured string beside it, and the
// self-test pins all four by name.
//
// After filtering: 147 claims, 0 not dominated by the final. The filtering is
// doing real work — 554 candidates down to 147 — which is exactly why the
// self-test has to show it still catches a real fabrication.
//
// WHAT A PASS DOES NOT MEAN
//
// Not that the briefs are truthful. A claim that never occurred but sits under
// the final passes, and nothing here reads player stats, standings or park
// factors. It checks scorelines against the one fact the game row settles.
//
// Usage:  node scripts/scoreline-check.mjs [--self-test]

import { readFileSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'
import { observed, final, judge, isFinding, wasChecked, finalPair } from '../build/Scoreline.js'
import { resolveGame, indexGames } from './game-id-scheme.mjs'

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')
const CORPUS = 'data/brief-join-corpus.json'

/**
 * A pair of numbers that is not part of a longer hyphenated run.
 *
 * The lookbehind and lookahead are what keep `5-5` from being harvested out of
 * `5-5-7`. That single case accounted for most of the first measurement's
 * apparent fabrications.
 */
const PAIR = /(?<![\d–-])(\d{1,3})\s*[-–]\s*(\d{1,3})(?![\s]*[-–]\s*\d)/g

/** Words that make a number a scoreline rather than a statistic. */
const CUE = /\b(leads?|leading|trails?|trailing|tie|tied|deadlock(?:ed)?|won|win|beat|defeat(?:ed)?|ahead|edge[ds]?|up)\b/i

/**
 * Words that make it a record instead, however scoreline-shaped it looks.
 *
 * The alternation was `/\brecord|mark\b/i`, which binds as `(\brecord)|(mark\b)`
 * — right by accident, and only for one of the two words. Grouped now.
 */
const RECORD = /\b(record|mark|standings?)\b/i

/**
 * A date, not a score: `on 08-08`.
 *
 * Found by this check's first real run, which reported "claims 8-8, final
 * Yankees 5 / Braves 4" from the sentence "The Yankees edged the Braves 5-4 on
 * 08-08" — the true scoreline 5-4 was extracted correctly, and the DATE beside
 * it was extracted as a second one.
 *
 * The discriminator is the leading zero. No one writes a score as "08"; a
 * zero-padded pair is a calendar date. Stated as a rule about notation rather
 * than a range, because a range would have to guess how large a score can be
 * and this corpus holds both 1-1 and 96-79.
 */
const ZERO_PADDED = /^0\d/

/**
 * A parenthesised pair is a record, not a scoreline: `The Valkyries (23-9)`.
 *
 * Caught by the self-test rather than the corpus. The cue word that admitted it
 * — "trail" — is real and refers to the game; the number in parentheses is the
 * season record beside the team name, and the word "record" sat just outside
 * the window. Parentheses are the reliable signal, so they are the rule.
 */
const PARENTHESISED = /\(\s*$/

/** How far either side of a number to look for a cue. */
const WINDOW_BEFORE = 55
const WINDOW_AFTER = 25

/** Every scoreline claim in a brief, with the window that justified it. */
export function scorelinesIn(text) {
  const out = []
  for (const m of text.matchAll(PAIR)) {
    const s = Math.max(0, m.index - WINDOW_BEFORE)
    const e = Math.min(text.length, m.index + m[0].length + WINDOW_AFTER)
    const window = text.slice(s, e)
    if (!CUE.test(window)) continue
    if (RECORD.test(window)) continue
    if (ZERO_PADDED.test(m[1]) || ZERO_PADDED.test(m[2])) continue
    if (PARENTHESISED.test(text.slice(Math.max(0, m.index - 2), m.index))) continue
    out.push({ a: Number(m[1]), b: Number(m[2]), window: window.replace(/\s+/g, ' ').trim() })
  }
  return out
}

// ── the self-test ───────────────────────────────────────────────────────────
//
// A filter that drops three quarters of its candidates has to be shown to still
// catch what it is for. Every exclusion below is a string measured out of the
// real corpus, not one invented to make the filter look good.

if (SELF_TEST) {
  const { check, summarize } = createChecks()

  const found = t => scorelinesIn(t).map(x => `${x.a}-${x.b}`)

  check('a plain scoreline is extracted',
    found('Detroit currently leads 4-2.').join() === '4-2', JSON.stringify(found('Detroit currently leads 4-2.')))
  check('a tie is extracted',
    found('Dodger Stadium hosts this 2-2 tie through three innings.').join() === '2-2',
    JSON.stringify(found('Dodger Stadium hosts this 2-2 tie through three innings.')))
  check('a deadlock is extracted',
    found('Angel Stadium hosts a tight 1-1 deadlock between the Brewers and Angels.').join() === '1-1',
    JSON.stringify(found('Angel Stadium hosts a tight 1-1 deadlock')))

  // The four measured false positives, by name.
  check('a three-part soccer record is NOT a scoreline',
    found('Minnesota holds a 6-5-6 mark this season while leading the group').length === 0,
    JSON.stringify(found('Minnesota holds a 6-5-6 mark this season while leading the group')))
  check('a pitcher win-loss record is NOT a scoreline',
    found('Yoshinobu Yamamoto carries an 11-6 record and leads the staff').length === 0,
    JSON.stringify(found('Yoshinobu Yamamoto carries an 11-6 record and leads the staff')))
  check('a parenthesised team record is NOT a scoreline',
    found('The Valkyries (23-9) trail the Sky with a 12-4 record').length === 0,
    JSON.stringify(found('The Valkyries (23-9) trail the Sky with a 12-4 record')))
  // The two the first real run and the self-test found, by name.
  check('a DATE beside a real scoreline is not a second scoreline',
    found('The Yankees edged the Braves 5-4 on 08-08, proving a point').join() === '5-4',
    JSON.stringify(found('The Yankees edged the Braves 5-4 on 08-08, proving a point')))
  check('a zero-padded pair alone is not a scoreline',
    found('Detroit leads the series on 08-08 against Chicago').length === 0,
    JSON.stringify(found('Detroit leads the series on 08-08 against Chicago')))

  check('a number with no scoreline cue at all is NOT a scoreline',
    found('San Diego and Minnesota remain at 1-1 in the standings table.').length === 0,
    JSON.stringify(found('San Diego and Minnesota remain at 1-1 in the standings table.')))

  // A real, large scoreline must survive — the filter must not be a bound on
  // magnitude, because WNBA and baseball live in the same corpus.
  check('a basketball-sized scoreline survives',
    found('securing a 96-79 win over Tempo').join() === '96-79',
    JSON.stringify(found('securing a 96-79 win over Tempo')))

  // ── the relation ──────────────────────────────────────────────────────────
  const v = (a, b, h, aw) => judge(final(h, aw), observed(a, b))

  check('a mid-game score under the final is consistent',
    v(4, 2, 6, 8) === judge(final(6, 8), observed(4, 2)) && !isFinding(v(4, 2, 6, 8)),
    'a legitimate mid-game score was reported as a finding')
  check('the final itself is consistent',
    !isFinding(v(2, 1, 2, 1)), 'a recap stating the final exactly was flagged')
  check('the reversed assignment is consistent',
    !isFinding(v(8, 6, 6, 8)), 'the claim was only tried in one order')
  check('a score ABOVE the final is impossible',
    isFinding(v(9, 2, 6, 8)), 'a claim that cannot have preceded this final passed')
  check('exceeding on the second side alone is impossible',
    isFinding(v(4, 9, 6, 8)), 'only one side is being compared')

  check('no final means Unsettled, and Unsettled is not a finding',
    !isFinding(v(4, 2, undefined, undefined)) && !wasChecked(v(4, 2, undefined, undefined)),
    'an unfinished game was treated as a pass or as a finding')
  check('a checked verdict reports as checked',
    wasChecked(v(4, 2, 6, 8)) && wasChecked(v(9, 2, 6, 8)),
    'the non-vacuity signal does not distinguish checked from unchecked')

  check('a negative claim is refused rather than judged',
    observed(-1, 2) === undefined, 'a negative score was accepted as observable')

  // The typed final must read back as what went in, since findings quote it.
  check('a Final reads back the pair it was built from',
    Array.from(finalPair(final(6, 8))).join() === '6,8',
    JSON.stringify(Array.from(finalPair(final(6, 8)))))

  process.exit(summarize() === 0 ? 0 : 1)
}

// ── the joined corpus ───────────────────────────────────────────────────────

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const capture = JSON.parse(readFileSync(CORPUS, 'utf8'))
  const index = indexGames(capture.games)

  let joined = 0
  let claims = 0
  let checked = 0
  const findings = []

  for (const b of capture.briefs) {
    const row = b.game_id ? resolveGame(b.game_id, index) : null
    if (!row) continue
    joined++
    const f = final(row.home_score ?? undefined, row.away_score ?? undefined)
    for (const s of scorelinesIn(b.brief_text)) {
      claims++
      const o = observed(s.a, s.b)
      if (!o) continue
      const verdict = judge(f, o)
      if (wasChecked(verdict)) checked++
      if (isFinding(verdict)) {
        // Read back off the TYPED final rather than the raw row, so the number
        // reported is the one that was actually judged. A finding quoting the
        // row while the comparison used something else would be unfalsifiable.
        const [h, a] = Array.from(finalPair(f))
        findings.push(`${b.id} (${b.brief_type}, ${row.sport}): claims ${s.a}-${s.b}, ` +
          `final ${row.home} ${h} / ${row.away} ${a} — …${s.window}…`)
      }
    }
  }

  console.log(`\n${joined} joined brief(s), ${claims} scoreline claim(s), ${checked} judged against a final\n`)

  // Non-vacuity first, and twice, because this check's headline result is a
  // zero. "No impossible scoreline" is free when nothing was extracted, and
  // free again when every game was unfinished.
  check('the corpus yields scoreline claims to check',
    claims > 0, `${claims} claim(s) extracted from ${joined} joined brief(s)`)

  check('the claims were judged against real finals, not skipped as unsettled',
    checked > 0, `${checked} of ${claims} claim(s) had a final to compare against`)

  check('no brief claims a scoreline its game could not have ended from',
    findings.length === 0,
    findings.slice(0, 10).join('\n      → '))

  process.exit(summarize() === 0 ? 0 : 1)
}
