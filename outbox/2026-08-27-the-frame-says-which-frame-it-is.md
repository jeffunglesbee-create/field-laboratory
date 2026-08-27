# The frame says which frame it is

`PlayFrame` records now carry a format version, and a reader that does not know
the version **refuses** instead of interpreting. Suite 82 → 85.

## The failure this closes

A binary layout has one failure mode JSON does not. Given bytes some other build
wrote, a JSON reader gets a missing key; a binary reader gets *numbers* — read
out of the wrong offsets, arriving as though measured, with no error anywhere.

This session spent a day on the softer version of exactly that. verify tests the
deployed site, deploy runs after verify, and twice I read a run as evidence about
a build it had not measured — once at run 159 this morning, once on preconnect at
13:24. The fix both times was to make the run state which bytes it read. Same fix
one layer down: byte 21 is the layout, and `frame` refuses anything else.

It costs nothing. The record is 24 bytes for the `int64`'s alignment either way,
so bytes 21–23 were padding. The version and two reserved bytes are free.

## Two refusals, not one

```fsharp
| UnknownLayout of version: int * atRecord: int
| ReservedInUse of atRecord: int
```

A declared version bump and an undeclared extension are different mistakes with
different fixes — one means "teach this reader layout 2", the other means "a
writer used a field this version says is zero". Collapsing them would be the
same move this repo refuses everywhere else.

`frame` checks **every** record, not the first. A sampled check is one that
passes on the bytes it did not look at; the cost is one byte read per 24, which
is nothing beside what a consumer then does with the record.

## Two things the change itself caught

**Six existing checks went red at once.** All of them hand-build a buffer and
hand-write two fields. They were not wrong — a raw `ArrayBuffer` is zeroed, so
every record declared layout 0 and was correctly refused. The fix is the better
design anyway: `Wire.allocate` now stamps the version into every record, which
gives the invariant a name — *a buffer from `allocate` is a valid frame of this
layout* — and removes the one byte a caller could forget.

**My totality check had no teeth, and the harness said so.** First version
corrupted record `n`, asserted the refusal named record `n`, and used 0 as the
counterexample. Corrupting record 0 is also detected, so the counterexample
passed too — `NO TEETH`. Nothing about a record *index* can be a counterexample
here. The input now carries both the record corrupted and the record the refusal
is expected to name, so the counterexample is a wrong **answer**: corrupt the
last record, expect record 0 named. True only for a reader that reports a fixed
location instead of the one it found.

## What this does not change

`LeverageIndex` still has no producer anywhere, and `WinProbability` has
producers (`soccer-wp.js`, the Odds API resolver) but none on the NFL play path.
Both stay optional and both write NaN when absent. Narrowing the layout to drop
`LeverageIndex` is now a **safe** change rather than a risky one — that is what
the version is for — but it is a separate decision and not this commit.

## Local

`check:verify` 85/85 held, `check:proof` 71/71, weather-burst 11/11, unused,
clean-source, import-purity. No injections stranded.
