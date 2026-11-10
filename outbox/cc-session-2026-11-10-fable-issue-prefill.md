# Session 2026-11-10 — automate the Fable crash report: the duplicate search and a one-click link

Session: https://claude.ai/code/session_017RuhXKQdbuZ7W9Q7sR1Vrm

## The ask and what could and could not be automated

"Automate this task" after the report for fable-compiler/Fable (`outbox/fable-crash-upstream-issue.md`) was ready and the last two steps were the owner's: look for a duplicate, then paste. Posting as the owner on a repository this project does not own needs a credential this session does not have: attaching `fable-compiler/Fable` was denied by the permission layer on 2026-11-09 and the `gh` token on the machine is invalid. A runner's `GITHUB_TOKEN` cannot create an issue in another repository either, and a personal token that could would be a broad credential (write on every public repository) for one issue. So the filing stays the owner's click, and everything in front of the click is automated:

- `scripts/fable-issue-prefill.mjs`: three searches of the PUBLIC search API, scoped to the repository, for the crash by its code and by its words; the union of the issues; a verdict that states its denominator (`NO DUPLICATE FOUND (3 queries, 0 issues returned)`), and says INCOMPLETE, never "none", when GitHub marks a search incomplete or a query has more results than the page read. A non-200, a body that is not JSON and a body without `items` are errors. GitHub's own `issues/new?title=&body=` link with the report in it, refused if it would pass 7500 characters (GitHub cuts longer links).
- `.github/workflows/fable-issue-prefill.yml`: dispatch, or a push of `outbox/.trigger-fable-issue-prefill`; runs the script, commits `outbox/fable-issue-prefill-latest.md` by the repository's push-and-verify pattern. Posts nothing.
- `npm run check:fable-issue` (29 clauses, no network) in `verify`.

## Evidence

- Self-test 29/29. Rule 90: 18 deliberate breakages of the script, each caught. The first sweep found 3 survivors (`no Title check`, `any status accepted`, `no shape check`): each rejection test also threw for a second reason, so the clause under test could be deleted unnoticed. Every rejection test now asserts its own error message, and the 403/422 cases carry VALID search bodies so only the status can reject them. Rerun: 18 of 18.
- The cheap guards that read workflows, scripts and docs, run locally: `check:workflows` 10/10, `check-script-orphans` 3/3, `check-no-literal-secret-writes`, `check:ignore-parity` 3/3, `check:gate-rows` 7/7, `check:citations`, `check:exit-drains` 4/4, `check-push-lands.py` (22 of 22 push-retry loops verify the push landed), `check:docs` 3/3 after a fresh build.
- `check:docs` first failed locally ("sports.modelled says 25, actual 24"): `build/Desk.js` was from 2026-11-03 and had no FA Cup, while `src/Desk.fs` has it. The check derives its count from the build, which is a copy of the source. `npm run build` (31 s), then 3/3. Not a regression; recorded because it is the second time this repository's guard has read a stale build.

## Not verified here

- The search itself: it runs on a runner, and this session did not read the Fable repository (it is outside the repositories this session is scoped to). The first dispatch is the test; its output is `outbox/fable-issue-prefill-latest.md`.
- That GitHub keeps the whole prefilled body in the link: the length is checked against 7500 characters, the figure is GitHub's documented practical limit, not measured here.
