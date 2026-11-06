# Session record: the gate preflight's comment no longer claims it works from another directory (review 7, L7)

**Date:** 2026-11-05. **Scope:** `scripts/confidence.mjs`, the comment above the `--stranded` preflight. Fix stream R1, commit 4. A comment-only change; this file exists because `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`.

## Reproduction (Rule 100)

The comment said the preflight runs `mutation-check.mjs` "by this file's own directory so that a gate run from another directory still finds it". The review ran a copy of the preflight alone from `/tmp` over a repository holding a stranded marker and it printed PASSED PREFLIGHT.

On this clone, the one command that tests the premise: `node <clone>/scripts/confidence.mjs`, started by absolute path from an empty directory outside the repository. It exits 1 with `Error: ENOENT: no such file or directory, open 'docs/gate-rows.txt'`, thrown by `readInventory`, which is the next thing the gate does after the preflight. So the premise of the finding holds in both halves:

- the SCRIPT is found by the file's own directory (`new URL('./mutation-check.mjs', import.meta.url)`), as the comment said;
- what `--stranded` READS is not: it looks for `.mutation-state` relative to the working directory, as the inventory (`INVENTORY_PATH` is `docs/gate-rows.txt`) and every row command (`node scripts/...`) do. From another directory the preflight would ask about THAT directory's state;
- the gate cannot run from another directory anyway, so there is no live wrong answer, only a comment that claimed a property the code does not have.

## What changed

The comment now says the script is found by the file's own directory, that what it reads is not, and that the gate is run from the repository root (`npm run gate`, and `verify-full.yml`, which run it there). The reviewer's alternative (pass `cwd` derived from `import.meta.url`) was not built: it would make the preflight answer for a directory the rows then do not score, and the inventory comparison right after it fails from another directory regardless.

## Red evidence

There is none to show for a comment: no clause can fail on its wording, and no table entry anchors on it (`node scripts/mutation-check.mjs --anchors` is unchanged: 0 stale, 0 ambiguous; the entries for `confidence.mjs` anchor on code lines). The reproduction above is the evidence.

## Not verified

- That nothing else repeats the claim: searched `scripts/` and `docs/` for "own directory" and "still finds it" and read the hits (the other file with "own directory" is `mutation-check.mjs`, where it means the `--stranded` block's own state directory, a different sentence). Existing outbox notes were not searched or edited.
