# Corrections from the independent review of the live-score commits (2026-11-11)

Three lenses (semantics, the capture, rules) read the commits through the poll, 32 agents, each finding re-checked by a skeptic told to
refute it. 30 agents finished; two skeptic runs were lost to a usage limit and one to a schema error. Findings that held are fixed in the
commits listed here; the capture's are in `outbox/live-shape-capture-2026-11-11.md` and landed separately.

| finding | verdict | where fixed |
|---|---|---|
| semantics:F1, rules:F6 (a card drawn before kickoff keeps `Scheduled` after it) | confirmed, reproduced on the compiled card | 88abf10, `outbox/live-score-memo-staleness-2026-11-11.md` |
| semantics:F8 (the live node has no CSS rule) | confirmed | 9404a71, `outbox/live-score-note-style-2026-11-11.md` |
| semantics:F2, rules:F1 (the "card, Stats and Pick'em keep agreeing" claim is false for what was built) | confirmed, severity lowered by the skeptic to medium or low | 560cf70: claim corrected in `LiveScore.fs`, the CC-CMD and the pure-half note; parity filed as `docs/CC-CMD-2026-11-11-live-scores-tabs.md` |
| semantics:F3, rules:F3 (`liveWorkAheadAt` never asked about "during") | confirmed | 560cf70: three instants, two table entries |
| rules:F12 (14 of 16 feed keys unpinned) | unverified by the skeptic (it returned no verdict); checked here | 560cf70: all sixteen pinned by value, three entries; each key measured on the deployed relay |
| semantics:F6 (keys cited from `SPORT_CONFIG`) | confirmed | 560cf70, and the measurement above |
| semantics:F4 (public values with no caller) | confirmed at low; the poll commit since gave them callers | `stateWith`, the one with no production caller, removed (560cf70) |
| semantics:F5 (two assertions that could not fail) | confirmed | the pinned-page guard now has an entry that the render check catches; the pre-kickoff-string row ties to the page through the `ahead` check, which already fails if the page's string moves |
| semantics:F7 (the forecast probe's wording for a card past kickoff) | confirmed | the probe tells `Start time passed` apart and says why; an entry catches the removal |
| rules:F11 (two miscounts) | confirmed | corrected in `outbox/status-start-time-passed-2026-11-11.md` and `outbox/live-score-card-handle-2026-11-11.md` |
| rules:F8 (the Stats gate's call site is undefended) | confirmed | stated, not built: a reading cannot reach the Stats tab (it renders from the games list), so no render check can drive the call, and a mutation of `StatsView.fs:65` is caught by nothing. The gate is defended at function level; the call site belongs to `docs/CC-CMD-2026-11-11-live-scores-tabs.md`, whose store makes a reading reachable and so makes the call testable |
| rules:F5 (the BSD-cache follow-up's trigger cannot fire) | confirmed | see the correction in `docs/CC-CMD-2026-11-11-v2-games-bsd-cache.md` (next commit) |
| rules:F10 (fact 7's key list) | confirmed | fact 7 in the soccer CC-CMD (revised on `main` with the capture hardening) |
| capture:F1, F3, F4, F5, F7, F8, F9, rules:F2, F4 | confirmed | the capture hardening, landed on its own |
| capture:F6, rules:F9 | refuted by the skeptic (a re-arm existed; the poll check and its entry exist) | none needed |
| capture:F2 (stored tasks carry no connectors or permission mode) | unverifiable without a live run | the captures are also dispatched from the authoring session |

What was not done, and why: the semantics lens's F2 premise "keep agreeing" is corrected, not made true. Making it true is the filed tabs
CC-CMD, which needs the handle and the poll to be on `main` first.
