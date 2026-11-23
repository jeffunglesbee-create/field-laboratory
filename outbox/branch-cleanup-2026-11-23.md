# Branch cleanup, 2026-11-23: what was merged, what was deleted, and where the history is

Owner, 2026-11-23: "Everything that is done that should be merged to main should be merged to main in a harmonious manner, then delete anything else that doesn't hold past, present or future value."

## Result

36 branches besides `main` were on the remote. **Nothing needed merging**: every branch with work that is done had its content on `main` already (patch-equivalent commits, or the same files and lines), checked below. 34 branches were deleted; 3 are kept; the 9 branches whose commits `main`'s docs cite, plus the owner's three drafts, are kept as tags `archive/<name>` at their exact heads, so every cited sha still resolves.

Kept: `main`; `claude/bsd-list-caller-search-5jd70z` (this session's designated branch, merged, no value to the repository but the session names it); `epl-alias-coverage` (another session's, 0 days old: its 3 commits are patch-equivalent on `main` and its ledger records are in main's ledger; delete it when that session is finished).

## How the history is read

`git fetch origin 'refs/tags/archive/*:refs/tags/archive/*'`, then `git log archive/gate-items-2-7` or `git show archive/jeffunglesbee-create-patch-2:FieldLaboratoryHUDTest.html`. To bring a draft back: `git checkout -b <name> archive/<name>`.

## The nine archived branches (tag at the head the branch had)

| branch | head | why it was not merged, and what it holds |
|---|---|---|
| `ccr-db13c105-6wz2mo` | `246cbd3b` | 5 commits: the college-football grounds table and the Exeter row are on main under other shas (`5b74eb63`, `c1437327` are cited); its ledger records are in main's ledger. |
| `claude/laboratory-desk-scoreboard-q9wmin` | `aa16f1f9` | 4 commits, patch-equivalent on main; `05950233` and `46e9cf8c` are cited. |
| `gate-baseline-names` | `24a07133` | 3 commits, equivalent on main (the fix is in `scripts/mutation-check.mjs`; its ledger records are in main's ledger); `df59d1f4` is cited. |
| `gate-items-2-7` | `1622a518` | 25 commits: the development history of the heredoc item (the 2026-11-19 note cites 16 of their shas); its net change is on main as `25065d4b`. Two of its commits (`7e31228a`, `92334d5d`) broke the per-commit pairing rule, so it could not be merged into main's history. |
| `jeffunglesbee-create-patch-1` | `48fe7147` | the owner's draft `src/FieldLaboratorySurface.fs`: compiled on 2026-10-25 and found not to build under Fable; the real module is `src/LaboratorySurface.fs` (docs: `outbox/cc-session-2026-10-25-metrics-play-frames.md`). |
| `jeffunglesbee-create-patch-2` | `37f24e33` | the owner's draft `FieldLaboratoryHUDTest.html`: a HUD harness with the colour scheme the owner wants lab-wide (`docs/CC-CMD-2026-10-27-lineups-on-game-cards.md` lists that as not yet built). Possible future value. |
| `jeffunglesbee-create-patch-3` | `59570874` | the owner's draft `src/LaboratorySurfaceNew.fs` (673 lines, the larger version of patch-1): 'not built on' (does not compile; its 7-state lineup status has no source on the vendor payload). |
| `probe-egress-per-round` | `4cb4c2ee` | 3 commits, patch-equivalent on main; `8306ce57` is cited by a doc. |
| `tls-premise` | `beb31891` | 4 commits: the throwaway premise probe versions (`493d8d88`, `0fca629f`, `33a21783`, `beb31891`), 'never merged' by their own header; cited by the TLS-stage CC-CMD. |

## The three deleted without an archive

| branch | head | why nothing is lost |
|---|---|---|
| `claude/dotnet-sdk-setup-bvtxkh` | `54e6de6f` | 1 commit: all 40 added lines of `docs/SETUP-SCRIPT.md` are on main. No commit cited. |
| `claude/venue-aliases` | `fa6612a3` | 2 commits: all three files they changed are identical on main. No commit cited. |
| `crash-probe` | `7e785bee` | 2 commits: the workflow, script and result file are on main; only `outbox/.trigger-fable-crash-probe` is not (a trigger file never belongs on main). No commit cited. |

## The 22 branches already merged into main (0 commits of their own)

`brief-hook` (`d5ef64d0`), `capture-hardening` (`59d1c489`), `ccr-fb852d69-i1ylmp` (`dd1a37a9`), `claude/new-session-xdba68` (`4ab7877a`), `e1-citations-head` (`8b725e34`), `egress-diagnostics` (`c0c047a7`), `egress-region-fix` (`cb3d4ecb`), `fable-issue-prefill` (`aa0dfe57`), `gate-speed` (`41a511de`), `guard-coverage` (`33ce43ff`), `install-no-apt` (`6ef6aecf`), `land-probe` (`2d5d8854`), `live-chip-pair-probe` (`5f1ace27`), `live-scores-t1` (`8cf3adb5`), `live-scores-t3` (`bf510473`), `option1-chromium-gate` (`39e21c3d`), `pipes-guard` (`4e197349`), `probe-fetch-cause` (`87c8b464`), `split-live-weather` (`7d46564c`), `split-live-weather-budget` (`cfa9b7f8`), `tls-stage` (`5f4b000b`), `workflow-pipes-mine` (`f4b61032`).

## How it was done, and why this way

- The census was read from the repository: `git rev-list --count origin/main..origin/<b>` for commits of its own, `git cherry` for patch-equivalents, a blob and line comparison of every file a branch changed, a grep of `main`'s docs for each commit sha, and the ledger for the shas of the failed and scored runs.
- The sandbox's git proxy carries neither a ref deletion nor a tag or custom-ref creation (all measured today: HTTP 403 or the remote hung up), and the committed `scripts/delete-branches.mjs` deletes `proof-*` names only. A throwaway branch `proof-branch-cleanup-2026-11-23` carried a one-off copy of the script, the plan pinned to each branch's head (a branch that had moved was refused, and refused the whole list), each `merged` head checked as an ancestor of `main`, each archive tag created and verified on the remote before the first deletion. Four copies broken on purpose all refused (a moved head, an unmerged branch labelled merged, a kept branch in the plan, an unknown kind). The unchanged `delete-branches` workflow ran it: run `45228532612`, success. The proof branch was then deleted by the committed tool from `main`. Pushes made with the workflow's `GITHUB_TOKEN` start no other workflow, so the tags triggered nothing.
- An `ours` merge (the method used for `item9` earlier today) was not used for `gate-items-2-7`: two of its commits break the history gate (`every governed commit changed source and outbox together`), so merging it into `main` would turn the gate red.

## Not verified

- The 22 merged branches were not read for value beyond "0 commits of their own": a branch with no commit of its own holds nothing that `main` lacks. - `claude/bsd-list-caller-search-5jd70z` and `epl-alias-coverage` were left on purpose. - No branch of another session was checked for work in progress beyond its head date and its commits; a session that pushes to a deleted name creates the branch again.
