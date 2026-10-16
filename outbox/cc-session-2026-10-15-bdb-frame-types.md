# CC session — bdb-frame-types (vintage-typed BDB frame decoding)

**CC-CMD:** `docs/CC-CMD-2026-10-15-bdb-frame-types.md`. Built 2026-10-16
(Eastern), alongside empowerment-metrics Task 4, which is its first consumer;
that change is written up in `outbox/gravity-well-2026-10-16.md`.
**State:** Tasks 1, 2, 4, 5 and 6 BUILT; Task 3 REJECTED (the three states it
names are defined nowhere). Status line set to BUILT.
**Base:** field-laboratory 8eaf5a0. Built and verified in an isolated copy;
the confidence gate (`npm run gate`) is run by the committing session.

## Unblocked

The blocker was the relay route. field-relay-nba
`outbox/verify-bdb-event-frames-latest.json` (commit 24cec24) records 11 of 11
checks held at 2026-10-16T18:24:47Z on the deployed
`/nflverse/bdb_event_frames.json`: HTTP 200, 1,816,808 bytes, `X-Source: r2`,
no `targetYear`. The artifact is committed here verbatim as
`data/bdb-event-frames-2022-w2.json` (sha256 6be5a282…d249, equal to the
builder's R2 read-back; `data/PROVENANCE.md` has the section and why it was
copied rather than captured).

## What was built, per task

| task | built | where |
|---|---|---|
| 1 `src/Vintage.fs` | `[<Measure>] season`; `Vintage` (private `Archive`/`Current`); `Tracked<'T>` (private case, prints `Vintage.Tracked` through `string`, `%A`, interpolation and `JSON.stringify`); `VintageMismatch`; `DecodeError` = `NoSeason`, `NoSourceDataset`, `FutureSeason`, `Malformed` | `src/Vintage.fs` |
| 2 decoder | `Vintage.decodeEnvelope current payload text`, generic over the payload so the six-file retrofit plugs in its own decoder; `Gridiron.decodeFrames` for the frames artifact. `season` must be a JSON number (Thoth's int decoder would parse `"2022"`), `sourceDataset` must be present and non-blank, a season after `current` is `FutureSeason`, `targetYear` is never read | `src/Vintage.fs`, `src/Gridiron.fs` |
| 3 wiring | REJECTED, see below | — |
| 4 proof doc | `docs/VINTAGE-PROOF.md`: 5 compile cases (3 FS1093, 2 FS0001) for three of the five rejections; the two that are runtime under the command's own types are said to be, with the rows and mutation that hold them | `docs/VINTAGE-PROOF.md` |
| 5 check:proof | `node scripts/proof-check.mjs --only VINTAGE-PROOF`: 5 of 5 cases rejected with the claimed code (plus baseline and registry phases, 8/8) | below |
| 6 mutations | `vintage-cases-public` (expect `proof-check --only VINTAGE-PROOF`) and `vintage-missing-season-defaults` (expect `node build/VerifyMain.js`) | `scripts/mutation-check.mjs` |

`render` became `Vintage.valueAt : int<season> -> Tracked<'T> -> Result<'T,
VintageMismatch>`: the lab has no `Svg` type, and the exit still demands the
season. A second exit, `Vintage.archiveAt`, returns the value only when it is
an ARCHIVE of the season asked; Gravity Well's display witness is built on it.
`decodeEnvelope` takes the current season as an argument and the F# reads no
clock. `Vintage.nflSeasonOf` gives the caller the relay's own August rule
(field-relay-nba's `nflYear`: from August, the new season).

## Task 3, rejected with its reason

`PocketState`, `RouteState` and `Anchor` are defined nowhere. A search of
field-laboratory, jubilant-bassoon and field-relay-nba (source and docs) on
2026-10-16 finds `PocketState` and `RouteState` only on the command's own line
74, and no type named `Anchor` in any repo; `git log -S PocketState` finds only
0814996, the command's own commit. "Anchor" exists as a metric idea in
`docs/DATA-VERIFICATION-2026-10-15-constrictor-catalyst-anchor.md` and is not
one of the four metrics the frames artifact unblocks. Building the wiring would
mean inventing the states. The pattern the task asks for exists on the one
state that is defined: `Gravity.Well` reaches a caller only through a season
(`Gravity.measuredAt`, `Gravity.archivedAt`) and has exactly one accessible-name
function. Nothing is deferred: a future Vault or Kinetic Separation command
defines its state and wires it the same way.

## Evidence

**Suite.** `node build/VerifyMain.js`: 213/213 held (191 before; the new
"Gravity Well" group adds 22, eight of them the envelope rows for this
command: no season, string season, missing or blank source, future season,
archive versus current, release only at its own season, the August rule, and
the printing of a tracked value). `grep -o 'Verify.check ' src/Suite.fs | wc
-l` = 213. On the Verify panel in Chromium the rows' must-hold inputs are
envelope text and seasons only.

**Proof.** `node scripts/proof-check.mjs --only VINTAGE-PROOF`:

```
--only "VINTAGE-PROOF": 5 of 95 case(s), 1 of 21 doc(s) — THIS IS A SUBSET.
PASS  baseline tree compiles
PASS  the proof doc contains machine-checkable cases
PASS  VINTAGE-PROOF.md case 1 rejected with FS1093
PASS  VINTAGE-PROOF.md case 2 rejected with FS1093
PASS  VINTAGE-PROOF.md case 3 rejected with FS1093
PASS  VINTAGE-PROOF.md case 4 rejected with FS0001
PASS  VINTAGE-PROOF.md case 5 rejected with FS0001
PASS  adding a Sport case without the registry does not compile
8/8 checks passed
```

Each case's compiler text, captured separately in a scratch copy of `src/`, is
quoted under it in the doc; each fails for the reason it claims and no other.

**Mutations.** Every anchor occurs once in its file (`grep -cF` prints 1).
Each was run alone with `node scripts/mutation-check.mjs --only <id>`; each run
reported a green baseline and the mutation CAUGHT by its expect (none was
"defended by the COMPILER"). The rows each one turned red were read in a
scratch copy of `src/` with the replace applied and the suite rebuilt:

| id | expect | rows red |
|---|---|---|
| `vintage-cases-public` | `proof-check --only VINTAGE-PROOF` | case 2 compiles |
| `vintage-missing-season-defaults` | F# suite | no season is refused |
| `vintage-blank-source-accepted` | F# suite | missing or blank sourceDataset |
| `vintage-season-string-accepted` | F# suite | season written as a string |
| `vintage-future-season-stamped-current` | F# suite | later season refused |
| `vintage-archive-granted-to-current` | F# suite | archive versus current; the gravity witness |
| `gridiron-past-line-inclusive` | F# suite | strictly past the line, plus five rows that read play 1's on-the-line RB |
| `gravity-snap-counts-a-defender-twice` | F# suite | census accounting, the four labels, drawn cancels, the four encodings |
| `gravity-drawing-at-zero` | F# suite | the four labels, the four encodings |
| `gravity-level-drawn-as-absence` | F# suite | the four encodings |

The first two are this command's Task 6. `gravity-level-drawn-as-absence` was
run twice: the first run's baseline was red while three sessions were
compiling on one machine (the clean suite failed and the mutated build did not
build); the same replace compiled in a scratch copy, the clean suite held
213/213, and the rerun was CAUGHT on a green baseline. After every run
`git status` showed no `.mutation-state/` or `.proof-state/`, and `src/` matched
the intended edits byte for byte.

## Residuals

- **Two of Task 4's five rejections are runtime, not compile errors.** The
  command says a 2022 number reaching a 2026 card is a compile error "where the
  call site is static"; under its own types the season is an `int<season>`
  value and the bytes arrive at runtime. VINTAGE-PROOF says so instead of
  claiming them.
- **"Current" is the caller's.** A caller that passes a future year to the
  decoder mints an archive from a current payload. Documented in both proof
  docs; the census passes `nflSeasonOf` of the Eastern field day.
- **The six-file retrofit** is out of this command's scope by its own text and
  is not started; `decodeEnvelope` is generic so it is the next step, not a
  rewrite.
- **The confidence gate** was not run in this isolated copy (60+ minutes; the
  committing session runs it). Every row's command that could be run cheaply
  here was run, listed in `outbox/gravity-well-2026-10-16.md`.

## README

This repo has no HANDOFF.md; the README's "answer so far" is updated by the
committing session with the text given in `outbox/gravity-well-2026-10-16.md`.
