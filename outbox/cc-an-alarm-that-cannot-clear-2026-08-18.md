# Outbox — an alarm that can never be cleared, and the scanner that skipped itself

**Date:** 2026-08-18
**Ships:** `Sport.LaLiga` and `Sport.Golf` with `SportMeta.Omission` in
`src/Desk.fs`, declared-vs-undeclared in `scripts/drift-check.mjs`, `LANDED`
asks and a self-test in `scripts/cc-cmd-followup.mjs`, working-tree scanning in
`scripts/exposed-secret-check.mjs`, `docs/JLAYER-PLAN.md` corrected

## The security finding first, because it is mine and it is a repeat

`37f1daf` — subject **"Redact the relay credential, and make the refusal
mechanical"** — committed the relay credential. Twice, in the docstring of
`scripts/exposed-secret-check.mjs`, the file whose entire purpose is to stop
that.

That is the third time in this project the value has entered the repository
inside an explanation of why it must not:

| commit | subject | where |
|---|---|---|
| `41f0b33` | Correct Phase 4: laboratory generates nothing | `docs/JLAYER-PLAN.md`, in the sentence saying laboratory must not hold it |
| `37f1daf` | Redact the relay credential, and make the refusal mechanical | `scripts/exposed-secret-check.mjs`, demonstrating the tokeniser |

### Why the guard did not catch it

```js
const files = execSync('git ls-files', …)
```

`git ls-files` lists what is **already committed**. `exposed-secret-check.mjs`
was untracked when I ran it before committing, so **it never scanned itself**.
The next run — with the file now tracked — failed immediately.

A guard meant to run before a commit was scoped to what already existed in one.
That is exactly backwards, and it is not a subtle bug: it means a brand-new file
carrying a secret is invisible until after the exposure.

Fixed to `git ls-files --cached --others --exclude-standard`. `--others` is the
half that was missing; `--exclude-standard` keeps `.gitignore` honoured so
`build/` and `node_modules` stay out.

Proven rather than reasoned about — an untracked file carrying the value now
fails on sight:

```
FAIL  no file in the working tree contains a known-exposed credential
      → zz-untracked-leak.md: relay shared auth header value
        (gates POST /d1/execute — write path to production briefs)
```

The docstring now uses a fictional example. **The value is in history at two
commits and rotation is still the only thing that ends it.**

## An alarm that could never be cleared

The probe run on a runner reported `unmodelled: golf, La Liga`. The drift log
shows `golf` in that position since **2026-08-14** — nine consecutive runs.

It will never leave. `src/Desk.fs` argues at length that golf must stay
unmodelled: the relay packs a tournament and a round into `home`/`away`, so
`golf_2026-08-14_fedexstjudechampionship_r2` renders "FedEx St. Jude
Championship vs R2", and every `Matchup` case asserts a contest between two
sides. `sport-registry-check.mjs` pins that decision so it cannot be "fixed"
quietly.

So the sentinel was correct, permanently, twice a day, about something nobody
should act on. The sentinel's own issue-closing step already names the cost:

> An issue that outlives its cause trains people to ignore the next one.

**`Modelled = false` meant two different things with nothing to tell them
apart** — "nobody has looked at this" and "we looked, and unmodelled is the
right answer". `SportMeta` now carries `Omission: string option`. `Some reason`
is a recorded decision; `None` on an unmodelled sport is a real alarm.

Same device the codebase already uses twice: `venuesWithoutParkFactors` for
venues with no park factors, and `tryUmpire` returning None for umpires
production genuinely has no entry for — *"a real answer, not a missing one"*.

Nothing about how golf renders changed. `Modelled = false`,
`Matchup = UnknownConvention`, neutral separator, flagged in the UI. The pinned
check passes untouched. The only difference is that the sentinel can now tell it
apart from `kabaddi`, which is still a real alarm.

### The escape this opens, closed in the same change

A declared-omission mechanism is one edit away from a suppression list — declare
everything and the check passes while the desk renders nothing under a real
convention. So the sentinel also asserts:

```
the declared omissions are not the whole slate
```

## La Liga, from evidence rather than convention

`Liga` in the sentinel output was the shell splitting on a space. The relay's
label is **`La Liga`**, and `data/brief-join-corpus.json` carries four fixtures:

```
sport="La Liga"  id=La Liga_2026-08-15_alavs_getafe   home=Alavés  away=Getafe
sport="La Liga"  id=La Liga_2026-08-16_espanyol_levante  home=Espanyol  away=Levante
```

Spanish top-flight association football — genuinely two-sided, unlike golf. The
ids list the home side first and agree with the `home` field, which is the
evidence for `HomeVersusAway` rather than an assumption. `IsSoccer = true`, the
same as MLS and EFL Cup.

Guessing a convention is what produced the AFL/MLB transposition this repo was
built around, so the basis is named in the source rather than inferred.
Verified: `Alavés v Getafe`, home first.

## Retiring a landed ask without deleting it

`quality-bar-scale` landed. Left in the open list it would print
`::notice::LANDED` on every run forever — the same defect as golf, one file over.

Deleting it is the other wrong answer: the ask landed because a field appeared on
a route, and a field that appeared can disappear. `Ceiling.relayReachable` is
245 and production now reports the scale it measures against.

So the asymmetry is the point:

- **an open ask that has not landed is not fatal** — someone else's backlog, and
  turning it into a red build here is the pressure that gets a check deleted
- **a landed ask that stops holding is fatal** — a regression against a fact this
  repository was told it could rely on

### The predicates had never been tested

They only ever ran against the live relay, where a working predicate and
`landed: () => true` are indistinguishable. Six self-test cases now, against
fixtures, no network. Two of them are discriminations I would otherwise have got
wrong:

- a payload reporting `below_240` with **no denominator** must NOT count as
  landed — the denominator *is* the ask
- `scoring_version: null` **does** count as landed — the ask is that the column
  is projected, and requiring a non-null value would keep it open forever on
  historical rows

## The plan contradicted itself for a day

`JLAYER-PLAN.md`'s status table said Phase 5 was *"done — a `verify` step, not a
gate row"* while its Order section still called it *"the only phase still gated
on a judgement call"*. The judgement was made on 2026-08-17 and the document
never recorded it. Corrected, with the reason, plus a table of where the four
relay asks now stand.

## Verified

`npm run build` clean, zero F# warnings. `check:sports` 8/8 with the golf pin
untouched. `check:secrets` 11/11 including the two new blind-spot assertions,
plus the untracked-file probe above. `check:import-purity`, `check:docs`,
`check:history`, `check:workflows`, `check:unused`, `check:confidence-record`,
`check:game-id`, `check:rows`, `check:gate-rows` all pass. `cc-cmd-followup
--self-test` 6/6, now wired into the sentinel ahead of the live probe.

No score is stated. The gate has not run against this tree, and a dirty run
could not back one anyway.
