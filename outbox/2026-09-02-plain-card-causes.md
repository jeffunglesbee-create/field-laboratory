# The thirteen that stay plain — measuring the cause before proposing a fix

65 of 78 cards tint. The thirteen that do not were reported as three facts, and
only one of the three was ever measured.

## The two claims that need checking

**"ESPN does not serve the club" (7 cards).** The alternate-colour probe reported
CFB at **exactly 50 teams**. That is not a fact about college football — it is
ESPN's default page size, and no call in this repo passes `limit`. If that is the
cause, six of the thirteen are one query parameter away and none of them is a
coverage limit at all.

**"No combination of published colours works" (5 cards).** Stated as though the
source were beyond question. This session already established it is not: ESPN's
`color` for European football is the **kit**, not the club — Bundesliga came back
with nine colours across thirty-four entries. "Angers and Auxerre carry the same
two colours" and "ESPN happens to describe both by the same kit" are different
claims with opposite remedies, and nothing has separated them.

The third fact — `Los Angeles Football Club` shares no token with ESPN's `LAFC` —
is measured and settled.

## What the probe measures

1. **`?limit=900` against the bare call, per league.** `pageVerdict` refuses to
   read a count on its own: a default page size and a league that genuinely has
   fifty teams are identical in a count, and only asking for more separates them.
2. **The failing condition per card**, which is the split that decides the
   remedy:

   | cause | what it means | remedy |
   |---|---|---|
   | `no-colours` | a side resolved to nothing | coverage |
   | `one-unreadable` / `both-unreadable` | every colour a side has derives a tint that does not read as a colour on this page | a fact about the **source** |
   | `too-close` | both sides have a usable colour and they still collide | a fact about the **fixture**; the rule is working |

   A side whose every colour is unusable fails no matter who it plays. Two sides
   that each have a usable colour but cannot be told apart is a different thing
   entirely, and only the second is the rule doing its job.
3. **Whether ESPN serves any colour for CFL**, which the alternates table hinted
   at — 9 teams, 0 with a distinct alternate — without saying whether that is one
   colour each or none.

## Teeth

14 self-tests. Five mutations, each dropping the count:

| mutation | result |
|---|---|
| pagination never detected | 13/14 |
| `one-unreadable` collapsed | 13/14 |
| readability ignored when judging a collision | 11/14 |
| `no-colours` collapsed | 13/14 |
| `both-unreadable` collapsed | 13/14 |

The first pass at this table was worthless and said so only because the harness
printed a Python error: three of the four `sed`-style replacements never applied,
and the unmutated file honestly reported 14/14 three times. The runner now
asserts that the mutation actually landed before believing the count — the same
defect this session keeps finding, an instrument reporting on something other
than what it names.

## Not proposed here

No fix is committed with this. The point of the probe is that three of the four
remedies differ depending on what it finds, and choosing between them first is
how the wrong one ships.

---

## The reading

```
  league                        bare   limit=900   with colour   verdict
  CFB                            50         760           690   paginated
  CFL                             9           9             0   complete
  ...every other league          =bare      =bare         =all   complete
```

**CFB was pagination.** 50 was ESPN's default page size, exactly as suspected;
the endpoint holds 760 teams and 690 of them carry a colour. Twenty of the
twenty-one leagues were already complete, so this was one league's worth of a
silent truncation that had been written down as a fact about the sport.

**CFL serves nine teams and zero colours.** Not a page-size artifact and not a
resolution failure — the field is simply absent for that league, which also
explains its 0-of-9 alternates in the earlier reading.

### Every card, re-classified against the paged lists

```
    renderable         67      <- 65 today
    no-colours          6
    one-unreadable      1
    both-unreadable     0
    too-close           4
```

**Paging alone recovers two cards** — North Carolina v TCU and Memphis v UNLV —
and that number is measured with any losses already netted out: a name unique
among 50 teams can become ambiguous among 760, and the resolver correctly
refuses those.

### The six `no-colours` are two different problems

```
MLS  Los Angeles Football Club v D.C. United  (none)  vs  #000000/#d61018
CFL  Montreal Alouettes v Winnipeg Blue Bombers  (none) vs (none)
CFB  NC State v Virginia                      (none)  vs  (none)
CFB  N Dakota St  (side of Jax State v ...)   (none)
CFB  E Michigan   (side of Sacramento St v ...) (none)
CFB  New Mexico St v Florida St               (none)  vs  (none)
```

CFL is the source. The four CFB sides are **the tokeniser**, and the cause is
exact:

```
NC State       -> {state}
N Dakota St    -> {dakota}
E Michigan     -> {michigan}
Florida St     -> {florida}
Virginia       -> {virginia}
New Mexico St  -> {new, mexico}
```

`tokens` drops every word of two characters or fewer, which throws away
precisely the discriminating part — `NC`, `N`, `E` — and leaves a stem that
several of 760 teams answer to. The resolver then refuses, correctly, because
picking one would invent a club's colour. Note `Jax State -> {jax, state}`
resolves fine: three characters survive the filter.

So this is not a matching bug. It is `tokens` throwing away the identity before
the matcher ever sees it, and the fix lives there — which moves `sameTeam`, and
with it `sameFixture` and the duplicate-fixture watcher. That is the blast radius
already flagged when `findTeam` was fixed in isolation, and it still wants its own
probe rather than a change made in passing.

### The five colour failures are all genuine, and one is suspicious data

```
one-unreadable  EPL      Hull v Coventry    #f28800/#ffffff*  vs  #87cced*/#ffffff*
too-close       MLS      Vancouver v Sporting KC   #ffffff*/#12284c  vs  #a7c6ed*/#0a2240
too-close       Ligue 1  Angers v Auxerre   #1a1a1a/#ffffff*  vs  #ffffff*/#1a1a1a
too-close       NFL      Lions v Colts      #0076b6/#bbbbbb*  vs  #003b75/#ffffff*
```

Coventry really is sky blue and white, and both derive tints that read as this
page's own text. That is a page constraint, not bad data: a pale foreground
cannot be told from light text on a dark ground, and the rule is right to refuse.

Vancouver and Sporting KC both come down to a navy — `#12284c` against `#0a2240`.
Lions and Colts to two blues. Those are real collisions and plain is correct.

**Angers and Auxerre carry byte-identical pairs**, `#1a1a1a/#ffffff` both ways
round. Angers' colours are black and white; Auxerre's are white and blue. Two
clubs with the same pair to the byte is the shape of a placeholder, not of two
clubs. Worth flagging, not worth acting on from here — correcting it needs a
source, and inventing one is the fabrication this project refuses.

## What shipped with this reading

`?limit=900` at all three ESPN call sites — the coverage probe, the alternate
probe, and the generator. One league was truncated; twenty were not; the
parameter costs nothing on the twenty.

## What did not, and why

| | remedy | blocked on |
|---|---|---|
| 4 CFB cards | keep short words in `tokens` | moves `sameFixture` and the duplicate-fixture watcher — needs its own probe |
| 1 `Los Angeles Football Club` | an explicit alias | a fact someone writes down, not one a matcher infers |
| 1 CFL card | another colour source | ESPN has no colour for that league |
| 4 colour collisions | nothing | the rule is working; plain is the honest rendering |

---

## Resolved: 65 -> 71, and two of my own diagnoses died on the way

Regenerated with `?limit=900`. The table went 1705 -> **5539 entries** and the
page went **65 -> 71 of 78**.

The probe predicted 67. It resolves through `findTeam`, which refuses an
ambiguous subset match; the page reads a table that now holds ESPN's own
strings. The prediction was the conservative one and the measurement is the
number.

### Both remedies I proposed for the CFB names were wrong

**"Keep short words in `tokens`."** Measured against ESPN's real naming:

| spelling | candidates now | with short words kept |
|---|---|---|
| NC State | 6 | **1** — fixed |
| Virginia | 3 | 3 — unchanged |
| N Dakota St | 2 | **0** — broken |
| E Michigan | 3 | **0** — broken |
| New Mexico St | 2 | **0** — broken |
| Florida St | 2 | **0** — broken |

`st` is not `state` and `n` is not `north`. It also breaks `D.C. United` against
`DC United`, which works today. One fixed, four broken, one regression.

**"They need an explicit alias table."** Also wrong, and the reason is the sort of
thing only running finds: ESPN's own `shortDisplayName` for those clubs **is** the
relay's abbreviation.

```
"CFB", "E Michigan",    "#006938", "#ffffff"
"CFB", "Florida St",    "#782f40", "#ceb888"
"CFB", "N Dakota St",   "#01402A", "#ffffff"
"CFB", "NC State",      "#cc0000", "#ffffff"
"CFB", "New Mexico St", "#7e141b", "#231f20"
"CFB", "Virginia",      "#232d4b", "#f84c1e"
```

The generator stores every spelling a club answers to, so the moment the full
760-team page arrived the table carried those strings and the page's exact lookup
found them. Six cards, no matcher change, no alias, no design decision.

The fuzzy matcher was the wrong instrument to ask. It answers "which club is this
probably", and the table answers "which club serves this exact string" — and the
second question already had the answer.

### The seven that remain are the floor

```
MLS      Sporting Kansas City v Vancouver Whitecaps FC   two navies
MLS      Kansas City v Vancouver                          the same fixture, short spellings
NFL      Lions v Colts                                    two blues
EPL      Coventry v Hull                                  Coventry is sky blue and white
Ligue 1  Auxerre v Angers                                 byte-identical pairs
MLS      D.C. United v Los Angeles Football Club          no shared token with `LAFC`
CFL      Montreal Alouettes v Winnipeg Blue Bombers       ESPN serves 0 colours for CFL
```

Five are the rule working. One needs an alias written down. One needs a source
that does not exist here.

### The probe that outlived its motivating case

`probe-unresolved-spellings` was written for six cards and finished with one. It
is kept, and its header now says so: a spelling gap is a recurring shape in this
repo, `Los Angeles Football Club` is still open, and the alternative to the probe
is guessing. It decides nothing — it lists ESPN's plausible candidates so an
alias is written from evidence.

Its own self-tests caught me making the session's signature error twice, inside
the test cases: `N Dakota St` asserted to fit `North Dakota Sioux` (`st` is not a
prefix of `sioux`), then `West Virginia` asserted NOT to fit `Virginia` (it does —
`virginia` is a prefix of its own second word). Both written from reading, both
answered in a second by running.

---

## The alias, written down

`Los Angeles Football Club` is the one remaining gap a decision can close, and
the capture supplies its own evidence:

```
MLS | Los Angeles Football Club | D.C. United | id 2026-08-29-mls-dc-lafc
MLS | LAFC                      | D.C. United | id MLS_2026-08-29_dcunited_lafc
```

The same fixture, the same day, D.C. United at home both times. The relay itself
asserts the two spellings are one club — and the two ids are the dash and
underscore schemes, so **the evidence is the MLS dual-writer duplicate this
session has been tracking in the relay**.

`ALIASES` is a list of facts with their evidence attached, applied after the
slate sweep so a spelling the relay actually served always wins on its own and an
alias is only ever the last resort. `Desk.fs` objects to a normaliser because it
is "a place for two spellings to **silently** become one". Nothing here is
silent: an alias appears in the generated table as an ordinary readable row, and
the entry says where it came from.

Two properties matter more than the mechanism:

- **The target is matched exactly.** `LAFC` must not reach `LAFC II`.
- **An alias whose target is absent or ambiguous refuses the whole run.** A
  silently dropped alias rots the moment ESPN renames a club, and it rots
  invisibly — the only symptom is a card quietly rendering plain, which is
  indistinguishable from every other reason a card renders plain.

### Teeth

29 self-tests. Five mutations, each dropping the count:

| mutation | result |
|---|---|
| exact target match becomes a substring match | 28/29 |
| a missing target is skipped rather than reported | 27/29 |
| an ambiguous target is accepted | 28/29 |
| the league is ignored | 28/29 |
| evidence is not required | 28/29 |

**The last one survived the first pass at 28/28.** The check asserted only
`ALIASES.every(hasEvidence)`, and the single shipped alias satisfies the rule
either way — so replacing the whole condition with `true` changed nothing. A
predicate asserted only against data that already passes is not asserted at all.
It now carries its counterexamples: an alias with no `why`, and one whose `why`
is the word "because".
