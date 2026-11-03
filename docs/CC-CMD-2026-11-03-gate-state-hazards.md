# Claude Code Command — the gate's kill-recovery state can overwrite newer files or vanish before it is used

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-03, by CC, as the follow-up `docs/CC-CMD-2026-11-03-proof-check-stale-state.md` names for what its review found and it does not touch (Rule 87.4: out-of-scope work gets its own CC-CMD before the first closes)
**Confidence gate:** `npm run gate` >= 95 before any commit that lands. Tasks 1 and 2 change `scripts/mutation-check.mjs`, the command behind the gate row `breaking each invariant makes a check fail`; Task 3 changes `scripts/proof-check.mjs`.
**Status:** FILED 2026-11-03. Nothing here is built. Tasks 1 to 3 change gate infrastructure beyond what the owner approved ("proof check approved"), so they wait for an instruction; Task 4 is a one-line comment and rides with whichever lands first.

---

## Related, read before building (BUILD-ON-A)

Searched 2026-11-03 by content (`heal`, `.mutation-state`, `restoreCmd`, `proof-state`, `livenessOf`, `stranded`) in `docs/CC-CMD-*.md`.

- `docs/CC-CMD-2026-11-03-proof-check-stale-state.md` (DONE): fixed the same defect class in `proof-check.mjs`'s heal. Its rule is the model here: a backup is applied only to a file that is exactly that backup plus what the script itself put there, and otherwise nothing is written.
- `docs/CC-CMD-2026-11-03-proof-check-shards.md` (DONE) keeps the heal of a killed run among proof-check's rules; Task 3 below changes that script's state handling and must keep it.
- `docs/CC-CMD-2026-11-03-gate-speed.md` (DONE) shards the mutation suite; nothing below changes the table or its partition, but Task 1 changes what a shard does at start.

## What was found (Rule 73)

2026-11-03, by five independent review agents over an immutable snapshot of the proof-check change, each demonstrating in scratch copies (a shim `dotnet`, planted markers, real SIGKILLs); a skeptic then tried to refute each of the findings below and could not. I did not re-run these demonstrations myself.

1. **`mutation-check.mjs` `heal()` restores from a stale marker with no liveness or still-mutated check** (high). It reads `{id, file, backup}` from `.mutation-state/active.json` and does `writeFileSync(file, readFileSync(backup))`. The marker carries no pid and nothing that says the file is still the mutated one. Reproduced with a planted marker whose backup was old and whose file was newer, and with a marker left by a real SIGKILL: the newer file was overwritten. The same defect as the proof-check incident, in the harness that runs after it.
2. **`mutation-check.mjs --self-test` deletes a real stranded marker and its backup before `heal()` can use them** (high). The self-test writes the REAL `.mutation-state/active.json` and `clearActive()` removes the whole directory. The pre-commit hook and the gate row both run it, so the next commit after a kill removes the only record of a stranded source mutation (a broken `Verify.fs` in the demonstration) while the file stays mutated; the following real run found nothing to heal.
3. **The world-mutation restore path** (medium). Restore strings use `/tmp` stashes (`/tmp/mut-outbox`, `/tmp/mut-stub`), which a container restart wipes while the marker in the repo survives: `heal()` then runs `cp ... 2>/dev/null || true`, prints "Ran its restore command" and the session document stays the stub. A stale stash also overwrote a newer document in the demonstration, and the `history-boundary` restore (`git checkout -- docs/history-boundary.txt`) discards uncommitted edits to it. Needs a likelihood caveat: a kill or restart inside the short mutate-to-restore window, plus a wiped `/tmp` for the first.
4. **proof-check's registry phase has no marker and no backup on disk** (medium, existed before the change). `restore()` removes `.proof-state/` at the end of phase 1; phase 2 then inserts the `    | NHL` probe into `src/Desk.fs` with nothing recording it. A SIGKILL there leaves the file mutated, every later run reads it as the original and fails its baseline on FS0025, and its exit `restore()` writes the mutation back; a second run started during phase 2 is not refused. Reproduced twice. The new per-file heal CAN heal a registry probe, but only if the marker is still on disk, which it is not in phase 2.
5. **A recycled pid or a zombie makes a stale marker refuse forever** (low, existed before): `process.kill(pid, 0)` cannot tell the recorded process from another one now holding the pid, and succeeds on a zombie. The refusal message then says the target "has ... injected right now" on a clean tree and recommends `kill <pid>`. And a marker whose pid equals the new run's own pid classifies `proceed` before the tree is looked at, so a stranded injection is reported as "no run state exists" with the state on disk.
6. **A comment in `proof-check.mjs` points at `livenessOf`**, which no longer exists (it is `isAlive`; removed in `6f33b8d`).

## Task 1 — `heal()` applies a backup only to a file that is still the mutation

The marker gains what the mutation did (the applied text is already in the table entry) and `heal()` restores only when the file is exactly the backup with that mutation applied; a file that is anything else is left alone and the state is kept, with a message that says where the backup is, as `proof-check.mjs` now does. A pid goes in the marker so a live run refuses. Probe first: read the marker writer and `heal()`; the artifact is a self-test case per outcome that runs the real harness against planted state in a scratch directory, and a mutation for each.

## Task 2 — the self-test must not touch the real state directory

The self-test uses its own state directory (a temp path or an override flag), never calls `clearActive()` on the real one, and the exit handler restores only the directory it created. Artifact: a case that plants a real-shaped marker and backup, runs `--self-test`, and requires both still present afterwards; it must go red on the current code first.

## Task 3 — proof-check keeps its marker through phase 2

Keep `.proof-state/` and the registry backup until the very end, and let `classifyState`'s inputs already added cover the probe in phase 2 (they do; only the marker's lifetime is missing). Add a pid-start fingerprint (the process's start time) so a recycled pid or a zombie does not read as the recorded run, and let the own-pid collision fall through to the tree check. Artifact: a real-script case for a kill in phase 2, and one for a recycled pid.

## Task 4 — the dangling comment

Change `see \`livenessOf\` below` to name `isAlive` in the header comment of `proof-check.mjs`.

## Done conditions

1. Each task's artifact exists and each case was red before its change.
2. `npm run gate` >= 95 with `PW_CHROMIUM` set (`lineups-render-check` needs it in this sandbox), on the tree of the commit.
3. The Status of this document set to DONE, with the commit.
