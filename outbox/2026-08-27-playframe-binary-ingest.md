# PlayFrame: binary ingest, and where the repo would let it land

`src/PlayFrame.fs` — an `ArrayBuffer`/`DataView` ingest path for a 24-byte
big-endian play record. Eight checks in `Suite.fs`; the F# suite goes 71 → 79.

## The probe, which decided the landing

The question was whether this could go in `src/` at all. Three findings settled
it, all read from HEAD rather than assumed:

1. **`scripts/unused-check.mjs` scans non-`private` `let` bindings in `src/*.fs`
   and fails any that nothing reads anywhere.** Dropping an unread module into
   `src/` fails on every public binding. Rule 63 is not documentation here, it
   is a gate. Its own words for the bar: *"no assertion has looked at it"* — so
   suite coverage satisfies it by definition, and that is the landing.

2. **STAGED is mechanical and does not fit.** `staged-verifier-check.mjs`
   requires `**STAGED** (verifier: <id> @ <repo>/<workflow.yml>)`, with the id
   present in `scripts/cc-cmd-followup.mjs` and the named workflow carrying a
   `schedule:`. Two consequences: `verify.yml` has no `schedule:` so it can
   never be a verifier, and the local registry is the CC-CMD ask list, which is
   for cross-repo asks to the relay. PlayFrame is neither. It is not tagged
   STAGED, and the reason is recorded here rather than left as an omission.

3. **Nothing in the repository produces one of these frames.** `grep -rln
   "ArrayBuffer\|DataView\|Uint8Array\|arrayBuffer()" src/ scripts/` returns
   nothing. Everything the laboratory ingests today is JSON from the relay.

So: the module lands in `src/`, `Suite.fs` is its only consumer, and that is
stated in the module header instead of being discovered later. The tests are
real. The producer is absent. The producer is the open item.

## What the design does differently from the .NET pattern it replaces

The proposal was `[<StructLayout(LayoutKind.Explicit, Size = 24)>]` +
`MemoryMarshal.Cast` + `byref` in-place endianness reversal. Compiled through
this repo's own toolchain, `Span`, `MemoryMarshal.Cast` and
`System.Buffers.Binary` are hard errors — and the struct attributes are worse
than errors: they compile clean and emit a plain JS object with no layout, no
offsets and no padding.

- **The endianness pass does not exist.** `getFloat32(offset, false)` reads
  big-endian directly, so the reversal loop, the second pass over every record,
  and the question of what a byte-swapped float32 bit pattern means before
  fixup all disappear together.
- **Truncation is a case, not a silence.** `MemoryMarshal.Cast` turns 25 bytes
  into one record and drops the rest. `PartialRecord(25, 1)` is asserted, with
  24 as the counterexample.
- **The scoring flag is a byte, never a `bool`.** A wire byte of 2 is an invalid
  `bool` instance under `Cast` and the CLR may take either branch. The check
  writes 2 and asserts it reads true.
- **The 64-bit id is guarded.** Fable maps `int64` to `BigInt` — a heap object
  per play, the allocation this path exists to avoid. Read as two 32-bit halves
  into a double, with `playIdIsExact` beside it: `hi <= 2^21 - 1`. 2097152 is
  the counterexample.
- **`Wire` writes through the same offset table.** One definition of the layout,
  used in both directions, so a round-trip assertion cannot be satisfied by the
  reader agreeing with itself.

`RecordBytes = 24` is kept; the original comment calling it "L1 cache alignment"
is corrected in place. A cache line is 64 bytes, so a 24-byte record straddles
one every third element. 24 is natural alignment for the `int64` at offset 0,
which is a real reason.

## Two errors found while building it, both worth keeping

**Fable compiled it; `dotnet build` refused it.** The `Emit` primitives were
`private` and the accessors `inline`. `dotnet fable` accepted that silently;
`check:proof`, the one verify step that runs the real F# compiler, returned
`FS1113: The value 'playId' was marked inline but its implementation makes use
of an internal or private function which is not sufficiently accessible`. The
primitives are public now, with that reason written at the declaration. Passing
Fable is not the same as the tree compiling.

**The zero-allocation assertion measured the JIT.** First version asserted the
heap grew under 256 KB across 200k records; it grew 359 KB and failed — on a
loop whose emitted form is `acc + v.getFloat32(o, false)` and a `getUint8`
compare, which cannot allocate. Measured across sizes:

```
       N     pass1        pass2      bytes/record (pass2)
  200000    806800       865304         4.3265
  400000    708496         3256         0.0081
  800000      3528         3384         0.0042
```

V8 warm-up, flat in N. The check's name and its measurement disagreed — the
same defect class this session has now found a dozen times, this time in my own
test. What the harness asserts instead is the property actually claimed: twice
the records must not cost twice the heap. A per-record object would be ~8 MB at
400k; measured growth is 3.3 KB.

That measurement lives in the scratch harness (`PlayFrameMain.fs`), not in
`Suite.fs`. A heap-growth threshold is a timing-sensitive assertion and putting
it on the push path would buy a flaky gate for a property the eight structural
checks already constrain.

## Open item

A producer. Until something emits a 24-byte frame, `Suite.fs` is the only
consumer and `unused-check` is what will notice if that stops being true.
