# The live-score probe (CC-CMD-2026-11-11-soccer-live-scores, Task 8)

Date: 2026-11-11. Status: BUILT, REWORKED AFTER AN ADVERSARIAL REVIEW, NOT YET RUN AGAINST A REAL MATCH. The first match it can judge is the
2026-11-11 19:00Z EFL Trophy pair only if the poll is deployed, which it is not until the stack lands; the first scheduled chance is 2026-11-17
19:35Z (CC-CMD Task 10).

## What it is now

- `scripts/live-score-probe.mjs`: `--self-test` (52 checks, the pure logic), `--e2e` (11 checks, the glue against the local rendered page with the
  relay's routes mocked and a fake clock), and the run itself. Pure: `decodeFeed` (the page's strict decoder), `rowsOf`, `judgeCard`, `judge`,
  `doneConditionOf`, `exitCodeOf`, `argsOf`. Glue: `probe({ browser, site, date, watchSeconds, getJson, prepare, wait, now })`, which never throws:
  a probe that dies returns a manifest with verdict `ERROR` and the message.
- `scripts/check-live-probe-keys.mjs`: the probe's `LABEL_TO_KEY` table held to the compiled registry, both ways (19 checks, in verify).
- `.github/workflows/live-score-probe.yml`: dispatch-only, inputs reach the script through the environment and are validated there.
- `npm run check:live-score-probe`, `check:live-score-probe-e2e`, `check:live-probe-keys`, three verify.yml steps.
- 34 table entries (`live-probe-*`), all caught.

## The first version, and the review that reworked it

The first version (8ab827b) passed its own self-test and 13 mutations. An independent review (three lenses, each finding re-checked by two skeptics told
to refute it; 51 agents, 24 findings reported, 20 held) found, among others, what the self-test could not:

| held | what it was | what changed |
|---|---|---|
| the runner's view was keyed on the page's own requests (3 lenses, high) | a page that never polls makes no request, so the runner fetched nothing and read "no game is live" in exactly the failure the probe exists for | the runner's keys come from the cards (`LABEL_TO_KEY`); a game the runner sees live that the page never read is `live-unread`, in or out of its window. `--e2e` has the case: an archive row with no start time, so the page never polls |
| failed polls were invisible (medium) | only status-200 bodies were kept, so a correct page that answered 503 on its last tick FAILed, and a page that hid a failed poll could PASS | every poll's outcome is recorded in order (a body the page's decoder accepts, an HTTP error, an unreadable body, no answer), and the card is judged against the last: a failed last poll after a good one must read `live score unavailable`. All polls failed while the runner sees the game live is a FAIL |
| the Done booleans were pinned only at `true` (high) | hard-coding them passed the self-test | each is pinned at its false value; `doneCondition` is one definition that needs a PASS, so a FAIL with every boolean true cannot satisfy it |
| `forecastAbsent` was true by construction on every non-EPL card | the first manifests that can satisfy Done are EFL Trophy ones | `forecastChecked` counts live cards with a forecast node; `forecastAbsent` over none is `null`; the CC-CMD says the forecast half is first proved on 2026-11-21 |
| `scheduledAfterKickoff` could not see the bug it names | it matched `Scheduled `, which a started row no longer reads | it matches `Start time passed` too |
| the page could be on its committed capture | `#decode-status` was never read | it is read, and any state but `ok` is a FAIL naming it |
| no error containment, `--date`/`--watch` unvalidated, workflow word-splitting | a runner fetch error crashed with no manifest | `probe()` never throws; arguments validated (exit 2); the workflow passes inputs by environment |
| the glue and the exit path were undefended | `process.exit(0)` survived everything | the glue is run by `--e2e`; main's exit is a source scan the self-test makes |
| polls judged outside their window; a hand-copied label list | cards outside kickoff to +3 h were judged against readings the page never applied | the window is applied from the archive start time; the key table is checked against the registry |

Found by the Rule 90 pass on the rework: one mutant survived (a poll still in flight when the watch ends was not waited for) because the end-to-end test's
own pauses let the answer land anyway. The test now makes the last answer arrive 1.5 s late, so only a probe that waits passes it. That was also a real
race in the probe, found because the test made it visible: a poll fired near the end of the watch could still be in flight when the cards were read.

Not changed, by the review's own refutation: nothing in the probe judges a card it did not join, and the workflow cannot be dispatched before it lands on
`main` (the capture workflow has the same property and was dispatched after landing).

## Coverage (Rule 91)

- Verified: the pure logic (52 checks), the glue against a real page with a real poll and a fake clock (11 scenarios: a live match, the whistle with a late
  answer, a page that never polls, every poll refused, a 503 after a good answer, an unreadable body, the committed capture, a runner that cannot read the
  feed, a runner that cannot read `/context/date`, a probe that dies), 34 mutations.
- NOT verified: anything against the real relay's bodies, and the real deployed page. The sandbox cannot reach `*.workers.dev`. `decodeFeed` mirrors
  `src/LiveFeed.fs` by reading it, and the real live body is what tonight's captures are for; the first real run of this probe is the next live match after
  the stack lands.
- The probe says the card agrees with what the relay served. It does not say the score is right: that is ESPN's.

## STAGED claim and unblock (Rule 74)

Staged: the probe's live path. Blocked by: the poll not being on the deployed page (the stack lands only after tonight's capture shows the live shape) and
by there being no in-play lab-covered match before 2026-11-11 19:00Z. Unblocked when: the stack is deployed and a dispatch lands inside a match. Verify:

    gh workflow run live-score-probe.yml -f date=<ET day>
    # then read outbox/live-score-manifest-<date>-*.json: verdict PASS, doneCondition true, requestsToV2Games >= 1, and `checked`
    # reading "checked N of M soccer cards"; on an EPL day also forecastChecked >= 1 with forecastAbsent true
