# Session outbox — sport grouping, date navigation, and the ADR-002 amnesty gate

**Date:** 2026-08-10
**Repo:** jeffunglesbee-create/field-laboratory
**Branch:** `claude/laboratory-desk-scoreboard-q9wmin`, then merged to `main`
**Commits:** `3d8e37c`, `293752f`, `45277a1`, `21014ad`, plus the arc-seal follow-up

---

## Process failure, stated first

**This session ran no confidence gate before committing, and wrote no outbox
until asked.** Three prior sessions in this repo produced one each; this one
produced work across five commits and none.

No CC-CMD governed the work — it came from direct requests — so there was no
pre-defined rubric to score against. That is an explanation, not a defence. The
convention exists precisely so that work dispatched informally still gets
reconciled against its own claims, and the gap is what let an overstated claim
reach `main` (see "The hole in the gate" below).

The scoring below is therefore retrospective. Recorded as such rather than
presented as though it gated anything.

---

## What was built

### 1. Sport grouping and date navigation (`3d8e37c`)

`renderSlate` sections the slate by sport, ordered by size descending then name,
so ordering does not depend on relay return order. Prev/next/today rewrite the
URL with `pushState` and re-render in place; every day is linkable and the back
button works. Dates step by building a `DateTime` from three integer parts
rather than parsing the ISO string — a bare parse of a date-only string is read
in the viewer's local zone, so stepping a day west of Greenwich could land on
the wrong date.

Each render disposes the previous Solid root and clears the mount. This is the
ambient-panel skeleton failure again: under fine-grained rendering, nothing
clears what the reactive system does not explicitly own.

### 2. `scripts/nav-check.mjs` (18 checks, `45277a1`)

Separate from `render-check` because `render-check` structurally cannot reach
either feature: both committed captures are single-sport, so grouping "works" on
them in exactly the shape a broken grouping would also produce, and both pin
`?data=`, which disables the date controls by design.

The probe intercepts the relay with Playwright routing — no egress needed, no
synthetic payload committed or shipped, game records recombined from the two
real captures.

Mutation-tested: deleting the two teardown lines takes it 18/18 → 11/18, cards
accumulating 4 → 6 → 12 → 16 → 18 under a status line still reading "decoded 2".
The check that stayed green throughout was "no page or console errors" —
nothing throws when a slate fails to tear down.

### 3. The ADR-002 amnesty gate (`21014ad` + follow-up)

`SealedDrama`, `SealedArc`, `AmnestyZone`, `formatDramaPeak`. Full write-up in
`docs/AMNESTY-PROOF.md`.

**This one found a real, live exposure in this repo**, which the other two did
not. `dramaText` took a whole `Game` and ran for every card at every state,
rendering the peak unconditionally. Both committed captures are all-Final, so
the output was compliant by accident of the data rather than by construction; a
live game carrying a `drama_arc` would have shown its peak — severity CRITICAL
under FIELD's own classification.

---

## The hole in the gate, and how it was found

The first cut sealed `DramaPeak` and left `DramaArc` as `Nested<int list>`.

That is not a complete gate. The arc is the *series* of composite drama scores,
so `arc |> List.map string` would have rendered four raw interest levels on a
live card — through a gate `docs/AMNESTY-PROOF.md` already claimed was closed
("the only path from a drama score to a string in the entire program").

**No check caught this.** All 40 assertions were green before and after, because
nothing in the repo renders arc values. It was caught by re-reading the claim
after being asked about the confidence gate — which is the argument for the gate
existing, made the hard way.

Fixed by sealing the arc, with `arcLength` left deliberately ungated (a count of
samples is factual, not an interest level). A fourth compiler violation is now
recorded in the proof doc.

---

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | 11/11 |
| `npm run check:hard` | 11/11 |
| `npm run check:nav` | 18/18 |
| drift-check, both captures | 3/3 each, `ok` |
| corrupted fixture | still rejected |
| F#/NuGet warnings | 0 |
| CI on branch (`46e9cf8`, `0595023`) | all 13 steps green, incl. live-slate render |

Four deliberate violations written, compiled, errors captured verbatim:
`FS0001` (no witness), `FS1093` ×3 (forged witness, unsealed peak, unsealed arc).

The runtime guard was mutation-tested: restoring pre-gate behaviour takes
`render-check` to 10/11 on "no drama peak displayed while live". Bypassing the
gate from `Scoreboard.fs` was impossible — the mutation required adding an
ungated formatter to `Desk.fs` itself, which is the claim.

---

## Retrospective confidence score

| Item | Weight | Score | Basis |
| --- | --- | --- | --- |
| Grouping + date nav correct and covered | 20 | 20 | 18/18, mutation-tested |
| Amnesty gate is real and unforgeable | 25 | 25 | 4 compiler rejections, verbatim |
| Runtime guard genuinely guards | 15 | 15 | mutation-tested 11/11 → 10/11 |
| Claims match what was built | 20 | 10 | proof doc overstated the seal until the arc was fixed |
| Process discipline (gate, outbox) | 10 | 0 | neither ran before commit |
| Production analysis well-sourced | 10 | 7 | specs + code map read; actual card code unreadable |

**Total: 77/95.** Below the bar this repo's CC-CMDs set, and it would have
blocked the commit had it been run at the right time.

The two failing rows are the honest ones. The work itself holds up — the code
claims are now accurate and every one is backed by a compiler error or a
mutation test. What failed was the reconciliation step that is supposed to catch
exactly the kind of overstatement that did in fact ship.

---

## Known limitations, carried forward

1. **Production's card code was never read.** `index.html` is 2.6 MB and
   `src/legacy/field.js` is the real source of truth; both exceed GitHub's 1 MB
   contents-API cap, and the relay archive URL is blocked from this sandbox.
   The comparison rests on `CODE_MAP.json`, `STANDARDS.md`, `ADR-002-CONTEXT.md`
   and three CC-CMDs — specs and inventory, not implementation.

2. **The seal is not proof of push-compliance.** It covers ADR-002's display
   axis (Defense 4). The 2026-07-07 push/pull re-analysis corrected Rules
   A/B/C/E but explicitly did not touch the display prohibition. Sealing removes
   the accidental route to a push trigger — the CC-CMD's named residual risk —
   but a `SealedDrama` could still be handed to something that pushes it.

3. **`disposePrevious()`'s effect lifetime is untested.** The DOM assertions
   cover the `innerHTML` reset; a leaked effect updating a detached node is
   invisible from the DOM.

4. **`Sport` is still `string`.** Production's Rules 50/51/52/53 are all
   "Specced, not yet built" and all the same stringly-typed failure. The lab
   inherited it, and the grouping added this session keys off a raw string.
   This is the obvious next experiment.

5. **`closing_odds`, `note`, `tags`, `crew`, `local_note`, and the top-level
   `briefs`/`series`/`standings` are decoded by nobody.** Opening-vs-closing
   odds is the Debrief's "Odds Story" layer.
