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
| the commit that adds this file | Step A: the evidence, the analysis script and its self-test, the record, this session doc, the CC-CMD's Result under Task 5 |

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

## Verified, and what is not

- Verified: 24 of 24 checks; 27 of 27 doctored copies caught; 20 of 20 broken copies refused by the self-test; the four protected files have no diff (`git diff --stat` empty) and their digests are in the record; no word `STAGED` in the new files.
- Not verified (the record's "What this does not show"): the 396 items' own statements under a property not named for a roof; other languages; other class items. The pages are not a runner's reading.
- Integration state (Rule 65): none. No endpoint, client consumer, relay contract or served page is involved.

## Carry-forwards

None. Task 5's Done-when waits for the owner's answer on which follow-on follows, or neither; no work is deferred to a later session.
