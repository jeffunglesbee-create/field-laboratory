# Pick'em: picks lock at kickoff, each side shows its served line, rows grouped by state

**Date:** 2026-11-15. **Repo:** field-laboratory. **Files:** `src/Pickem.fs`, `src/PickemView.fs`, `src/Desk.fs` (`bestOdds` made public, body unchanged), `index.html` (two CSS rules), `scripts/pickem-check.mjs`, `scripts/computed-chrome-check.mjs`.
**Trigger:** owner-pasted proposal 5 of 5, approved 2026-11-15.

## What was found

- Grading already existed (`Pickem.decide`, `Final` only) and the `pk-chip--right/--wrong/--live` rules were already in use. "NO PICK" on every row meant no pick had been made, not that grading was missing.
- **A real defect the proposal did not name:** a side could be picked on a finished game and was graded at once. Clicking the winner of a 5-2 final read CORRECT, and the banner counted it.
- The buttons showed no line, though the payload carries one (closing preferred, as `Desk.winProbability` already chooses).

## What changed

- `Pickem.pickOpen`: a pick may be made or changed only before kickoff. Kickoff rather than state alone, because a game past its start time with no score served still reads `Scheduled`. Locked sides are `disabled`; the chosen side keeps its styling.
- Rows within a sport are grouped **Open · n**, **Under way — locked · n**, **Settled · n**. The heading is the explanation for the lock (the CSS records an earlier failure of greyed buttons with no explanation).
- Each side carries its served moneyline (`+170`, `-205`) in tabular figures, titled `closing moneyline` or `opening moneyline`. No line served, no stamp.

## Proof

| check | result |
|---|---|
| `check:pickem` | 33/33 (was 25; grading picks are now seeded as made before kickoff, and the lock, groups and stamps are asserted) |
| lock removed (`pickOpen` true after kickoff) | 30/33: the two lock checks and "clicking a finished game's winner picks nothing" red |
| stamp built but not attached | 31/33: the two stamp checks red (the stamp read was made non-throwing first, so a missing stamp is a named FAIL rather than a locator timeout) |
| `check:computed-chrome` | was a 30 s timeout after the lock: its one click hit a disabled side on the all-final 08-09 fixture. It now clicks an open side, or seeds a pick where every side is locked: 25/25, chosen state still compared on two rendered siblings |
| `check:tabs` 61/61, `check` / `check:hard` / `check:render-sports` 19/19, `check:device-chrome` 8/8, `check:glyph` 2/2, design-tokens, typography, palette | green |

## An incident in this session, recorded

A read-only script meant to list `mutation-check.mjs` anchors imported that file, which runs the mutation suite. It was stopped within two minutes. It had injected proof code into `src/Scoreboard.fs` (restored from git, identical to the run's own backup) and left `.proof-state/active.json`; `proof-check` then classified the state STALE and discarded it without writing back (140/140). The anchor census was redone as a text scan: 29 anchors on the files this session changed, 0 broken.
