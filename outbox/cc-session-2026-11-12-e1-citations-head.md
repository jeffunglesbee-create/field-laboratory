# Session note: E1, the citation check reads the history behind HEAD (2026-11-12)

**Branch:** `e1-citations-head` off `origin/main` `f95ecb1`. **Owning CC-CMD:** `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md`, row E1 (filed 2026-11-11, trigger observed a second time at 22:41Z the same day). **Asked for by the owner:** "Build e1 while moving towards completion of root of the problem" (2026-11-12). The second half of that sentence is read as the apt-mirror CC-CMD (`docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md`), whose option 1 is the one part not built; its scoping is a separate section below and is not part of E1's commit.

## What E1 was

`scripts/check-doc-citations.mjs` decided "deleted here" from `git log --all`, so a path that existed only on an UNMERGED branch counted as tracked-then-deleted once the branch was pushed. A document on main that cited it failed `check:citations` in `guards`, in `verify` and in the pre-commit hook, and `deploy` skips a red `verify`. Two occurrences in one day: `live-scores-t1` (05:42Z to 07:56Z) and `live-scores-t3` (22:41Z to 23:40Z). The same tree read `DELETED HERE 1` with the remote branches not fetched and `DELETED HERE 4` with them fetched: the answer depended on the checkout.

## What was built (one commit, `scripts/check-doc-citations.mjs` only)

- `everTrackedPaths({cwd, rev = HISTORY_REV})` (exported; `HISTORY_REV = 'HEAD'`) replaces the module-level `git log --all`. The history behind the commit under test is the history that commit is judged against: a branch that landed is reachable through its merge, a branch that has not is foreign. A shallow clone and an unreadable history stay a PROBLEM and not an empty set.
- `cleanGitEnv(env)` (exported): the environment a throwaway repository's git commands run in, with every `GIT_*` variable of the caller dropped. The script runs from the pre-commit hook, where `GIT_INDEX_FILE` is the real index.
- The report prints `history read from HEAD: N path(s) ...`, so a verdict says what it was read from.
- The self-test gains 11 checks (16 to 27) over real throwaway git repositories (a side branch, a merge, a rename, a shallow clone, a directory with no history, the command line before and after another session pushes a branch), including a positive control that fails when the reader is pointed back at every ref.
- Budgets are unchanged (`docs/deleted-citation-budget.txt` 1, `scripts/chrome-check.mjs` the standing path): the result on this tree is `DELETED HERE 1 path(s)` before and after.

## Verified (Rule 89: each with its artifact)

- **Red before, green after, on the real tree:** `outbox/e1-red-before-2026-11-12.txt` (from `outbox/e1-red-before-2026-11-12.mjs`): a clone of this repository with a side branch adding a cited script. The version at `origin/main` reads `DELETED HERE 2`, exit 1; the new one reads `DELETED HERE 1`, exit 0; with no side branch both read 1 and exit 0.
- **The self-test can fail:** `outbox/e1-sweep-2026-11-12.txt` (from `outbox/e1-sweep-2026-11-12.mjs`): 15 mutations of the reader, its environment handling, the command-line wiring and the fixture environment, each anchor unique and applied, the unmutated copy run first, every run made under a DECOY of the pre-commit hook's environment; 15 of 15 caught, each by a named check.

## The defect the real hook found in the first version of the self-test

The self-test passed standalone and FAILED under the pre-commit hook (11 failing checks, the first commit attempt was refused): `everTrackedPaths` inherited `GIT_DIR` from the hook, which names the real repository, so it read the real history while being asked about a fixture. The fixture's own git commands had been given a cleaned environment; the reader under test had not. Fixed by an `env` option on the reader (the process's by default) which the self-test passes; the sweep now runs every copy under a decoy hook environment (`GIT_DIR` and `GIT_INDEX_FILE` naming a throwaway repository with one unrelated commit, never the real one), and three of its mutations are about the reader's environment. A standalone run cannot see this class of defect.

## Not yet done at the time of writing

Independent review, the scored `verify-full`, landing on `main`, and the E1 row's status. This note is completed after them.
