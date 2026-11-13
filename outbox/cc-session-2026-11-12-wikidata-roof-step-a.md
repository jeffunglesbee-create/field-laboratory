# CC session 2026-11-12 (evening): Task 5 Step A, the roof rule's Wikidata step

Session: https://claude.ai/code/session_01X1QRUKcA6Q8MCKMehmeiXX. Scope: `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 4's close and Task 5's Step A. Nothing under `src/`, `scripts/`, `.github/` or the relay changed.

## What the owner said and what was done

| time (ET) | owner's words | read as | done |
|---|---|---|---|
| Thu 2026-11-12 20:42 | "Decisions: keep and approve" | **keep**: the 61 hand rows of `bf1fdf4c` stay, none reverted. **approve**: Task 5, Step A (the read-only part); neither follow-on | `78ba16bd`: Task 4 DONE, Task 5 header "Approved … Step A", Status line; the two follow-ons recorded as not approved |

No question about that reading was put to him (the same way "Yes to all" was read in the earlier session).

## HEAD progression

| commit | what |
|---|---|
| `7654aa5d` | start: landing record of the hand rows |
| `78ba16bd` | docs: the owner's keep and approve recorded (guards: see the manifest) |
| `c3176fa5` | Step A: the evidence, the analysis script and its self-test, the record, this session doc, the CC-CMD's Result under Task 5 (9 files, `docs/` and `outbox/` only) |
| the commit that adds the Landing manifest | docs only; a file cannot name its own commit, `git log -1 -- outbox/cc-session-2026-11-12-wikidata-roof-step-a.md` does |

## Built

- `outbox/venue-wikidata-roof-evidence-2026-11-12.json`: 19 pages from Wikidata's live API as the page reader returned them (extracted from the session transcript by a script that edits nothing but the whitespace around a body) and the four attempts on the query service that the reader refused.
- `outbox/venue-wikidata-roof-step-a-2026-11-12.mjs`: reads committed files only (its own imports can read and hash, nothing else: check G6) and prints 24 checks, its coverage (what each number is out of), the verdict by criteria 1 to 6 and the digests of the four files criterion 6 protects. `record` generates the record; `--self-test` doctors its inputs 27 ways.
- `outbox/venue-wikidata-roof-step-a-selftest-teeth-2026-11-12.mjs`: breaks 20 of the checks one at a time in copies of the script and requires each copy's self-test to name the doctored input aimed at it.
- Outputs: `…-2026-11-12.txt` (report), `…-2026-11-12.md` (record), `…-selftest-2026-11-12.txt`, `…-selftest-teeth-2026-11-12.txt`.

## Result

NO-GO by criteria 1 to 6. Wikidata's property search for "roof" lists 0 properties; the full-text search of the Property namespace lists 1 (P5833, "Playbill production ID", matched through an example value `fiddler-on-the-roof-…`), set aside; 0 candidates retained, so 0 of 9 names decided and no read of the 396 is required (0 of 0). The property the rule reads today (P5624) carries a roof on 0 of 396 items (cache). The two roof classes Wikidata has an item for ("retractable roof", "domed stadium") reach 1 of 396 items (Stade Pierre-Mauroy, whose lead already decides it) and none of the 9 names; that is information, not a candidate.

## Premises (Rule 100): the one command that would refute each, and what it said

| premise the work rests on | the command | result |
|---|---|---|
| a list of 0 from the property search is an answer, not a form that cannot answer | the same search for "capacity" | 5 properties listed (P1083, P2109, P2957, P8628, P2351): not refuted |
| the one full-text hit, P5833, is about a roof | `wbgetentities` labels and descriptions; its claims page | label "Playbill production ID", description about a theatre database; the word comes from the example value `fiddler-on-the-roof-imperial-theatre-vault-0000006051`: refuted, set aside |
| Wikidata's query service can be read through the page reader | four fetches (`format=json`, `csv`, `tsv`, `xml`) | `CRAWL_UNEXPECTED_CONTENT_TYPE` ×2, `CRAWL_LIVECRAWL_TIMEOUT` ×2: refuted; recorded under `unreadable` |
| the backlinks lists of the two class items are complete | `batchcomplete`, no `continue`, count under the API's cap of 250, and the redirect-following read | 14 and 5 pages, both reads equal: not refuted |
| the 9 names criterion 5 names are the review rows whose reason begins "roof:" | the count in Step 1's record | 9 names, 29 games, 28 venue-days, equal to the rows' count (check V6): not refuted |
| the 396 items are the cache's `wd-roof|` keys, and the check on them can fail | a doctored cache with one key deleted | **refuted for the first version of the check** (mistake 1); fixed |
| the class items reach some of the 9 names | intersect the 19 pages with the 9 QIDs | 0 of 9 |

## Mistakes

1. The self-test's first run caught 25 of 26 doctored copies. The miss was my check C2b ("answered 396 of 396"): with one item deleted from the cache it read "395 of 395" and passed, because its denominator came from the copy it checked. Fixed by pinning Task 5's own count (`ITEMS`, 396) and adding C2e, which ties the cache to the items the latest run's rows carry (391 of 391; the cache holds 5 more that no row of that run carries). Re-run: 27 of 27.
2. Two sentences in my first draft of the record were not measured: that an item's claims "run to about 100 KB" and that the query service "would answer that in one statement". Both were replaced by what is known (the service refused the reader; the read through the reader was not attempted; the sourcing runs do query that service from a runner).
3. The first two property-search pages were read before the context was compacted and existed in this session only as a quotation in a summary. They were fetched again so that every saved page is a machine capture; the new bodies equal the quoted ones.
4. The first backlinks reads asked for 500 rows; the API caps an ordinary account at 250. Its warning is in the second pair of reads and not in the first (not investigated: the lists are 14 and 5, far under either cap, and the two forms agree).
5. The "Verified" line below ended with a claim that the new files carry none of Rule 74's marker word. That line spelled the word out, so the claim was false as written in the pushed commit `c3176fa5`. Found by a case-sensitive `grep -n` for the marker over the new files after the push: 1 hit, that line. The line now says what is true (no feature is built or left awaiting an unblock), and the same `grep -c` over this file returns 0.

## Verified, and what is not

- Verified: 24 of 24 checks; 27 of 27 doctored copies caught; 20 of 20 broken copies refused by the self-test; the four protected files have no diff (`git diff --stat` empty) and their digests are in the record; no feature is built or left awaiting an unblock, so Rule 74 has nothing to apply to.
- Not verified (the record's "What this does not show"): the 396 items' own statements under a property not named for a roof; other languages; other class items. The pages are not a runner's reading.
- Integration state (Rule 65): none. No endpoint, client consumer, relay contract or served page is involved.

## Carry-forwards

None. Task 5's Done-when waits for the owner's answer on which follow-on follows, or neither; no work is deferred to a later session.

## Landing manifest

Written after the push of `c3176fa5`. Run times are UTC on 2026-11-13, which is the evening of 2026-11-12 in ET. Every value below was read from GitHub or computed on the pushed tree after the push.

| item | value |
|---|---|
| Step A commit | `c3176fa597673fe33fde09a552e3747b722b91a7`: 9 files, 915 insertions, 1 deletion, all under `docs/` and `outbox/` (`git show --stat`) |
| decision commit | `78ba16bd11dc17ef1e0730036ff4fd1761f7eac2`: 1 file (the CC-CMD), 7 insertions, 2 deletions |
| every run GitHub holds for `c3176fa5` | `guards` (push) 43349768798 success; `live-check` (dispatched by me) 43349947319 success. No `deploy` run exists for this SHA |
| every run GitHub holds for `78ba16bd` | `guards` (push) 43347839711 success; `deploy` (event `schedule`) 43348238697 success; `status` 43348342586 success; `live-check` 43348342619 **failure** (next section) |
| deploy run for this work | none. Nothing under `src/`, `scripts/` or `.github/` changed |
| branch | `main` (`git branch --show-current`, read before this commit) |
| protected files (criterion 6) | the sha256 of each of the four files on the pushed tree equals the digest the report prints (4 of 4); `git log 7654aa5d..HEAD` on those four paths lists 0 commits |

### Done-condition probe output

Run twice: on the pushed working tree, and on a fresh `git archive` of `c3176fa5` extracted to an empty directory with the repository's `node_modules` linked in (the archive carries none, and `scripts/venue-source.mjs` imports `@xmldom/xmldom`). On both, the report, the record, the self-test output and the teeth output are byte-equal to the committed files (`cmp`: 4 of 4 on the tree, 4 of 4 on the archive).

```text
$ node outbox/venue-wikidata-roof-step-a-2026-11-12.mjs
24/24 checks passed
NO-GO. Criterion 1 leaves 0 candidate(s): the searches list 1 (P5833) and 1 is set aside because the description is not about a roof, so no property can pass criterion 5 (it must decide the roof of at least 1 of the 9 names).
$ node outbox/venue-wikidata-roof-step-a-2026-11-12.mjs --self-test
27 of 27 doctored copies caught by the check or number aimed at them; 0 not applied; control green
$ node outbox/venue-wikidata-roof-step-a-selftest-teeth-2026-11-12.mjs
20 of 20 broken copies refused by their own self-test, each naming the doctored input aimed at the broken check; control green
```

What each number is out of (the report's own coverage block, Rule 91):

```text
pages held 19 of 19; pages with their shape 19; query-service attempts recorded 4
candidates listed 1; set aside 1; retained 0; reads made 0 of 0 required over 396 items
P5624 control: answered 396 of 396; distinct 396; carrying a roof 0 of 396; items the latest run's rows carry 391 of 391 covered
class items referenced by retractable roof 5, domed stadium 14; among the items retractable roof 1 of 396, domed stadium 0 of 396
rows the class and the lead or infobox both decide 1; agree 1; class items with no result row 0
the 9 names whose roof is unsettled: among the items 9 of 9; among the items that reference a class 0 of 9 (Step 1's record counts 9)
```

### Observed on `78ba16bd`, not caused by this change

`live-check` 43348342619 (event `workflow_run`, after the scheduled `deploy` 43348238697) ran 01:54:46Z to 01:56:52Z and failed at the step "Render the deployed page and assert on it". Its annotation on `every card whose venue the table knows carries a live chip`, verbatim:

> 3 known venue(s) on this slate, 0 chip(s) filled. Attribution from the page's own window: host-silent — 6 request(s) over 14001ms, none received any response (the slate's budget is 14000ms, each request's cap 8000ms). A late node probe saw: unreachable — fetch failed (a later moment, not evidence about the page's window). The page reported: Weather is unavailable: all 3 venue requests failed. | Reported: MetLife Stadium: signal timed out after 8000ms; Raymond James Stadium: signal timed out after 8000ms; Malone Stadium: signal timed out after 8000ms. Request timings (start+duration): 1156+8000ms 1156+8001ms 1156+8001ms 9156+5999ms 9157+5999ms 9157+6000ms. Page built from: 78ba16b

Three more assertions failed with it: `every live chip carries a real roof caveat` and `every live chip reads as a temperature and nothing else` (each reports `[]`), and `the chips all filled within the wait` (`page.waitForFunction: Timeout 20000ms exceeded.`).

- What this change touches: `docs/` and `outbox/` files only (the two commits' file lists above).
- After it: the `live-check` I dispatched on `c3176fa5` (43349947319, created 02:08:01Z, 13 minutes after the red) passed. Of the 12 latest `live-check` runs read after the push: 9 success (the 8 before the red and that one), 2 failure (the red, and 43115011612 on `b3bceaa7`, 2026-11-11T22:49:58Z, not examined here), 1 skipped. Runs older than those 12 were not read.
- Existing CC-CMDs (BUILD-ON-A): a content search for `host-silent`, `signal timed out` and `Weather is unavailable` over `docs/`, `outbox/`, `scripts/`, `src/` and `test/` lists one CC-CMD, `docs/CC-CMD-2026-10-17-weather-live-http-outage.md` (Status DONE 2026-10-20). A name search for weather finds its split-out, `docs/CC-CMD-2026-10-20-weather-first-call-connect.md` (Status DONE 2026-11-03 by its own count of 28 of 28 weather steps success; its Status says "Building Task 1 anyway is the owner's call"). Both concern weather calls from runners that got no answer. Neither is open, so nothing was added to them and no CC-CMD was filed.
- Not established: why the page's requests got no response in that window, and whether the cause is the one those two CC-CMDs describe. One failing run followed by one passing run is two data points, and no cause is stated here.

### Residual

None from this work. Task 5's Done-when waits for the owner's answer on which follow-on follows, or neither (an owner decision, not deferred work). The commit that adds this section cannot name itself, and its `guards` run does not exist until the commit is pushed, so neither is in this file: `git log -1 -- outbox/cc-session-2026-11-12-wikidata-roof-step-a.md` names the commit, and the owner report carries the run.
