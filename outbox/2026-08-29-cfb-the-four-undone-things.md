# The four undone CFB things

**2026-08-29** · answering "what else about cfb is undone" with work rather than a list

## 1. Briefs written before the classifier could scope them

`detectSportClass('CFB')` returned null until `7a0caad`, deployed **15:37 UTC**.
CFB games kicked off from ~12:00 UTC (the Dublin fixture) and the journalism
cron writes every 15 minutes, so roughly **three and a half hours of ticks** drew
CFB briefs against basketball, hockey, soccer, football, tennis and golf
exemplars simultaneously.

`scripts/cfb-brief-contamination-probe.mjs` counts them and inspects them, and
its comment states its own limit before printing any number:

> **CANNOT: register damage.** An exemplar governs how prose sounds — connective
> sentences, numbers subordinated into claims — and a brief can be drafted
> against a tennis exemplar without ever using a tennis word. A zero here is NOT
> proof the briefs are fine. It is proof that the one detector available found
> nothing, which is a smaller claim and the only honest one.

It splits on `updated_at` over `created_at`, because three brief writers use
`ON CONFLICT DO UPDATE` and a brief regenerated after the fix keeps its original
`created_at` — the same reasoning `CC-CMD-2026-08-22-brief-sport-contamination`
records.

Dispatch-only. The window is closed; a cron on a closed window is the audited
waste pattern.

## 2. The cron that outlived its own DELETE-BY

`cfb-first-slate.yml` kept firing daily at 16:00. Its retirement note was written
into the file **and** the outbox before the first run, precisely so retiring it
would not depend on anyone remembering — and then it did.

Run `33251392427` answered the question 4/4 on the first FBS slate. Schedule
removed; the workflow stays dispatchable. The standing form of the question is
`seed-coverage.yml`, which already asserts every seeded competition with fixtures
reaches the archive.

## 3. The label had no contract

`CONTRACTS.md` mentioned CFB four times, all about `curatedRank` from
2026-07-15. Nothing about the archive label — which I chose, declared before any
row landed, and which **three parties consume three different ways**:

| consumer | matches | fails as |
|---|---|---|
| field-laboratory `sportOfString` | **verbatim** | `CFB · UNMODELLED SPORT`, sentinel files an issue within a day |
| relay `detectSportClass` | **substring** | class goes null, every brief drafted against every exemplar, **silently** |
| relay `seed-manifest.js` | by V2 key `cfb` | unaffected |

The substring consumer is the dangerous one and it already failed once. Recorded,
with the conclusion that adding a competition to `LEAGUES` is a **three-repo
act** — label, `Sport` case, classifier — and the third was invisible until it
wasn't. Both `CONTRACTS.md` copies synced byte-identical.

## 4. No Sport case has ever rendered a card

`npm run check` renders `public/data/context-2026-05-15.json`: **two AFL rows.**

Every case added since — CFB, Bundesliga, EPL, La Liga, Ligue 1, Serie A, the six
UEFA competitions, NFL, CFL, PGA Tour — is verified by the compiler
(`check:proof` asserts a case without a registry entry does not build) and by
nothing that renders. `Matchup = AwayAtHome` on CFB and `HomeVersusAway` on
Bundesliga are type-checked claims about a function nobody has watched produce
output.

`scripts/capture-render-fixture.mjs` captures a **real** payload — never a
hand-written one, since a hand-made row is an invented row and the point is to
render what the relay actually serves. 2026-08-29 is the first date carrying CFB
and it carries eleven sports at once, so it is strictly better corpus than two
AFL rows. It refuses to write a capture with fewer than five sports: a fixture
poorer than the one it replaces is not an upgrade, and a broken capture should
fail rather than quietly shrink the corpus.

**This closes the same gap for Bundesliga and every UEFA competition**, which is
why it was worth more than a CFB-only fixture.

---

## Results

### 1. Twelve briefs were written unscoped

`cfb-brief-contamination-probe.mjs`, run against the live archive:

```
/archive/query?sport=CFB returned 14 brief(s)

  written BEFORE the fix (unscoped):  12
  written AFTER  the fix (scoped):     2

PASS  no CFB brief carries another sport's vocabulary
```

**The two post-fix briefs are the control.** They prove the classifier fix is
live in the deployed worker, not merely committed — nothing else this session
established that.

**Zero cross-sport vocabulary in all fourteen, and that clears less than it
looks.** An exemplar governs register — connective sentences, numbers
subordinated into claims — and a brief drafted against a tennis exemplar can use
no tennis word at all. The one detector available found nothing; that is the
whole claim. Regenerating twelve briefs costs LLM calls and is a decision for a
human, not a consequence this probe is entitled to draw.

### 4. The capture failed, on a path I assumed

```
ENOENT: open 'public/data/context-2026-08-29.json'
```

**`public/` is gitignored.** It is build output: `scripts/build-site.mjs` copies
`data/` → `public/data/`, so the tracked source of every fixture is `data/`, and
writing to the copy produces a file that exists only on the runner and is staged
by nothing.

I read the fixtures at `public/data/` — where they exist locally, after a build —
and wrote the capture against that path without checking whether it was the
source or the output. **Fourth time this session in different clothes: a path,
a payload shape, a marker convention, an upstream status, each assumed rather
than read.**

Retargeted to `data/`, and it now appends to `data/PROVENANCE.md` — that file
exists so a reader can ask where anything in the directory came from, and a
capture that does not answer the question is exactly the unsourced fixture it was
written to prevent.
