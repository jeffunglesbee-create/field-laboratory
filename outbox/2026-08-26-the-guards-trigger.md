# The guard set's trigger did not cover the guard set's inputs

**2026-08-26.** `.github/workflows/guards.yml`, `scripts/not-observable.mjs`.

## The gap

`verify.yml` fires on every push except `docs/**`, `outbox/**` and `**/*.md`.
That exclusion is deliberate and load-bearing — the Actions budget was 90%
consumed with two weeks left, and the status and session-doc commits that land
in `outbox/` several times a day would each otherwise pay for a build, a
Chromium install and sixty checks.

Six ratchets and ledgers this repo relies on live under `docs/`:

| file | read by |
|---|---|
| `docs/exposed-secrets.sha256` | `exposed-secret-check.mjs` |
| `docs/history-boundary.txt` | `history-check.mjs`, `boundary-reachable-check.mjs` |
| `docs/citation-budget.txt` | `check-doc-citations.mjs` |
| `docs/gate-rows.txt` | `gate-inventory.mjs`, `row-confidence.mjs` |
| `docs/confidence-log.jsonl` | `confidence-record-check.mjs` |
| `docs/not-observable.txt` | `not-observable.mjs`, `computed-chrome-check.mjs` |

Every one could be edited — a hash removed, a count lowered, a gap declared
closed — in a commit no workflow read.

## The precedent is not hypothetical

`field-relay-nba` shipped `check-no-literal-secret-writes.mjs` with the real
(exhausted) Odds API key pasted twice into its own self-test fixture — in the
script whose only purpose is to stop credentials being written from literals.
It touched `scripts/` and `.github/workflows/` only, `deploy.yml`'s `paths` did
not cover either, and the exposed-secrets ratchet that would have failed it
never fired. Found by running the checks by hand two commits later.
`guards.yml` was written there for exactly this. This is that workflow, here.

## Shape

`paths` is the complement of `verify.yml`'s `paths-ignore`. Source-only push →
verify. Docs-only push → guards. Mixed → both. Nothing builds, installs a
browser, or reaches the network, so the docs-only case is well under a minute.

Eleven steps, every one verified to run clean locally before the workflow was
written.

## Two things it deliberately cannot do, said out loud

**`check:docs` is not in it.** It verifies that numbers documents quote about
production still match what the decoders produce, so it imports `build/`.
Building costs dotnet plus Fable, which is most of `verify.yml`'s runtime and
the whole reason this workflow exists. It was in the first draft and
`check:workflows` rejected it **by name** — the guard doing exactly its job:

```
FAIL  no job runs a build-dependent script without building
      → guards.yml:guards runs scripts/docs-check.mjs — which import build/ — but never builds
```

**Whether a declared gap has CLOSED is not checked here.** That needs the
rendered page. It runs in `verify.yml` on source pushes, which is the same
commit that would close a gap. A stale entry added in a docs-only commit
survives until the next source push.

## One parser, two callers

`docs/not-observable.txt` is now parsed by `scripts/not-observable.mjs`, which
`computed-chrome-check.mjs` imports. The browser check had its own inline copy
of the format. Two parsers of one format that drift apart is the defect class
this session has named all day — a value whose name and its measurement
disagree — and it would have been shipped inside the file written to prevent it.

Nine self-tests on the parser, including the one that matters: a single space is
**not** a separator, or `contrast:sport filter` parses as the id
`contrast:sport` with the rest as its corpus. That line is malformed and is
reported, not half-understood. Written wrong the first time and caught by its
own run.

## On `check:history` failing locally

It does, and it is not a finding:

```
  rule effective at : c31b94e
  predating the rule: 4 (declared 22)
FAIL  the pre-rule violation count moved: 4, declared 22
```

`git rev-list --count HEAD` is 285 and `.git/shallow` exists. This clone is
shallow; CI's is ~700 commits. `docs/history-boundary.txt` records this exact
trap twice in its own history — *"check:history is only meaningful on a full
clone. If the count it prints disagrees with this file, confirm
`git log --oneline | wc -l` is in the hundreds before believing either number."*
`guards.yml` checks out with `fetch-depth: 0`.
