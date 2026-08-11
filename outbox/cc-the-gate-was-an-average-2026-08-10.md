# The gate was an average, and it rotted as it grew — 2026-08-10

Jeff asked whether confidence ran per item or cumulatively. Cumulatively — and
that was wrong in a way that had been getting quietly worse all day.

## What the arithmetic actually did

`earned / possible`, summed across every row, with a pass at 95. So a failing
row was affordable when enough others passed. Measured against the real suite:

```
if this row alone FAILS, out of 225 possible points:
   10 pts   96/100  PASSES THE GATE   build is clean
   10 pts   96/100  PASSES THE GATE   decoders still REJECT the corrupted fixture
   10 pts   96/100  PASSES THE GATE   game state is correct at fixed instants
   10 pts   96/100  PASSES THE GATE   FIELD-zone day is correct
   10 pts   96/100  PASSES THE GATE   pick decoders match the live response
   10 pts   96/100  PASSES THE GATE   workflow jobs can run what they invoke
   10 pts   96/100  PASSES THE GATE   every governed commit paired with outbox
   10 pts   96/100  PASSES THE GATE   this session wrote its outbox
   10 pts   96/100  PASSES THE GATE   source changes arrive with an outbox entry
   10 pts   96/100  PASSES THE GATE   decoders accept both real captures
   15 pts   93/100  blocked
   20 pts   91/100  blocked
   25 pts   89/100  blocked
```

**Ten of seventeen rows could fail alone and the gate would still pass.**

## The part that makes it worse

The same 10-point failure, at each size the suite has been today:

```
120 pts -> 92   blocked
130 pts -> 92   blocked
140 pts -> 93   blocked
165 pts -> 94   blocked
180 pts -> 94   blocked
190 pts -> 95   PASSES
210 pts -> 95   PASSES
225 pts -> 96   PASSES
```

**Every row added made the next failure cheaper.** The gate crossed its own bar
somewhere around 190 points — which happened today, while I was extending it. No
commit introduced this. It accumulated, and every commit that improved coverage
degraded strictness.

A gate whose whole purpose is that no overstated claim reaches main would, as of
this morning, have let a corrupted-fixture regression through.

## The fix

A gate is a conjunction, not an average. **Every row must pass.** The percentage
is still reported, because the CC-CMD ceremony asks for a number, and it now
decides nothing — it is printed *after* the verdict so nobody reads it first.

None of these rows is a matter of degree. Each is an invariant that holds or
does not, and an average lets a passing majority vote a real defect through.

Demonstrated: a deliberately failing 10-point row, which scored 96 and passed
under the old arithmetic, now exits 1.

## A second half-working thing, found while testing the first

`--quick` exited 0 unconditionally — "not a gate result", so it never reported
anything. But a row that actually **ran** and **failed** is a real failure
whatever else was skipped. Quick mode was a check that could only ever deliver
good news.

It now cannot claim a pass (it skipped rows) but does exit non-zero on any row
that ran and failed. That is also what made the conjunction cheap to test
without a twenty-minute run.

## Every item re-scored

With weights no longer gating anything, their old values were meaningless — and
they had accreted one row at a time, each number chosen against whatever the
total happened to be that hour. So all seventeen were re-derived at once against
a single rubric, now stated at the top of `docs/gate-rows.txt`:

| weight | meaning |
| --- | --- |
| **30** | a user is told something untrue, or shown nothing at all |
| **20** | detection is lost — the product may be fine, the ability to notice is not |
| **10** | the record is wrong — nothing breaks today, we misremember later |

| | before | after |
| --- | --- | --- |
| decoders accept both real captures | 10 | **30** |
| FIELD-zone day is correct at fixed instants | 10 | **30** |
| game state is correct at fixed instants | 10 | **30** |
| pick decoders match the recorded live response | 10 | **30** |
| grouping and date navigation pass | 15 | **30** |
| tabs work and the pick score never renders | 15 | **30** |
| pick'em grades only finished games | 15 | **30** |
| the sparkline shows the value, not a silhouette | 15 | **30** |
| render checks pass on both captures | 20 | **30** |
| build is clean, zero F#/NuGet warnings | 10 | **20** |
| decoders still REJECT the corrupted fixture | 10 | **20** |
| workflow jobs can run the scripts they invoke | 10 | **20** |
| doc claims are compiler-verified, not prose | 25 | **20** |
| breaking each invariant makes a check fail | 20 | 20 |
| every governed commit paired source with outbox | 10 | 10 |
| this session wrote its outbox | 10 | 10 |
| source changes arrive with an outbox entry | 10 | 10 |

Nine of seventeen are 30, and that is the honest reading rather than inflation:
this suite mostly defends against telling the user something false. The two that
went **down** are worth naming — the proof-doc row was the heaviest at 25 because
it was the row that had once failed, which is recency, not cost. A proof doc
going stale loses detection; it does not itself mislead a user.

## What this does not fix

The rubric is a judgement, applied by one person in one sitting. It is written
down so it can be argued with, which is more than the old numbers offered, and
it is not evidence of anything. The conjunction is the part that is mechanical.

## Verification

| | |
| --- | --- |
| a failing 10-pt row under the old arithmetic | 96/100, passed |
| the same row now | exit 1, named in the failure list |
| `--quick` with a failing row | exit 1 (was exit 0) |
| `gate-inventory` after re-scoring | 7/7, both files agree |

---

## Every item re-scored per item, and the ones under 95 fixed

Jeff: *"Those that are under 95 must be resolved to 95 or higher."* Under a
conjunction the gate reports each row as weight/weight, which is only "did this
command exit 0 today" — a fact about the tree, not confidence in the row.

`scripts/row-confidence.mjs` scores each row on what it can be wrong about:

| | |
| --- | --- |
| **TEETH (70)** | a mutation breaks this row's invariant and THIS ROW is what fails |
| **DETERMINISTIC (30)** | the row's scripts do not read the clock or the network |

Both are needed to clear 95. Whether the row passes today is deliberately not
scored — that is what the gate measures, and duplicating it would let a green
light stand in for evidence again.

**First run: 4 of 17 rows cleared the bar.** Thirteen rows had nothing proving
they could fail.

### Closing the gap

Twelve new mutations, plus two ideas the existing harness could not express:

- **`run-row.mjs`** runs one gate row by name, so a mutation's expectation is
  the row itself rather than a script that resembles it. The outbox and history
  rows have their logic inside `gate-checks.mjs` and could not be covered at all
  before.
- **World mutations** change what a row measures rather than the source — moving
  a session's outbox aside, stubbing it, moving the history boundary. Mutating
  those rows' own source would be circular.

`zone-check` also lost a point of nondeterminism: it read `new Date()` three
times, so two lines either side of midnight could disagree for a reason having
nothing to do with zones. Captured once as `NOW`, which is the discipline
`gameStateAt` already follows.

**Now 18/18 rows at or above 95, and 27/27 mutations killed.**

### Two guards that could not test themselves

The mutation harness and the row scorer both have the same problem: blind them
and everything turns green. Each now carries a case that is *supposed* to fail —

- `known-survivor` breaks something deliberately undefended; the harness must
  report it as a survivor, so `--only known-survivor` **failing** is the proof.
- `row-confidence --self-test` scores a synthetic toothless row and requires it
  below the bar.

And each has a mutation that blinds it (`harness-blind`, `scorer-blind`) which
those self-tests catch.

### The self-reference bug that cost twenty minutes

`harness-blind` kept reporting SURVIVED while a manual run of the same steps
worked. The cause: when the harness mutates **its own file**, the `find` string
it searches for also exists in the MUTATIONS table *above* the code it targets —
as the literal defining the mutation. `replace` hit that first, rewrote the
mutation's own definition, and left the logic untouched. The mutation appeared
to survive because it never happened.

Fixed by mutating only the region after the table. Recorded because it is the
exact class this harness exists for: a result that is wrong for a reason
unrelated to the thing being measured.

### One mutation is weaker than the others, and says so

`outbox-pairing-blind` breaks the outbox half of the pairing predicate directly.
The first version appended a line to a source file and expected the row to
fail — it survived, because this working tree already had outbox changes, so
the row correctly said both had changed. **The mutation was measuring the state
of my desk, not the rule.**

Moving the outbox aside would work and was not worth risking a failed restore
losing a session's write-ups. So it proves the row's verdict flows from that
predicate, and does not prove the row is right on a clean tree. Stated in the
mutation itself, not only here.

---

## What FIELD's own record says about the 95 threshold

Searched Drive for the full context. The most relevant document is
`CC-CMD: Replace scoreProse's composite-rubric retry gate with a qualitative
voice judge` (2026-07-16), and it is worth reading closely because it is
**honest, careful work that the arithmetic still let through.**

Its scoring:

```
TASK 0 (30 pts):  30/30
TASK 1 (45 pts):  45/45
TASK 2 (25 pts):  17/25   full marks withheld — a live proxy call proving the
                          judge works against a real LLM was blocked by the
                          sandbox's network policy
Total: 92/100
```

Then, verbatim:

> Score is below the 95 commit threshold. Per this session's established pattern
> (matching `brief-game-kv-id-convention`'s **63/100** disposition): the fix code
> is already correct … deploying it is not a correctness risk.

Three things follow from that, and none of them is a criticism of the session
that wrote it:

**1. Production already scores per item and then sums.** TASK 0/1/2 are
individually scored and totalled — which is exactly the cumulative arithmetic
this entry started by fixing. TASK 2 was materially incomplete, and 30/30 and
45/45 carried it to 92.

**2. The threshold has been overridden at least twice** — 92/100 here, and
63/100 cited as precedent. A "95 commit threshold" that is passed by writing a
paragraph is a convention, not a gate. The paragraph was true and the reasoning
was sound; that is the point. Nothing mechanical had to agree.

**3. Under a conjunction, TASK 2 at 17/25 blocks.** Not because 17/25 is a bad
score, but because the thing it was withholding marks for — proving the judge
works against a real LLM — either happened or did not. The honest disposition
would then be to record the block and ship deliberately, which is a decision
someone makes, rather than a number that quietly permits it.

This laboratory's gate cannot be talked past, and that is its entire claim over
production's. It is also why the gate refusing a commit three times today is
evidence it works rather than friction.
