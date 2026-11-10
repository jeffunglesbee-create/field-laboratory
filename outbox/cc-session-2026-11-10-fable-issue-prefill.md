# Session 2026-11-10 — automate the Fable crash report: the duplicate search and a one-click link

Session: https://claude.ai/code/session_017RuhXKQdbuZ7W9Q7sR1Vrm

## The ask and what could and could not be automated

"Automate this task" after the report for fable-compiler/Fable (`outbox/fable-crash-upstream-issue.md`) was ready and the last two steps were the owner's: look for a duplicate, then paste. Posting as the owner on a repository this project does not own needs a credential this session does not have: attaching `fable-compiler/Fable` was denied by the permission layer on 2026-11-09 and the `gh` token on the machine is invalid. A runner's `GITHUB_TOKEN` cannot create an issue in another repository either, and a personal token that could would be a broad credential (write on every public repository) for one issue. So the filing stays the owner's click, and everything in front of the click is automated:

- `scripts/fable-issue-prefill.mjs`: three searches of the PUBLIC search API, scoped to the repository, for the crash by its code and by its words; the union of the issues; a verdict that states its denominator (`NO DUPLICATE FOUND (3 queries, 0 issues returned)`), and says INCOMPLETE, never "none", when GitHub marks a search incomplete or a query has more results than the page read. A non-200, a body that is not JSON and a body without `items` are errors. GitHub's own `issues/new?title=&body=` link with the report in it, refused if it would pass 7500 characters (GitHub cuts longer links).
- `.github/workflows/fable-issue-prefill.yml`: dispatch, or a push of `outbox/.trigger-fable-issue-prefill`; runs the script, commits `outbox/fable-issue-prefill-latest.md` by the repository's push-and-verify pattern. Posts nothing.
- `npm run check:fable-issue` (29 clauses, no network) in `verify`.

## Evidence

- Self-test 40/40 (no network). Rule 90: 28 deliberate breakages of the script, each caught. The first sweep (18 breakages) found 3 survivors (`no Title check`, `any status accepted`, `no shape check`): each rejection test also threw for a second reason, so the clause under test could be deleted unnoticed. Every rejection test now asserts its own error message, and the 403 and 422 cases carry VALID search bodies so only the status can reject them.
- Independent review (25 agents, three dimensions, two skeptics per finding): 7 findings confirmed (6 distinct), all fixed:
  - MAJOR: `node ... | tee` in the workflow has no `pipefail` under the default Actions shell, so a search that threw left the step green and the previous verdict standing in the file (reproduced with a stubbed 403; the repo documents the same trap at `forecast-run.yml:62-66`). Now `exit ${PIPESTATUS[0]}`; and the file carries `Searched <time>, run <id>` so a stale file cannot pass for a fresh one.
  - `incomplete_results` was read with `=== true`, so a missing, null, numeric or string flag read as "complete" (the one place the rule failed open), and a negative or fractional `total_count` read as "nothing found": every field the verdict leans on is now type-checked, with a clause each.
  - The link was a bare URL, which a Markdown renderer ends before a trailing `.`: now an angle-bracket autolink. A CRLF issue file was refused with a false message: normalised. An empty title was accepted: refused. A pull request was reported as an issue: the table has a `kind` column and the verdict says "item(s)".
  - Three sentences that were false: the `MAX_LINK` comment (the host and title are inside the measured length, and the 8 KB figure was not measured: it is now described as a budget), the workflow header (the Commit step pushes with the job's token), and the `verify.yml` comment ("each clause has a must-fail twin": 28 behaviours were broken, not 40 clauses).
- The cheap guards that read workflows, scripts and docs, run locally on the final tree: `check:workflows`, `check-script-orphans`, `check-no-literal-secret-writes`, `check:ignore-parity`, `check:gate-rows`, `check:citations`, `check:exit-drains`, `check-push-lands.py`, `check:import-purity`, `check:docs`.
- Two local failures were the machine, not the change, and are recorded because each is the "a copy read as the source" mistake: `check:docs` ("sports.modelled says 25, actual 24") read `build/Desk.js` from 2026-11-03, before the FA Cup was added to `src/Desk.fs` (`npm run build`, 31 s, then 3/3); and `check:import-purity` failed on four `venue-*.mjs` scripts because this worktree's `node_modules` was a symlink to a checkout that predates the `@xmldom/xmldom` dependency in `package.json` (a private `npm ci`, then 3/3; CI runs `npm ci` and is unaffected).

## Adjacent findings, not changed here (Rule 69)

- `.github/workflows/fable-crash-probe.yml` (mine, 2026-11-03) has the same `| tee -a "$GITHUB_STEP_SUMMARY"` pipe in its "50 builds" and "The table" steps: a failing probe step would be green. `scripts/workflow-check.mjs` has no check for an unguarded pipe, which is why neither workflow was flagged.

## Not verified here

- The search itself: it runs on a runner, and this session did not read the Fable repository (it is outside the repositories this session is scoped to). The first dispatch is the test; its output is `outbox/fable-issue-prefill-latest.md`.
- Where GitHub starts cutting a long new-issue link. The report is about 4 KB, so the link is about 5 KB against a 7500-character budget; the limit itself was not measured.
- That the quoted-phrase queries find the crash's wording if it was reported: the three phrasings are the ones in the report (`code 193`, `internal error` with `Object reference not set to an instance of an object`, `internal error` with `Thoth.Json`); a report worded otherwise would be missed, which is why the verdict states its denominator and the note says to search by hand when it is INCOMPLETE.
