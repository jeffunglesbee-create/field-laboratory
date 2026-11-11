# The probe's end-to-end flaked, and the flake was a race in the probe (2026-11-11)

While re-running the probe's `--e2e` after an unrelated change it failed once (10 of 11) and passed on the next run. A flaky check is a finding, not a pass
(Rule 77), so it was run eight times in a row: one more failure, the same scenario both times, the whistle with a late answer. The failing manifest said
`requestsToV2Games: 2` and recorded ONE poll outcome.

Cause: after the watch ends, the probe asks how many of the page's polls are still open before it reads the cards. A poll fired in the very last instant of
the watch has been issued by the page, but Playwright's `request` event for it can reach the probe's listener a few milliseconds after the probe looked.
`open` then read 0, the probe read the cards, and the card still showed the previous answer. The earlier fix (wait for open polls) was right and incomplete.

Fix: 300 ms real time for the events to arrive before the question is asked (`scripts/live-score-probe.mjs`). Fourteen consecutive runs: 14 of 14. The table entry
`live-probe-reads-cards-with-polls-in-flight` (remove the wait) is unchanged and still caught, because the test's last answer is delivered 1.5 s late.

Not claimed: that it can never flake. It is a race against a browser's event delivery with a 300 ms margin; if it flakes again the margin is the first thing
to look at, and the probe's real run (70 s watch, no fake clock) has the same margin.
