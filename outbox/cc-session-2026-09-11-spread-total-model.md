# CC session — spread/total model (CC-CMD-2026-09-11), closed

**Date:** 2026-09-21
**CC-CMD:** `docs/CC-CMD-2026-09-11-spread-total-model.md`
**Commits:** `b81b5c8` (Task 0.2), `cf9eab8` (Task 1), this one (Tasks 0.3, 3, 4)

## TASK 0 — the probe

### 0.1 — the model at HEAD, read before extending

`Spread` was `Balanced`/`Unbalanced`, `TotalLine` was `OneLine`/`TwoNumbers`,
both since `85afee8` on 2026-08-10. The CC-CMD's warning not to assume those
names was right to exist, and they were in fact current.

### 0.2 — the shapes, verbatim

**The document said this needed a runner. It did not.** "No committed capture
holds a single `spread` or `total` key" is false; three of four hold both. The
correction, and who repeated it, are in
`outbox/2026-09-21-spread-total-shapes.md`.

Committed captures (`scripts/odds-shape-census.mjs`, raw payload, not decoded):

```
spread    30×  {away,awayPrice,home,homePrice}
               {"home":-1.5,"away":1.5,"homePrice":169,"awayPrice":-207}
           5×  {away,home}
               {"home":-1.5,"away":1.5}
           1×  {away,home} ALL NULL
               {"home":null,"away":null}   EPL_2026-08-29_bournemouth_everton

total     36×  {over,under}   {"over":8,"under":8}   {"over":8.5,"under":8.5}
           1×  {over,under} ALL NULL   same game

moneyline 76×  {away,draw,home}   soccer
          34×  {away,home}        MLB
```

**`over === under` in every sample.** `TwoNumbers` has never been observed.

### 0.3 — two fresh live dates

Workflow `odds-shape-census.yml`, run 1 (`35554699423`, **success, 15s**),
committed as `outbox/odds-shape-census-20260921T023554Z.md`:

```
2026-09-20    75 rows,  52 snapshots    spread 26   total 26    moneyline 51
              26× {away,awayPrice,home,homePrice}   MLB, WNBA, wnba
              26× {over,under}   {"over":8,"under":8}

2026-09-19   141 rows, 161 snapshots    spread 35   total 110   moneyline 160
              35× {away,awayPrice,home,homePrice}   CFL, MLB, WNBA, wnba
             110× {over,under}   {"over":3.5,"under":3.5}
                  CFB, CFL, MLB, MLS, WNBA
```

**Four findings the committed captures could not have shown:**

1. **`spread` and `total` are not 1:1.** 35 against 110 on 09-19. In every
   committed capture they moved together (4/4, 18/18, 14/14). Soccer and CFB
   get totals with no handicap.
2. **`moneyline` is no longer on every snapshot** — 51 of 52, then 160 of 161.
   It was universal in all four captures.
3. **`_kickoff` is on the wire** — 16 of 52, then 114 of 161. In no capture.
4. **`_oddsProof` is no longer universal** — 83 of 161 on 09-19, against 100%
   in every capture.

None of these change the `Spread`/`TotalLine` unions. All four are recorded
rather than acted on: this CC-CMD models line SHAPE, and each is a question
about the relay's payload composition.

## TASK 1 — the unions

| added | measured reason |
|---|---|
| `Spread.PickEm` | a zero handicap names no favourite; `favouriteAgreement`'s `when h <> 0.0` guard existed because the type could not say it. Guard removed. |
| `Spread.OneSidedSpread of float option * float option` | `spreadOf` returned `None` for "no key" AND "one side present" — an absence collapse |
| `SpreadPricing` = `BothPriced` / `NeitherPriced` / `OnlyOnePriced` | 30 priced against 5 unpriced, **both shapes in the same capture**; prices were decoded into `Odds` and appeared in no union case |

`TotalLine` unchanged — nothing measured to add.

**Appended, never inserted.** `drift-check.mjs` transcribes the tags as
ordinals. Re-read from `build/Desk.js` after the change: `Balanced 0,
Unbalanced 1, PickEm 2, OneSidedSpread 3`.

## TASK 3 — the proof case, and the compiler's own refusal

Unprompted, during the build:

```
./src/Scoreboard.fs(165,15): warning FSHARP: Incomplete pattern matches on this
expression. For example, the value 'Some (OneSidedSpread (_, _))' may indicate a
case not covered by the pattern(s). (code 25)
```

`verify` treats an F# warning as an error, so that build does not ship.

Then as a committed case, verbatim from `npm run check:proof`:

```
PASS  ODDS-PROOF.md case 34 rejected with FS0025: | Some (OneLine line) -> sprintf "
PASS  ODDS-PROOF.md case 35 rejected with FS0025: | BothPriced(h, a) -> sprintf "%+.

77/77 checks passed
```

**Case 35 is new.** 77/77, up from 76.

## TASK 3 — the per-sport census, three distinct dates

```
2026-08-29  Bundesliga=0/6 CFB=0/8 CFL=0/1 EPL=4/4(draw 4) La Liga=3/3(draw 3)
            Ligue 1=3/5(draw 3) MLB=14/15 MLS=26/28(draw 26) NFL=0/2
            Serie A=4/4(draw 4) WNBA=2/2

2026-09-05  Bundesliga=0/6 CFB=0/68 EPL=6/7(draw 6) La Liga=0/3 Ligue 1=0/3
            MLB=14/15 MLS=18/21(draw 18) Serie A=2/3(draw 2)

2026-09-20  Bundesliga=0/3 EPL=3/4(draw 3) La Liga=4/5(draw 4) Ligue 1=3/3(draw 3)
   (live)   MLB=15/15 MLS=2/11(draw 2) NFL=0/14 NHL=0/7 Serie A=3/5(draw 3)
            WNBA=6/6 golf=0/2
```

**The done condition says "MLS appears with 0 odds, and the sentinel's
transition alarm is demonstrated (or its absence explained)."**

MLS is **2 of 11**, not 0. The alarm fired on it anyway, and getting there took
two corrections:

```
ODDS COLLAPSED  MLS: 18/21 (86%) on 2026-09-05, now 2/11 (18%)
```

The first version fired only on `withOdds === 0` and printed PASS over this.
Missing the case by two games is missing it. The rule is now a collapse below a
third of a previously-covered rate, firing on the **transition** rather than
every day the condition persists. Full account:
`outbox/2026-09-21-first-live-coverage-reading.md` and
`outbox/2026-09-21-the-collapse-alarm-is-a-transition.md`.

## A census blind spot, found by disagreement

`spreadOf` counted 17 spreads on 2026-08-29; the shape census counted 18. The
extra is `EPL_2026-08-29_bournemouth_everton` `closing_odds` carrying
`spread: {"home":null,"away":null}` — key present, both values null. The census
grouped by key set alone, so a present-but-empty payload read as a genuine
unpriced handicap, and the "6 unpriced" published that morning was 5. The same
game carries `total: {"over":null,"under":null}`.

Neither tool was wrong about what it measured. **The disagreement was the
finding**, and only running both produced it.

## WHAT REMAINS UNMODELLED — explicitly

1. **`spreadOf` still collapses two facts into `None`.** "No `spread` key" and
   "`spread: {home:null, away:null}`" both arrive as `None`, because `Odds`
   decodes `SpreadHome: float option` and key-presence is gone before
   `spreadOf` sees it. `OneSidedSpread` closed the half-present case; this needs
   a DECODER change, not a union change. **One row on 2026-08-29 carries it.**
   Not attempted. `TotalLine` has the same gap for the same reason.

2. **The `spread`/`total` divergence is uncounted.** 35 against 110 on
   2026-09-19 means a game can carry a total and no handicap. Nothing in the
   model says the two travel together, so nothing is wrong — but nothing
   measures the divergence either.

3. **`_kickoff` and the `_oddsProof` drop are unexamined.** Both are new on the
   wire relative to every committed capture. Neither is a line shape.

4. **MLS's cause remains undiagnosed.** The CC-CMD killed four hypotheses and
   named three untested candidates. This session tested none of them. It made
   the collapse visible and alarmed-on, which is a different thing, and is
   stated as such rather than as a diagnosis.

## Verification

| check | result |
|---|---|
| `npm run build` | clean, zero F# warnings |
| `check:proof` | **77/77** (was 76); case 35 is the new one |
| `odds-shape-census.mjs --self-test` | 19/19 |
| `mutate-odds-shape-census.mjs` | 8/8 caught |
| `odds-coverage.mjs --self-test` | 24/24 |
| `mutate-odds-coverage.mjs` | 13/13 caught |
| `odds-shape-census.yml` run 1 | success, 15s, two dates committed |
| citations, import-purity, short-circuit, script-orphans, workflows, rows, docs, staged-outbox | all PASS |
