# Session 2026-11-07 — the FA Cup in the sport registry, and the history boundary it cost

**Task:** the owner's message after a screenshot of the scoreboard (2026-11-06, 5:50 PM ET): "More leagues do sit below the fold, although fa cup is missing. The main issue is the lineup source can't be found." The lineup half was a relay defect and is documented in field-relay-nba, `outbox/cc-session-2026-11-07-lineup-join-and-fa-cup.md`. This entry is the laboratory half of the FA Cup, and the record of the one step of the laboratory's CI it failed.

## What was built (commit `c8fd578`)

- `src/Desk.fs`: `Sport.FACup`, in `allSports`, in `sportMeta` (label "FA Cup", `HomeVersusAway`, soccer, modelled) and in `sportOfString` ("FA Cup"). Modelled the day the relay carries the competition and not on the first slate with a fixture, the CFB exception: otherwise the first FA Cup day renders under "FA Cup · UNMODELLED SPORT" with "vs" for both sides, as Bundesliga did on 2026-08-28.
- `scripts/sport-registry-check.mjs`: "FA Cup" among the contest sports, 21 to 22.
- `docs/JLAYER-PLAN.md`: the claim `sports.modelled` 24 to 25, which `docs-check` re-derives from the registry.

## What is proven, and what is not

- **The relay serves it.** field-relay-nba registered `facup` (ESPN `eng.fa`) and deployed it (Deploy RELAY Worker run 42322923778, success). After the deploy `/v2/games?sport=facup&date=2026-11-06` returned HTTP 200, `"league":"FA Cup"`, two finished games: Bristol Rovers 2-0 Cambridge United and Oxford City 2-4 Leicester City, `"round":"English FA Cup, First Round"`. The home side is the club whose ground is the venue in both (Memorial Stadium, RAW Charging Stadium), which is what `HomeVersusAway` assumes.
- **The laboratory's CI compiled it.** verify run 42324080403: the F# build and "Fail on any F# compiler warning" passed, "The sport registry matches what production serves" passed, "Every claim a document makes is still true" passed (the `sports.modelled` claim at 25). The F# was not compiled in the session's sandbox (no `dotnet` there); CI is where it was compiled.
- **Not proven:** no archived FA Cup row has been read by the laboratory yet. The archive creates a day's rows at about 10:00Z, and the first FA Cup rows exist only after 2026-11-07 10:00Z. The convention is read from the relay's ESPN adapter, which orders the sides by `homeAway`. STAGED. Unblocked when `regular_season_games` holds a row with `sport = 'FA Cup'`; verify by loading the scoreboard for that date and reading the card's "Home v Away" order against the venue.
- **Not done:** team colours for FA Cup clubs. `TeamColours.fs` has none for the competition, so its cards take the plain palette.

## The step it failed

verify run 42324080403 and guards run 42324080426 failed in exactly one step, "Source and outbox changed together, every commit" (`scripts/history-check.mjs`): `c8fd578` changed `src/` and `scripts/` and carried no outbox entry. Every other step passed. The cause was measured in the clone that made the commit, before anything was changed: `git config core.hooksPath` empty, so `.githooks/pre-commit` was not installed; `ls node_modules | wc -l` 0; `CLAUDE_CODE_REMOTE=true`. The same two readings as the 2026-11-03 entry in `docs/history-boundary.txt`. Why `scripts/install_pkgs.sh` did not run in that session is still not established.

The rule is per commit and settled when the commit is made, so a later entry does not pair with it. The owner was asked and chose to move the boundary one commit (the other offers were rewriting `c8fd578` and force-pushing main, or leaving main red). `docs/history-boundary.txt` now ends `2c4ec401c7ea3723d5554dea237a8a3b370c3f99  39`, with the eighth move written out above it: 38 plus the one absorbed commit, derived on a full clone (`git fetch --unshallow`, 2859 non-merge commits) where `node scripts/history-check.mjs` named exactly `c8fd578`, and passes with the new pair.

## Addendum 2026-11-07 13:40Z — it was not live until 12:50Z

The section above says the laboratory's CI compiled `c8fd578`. It did not say the site was never published, and it was not: the page stayed at `ff9c83a`. `verify` was red on `c8fd578` (the history step), the boundary move `36783a96` is docs-only and paths-ignored, so verify never ran on a newer deployable commit, and `deploy` asks verify for the verdict of the newest DEPLOYABLE commit, which stayed `c8fd578`'s red run. `live-check` was red from 08:53Z for exactly that (run 42364844307, `deploy-landed-check`: "published ff9c83a is behind the newest deployable commit c8fd578"); I read it at 12:40Z. Verify dispatched on HEAD (run 42373737893, success) fired `deploy` through `workflow_run` (42374233305, success); `deploy` dispatched once more (42374496409, success); `live-check` 42374544456 `success`.

**FA Cup on the board, what is and is not shown.** `lineups-live-probe` run 42374701964, `outbox/lineups-live-manifest-2026-11-07T12-57-19.json`: for 2026-11-07 the page holds 146 cards (the relay's `/context/date` has 146 rows), 75 soccer cards and 41 joined at that moment (42 after the relay's alias), and 5 of 5 joined cards opened drew a predicted lineup sheet (verdict PASS). 75 = 23 MLS + 19 big-five + 33 FA Cup, so the FA Cup cards are there by arithmetic. **Not read:** the `FA Cup` sport group itself on the deployed page (the sandbox browser tool is not allowed on `*.workers.dev`, and a probe for it would cost a verify run). The home-side order the first section staged is still unverified against a venue.

## Open

- Two moves of this boundary in four days, from clones in the same state. The thing to act on is the guard not being in the committer's path in cloud sessions, not the boundary. A check that makes a cloud session say, at its first commit, that the hook is not installed would cost less than a move.
- The first archived FA Cup row: it exists now (33 rows for 2026-11-07, D1), and the card's "Home v Away" order against the venue is still unread.
