# Claude Code Command — the four empowerment metrics have no render path; give them a tab

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Confidence gate:** >= 95 before any commit
**Filed:** 2026-10-17 by chat, read from `src/*.fs` and `index.html` at `61110a4`
**Status:** FILED, not dispatched.
**Owner decision on file:** "On their own to start" (2026-10-17) — a tab of their own, not additions to Scoreboard or Stats.

---

## The gap, and where it came from

`Flow.fs`, `Stamina.fs`, `TacticalLock.fs`, `Gravity.fs`, `Vintage.fs` and
`Gridiron.fs` are referenced by nothing in `src/` except `Suite.fs`. Measured
2026-10-17: 115 Suite references across the four metrics (Flow 36, Stamina 32,
Tactical Lock 24, Gravity 23), 530/530 on the gate, 163 mutation records — and
no pixel on the deployed page. The live site serves ten tabs (Scoreboard,
Field's Pick, Scout's Pick, Pick'em, Weather, Stats, Lineups, Briefs, Draw,
Verify) and none of them is any of these.

`docs/CC-CMD-2026-10-15-empowerment-metrics.md` is marked DONE, correctly. Its
six done conditions are probe artifacts, implement-or-reject, proof
compilation, `npm run gate >= 95`, mutation testing, and a session doc. Every
one is a proof condition. **Not one of them requires the metric to appear
anywhere.** Chat wrote those conditions; this CC-CMD exists because of that
omission, not because anything was built wrong.

`docs/AMNESTY-PROOF.md:661` already says so in the repo's own words:

> **No real window gives a lock to render.** … So every real window classifies
> as `ActivePlayUnmeasured`, and nothing renders any of these states today. The
> gate is built ahead of a source that could feed it.

---

## What is renderable, measured

From `outbox/cc-session-2026-10-15-empowerment-metrics.md` (run 38984743564 for
the first three, 38984745121 for Gravity):

| metric | population | what a panel would show |
|---|---|---|
| **Flow** | 791 of 791 captures decoded, 787 read, 2,732 runs closed exactly once | real variation — build it |
| **Gravity Well** | 545 plays accounted for, 489 measured, `drawn` cancels on all 489 | real variation — build it |
| **Second Wind** | 11,807 skater-games: Insufficient 11,232, PopulationRate 551, SecondWind 15, TrailingRate 9 | thin: 4.9% carry a reading at all, 24 of 11,807 are the interesting two states |
| **Tactical Lock** | 132,798 team windows, **every one `ActivePlayUnmeasured`** | nothing — no source clocks a restart below the minute |

### The Tactical Lock call, made here

**Do not build a Tactical Lock panel.** Rendering it would draw
`LockShape.Hatch` 132,798 times, because `lockClassify` returns
`ActivePlayUnmeasured` for every window a committed capture can produce. A
uniform hatch is not a defect and it is not a feature; it is a gate waiting on
a source.

It gets one stated line in the tab instead (TASK 5). That is Rule 99 applied to
the page rather than the type: absence is a sibling of the value, so it is
shown as what it is and not as an empty panel the reader has to interpret.

### Second Wind needs a chosen subject

94.9% of skater-games are `Insufficient`, which draws `Mark.TrackOnly` — a
track with no tick. A panel that samples the slate shows empty tracks and looks
broken. TASK 3 therefore picks its subjects from the fixture by state, so each
of the four cases is on screen at once and the reader sees the scale that
produced them.

---

## What already exists, so this is a mount and not a build

Every metric already exposes exactly the two things ADR-002 permits — a
non-text visual encoding and an accessible name. All public, all verified:

| metric | decode from text | visual encoding | accessible name |
|---|---|---|---|
| Flow | `Flow.decodeCapture stats incidents`, `Flow.witnessAfterKickoff` | `Flow.pulseStyle : Finished -> Side -> Clock -> string` (a CSS style string) | `Flow.ariaLabel` |
| Second Wind | `Stamina.staminaPlayByPlay`, `staminaShifts`, `staminaPlayerGames`, `staminaCurve`, `staminaWitness` | `Stamina.staminaMark : Curve -> FinishedGame -> int -> Mark option`, `Mark = TrackOnly \| Ticks of expected * observed * opacity` | `Stamina.staminaLabel` |
| Gravity | `Gridiron.decodeFrames : int<season> -> string -> Result<Tracked<Play list>, DecodeError>`, `Gravity.archivedAt` | `Gravity.encodeWell` → `Encoding = { Opacity: float; Shape: Shape }` | `Gravity.accessibleName` |
| Tactical Lock | `TacticalLock.lockWindows stats incidents` | `lockEncode` → `LockShape = Shield \| OpenArc \| Ring \| Hatch \| Stipple` | `lockAriaLabel` |

The pattern to copy is `src/Scoreboard.fs:520`, where `Scoreline.verdictFor`
turns a typed verdict into a class name and an accessible string, nothing more:

```fsharp
match Scoreline.verdictFor (Scoreline.final game.HomeScore game.AwayScore) text with
| Scoreline.Consistent -> "desk-card__verdict desk-card__verdict--ok", "scoreline checks out"
```

### Committed fixtures and their cost

| fixture | bytes |
|---|---|
| `data/bsd-flow-finished-stats.json` | 20,629 |
| `data/bsd-flow-finished-incidents.json` | 4,859 |
| `data/bsd-flow-inplay-stats.json` | 14,577 |
| `data/bsd-flow-inplay-incidents.json` | 2,141 |
| `data/nhl-second-wind-pbp.json` | 149,977 |
| `data/nhl-second-wind-shifts.json` | 265,898 |
| `data/bdb-event-frames-2022-w2.json` | 1,816,808 |

Eager-loading all of it is 2.27 MB on one tab open. `scripts/gravity-census.mjs`
already refused that trade for the Verify tab, in its own header:

> a 1.8 MB capture in `Fixtures.paths` would be fetched on every Verify-tab
> open, and a must-hold input built from it would print derived counts in the
> panel's visible text

Both halves of that still bind. Hence per-section lazy loading in TASK 1, and
aria-label-only numbers throughout.

---

## TASK 0 — verify before writing (this repo's probe-first rule)

Reading is a simulation of execution, and five of the facts above are
cross-boundary. Run the commands:

1. `git grep -l 'Flow\.\|Stamina\.\|TacticalLock\.\|Gravity\.' -- 'src/*.fs'` —
   confirm `Suite.fs` is the only file outside each module itself. If any view
   already references one, stop and report: the gap this CC-CMD describes is
   not the gap that exists.
2. Confirm every public signature in the table above, by name and arity, from
   the source. They are quoted from `61110a4`; a changed arity changes the view.
3. `wc -c data/*.json` for the seven fixtures — the lazy-loading design is a
   response to those sizes.
4. Confirm the tab machinery: the `ids` list in `src/Program.fs:624`, the
   `role="tab"` buttons at `index.html:963` onward, and `loadVerifyOnce` at
   `src/Program.fs:249` (`let private loadVerifyOnce () =`) as the lazy-load
   precedent.
5. Re-read `docs/AMNESTY-PROOF.md` around line 661 and
   `outbox/cc-session-2026-10-15-empowerment-metrics.md` around line 74.
   **If any capture now clocks a restart below the minute, stop and report** —
   Tactical Lock becomes renderable and TASK 5 is the wrong shape.

Chat could not compile here: `api.nuget.org:443` is a 403 policy denial in this
sandbox, so `dotnet tool restore` fails and `fable` never runs. Nothing in this
document has been compiled. Treat every signature as read, not as built.

---

## TASK 1 — the tab

`id="tab-metrics"`, `aria-controls="panel-metrics"`, label **Metrics**.
Inserted **before** `tab-verify`, which stays last because it is the harness
rather than a reading.

1. `index.html`: a `role="tab"` button matching its siblings at `963`–`972`
   exactly — `aria-selected="false"`, `tabindex="-1"` — and a `panel-metrics`
   element matching the other panels, `hidden` by default.
2. `src/Program.fs:624`: add `"tab-metrics"` to `ids`, positioned before
   `"tab-verify"`. The list drives arrow-key order, Home and End, so position
   is behaviour and not cosmetics.
3. Lazy load, following `loadVerifyOnce` at `249`: a `metricsLoaded` flag and a
   `loadMetricsOnce ()` called from the `if selected && tab.id = …` line at
   `644`. **Nothing fetches on page load.**
4. **Per-section lazy loading inside the panel.** Opening the tab must not
   fetch 2.27 MB. Flow's four files total 42 KB and may load with the tab;
   Second Wind (416 KB) and Gravity (1.8 MB) load on first expand of their own
   section, each once. A section that has not been expanded shows its title and
   its provenance line and fetches nothing.
5. **A provenance line at the top of the panel, in visible text:** these are
   committed captures, named, not today's slate. A reader must not mistake a
   fixture for live data. The fixture name and date are not derived values, so
   ADR-002 does not reach them.

---

## TASK 2 — Flow

Two subjects, both already committed: the finished capture
(`bsd-flow-finished-*`, bundesliga 213708, FT marker at 90') and the in-play one
(`bsd-flow-inplay-*`, europa 601226, live at 90', last shot 79'). Showing both
is the point — the in-play capture is the one whose clock is not recorded, and
the difference between them is the metric's whole claim.

Per subject, per side: `Flow.decodeCapture` → `Flow.witnessAfterKickoff` →
`Flow.pulseStyle` on the node's `style` attribute, `Flow.ariaLabel` as its
accessible name. Nothing else.

When `witnessAfterKickoff` returns `None`, the node still renders and still
carries an accessible name saying there is no witness. A missing witness is a
state, not a reason to omit the node.

---

## TASK 3 — Second Wind

`staminaPlayByPlay` + `staminaShifts` → `staminaPlayerGames` → `staminaCurve`,
`staminaWitness` → per-player `staminaMark` / `staminaLabel`.

Pick subjects **by state, from the fixture**, so one of each of the four cases
is on screen: an `Insufficient`, a `PopulationRate`, a `SecondWind` and a
`TrailingRate`. Sampling the roster in order shows 95% empty tracks.

- `Mark.TrackOnly` → the track, no tick. It must be visibly a track with
  nothing on it, distinguishable from a track whose ticks coincide.
- `Mark.Ticks (expected, observed, opacity)` → two ticks at those fractions of
  the track's width, drawn at that opacity. `expected` and `observed` are
  fractions already; do not rescale them.
- Beside the four, state the population in visible text — 11,807 skater-games,
  11,232 of them `Insufficient`. That is a census count, not a verdict about a
  named player, so it is outside ADR-002's restriction and it is the context
  that makes four marks meaningful.

---

## TASK 4 — Gravity Well

`Gridiron.decodeFrames` with the season read from the file's name, as
`gravity-census.mjs` already does — not from a clock, and not hardcoded in two
places. Then `Gravity.archivedAt`, then per receiver `Gravity.encodeWell` →
`{ Opacity; Shape }` and `Gravity.accessibleName`.

1.8 MB, so: fetch once, on first expand of this section only, and keep the
decoded result. Of 545 plays, 489 are measured; show a bounded set of plays, not
all 545, and say in visible text how many of the 545 the panel is showing.

**The unencoded fifth must be on the page as its own state.**
`outbox/gravity-census-latest.json` reports `encodings` as 1,923 encoded and
**515 unencoded** of 2,438 receivers, with `opacityInRange` 1,923. A panel that
draws only what `encodeWell` returns silently drops 21% of the receivers it
measured, and a reader cannot tell a receiver who drew nothing from one the
encoder refused. Carry the unencoded count in visible text (it is a census
count, not a verdict about a named player) and give those receivers a mark that
is not the zero-drawn mark.

Position is NOT adjusted for, and that is accepted — `drawn` is a within-player
difference against his own snap alignment, so position tendency cancels for a
per-play reading. It does not cancel across players: `byPos` means are FB
+0.188, RB +0.485, TE **−0.415**, WR +0.093, so drawn = 0 sits above a TE's
expectation and below an RB's. **This panel therefore shows per-play readings
and must not rank or compare receivers**, in the encoding or in the accessible
name. A cross-player view needs the per-position expectation `byPos` already
measures, and FB's 16 observations cannot carry one.

`Vintage` is the gate on this path. `encodeWell` takes an `Archived`, which only
`archivedAt` mints and only for an archive season. If the displaying season and
the capture's season disagree the result is a `VintageMismatch` — render that as
its own state with its own accessible name. Do not unwrap it to `None` and draw
nothing; a mismatch and an absent measurement are different facts.

---

## TASK 5 — Tactical Lock, as a stated absence

One section, no marks. In visible text: the metric is built and proven, 132,798
team windows were classified, every one `ActivePlayUnmeasured`, and the reason
is that no capture clocks a restart below the minute. Cite
`docs/AMNESTY-PROOF.md` and `docs/LOCK-PROOF.md` so a reader can get from the
page to the proof.

Those are census counts and a mechanism, not a verdict about a named player, so
they belong in visible text.

**Do not draw 132,798 hatch marks, and do not draw one hatch mark as a
sample.** A single hatch implies the others differ.

---

## TASK 6 — the render check, which is the done condition

New `scripts/metrics-render-check.mjs`, on the pattern of
`scripts/tab-check.mjs`: `import { chromium } from 'playwright'`,
`/opt/pw-browsers/chromium`, driven against a served page with `URL=`.

It must assert, on the rendered DOM:

1. The tablist still behaves like a tablist with eleven tabs — arrows move,
   exactly one tab is in the tab order, panels show and hide. Adding a tab can
   break the ARIA pattern, and `tab-check.mjs` covers the old ten.
2. `panel-metrics` contains a Flow node for each subject and side, each with a
   non-empty `style` and a non-empty accessible name.
3. All four `Stamina` cases are present, and a `TrackOnly` node is
   distinguishable from a `Ticks` node by something other than its label.
4. The Gravity section renders nothing before it is expanded, and renders marks
   with distinct opacities after. **Assert the fetch count**, so a regression
   that eager-loads 1.8 MB fails here rather than in a page-weight complaint.
5. **No derived number appears in `panel-metrics`'s visible text.** Read the
   panel's `innerText` and assert it carries no per-player verdict and no state
   name — those live only in `aria-label`. This is the ADR-002 boundary, from
   the outside, the same way `tab-check.mjs` asserts the composite score never
   reaches the DOM. The census counts TASK 3 and TASK 5 put on the page are
   permitted; a verdict about a named player is not.
6. Every node carrying one of these states has a non-empty accessible name. The
   2026-10-15 amendment makes that required, not optional: "A node carrying one
   of these three states and no accessible name is a defect, not a style
   choice."

Self-test it (`--self-test`) like its siblings, and make each assertion fail
once before trusting it.

### Done conditions

1. `node scripts/metrics-render-check.mjs --self-test` passes, and the real run
   passes against a served build.
2. `npm run check:tabs` still passes — the existing ten-tab assertions survive
   the eleventh.
3. A screenshot of `panel-metrics` with all four sections expanded, written to
   `outbox/`, so the result is visible without running anything.
4. `npm run gate` still >= 95. **This is a regression condition, not the
   deliverable.** The deliverable is condition 3.
5. `outbox/cc-session-2026-10-17-metrics-tab.md` last (Rule 87,
   SELF-COMPLETE-A), and the README's "answer so far" updated.

---

## FORBIDDEN

- **No new metric arithmetic.** Every number comes from the compiled modules.
  If a panel needs a value no public function returns, stop and report — a
  second implementation in a view is the defect
  `gravity-census.mjs` already refused ("NO SECOND COPY OF THE METRIC").
- **No derived verdict in visible text.** ADR-002 as amended 2026-10-15:
  geometry, colour and opacity carry the verdict; `aria-label` and `sr-only`
  carry the math and the state name, mechanically generated from the value,
  never hand-written per card and never adjectival. "InFlow state active,
  sequential xG 0.42" is the shape.
- **No eager load.** Nothing in this tab fetches on page load, and the 1.8 MB
  capture fetches only on its own section's first expand.
- **No Tactical Lock marks.** TASK 5 is text.
- **Do not touch the other ten tabs**, `Scoreline`, `Scout` or `Desk`. Those
  three already reach the page and are not in scope.
- **Do not make a private type public to render it.** The encodings are already
  public; the states are deliberately private. `flow-teamstate-goes-public` is
  an existing mutation record precisely because that loosening must stay red.
- No PR. Commit to `main`.

---

## Why a render check and not a gate row

The gap this CC-CMD fixes was created by done conditions that were all
provable. `npm run gate` was 530/530 with six modules unreachable from the page,
and it would have stayed 530/530 if they had never been mounted, because no row
asks whether anything renders. Adding gate rows would repeat that: a row can
only assert what it is told to look at, and nobody told it to look at the page.

Condition 3 is a screenshot for the same reason. A passing check says an
assertion held; an image says the thing exists. The four metrics have been
provably correct and invisible for two days, and only one of those two words
was being measured.
