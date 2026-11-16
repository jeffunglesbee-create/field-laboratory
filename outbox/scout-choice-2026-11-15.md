# Scout's Pick chooses among qualifiers by gate precedence, then nearest to even; ties are named

**Date:** 2026-11-15. **Repo:** field-laboratory. **Files:** `src/Scout.fs` (`chooseScout`), `src/PickView.fs`, `scripts/scout-coinflip-check.mjs`.
**Trigger:** owner's ruling 2026-11-15 on the options offered: "2 and 3 seem best, we don't want anything arbitrary and/or invented."

## What it replaces

The panel took the first qualifier in slate order. Production orders by `_rankSignal` (`jubilant-bassoon/src/legacy/field.js:6764`), a weighted sum used for sort order only: stat anomaly 100+, milestone 60/80, series 40, WC MD3 35, MD2 20. Those weights are chosen numbers and Gate E has none, so it is not ported.

## The rule

1. **Gate precedence.** The game whose best qualifying gate comes first in `gatesFor`, the architecture doc's order (A, B, C, D) with E after it. A series game ranks ahead of a coin-flip one. Only the single best gate is compared; nothing is summed.
2. **Nearest to even,** between games whose best gate is the coin-flip market: the smaller distance of the de-vigged home probability from 50% (float tolerance 1e-9, the same as `Market`'s).
3. **What is still level is named,** not broken by slate order: `ScoutChoice.Level` lists every game tied with the choice, and the panel says "level with N other(s) on the same signals: ...". The panel also states the basis in words.

Not included: excluding finished games. It was offered with this as a separate point and was not part of the ruling.

## Proof

| check | result |
|---|---|
| `check:scout-coinflip` | 22/22 (8 new). The real 11-14 mirror lines, Ducks (-108/-112) and Blues (-112/-108), are reported level; Marshall (47.83) is not in the running; reversing the slate leaves the level set unchanged; a lone qualifier says so; no qualifier is no choice; a synthetic playoff league on the Cavaliers' real row ranks ahead of both coin-flip games |
| gate precedence removed | 21/22 |
| nearest-to-even removed | 20/22 |
| tie broken silently (`Level = []`) | 20/22 |
| browser read of `#panel-scout-pick` with the fixture served as the slate | leader "Islanders @ Ducks", "level with 1 other on the same signals: Panthers @ Blues", basis "the coin-flip market nearest to even", no bare decimal, no page errors |
| `check:tabs` 62/62, `check` / `check:hard` / `check:render-sports` 19/19, `check:pick` 24/24, `check:pickem` 33/33, `check:computed-chrome` 25/25, `check:outlet-registry` 21/21, `outlet-scan-check` 6/6, `check:script-orphans`; mutation anchors on changed files 5, 0 broken | green |

## Residual

- When the panel shows a tie, the game drawn as the leader is still the first of the level set in slate order. The tie line names the others, so the order is not presented as a judgement; removing a single leader altogether would be a layout change and is not made here.
