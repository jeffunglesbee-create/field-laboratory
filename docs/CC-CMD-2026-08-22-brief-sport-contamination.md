# CC-CMD-2026-08-22-brief-sport-contamination

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (journalism cron — the brief-generation prompt/context)
**Status:** PARTIALLY DONE 2026-08-23 — defects 1 and 3 shipped and deployed on the
relay; defect 2 remains open and is the whole of what is left here.

- **Defect 1 (cross-sport vocabulary) — DONE.** `2ed34c7` sport-gates the style
  block, so `CITE NBA ANALYTICS` and its "107.7 DRTG, best in the NBA" example no
  longer reach a soccer prompt. `9bf12b0` sport-gates the voice register, so a
  soccer brief sees exemplars D and E instead of all seven. Both kept layer 2f
  alive under gating — a gated block is a SUBSET, and the leak detector
  subtracted the joined string, so 10 of 16 tracked literals would have become
  undetectable in the same commit that reduced the leaks. Locked by
  `scripts/prose-style-scope-check.mjs` (23) and `voice-register-scope-check.mjs` (34).
- **Defect 3 (cross-window comparison) — DONE.** `812bb5c` adds the
  ONE WINDOW PER COMPARISON style rule, `crossWindowComparisons()`, and retry
  layer 2g. `scripts/cross-window-check.mjs`, 24 assertions, 8 of them negative.
- **Defect 2 (a live 3-0 called a "0-0-0 stalemate") — OPEN.** Untouched. Its
  real fix is the soccer season-stat model — table position and competition
  stakes rather than a W-D-L record — which needs standings in the prompt, so it
  overlaps `CC-CMD-2026-08-21-fpl-event-grounding-epl` and should be planned with it.
- **Residual, filed separately:** `CC-CMD-2026-08-23-prompt-numeral-mining` (the
  anti-exemplar's own figures still reach every sport) and
  `CC-CMD-2026-08-23-dim2-figure-cliff` (the scale pays 58.3 points for a brief's
  first figure and never asks whether it is real).
ask is the source fix (stop generating it).

One-liner:
```
EPL (soccer) briefs are being generated with basketball vocabulary and stats: an
Everton v Crystal Palace game_live brief read "Everton maintains a 107.7 DRTG,
best in the NBA, despite playing soccer tonight." DRTG is a basketball metric and
the NBA is a basketball league. The prompt/context for soccer briefs is leaking
another sport's stat model. Ground soccer briefs in soccer stats only.
```

---

## Probe block — run first, from HEAD (Rule 87)

Three of five relay asks this arc described already-done work because they were
filed from what the desk *rendered*, not from a HEAD probe. Do not repeat that.
Confirm the prompt path and the actual generated corpus before changing anything.

```bash
git log --oneline -5

# The brief, on the desk 2026-08-22 (EPL · 5), Everton v Crystal Palace game_live:
#   "Everton maintains a 107.7 DRTG, best in the NBA, despite playing soccer tonight."
# Pull the stored brief text and confirm the string is really in the archive, not
# a render artefact.
curl -s "$RELAY/context/date/2026-08-22" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
  for (const g of d.games.regular.filter(x=>x.sport==="EPL")) {
    const b = (g.brief_text||"");
    console.log(g.id, /\b(NBA|NHL|NFL|MLB|WNBA|DRTG|ORTG)\b/i.test(b) ? "CONTAMINATED" : "ok",
      "|", b.slice(0,120));
  }'

# How many soccer briefs across the corpus name a non-soccer league/metric?
# (This is the denominator the ask needs — is it one card or a class?)
grep -nE "DRTG|ORTG|\bNBA\b|\bNHL\b" src/journalism*.js src/*prompt* 2>/dev/null

# What context does a soccer brief get? Find where the prompt is assembled and
# what stat block it interpolates for sport==="EPL"/"La Liga"/"MLS".
grep -n "brief\|prompt\|game_live\|game_recap\|DRTG\|scoring\|stat" src/journalism*.js | head -40
```

## The evidence (from the laboratory side)

Two EPL cards on `/context/date/2026-08-22`, both `game_live`:

**Everton v Crystal Palace** — "Everton secured a 2-0 win … Everton maintains a
**107.7 DRTG, best in the NBA, despite playing soccer tonight**." The model wrote
its own confusion into the sentence. This is not a rendering bug — the desk's
scoreline verdict is green (2-0 checks out) and the one stat sentence carries a
time window, so every quality dimension the relay measures *passed* a brief that
claims a basketball rating for a football club.

**Brentford v Spurs** — "Brentford leads Spurs 3-0 in the 58th minute … Both
teams hold 0-0-0 records this season. The game remains a **0-0-0 stalemate in
league standings**." A live 3-0 is described as a stalemate. Separately: "Spurs' 3
shots this match trail Brentford's 37 goals this season" compares shots-in-a-match
to goals-in-a-season — two different windows in one comparison, and "37 goals this
season" alongside "0-0-0 records this season" is internally contradictory.

## The ask

Three defects, most severe first. (1) is the filed one; (2) and (3) are named
because they are the same root cause — a soccer brief built from the wrong stat
model — and fixing only (1) leaves the card still wrong.

1. **Stop leaking non-soccer vocabulary into soccer briefs.** A soccer brief must
   not name DRTG/ORTG (basketball rating metrics) or a non-soccer league (NBA,
   NHL, NFL, MLB, WNBA). Whether this is a shared prompt template, a mis-joined
   stat block, or a model free-associating from a basketball-heavy context — the
   probe above says which. The fix belongs where the soccer prompt is assembled.

2. **A live scoreline and a "stalemate" standings line must not co-exist.** If the
   card is live at 3-0, the brief may not also call the game a "0-0-0 stalemate."
   This is the season-stat-template gap (`CC-CMD-2026-08-20-brief-data-quality`
   ask 5, `CC-CMD-2026-08-21-fpl-event-grounding-epl`) showing as a contradiction,
   not just an omission.

   **The deeper fix is the stat model, not the contradiction.** For European
   soccer a won-drawn-lost record is not the headline season stat; **table
   position (points, rank) and competition advancement** (European qualification,
   relegation battle, cup round) are what carry meaning. The "0-0-0 records this
   season" line is wrong on two counts: it reaches for the wrong stat, and on this
   slate — 2026-08-22, opening weeks — *every* side's record is 0-0-0, so it is
   vacuous even before it contradicts the 3-0. Table position is not vacuous in
   August; a side can already sit top or bottom on goal difference after two
   games. The soccer season-stat template should ground briefs in the table and
   in what the club is playing for, and only cite record where it actually
   discriminates (mid-season, and even then behind points/position).

3. **Do not compare across time windows in one sentence.** "3 shots this match"
   vs "37 goals this season" is not a comparison. This is a `FIELD_PROSE_STYLE`
   question — the Dim 8 rule already forbids a bare number; it does not yet forbid
   a two-window comparison.

**Artifact:** a soccer `game_live`/`game_recap` brief on the next EPL/La Liga/MLS
slate contains zero of the tokens `DRTG|ORTG|NBA|NHL|NFL|MLB|WNBA`, does not
describe a game with a non-0-0 scoreline as a stalemate, and — where it cites
season context at all — leads with table position or competition stakes rather
than a bare W-D-L record (and never cites a 0-0-0 record as though it
discriminated) — enumerated pass/fail per row, not a prose judgement.

## What the laboratory already does (do not re-file)

The desk now **catches** two of these rather than rendering them as true — the
trust wedge working: a false claim is visible as caught, not laundered into the
card. But catching is not curing; the relay should not be *writing* the
falsehoods, which is this ask.

- **Defect 1 (cross-sport).** `Journalism.crossSportTokens` reads the game's own
  `IsSoccer` from the `Sport` registry and flags any foreign league/metric token;
  `src/Scoreboard.fs` renders "cross-sport reference — this soccer brief names
  NBA, DRTG". Negative-tested in `scripts/journalism-check.mjs` (the Everton brief
  is caught; a clean soccer brief and an "MLS" mention are not).

- **Defect 2 (stalemate vs a stated lead).** `Scoreline.contradictoryLevelClaim`
  flags a brief that states a scoreline with a strict leader AND calls the game a
  "stalemate"; `Scoreboard.fs` renders "contradiction — states a lead yet calls
  the game a stalemate". It reads the brief alone (the live game had no final, so
  the scoreline verdict could only say "final not in yet"). Crucially it does NOT
  read "0-0-0" as a 0-0 score — that is a won-drawn-lost record, dropped as a
  three-part run; the only scoreline is the 3-0, and the flag is the word
  "stalemate" against it. Negative-tested in `scripts/scoreline-check.mjs`
  (a clean lead, a genuine "1-1 deadlock", a "level at the half" progression, and
  a bare 0-0-0 record are all NOT flagged).

Defect 3 (the two-window comparison) has no laboratory guard yet — it is a
`FIELD_PROSE_STYLE` question and is the relay's to fix.

## Scope boundary

- Not the laboratory. The detector is shipped and verified; this ask is purely
  about the generation side.
- Only the soccer direction is modelled in the detector, because it is the one
  observed. If a basketball/baseball brief ever names a soccer league, that is a
  laboratory extension filed then — not invented now.
