# Scout's Gate E: a coin-flip market, from the moneylines /context/date already carries

**Date:** 2026-11-15. **Repo:** field-laboratory. **Files:** `src/Scout.fs`, `scripts/scout-coinflip-check.mjs`, `data/scout-coinflip-2026-11-14.json`, `scripts/tab-check.mjs`, `package.json`, `.github/workflows/verify.yml`.
**Trigger:** owner-pasted proposal 3 of 5. The owner approved "the win-probability field" on 2026-11-15, after being told `/context/date` serves no win-probability field.

## What was found before building

- No relay change was needed. `/context/date` carries `opening_odds` and `closing_odds` with moneylines, and the laboratory already de-vigs them: `Desk.winProbability` (closing preferred over opening, typed by market shape in `Market.fs`, a three-way market without a draw price reported as such). Nothing displayed it until now.
- The paste's coin-flip rule states two bands that disagree: "47%–53%" and "H(p) >= 0.99" (about 44% to 56%). The explicit 47–53 is used. Under it, the paste's own example "Wild @ Bruins 54%/46%" does not qualify: the closing line de-vigs to 45.73.

## What changed

- `Scout.gateCoinFlip`, **Gate E — coin-flip market**: Qualifies when the de-vigged home probability is within 47% to 53% inclusive; the reason names both sides with whole percentages in the sport's matchup order. A three-way market is a defined "no"; a missing draw price or no moneyline is "cannot tell", naming the input.
- Added to `gatesFor` after Gate D, not in place of B, C or D: those still state what production reads and this payload lacks. Gate 0 still vetoes first, so a level game on a national-only broadcast stays out.
- `Indeterminate` carries how many gates were asked; the summary read "of 5 gates" as a literal.
- The proposal's other two payload-native gates (market shock, live upset) are not built: the approval named the win-probability input, which is what this gate needed.

## Proof

| check | result |
|---|---|
| `check:scout-coinflip` (new; real 11-14 lines, expectations computed by hand) | 14/14 |
| band widened to 45% | 13/14 (Bruins red) |
| sides transposed in the reason | 13/14 (matchup-order check red) |
| Gate E left out of `gatesFor` | 13/14 (the qualifier check red) |
| `check:tabs` 62/62 (Gate E added to its gate-line split and three-answer form), `check:outlet-registry` 21/21, `check:pick` 24/24, `check:pickem` 33/33, `check` / `check:hard` / `check:render-sports` 19/19, `check:computed-chrome` 25/25, `outlet-scan-check` 6/6, `check:script-orphans`, `check:workflows` 71/71 | green |
| mutation-check anchors on the files changed | 17 checked, 0 broken |

## Residual

- Scout's Pick takes the first qualifying game in slate order, as before. With Gate E, many nights will have several qualifiers; choosing between them is not decided here.
