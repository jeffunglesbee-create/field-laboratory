# cc-session-2026-08-09-dotnet-sdk-and-desk-scoreboard

**CC-CMD:** `docs/CC-CMD-2026-08-09-dotnet-sdk-and-desk-scoreboard.md`
**Repo:** field-laboratory · **Branch:** main
**Confidence:** 96

All five tasks complete. Every claim below is an executed check.

---

## Read this first

The environment's setup-script field is **still unedited and still cannot be
edited from a session.** `docs/SETUP-SCRIPT.md` has the exact one-line script
to paste at claude.ai/code. Until someone pastes it, every cold session pays
~30 seconds installing the SDK through the fallback hook instead of zero.

Nothing is broken without it. It is a speed cost, not a correctness one — that
was the point of building the fallback.

---

## Task 1 — Re-verified

Everything the CC-CMD recorded still holds. `builds.dotnet.microsoft.com` still
403s; `api.nuget.org` and `archive.ubuntu.com` still reachable. `fable` 5.13.0,
`Thoth.Json` 10.5.1, `Fable.Core` 5.2.0 unchanged. `Fable.Solid` still has no
stable release — newest is still `1.0.0-beta-004` from 2022.

**The gap the CC-CMD flagged is closed.** The full top-level key set of
`/context/date/<date>`, which last session could not get past the probe's
truncation, is:

```
ok, date, games{regular, postseason}, briefs, series, standings
```

Obtained by probing `2019-01-01` — a date early enough that every collection is
genuinely empty, so the whole response is 109 bytes and arrives intact. Cheaper
than fighting the truncation on a busy date.

## Task 2 — The .NET SDK

Shipped: `scripts/install_dotnet.sh`, `docs/SETUP-SCRIPT.md`, the SessionStart
hook wiring, and a committed `.config/dotnet-tools.json` pinning Fable 5.13.0.

**The cold test was genuine.** The SDK installed while working out the CC-CMD
was purged first — `apt-get purge` plus `rm -rf /root/.nuget /root/.dotnet`,
confirmed `dotnet: ABSENT` — so this is a real cold start, not a warm one
described as cold:

| Path | Result |
| --- | --- |
| Cold (`dotnet` absent) | **30.5s**, installs 10.0.110, exit 0 |
| Warm (SDK already present) | **0.006s**, exit 0 |
| `apt-get` and `dotnet` both broken | loud diagnostic, **exit 0** |
| Full hook chain, warm | 1.0s, exit 0 |
| Local (`CLAUDE_CODE_REMOTE` unset) | exits 0 immediately, installs nothing |

That third row is the one that matters. The original failure was a setup script
that hard-failed a session; this cannot, by construction.

One small real finding: .NET 10's `dotnet new tool-manifest` writes the manifest
to the **repo root**, not `.config/`. Both locations resolve; it was moved to the
conventional path and `dotnet tool restore` confirmed working from there.

## Task 3 — Real compiler, and the wrapper is gone

**`dotnet fable` does not have the JS-hosted compiler's defect.** Measured:
exit **0** on success, exit **1** on a deliberate compile error. So
`scripts/build.sh` — which existed only to catch a compiler that lied about
success — is deleted, and `package.json` calls `dotnet fable` directly. The
simplification is a measurement, not a preference.

**`@fable-org/fable-compiler-js` is removed, not retained as a fallback.** Two
reasons, and the first is decisive: it cannot resolve Thoth.Json, so it cannot
build this application. A fallback that cannot build the app is not a fallback —
it is a path that looks like safety and isn't. Second, this project has already
been bitten twice by parallel copies drifting (`App.artifact.jsx`,
`NON_MATCHUP_SPORTS`); a second rarely-exercised build path is that same shape.

## Task 4 — The desk scoreboard

`src/Units.fs`, `src/Desk.fs`, `src/Scoreboard.fs`, `src/Program.fs`,
`index.html`, plus a static server and a headless render check.

### It renders real data

Two verbatim live captures, both **6/6 checks** in real Chromium. Actual output:

```
decode-status: decoded 2 game(s) for 2026-08-09
units-demo:    home win probability: 62%

  MLB_2026-08-09_yankees_braves
    Braves @ Yankees  2–1  [Final / OT]
    arc 504 pts, peak 81  |  draftkings ML +132 / -142
  MLB_2026-08-09_whitesox_guardians
    Guardians @ White Sox  —  [Scheduled 2026-08-09T18:10Z (parsed 18:10)]
    no arc  |  draftkings ML -105 / -102
```

Every hazard the CC-CMD named is visible in those six lines:

- **504-element `drama_arc`** pulled out of a *string* containing JSON
- **nested odds** decoded to real moneylines
- **null scores** rendering as `—` / Scheduled, not `0–0`
- **`went_to_ot: 1`** as `Final / OT` through a real three-case union
- **`"2026-08-09T18:10Z"`** parsed despite having no seconds component

### The failure path is real, and this is the strongest result

A deliberately corrupted fixture (`test/malformed-nested.json`) — truncated
array, wrong inner type, **outer JSON still perfectly valid**:

```
drama:  ARC MALFORMED: Given an invalid JSON: Unexpected end of JSON input
odds:   ODDS MALFORMED: Error at: `$.moneyline.home` Expecting an int but instead go…
score still rendered: 75–81
page errors: none
```

Reported, contained, and nothing threw. The game still decoded and the card
still showed its correct score. This is the case a TypeScript `drama_arc: string`
annotation describes with complete accuracy and total uselessness.

### Units of measure

The production bug was written on purpose and rejected at compile time. Verbatim
in `docs/UNITS-PROOF.md`:

```
error FSHARP: The unit of measure 'drama' does not match the unit of measure 'prob'
error FSHARP: Type mismatch. Expecting a 'float<prob>' but given a 'float<pct>'
Compilation failed
```

`npm run build` exited 1, no JavaScript emitted, no test written for it.

## Task 5 — What the type system actually earned, honestly

**What it genuinely caught:**

The double-encoded fields are the real win, and not a marginal one. `drama_arc`,
`opening_odds`, and `closing_odds` are strings containing JSON. Any type
annotation calling them `string` is correct and worthless. Making the inner
decode a `Result` surfaced two distinct failures in the corrupted fixture with
useful messages, contained both, and kept rendering. That is a genuine
structural advantage, not a stylistic one.

Exhaustive matching on `GameState` is a quieter second win: adding the
`Scheduled` case forced every render path to handle it, which is exactly the
null-score-renders-as-0–0 bug that would otherwise be written by accident.

**What it did not catch, and this needs saying plainly:**

The units of measure caught **nothing real in this build.** They rejected a bug
written deliberately to be rejected. That is proof the mechanism works; it is not
proof it would have caught the original incident. The reason is in
`docs/UNITS-PROOF.md` and worth repeating: a number decoded from JSON arrives as
a bare `float`, and someone has to attach the unit at the boundary, on purpose,
having understood the distinction at that moment. **The compiler protects the
interior; the boundary is still a judgement call.** If that one line in
`Desk.fs` is wrong, the type system has nothing to work with.

The decoders also caught nothing on the *real* captures — both payloads were
well-formed and decoded cleanly first try. All the failure evidence comes from a
fixture broken on purpose. The honest reading: the decoders are proven to work,
and are not yet proven to have been *needed* on live data.

**Fable.Solid was not the blocker it looked like.** A 2022 beta depending on a
`Fable.Core 4.0.0-theta` prerelease compiled correctly under Fable 5.13 and .NET
10 and emitted clean `createSignal` / `createMemo` / `createEffect` imports. The
staleness is a real maintenance risk, not a current defect.

**The view layer decision, with the cost measured.** `Feliz.JSX.Solid` is
`beta-002`, older than `Fable.Solid` itself, and requires moving the whole
compilation to JSX mode. For one card that is a poor trade, so the view is plain
typed DOM from `Fable.Browser.Dom` 2.20.0 — a current stable package — with
Solid driving only the reactive score node. Per the island rubric this card
qualifies (update frequency + derived values + its own mount point); Solid is
here because the rubric says so, not because it was available.

**Two gotchas that will bite the next person:**

1. Fable emits **bare module specifiers** (`import { createSignal } from
   "solid-js"`). Browsers cannot resolve those natively. Fixed with an import
   map rather than adding a bundler.
2. `solid-js`'s `module` field points at `dist/server.js`, the **SSR build**.
   The browser build is `dist/solid.js`, reachable only through the `browser`
   export condition, which a plain `<script type="module">` does not apply.
   Pointing an import map at the default entry loads the server renderer and
   nothing reactive works — with no error.

## Verified from a clean slate

`rm -rf build obj node_modules`, then: `npm install` → `dotnet tool restore` →
`npm run build` (0 errors, 0 warnings) → `npm run check` 6/6 → `npm run
check:hard` 6/6.

## Open items requiring a human

1. **Paste `docs/SETUP-SCRIPT.md` into the environment setup-script field.**
   Still the one thing no session can do.
2. **Decide whether `Fable.Solid`'s staleness is acceptable long-term.** It works
   today. It is a four-year-old beta with no stable release and an outdated
   `Fable.Core` dependency, and nothing suggests that changes.
3. **The decoders have not yet earned their keep on live data.** They are proven
   correct against real captures and proven resilient against deliberate
   corruption. Whether FIELD's live payloads actually drift often enough to
   justify the approach is an open question this build cannot answer — it needs
   the decoders pointed at the relay over time, which this sandbox cannot reach.
