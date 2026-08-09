# CC-CMD-2026-08-09-dotnet-sdk-and-desk-scoreboard

**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR

One-liner:
```
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull. Read docs/CC-CMD-2026-08-09-dotnet-sdk-and-desk-scoreboard.md. Execute all tasks.
Do not commit unless confidence >= 95. If score < 95, report verbatim and stop.
```

---

## What is already proven, so you don't re-derive it

Everything in this section was **executed and verified in a real cloud session
on 2026-08-09**, not reasoned about. Treat it as measurement, not suggestion.
Re-verify anything that looks stale (Rule 87), but start from here.

The repo currently builds F# to JavaScript with **no .NET SDK at all**, via
`@fable-org/fable-compiler-js` (see the prior CC-CMD's outbox). That path has a
measured ceiling: it resolves **only** the assemblies bundled in
`@fable-org/fable-metadata` (FSharp.Core, Fable.Core, Browser.*, core BCL). Any
other NuGet package fails:

```
PackageReference Include="Thoth.Json"
→ ERROR: Cannot find package /root/.nuget/packages/thoth.json/10.2.0
→ no output produced, exit code 0 (the compiler lies about success)
```

The desk/scoreboard needs Thoth.Json. So this CC-CMD installs the real SDK
first, then builds the feature on the real compiler.

### The .NET install route — the obvious one is blocked

**Do not use `dotnet-install.sh`.** It is the documented route and it does not
work here. Measured:

| Host | Result |
| --- | --- |
| `dot.net` (redirects to the binary host) | **403 CONNECT tunnel failed** |
| `builds.dotnet.microsoft.com` | **403 — gateway policy denial** |
| `dotnet.microsoft.com` | 200 (marketing site only, no binaries) |
| `packages.microsoft.com` | 200 |
| `api.nuget.org` | 200 |
| `archive.ubuntu.com` | 200 |

The docs' default-allowlist accordion lists `dot.net` and `dotnet.microsoft.com`,
but the host the install script actually redirects to for binaries is
`builds.dotnet.microsoft.com` — a **different host, not covered by the bare
entry**, and it is denied. The allowlist looks like it permits the official
installer and does not.

**The route that works is Ubuntu's own archive**, no third-party repo needed:

```bash
apt-get update && apt-get install -y --no-install-recommends dotnet-sdk-10.0
```

Measured: `apt-get update` ~17s, install ~19s, total **under 40 seconds** —
comfortably inside the setup script's ~5-minute budget. Result: `dotnet
10.0.110` at `/usr/bin/dotnet`.

The `apt-get update` is **not optional**. Without it the install fails on a
stale index with `404 Not Found` on the `.deb` files — verified, that exact
failure happened first try.

### Why SDK 10 specifically, not 8

Not preference. **Fable 5.13.0 ships `tools/net10.0/` only** — confirmed by
unpacking the real `.nupkg`. Under SDK 8 the tool install dies with:

```
Microsoft.DotNet.ToolPackage.ToolConfigurationException:
Settings file 'DotnetToolSettings.xml' was not found in the package.
```

`dotnet-sdk-9.0` is **not available** in Ubuntu noble at all (`apt-cache policy`
returns nothing for it). SDK 10 is available and is the only version that works.

### The full chain, verified end to end

Current real versions, read from NuGet this session — re-confirm rather than
trust these if meaningful time has passed:

| Package | Version | Status |
| --- | --- | --- |
| `fable` (dotnet tool) | 5.13.0 | installs in ~1.8s, runs |
| `Thoth.Json` | 10.5.1 | restores, compiles, **runs** |
| `Fable.Core` | 5.2.0 | fine |
| `Fable.Solid` | 1.0.0-beta-004 | see the warning below |

Real, executed proof that Thoth.Json works — a decoder over a game-shaped
payload, compiled by real Fable and run on Node:

```
$ dotnet fable Test.fsproj --outDir out
Fable compilation finished in 5231ms
$ node out/Program.js
decoded 401: LAD vs SF
```

### Fable.Solid — works, but read this before depending on it

`Fable.Solid` has **never had a stable release**. The newest package is
`1.0.0-beta-004`, published **2022-11-26** — nearly four years old — and its
nuspec depends on `Fable.Core 4.0.0-theta-004`, a prerelease of a line now at
5.2.0.

It nonetheless **still works**, verified this session rather than assumed. It
restored cleanly and compiled under Fable 5.13.0 / .NET 10, emitting correct
idiomatic output:

```fsharp
let count, setCount = Solid.createSignal 0
let doubled = Solid.createMemo (fun () -> count() * 2)
```
```javascript
import { createMemo, createSignal } from "solid-js";
export function makeCounter() {
    const patternInput = createSignal(0);
    const doubled = createMemo(() => ((patternInput[0]() * 2) | 0));
```

Two real caveats found:

1. The package declares `namespace global` — `Solid.createSignal` is available
   with **no `open`**. Do not add one; it will not resolve.
2. The **reactive primitives** (`createSignal`, `createMemo`, `createEffect`,
   `createResource`, `createStore`) are what was verified. The **view layer**
   is not in this package — `Feliz.JSX.Solid` is separate, and the types are
   `JSX.Element`, which means Fable's **JSX output mode**, not plain JS output.
   An attempt to `open Feliz.JSX.Solid` failed with *"The namespace or module
   'Feliz' is not defined."* Confirm what the view layer actually requires
   before writing any markup in F#; do not assume it comes along with
   `Fable.Solid`.

### The real desk data — probed live, not assumed

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/context/date/YYYY-MM-DD
→ 200, ~186KB for a busy date
{ "ok": true, "date": "...", "games": { "regular": [...], "postseason": [...] },
  "briefs": [...], ... }
```

Verified: `games` has exactly `regular` and `postseason`. `briefs` is a
sibling top-level key. **The full set of top-level keys was NOT enumerated** —
the response truncated at 186KB. Enumerate it yourself before writing a
top-level decoder; do not infer it from this list.

A real game object, fields observed directly:

```
id, sport, league, date, home, away, home_score, away_score, venue, streams,
note, tags, crew, local_note, created_at, opening_odds, closing_odds,
drama_peak, drama_arc, espn_event_id, went_to_ot, finalized_at, start_time
```

**Four shape hazards in that payload, all real, all measured.** These are the
whole reason this repo is in F# — they are precisely what a TypeScript
interface describes correctly and still gets wrong at runtime:

1. **Double-encoded JSON.** `opening_odds`, `closing_odds`, and `drama_arc` are
   **strings containing JSON**, not objects. `drama_arc` is a stringified array
   of several hundred integers. A TS type saying `string` is *accurate* and
   tells you nothing.
2. **Nullable scores.** `home_score` / `away_score` are `null` pre-game
   (confirmed: `MLB_2026-08-09_whitesox_guardians`). Not zero. Null.
3. **`went_to_ot` is `0 | 1 | null`** — an integer standing in for a tri-state
   boolean, where null means "not yet known" rather than "no".
4. **`start_time` is ISO-8601 with no seconds** — `"2026-08-09T16:15Z"`, not
   `"...T16:15:00Z"`. The codex already records this as a real client-side
   parsing risk (`cc-cmd-2026-07-25-start-time-persistence`). It is not
   hypothetical.

And the one that matters most for the units-of-measure case: **`drama_peak` is
on a 0–100 scale** (observed 58, 81), while win probability elsewhere in FIELD
is 0–1. That is the exact scale-mismatch bug class that already shipped to
production this year and had to be caught by a live probe.

---

## Task 1 — Re-verify before writing (Rule 87)

- Re-run the reachability probes above. If `builds.dotnet.microsoft.com` has
  since been allowlisted, say so — but still prefer the apt route, which is
  faster and has no third-party dependency.
- Re-confirm the current `fable`, `Thoth.Json`, and `Fable.Solid` versions from
  NuGet directly. If `Fable.Solid` has finally shipped a stable release, that
  is a genuinely material change — report it prominently.
- Confirm `/context/date/<date>` still returns the shape above, and **enumerate
  the full top-level key set** this session did not get.

## Task 2 — The .NET SDK, three parts

The environment's setup-script field cannot be edited from a session. Ship all
three so the repo works whether or not a human has pasted it in yet.

**2a. `scripts/install_dotnet.sh`, committed to the repo.** The real, working
install (apt route, `apt-get update` first, `--no-install-recommends`). Must be
idempotent: if `command -v dotnet` already succeeds and reports a 10.x SDK, exit
0 immediately without touching apt. Must exit 0 on failure — it will be called
from a session-start path and must never hard-fail a session the way the
original setup script did. Log loudly on the slow path so a 40-second startup is
explained rather than mysterious.

**2b. `docs/SETUP-SCRIPT.md`** — the exact text for Jeff to paste into the
environment dialog at claude.ai/code, in a copy-paste block with nothing else in
it. State plainly that it belongs there and not in the repo, and why: the
environment cache persists it, so pasting it makes the install disappear from
every subsequent session's startup.

**2c. Wire it into the existing SessionStart hook** (`scripts/install_pkgs.sh`),
before `npm install`. This is the self-healing path for when the field hasn't
been pasted yet. It is deliberately the *second-best* mechanism — a hook runs on
every session start and is not cached — which is exactly why 2a's fast-path
check matters. Keep the `CLAUDE_CODE_REMOTE` guard so local machines are still
untouched.

**2d. Commit a tool manifest.** `dotnet new tool-manifest` + `dotnet tool
install fable`, with `.config/dotnet-tools.json` committed so the version is
pinned and reproducible. Add `dotnet tool restore` to the install script.

Verify for real: from a state where `dotnet` is absent, the script installs it
and `dotnet fable --version` reports a real version. Then run it a second time
and confirm the fast path no-ops in under a second.

## Task 3 — Move the build onto the real compiler

The repo currently builds via `@fable-org/fable-compiler-js`. Once the SDK is
real, `dotnet fable` is the correct compiler.

- Switch `scripts/build.sh` to `dotnet fable`. **Re-check the exit-code
  behavior.** The JS-hosted compiler exits 0 on failure, which is why the
  wrapper exists; the real one may not have that defect. If it exits non-zero
  correctly, simplify the wrapper and say so. If it has the same bug, keep the
  guard. Either way, prove it with a deliberate compile error, the same way the
  current guard was proven.
- Decide, and state the reasoning: does `@fable-org/fable-compiler-js` stay as a
  no-SDK fallback, or is it removed as a second build path that will silently
  drift? A second, rarely-exercised build path is a real maintenance liability;
  this project has already been bitten twice by parallel copies drifting
  (`App.artifact.jsx`, `NON_MATCHUP_SPORTS`). Recommend removal unless there's a
  concrete reason to keep it.

## Task 4 — The desk/scoreboard

The actual feature. Keep it genuinely island-sized per the established Solid
rubric (`rule-solid-js-island-rubric` plus its blast-radius addendum): one
contained thing with its own mount point, proven end to end, **not** a broad
scoreboard system. The point of this repo is to test whether F#'s type system
earns its keep against FIELD's real failure modes — that test needs one real
card working, not fifteen half-working ones.

**4a. Real decoders for the real payload.** `Thoth.Json` decoders for the game
shape, handling all four hazards above explicitly:

- Decode `drama_arc` / `opening_odds` / `closing_odds` as *strings first, then
  decode again* — and return a real `Result` on the inner failure rather than
  throwing or silently producing an empty array. This is the single most
  valuable thing in the whole task: it is a case TypeScript structurally cannot
  catch and this project has been burned by.
- `home_score` / `away_score` as `int option`. Pre-game null must be
  representable and must not render as `0`.
- `went_to_ot` as a real three-case type, not a bool and not an int.
- `start_time` parsed with the seconds-less format handled explicitly, with a
  test over the real observed value `"2026-08-09T16:15Z"`.

**4b. Units of measure on the scales.** Give `drama_peak` (0–100) and win
probability (0–1) **structurally incompatible types**, so combining them without
an explicit conversion is a compile error. Then — and this is the actual
deliverable, not the types themselves — **write the mistake on purpose, confirm
the compiler rejects it, and put that compiler error verbatim in the outbox.**
An F# scaffold that merely *has* units of measure proves nothing. A demonstrated
rejection of the exact bug class that shipped to production this year is real
evidence.

**4c. One scoreboard card, rendering real data.** Fetch a real
`/context/date/<date>`, decode it, render one game card. Solid signals for
reactive state (verified working), plain DOM or JSX per whatever Task 1
established about the view layer. Score, teams, and either the pre-game state or
the final. It must render **real fetched data**, never a fixture — this project
has a standing rule against fabricated data in verification paths.

**4d. Prove it renders.** Not "the build succeeded." Actual output, actually
rendered, with the real values visible. Follow the repo's established
artifact-check discipline if it applies here; otherwise a headless browser check
with the fetched values asserted is the minimum. Chromium and Playwright are
pre-installed — do not run `playwright install`.

## Task 5 — Honest reporting

- If Fable.Solid's staleness turns out to be a real blocker rather than a
  cosmetic worry, **say so and stop**, rather than routing around it with a
  hand-rolled binding. A hand-rolled Solid binding is a much larger commitment
  than this CC-CMD authorizes and is Jeff's call.
- If the JSX-mode requirement makes the view layer disproportionately expensive,
  present that as a decision with the real cost measured — plain DOM
  manipulation from F# is a legitimate answer for one card, and "we used the
  framework because it was there" is not.
- Report what the type system genuinely caught, and — equally — **what it
  didn't.** If the decoders caught nothing because the payload happened to be
  well-formed that day, say that plainly. The value of this repo is the honest
  answer to "does F# earn its keep here," and a flattering answer is worth
  nothing.

---

## Explicitly NOT in scope

- Do not edit the environment's setup-script configuration. No tool access
  exists; it requires a human at claude.ai/code. Ship the text, don't pretend
  to apply it.
- Do not port anything from jubilant-bassoon or field-playground. This is a
  laboratory: one contained thing, built to answer a question.
- Do not build a multi-sport or multi-card scoreboard. One card, real data,
  proven.
- Do not hand-roll Solid bindings if `Fable.Solid` proves inadequate — report
  and stop.
- Do not add `Fable.JsonProvider`. The type provider's own documentation states
  it performs no runtime checks, and every hazard in this payload is a runtime
  drift problem. Thoth.Json is the right tool here; the provider would be
  motion, not progress.

---

## Outbox

`outbox/cc-session-2026-08-09-dotnet-sdk-and-desk-scoreboard.md`: the real
install route proven from a cold start, the real compiler switch with its
exit-code behavior measured, the verbatim compiler error from the deliberate
units-of-measure mistake, real rendered output from real fetched data, and an
honest accounting of what the type system caught and what it missed.
