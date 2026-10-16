# Gravity Well (NFL) and vintage-typed BDB frames — 2026-10-16

**Commands:** `docs/CC-CMD-2026-10-15-empowerment-metrics.md` Task 4 (Gravity
Well, NFL), and `docs/CC-CMD-2026-10-15-bdb-frame-types.md` Tasks 1, 2, 4, 5
and 6 (its Task 3 is REJECTED with the measured reason; that command's own
session doc is `outbox/cc-session-2026-10-15-bdb-frame-types.md`).
**State:** built and verified locally in an isolated copy at 8eaf5a0; the
confidence gate and the CI census dispatch are the committing session's.

## What the metric is

For each eligible receiver (WR, TE, RB, FB) on each play with a forward pass:
at the release (`pass_forward`) every coverage defender is assigned to the
route runner nearest him; the same defenders and runners are assigned again
from the same play's snap positions. **drawn = release attention minus snap
attention.** The snap assignment is the denominator the command's own rule
asks for ("against what should have happened"): what the receiver's alignment
alone gave him. The coverage size is the second denominator, carried in the
value, so "drew 1" is always "drew 1 of 7".

- `Drawing` (drawn > 0), `Level` (= 0, a measured zero), `Ceding` (< 0), and
  `NotRouteRunner` (eligible but not past the line: a sibling, not a zero).
- A play is refused, by name and in a fixed order, as `NoReleaseFrame`,
  `NoSnapFrame`, `NoSnapper`, `NoRouteRunner`, `NoCoverage`, `SoleRouteRunner`
  (one runner's drawn is zero by construction) or `MissingAtSnap`.
- Both instants assign the same defenders, so drawn sums to zero within a play:
  "away from his teammates", literally.
- **Not position-adjusted** (a delegated decision; see below), not a player
  trait (no roll-up), and route runners and coverage are line-geometry proxies
  because the artifact carries no `wasRunningRoute` or `wasInitialPassRusher`.

## Census over the committed capture (`outbox/gravity-census-latest.json`)

545 of 545 plays accounted for: 489 measured, 54 `NoReleaseFrame`, 2
`SoleRouteRunner`, every other reason 0. Conservation holds on 489 of 489.
Ties 0 at the snap, 0 at the release. 2438 receivers on measured plays: 1923
route runners (560 Drawing, 816 Level, 547 Ceding) and 515 NotRouteRunner (RB
326, TE 121, WR 49, FB 19). Mean drawn per route runner: FB +0.188 (16), RB
+0.485 (163), TE −0.415 (480), WR +0.093 (1264). Two offensive C labels in 32 of
545 snap instants, all in game 2022091803; in all 32 the forward-most C (the
snapper by the decoder's rule) is the one nearest the quarterback's y (a
scratch measurement on the raw JSON, not committed). Coverage defenders 3362, of whom 1119 change assignment
between the instants; DE/DT/NT-labelled defenders in coverage 131, 59 of them
reassigned — a LOWER BOUND on linemen in the proxy, which is why the census
also bins every proxy member by yards past the line (e.g. coverage within 2 yd:
OLB 36, ILB 39, DT 51, DE 29, NT 12; route runners within 1 yd: TE 36, RB 32,
WR 32, FB 3). Every number came from the compiled F#; each matched the design's
scratch preview once the preview's two denominators were corrected (515 over
measured plays, 32 over all snap instants).

## Files

- `src/Units.fs`: `[<Measure>] yd`, with why there is no meters measure.
- `src/Vintage.fs` (new): `season`, `Vintage`, `Tracked<'T>`, `VintageMismatch`,
  `DecodeError`; `decodeEnvelope`, `valueAt`, `archiveAt`, `nflSeasonOf`.
- `src/Gridiron.fs` (new): frame tags `OffenseRight`/`Scrimmage`, instant tags
  `Snap`/`Release`, `Position<'Frame,'Instant>` (private fields), `Player`,
  `Play`; `distanceSq`, `toScrimmage`, `yardsPast`, `pastLine`, `snapperAt`,
  `decodeFrames`.
- `src/Gravity.fs` (new): `Pull` (private), `Well` (private cases), `Receiver`,
  `Unmeasurable`, `PlayGravity`, `Measurement`, `Shape`, `Encoding`, `Archived`
  (private witness), `PosTally`, `PastLineTally`, `Census`; `measuredAt`,
  `archivedAt`, `accessibleName`, `encodeWell`, `gravityCensus`.
- `src/Laboratory.fsproj`: Vintage, Gridiron, Gravity after Stats.fs, directly
  above Scoreboard.fs (proof injection) and Suite.fs.
- `src/Suite.fs`: group "Gravity Well", 22 checks (191 to 213).
- `docs/VINTAGE-PROOF.md` (5 cases), `docs/GRAVITY-PROOF.md` (12 cases).
- `scripts/gravity-census.mjs` (new), `package.json` `census:gravity`,
  `.github/workflows/gravity-census.yml` (dispatch-only; builds, runs the
  census, commits `outbox/gravity-census-latest.json`).
- `scripts/mutation-check.mjs`: ten records appended.
- `data/bdb-event-frames-2022-w2.json` (verbatim copy) and its
  `data/PROVENANCE.md` section.
- `docs/CC-CMD-2026-10-15-empowerment-metrics.md`: one dated CC note under
  Task 4's "0-100 normalized only" (yards are BDB's native unit). Status line
  untouched.
- `docs/CC-CMD-2026-10-15-bdb-frame-types.md`: Status BUILT, Task 3 REJECTED
  with its reason, a CC note on what was built against the done conditions.

## The guarantees, and where each is held

| claim | held by |
|---|---|
| a snap position cannot be set against a release one, nor a served-frame position against a scrimmage one | compiler, GRAVITY-PROOF 1-3 |
| a position, a well, a pull or the witness cannot be forged; a well's counts cannot be read | compiler, GRAVITY-PROOF 4, 7-10 |
| nothing projects a well without the archive witness | compiler, GRAVITY-PROOF 11-12 |
| yards are not a bare number; meters have no unit | compiler, GRAVITY-PROOF 5-6 (6 turns FS0001 if a meters measure is declared in `Units`, measured) |
| a Tracked or a Vintage cannot be built or taken apart; no exit without a season | compiler, VINTAGE-PROOF 1-5 |
| no season, a string season, a blank source, a future season are refused | Suite rows plus a mutation each |
| the witness exists only for an archive at that season | two Suite rows, mutation `vintage-archive-granted-to-current` |
| strictly past the line; Drawing only above zero; drawn cancels; four cases drawn four ways | Suite rows plus a mutation each |
| every play of the capture accounted for, conservation on all of it, every label well-formed | `scripts/gravity-census.mjs`, 13 checks |

The must-hold inputs on the Verify panel are envelope text, seasons, and the
printed type names only: no drawn count, accessible name or encoding reaches
visible text (read off the rendered panel in Chromium, 2026-10-16).

## Verification run here (isolated copy at 8eaf5a0, 2026-10-16)

- `npm run build`: exit 0, zero `warning FS`/`warning NU`; `dotnet build`:
  0 warnings, 0 errors.
- `node build/VerifyMain.js`: 213/213 held; `Verify.check ` occurs 213 times
  in `src/Suite.fs`.
- `node scripts/proof-check.mjs --only VINTAGE-PROOF`: 8/8 (5 of 95 cases);
  `--only GRAVITY-PROOF`: 15/15 (12 of 95 cases). The full proof run was not
  made here.
- Each of the ten new mutations CAUGHT by `mutation-check --only <id>`, none by
  the compiler, every anchor unique (`grep -cF` 1). The first attempt at
  `gravity-level-drawn-as-absence` came back red at its BASELINE (the clean
  suite failed and the mutated build did not build) while three sessions were
  compiling on this machine; the same replace compiled in a scratch copy, the
  clean suite then held 213/213, and the rerun was CAUGHT with a green
  baseline. In a scratch copy of `src/`, each of the nine suite-expect
  mutations turns red the row named in its claim; `gridiron-past-line-inclusive`
  also reddens the five rows built on play 1's on-the-line running back, and
  the conservation mutation the four rows that read drawn. The table is in
  `outbox/cc-session-2026-10-15-bdb-frame-types.md`. The census's conservation
  check was also made to fail on purpose (0 of 489 with a defender counted
  twice at the snap), and its PROVENANCE check before the section existed.
- `unused-check` 1/1, `units-check` 10/10; `check-doc-citations`,
  `check-script-orphans`, `import-purity-check`, `cc-cmd-status-check`,
  `check-exit-drains`, `workflow-check`, `docs-check`, `clean-source-check`,
  `short-circuit-check`, `staged-verifier-check`, `exposed-secret-check`,
  `sport-registry-check`: all exit 0.
- Gate rows run singly through `run-row.mjs`: "this session wrote its
  outbox", "source changes arrive with an outbox entry", "generated source
  matches its generator and data", "decoders accept both real captures", "no
  value is written without being read back", "the F# harness refuses a check
  with no counterexample": all PASS. Render check on both captures 18/18, tab
  check 53/53, Verify panel check 18/18, against a local server.
- NOT run here: `npm run gate` (the committing session runs it), the full
  mutation suite, the full proof run, and the CI dispatch of
  `gravity-census.yml`.

## Decisions taken in this session

- **Delegated, for the owner to see: not position-adjusted.** drawn is
  relative to the receiver's own snap alignment, not to his position's usual
  draw. The census reports the per-position means beside the counts instead of
  subtracting them; the Well type's doc comment and the census definition both
  say "not position-adjusted".
- The witness is Gravity's own (`Gravity.Archived`), not `Desk.AmnestyZone`,
  which would have widened the token that unlocks the drama formatters.
  `archivedAt` takes the FRAMES (`Tracked<Play list>`) and measures inside, so
  no `mapTracked` exists: a public map would hand the bare value to any closure
  without a season.
- `archivedSeason` was not built. `Vintage.archiveAt` is the bound route, and
  the census takes 2022 from the file name.
- `Tone` was dropped: `Encoding` is opacity plus a shape (`Expanding`,
  `Steady`, `Contracting`); a NotRouteRunner has no encoding.
- `toJSON` overrides needed `[<Fable.Core.AttachMembers>]`: without it Fable
  emits the member as a detached function and `JSON.stringify` would serialise
  the case and its counts.
- The census bins every proxy member by yards past the line, and calls the
  DE/DT/NT count a lower bound.
- Ten mutations, the budget. The `Archived` witness going public is held by
  GRAVITY-PROOF case 10 under proof-check but has no mutation of its own: the
  two Vintage directions bdb-frame-types Task 6 requires took two of the ten.

## The README's "answer so far" should gain

**Vintage and Gravity Well (NFL):** a Big Data Bowl frames value cannot be
built outside its decoder or read without naming its season, and an envelope
with no season, a string season, a blank source or a future season is refused
rather than stamped current (`docs/VINTAGE-PROOF.md`, 5 cases; two of the
command's five rejections are runtime and the doc says so). Gravity Well counts
the coverage defenders each route runner draws at the release against what his
snap alignment alone drew, with positions typed by coordinate frame and instant
so a snap position cannot be set against a release one (`docs/GRAVITY-PROOF.md`,
12 cases); over the committed 2022 week-2 capture, 489 of 545 plays are
measured, the other 56 refused by name, and the drawn counts cancel on all 489.
It is not position-adjusted, not a player trait, built on line-geometry proxies
over 7 of 16 games, and nothing renders it yet: its two projections take a
witness only a past season yields.
