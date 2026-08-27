module PlayFrame

open Fable.Core
open Fable.Core.JsInterop

// Binary ingest for the high-frequency play feed.
//
// NOTHING IN THIS REPOSITORY PRODUCES ONE OF THESE FRAMES YET. Every consumer
// of every binding below is `Suite.fs`. That is stated here rather than left to
// be discovered, because `unused-check` enforces exactly this and would fail on
// each public binding the moment the suite stopped reading it — a public value
// no assertion looks at is the `went_to_ot` shape that check exists to catch.
// Suite coverage satisfies it by that check's own definition ("no assertion has
// looked at it"), and it is still worth being plain: the tests are real, the
// producer is absent, and the open item is the producer.
//
// WHY THIS IS NOT THE .NET PATTERN IT REPLACES. The proposed design was
// `[<StructLayout(LayoutKind.Explicit, Size = 24)>]` + `MemoryMarshal.Cast` +
// `byref` in-place endianness reversal. Compiled through this repo's own
// toolchain (`dotnet fable`), `Span`, `MemoryMarshal.Cast` and
// `System.Buffers.Binary` are hard errors, and the struct attributes are
// WORSE than errors: they compile clean and emit a plain JS object with no
// layout, no offsets and no padding. A 24-byte record that nothing can observe
// is a comment.
//
// So the layout lives where it is real — in the offsets below, applied to the
// bytes themselves. The bytes ARE the data structure. Nothing is decoded into
// an object, which is the same posture `MemoryMarshal.Cast` was reaching for
// and the only one JS can actually honour.
//
// THE ENDIANNESS PASS DOES NOT EXIST HERE. `DataView` takes the byte order per
// read, so big-endian wire data is read directly. The `reverseEndiannessInPlace`
// loop, the second pass over every record, and the question of what a
// byte-swapped float32 bit pattern means before it is fixed up all disappear
// together — there is no window in which the value is garbage, because the
// value is never materialised until it is correct.

// WHICH OF THESE FIELDS MAY BE PRODUCED RELAY-SIDE.
//
// Checked against `jubilant-bassoon/docs/ADR-002-CONTEXT.md` at HEAD and against
// the newest governing Drive read, not assumed — because the architecture brief
// this layout came from named a third metric, "Win Probability Volatility",
// that does not exist in any FIELD repository.
//
// The thing it most resembles is `getVolatilityIndex`
// (`jubilant-bassoon/src/legacy/field.js:6986`), and that computes the variance
// of the DRAMA SCORE, not of win probability. Its build spec (Drive
// 1FS71I5gJV0OJVY6i6IKKxLrmIvHX_mu4XO_gZfZ7q98, 2026-05-19) says so in one
// line: "Volatility = variance in drama score samples over recent polling
// window." The implementation matches the spec's formula; it narrows the spec's
// three tiers to two labels and returns null in between.
//
// The spec is 2026-05-19 and was therefore re-verified forward rather than
// cited as-is (Rule 73). Two later documents bear on it:
//
//   * `CC-CMD-2026-08-02-ruwt-baseline-audit` (Drive 1Jo9jHPPBqf3..., 2026-08-03)
//     is the newest governing read. It states the two-part test explicitly —
//     "Both tests (Rule F content, Rule A delivery) must independently hold —
//     passing one doesn't clear the other" — and confirms by grep that
//     `dramaScoreLive` / `computeWatchValue` / `preGameScore` are NOT computed
//     or served by any production relay route today. A future relay-side
//     migration of them is permitted under Rule C, subject to A and B.
//   * `FIELD — Wow Features: CFB + NFL` (Drive 1h5YPOiXt1Qz..., 2026-08-02)
//     proposes a "RANKING VOLATILITY FLAG" for CFB poll churn. Unbuilt, and an
//     entirely different quantity. Named here only so the collision is on the
//     record before someone wires the wrong one into this layout.
//
// So, precisely:
//
//   * WinProbability and ExpectedPointsAdded are commodity. ESPN and nflfastR
//     publish both; Rule F's own worked example is `soccer-wp.js` running
//     Poisson + Dixon-Coles relay-side. Relay-safe, on pull.
//   * A volatility INDEX — a bare variance — is a scalar of the same class as
//     the drama score it derives from. Rules B and C permit that relay-side
//     subject to Rule A: served on pull, never wired to an autonomous push.
//     It is not automatically barred, and saying it was would be wrong.
//   * A volatility LABEL is barred. `getVolatilityLabel` returns "chaotic" or
//     "locked in" only when volatility and smoothed drama clear thresholds
//     together, which is a value whose receipt answers "should I watch this
//     game?" — Rule F, regardless of how the field is named.
//
// LeverageIndex is commodity (Tango's index is published) but nothing in any
// FIELD repository computes it. The field is in the layout because the layout
// came with it; its producer does not exist.

// --- the wire layout ---------------------------------------------------------
//
// 24 bytes, big-endian. Bytes 21-23 are unused: the record is padded to a
// multiple of 8 so the 64-bit id at offset 0 sits on its natural boundary in
// any consumer that does care about alignment.
//
// Recorded as a comment in the original: "Padded to 24 bytes for L1 cache
// alignment." That is not what 24 bytes buys. A cache line is 64 bytes, so a
// 24-byte element straddles one every third record. This is natural alignment
// for the int64, which is a real reason, and it is written down as the real
// one.

let [<Literal>] RecordBytes = 24

/// The layout this reader understands.
///
/// A binary format has one failure mode JSON does not: a reader given bytes some
/// other build wrote does not fail, it MISREADS. No exception, no missing key —
/// just numbers off by an offset, arriving as though measured. This session
/// spent a day on the softer version of that (a check measuring a build that
/// predated the change it was testing) and the fix there was to make the run
/// state which bytes it read. Same fix, one layer down: every record says which
/// layout it is, and a reader that does not know that layout REFUSES instead of
/// interpreting.
///
/// It costs nothing. Byte 21 was padding — the record is 24 bytes for the
/// int64's alignment either way, so the version and the two reserved bytes are
/// free.
let [<Literal>] FormatVersion = 1

module Offset =
    let [<Literal>] PlayId = 0               // int64, bytes 0-7
    let [<Literal>] WinProbability = 8       // float32, bytes 8-11
    let [<Literal>] ExpectedPointsAdded = 12 // float32, bytes 12-15
    let [<Literal>] LeverageIndex = 16       // float32, bytes 16-19
    let [<Literal>] ScoringFlag = 20         // uint8,   byte 20
    let [<Literal>] FormatVersion = 21       // uint8,   byte 21
    let [<Literal>] Reserved = 22            // bytes 22-23, must be zero

// --- bindings ----------------------------------------------------------------
//
// Written as `Emit` rather than taken from whatever Fable.Core happens to bind,
// for one reason worth the verbosity: the big-endian flag is visible at every
// read site. `getFloat32(o, false)` cannot be mistaken for a little-endian read
// the way a shared helper named `readFloat` can.

type ArrayBuffer = interface end
type DataView = interface end

[<Emit("new DataView($0)")>]
let private viewOf (b: ArrayBuffer) : DataView = jsNative

[<Emit("$0.byteLength")>]
let byteLength (b: ArrayBuffer) : int = jsNative

// PUBLIC, and not by preference. The accessors below are `inline`, and F# forbids
// an inline function from reaching a private implementation — `dotnet build` says
// FS1113 and refuses. Fable compiled the private version without complaint, which
// is the useful part of the finding: passing `dotnet fable` is not the same as
// the tree compiling, and `check:proof` is the step that runs the real compiler.
//
// `inline` stays because it is what puts `v.getFloat32(o, false)` at the call
// site in the emitted JS rather than a function call per field, and that emitted
// form is what the allocation measurement was taken against.
[<Emit("$0.getUint32($1, false)")>]
let u32be (v: DataView) (o: int) : float = jsNative

[<Emit("$0.getFloat32($1, false)")>]
let f32be (v: DataView) (o: int) : float = jsNative

[<Emit("$0.getUint8($1)")>]
let u8 (v: DataView) (o: int) : int = jsNative

// --- the frame ---------------------------------------------------------------

/// What a payload turned out to be.
///
/// `MemoryMarshal.Cast` answers this by SILENTLY TRUNCATING: a 25-byte payload
/// casts to one record and the trailing byte vanishes, so a truncated frame
/// processes as N whole records and reports success. That is the failure this
/// union exists to refuse, and the reason it is a union rather than a length
/// check the caller is trusted to remember.
type Frame =
    /// No bytes. A real, quiet answer — not an error and not a truncation.
    | NoRecords
    /// A whole number of records, and a view positioned over them.
    | Records of view: DataView * count: int
    /// Bytes that are not a whole number of records. Named with the remainder,
    /// because "how much is left over" is the first thing anyone asks.
    | PartialRecord of byteLength: int * remainder: int
    /// A record declares a layout this reader does not know. Carries the version
    /// it found and where, so the report names the mismatch rather than the
    /// symptom.
    | UnknownLayout of version: int * atRecord: int
    /// A byte this version defines as zero is not zero: the writer knew about a
    /// field this reader does not. Distinct from `UnknownLayout` because it is a
    /// different mistake — an undeclared extension rather than a declared bump —
    /// and they are fixed differently.
    | ReservedInUse of atRecord: int

/// Classify a payload. The only constructor for `Frame`, so a caller cannot
/// build `Records` over a buffer that does not divide.
let frame (buffer: ArrayBuffer) : Frame =
    let n = byteLength buffer
    if n = 0 then NoRecords
    elif n % RecordBytes <> 0 then PartialRecord(n, n % RecordBytes)
    else
        let v = viewOf buffer
        let count = n / RecordBytes
        // EVERY record, not the first one.
        //
        // Sampling would be cheaper and would be a check that passes on the
        // bytes it did not look at — the vacuity this repo keeps finding. The
        // cost is one byte read per 24, which is nothing beside what any
        // consumer then does with the record, and it makes the guarantee total:
        // if this returns `Records`, every record in it is this layout.
        let mutable bad = -1
        let mutable reserved = -1
        let mutable i = 0
        while i < count && bad < 0 && reserved < 0 do
            if u8 v (i * RecordBytes + Offset.FormatVersion) <> FormatVersion then bad <- i
            elif u8 v (i * RecordBytes + Offset.Reserved) <> 0
                 || u8 v (i * RecordBytes + Offset.Reserved + 1) <> 0 then reserved <- i
            i <- i + 1
        if bad >= 0 then UnknownLayout(u8 v (bad * RecordBytes + Offset.FormatVersion), bad)
        elif reserved >= 0 then ReservedInUse reserved
        else Records(v, count)

// --- field access ------------------------------------------------------------
//
// One function per field, taking the view and the record index. No object is
// built, so a slate of ten thousand plays allocates the ArrayBuffer and nothing
// else. This is the `Span<LivePlayState>` indexer, in the only form JS has.

/// The id, as a Number.
///
/// JS has no int64 that is also a primitive. Fable maps `int64` to `BigInt`, and
/// a BigInt is a heap object — one per play is precisely the allocation this
/// path exists to avoid. So the id is read as two 32-bit halves and combined.
///
/// That is exact to 2^53-1 and silently wrong above it, which is why
/// `playIdIsExact` sits beside it instead of a comment claiming ids are small.
/// Read unsigned: a negative play id is not a thing this feed emits, and
/// pretending to handle one would be a fourth meaning nobody has a use for.
let inline playId (v: DataView) (i: int) : float =
    let o = i * RecordBytes + Offset.PlayId
    u32be v o * 4294967296.0 + u32be v (o + 4)

/// Whether this record's id survives the trip through a double.
///
/// hi * 2^32 + lo <= 2^53 - 1 with lo at most 2^32 - 1 gives hi <= 2^21 - 1.
let inline playIdIsExact (v: DataView) (i: int) : bool =
    u32be v (i * RecordBytes + Offset.PlayId) <= 2097151.0

/// Whether a float field carries a measurement at all.
///
/// A float32 has no spare value for "not measured": 0.0 is a real EPA and a real
/// win probability. NaN is the one bit pattern that cannot be mistaken for one,
/// and — the reason it was chosen over a presence bitfield in the spare bytes
/// 21-23 — it PROPAGATES. A sum across a slate that includes an absent value is
/// NaN, so absence cannot be quietly averaged into a number. A flag can be
/// ignored; a NaN cannot.
///
/// This exists because the layout asks for more than FIELD produces. Verified
/// live against the relay's own `/espn-summary` route (field-relay-nba
/// `scripts/nfl-epa-shape-probe.mjs`, artifact
/// `outbox/nfl-epa-shape-probe-20260815T013003Z.log`, 14/14): an ESPN NFL play
/// carries `start.{down,distance,yardsToEndzone}`, `type.text`, `scoringPlay`,
/// `end.{...}` and `isTurnover`. It carries no win probability and no leverage
/// index. Writing 0.0 into those fields would put this session's own defect —
/// a value whose name and measurement disagree — into the wire format itself.
let inline isPresent (x: float) : bool = not (System.Double.IsNaN x)

let inline winProbability (v: DataView) (i: int) : float =
    f32be v (i * RecordBytes + Offset.WinProbability)

let inline expectedPointsAdded (v: DataView) (i: int) : float =
    f32be v (i * RecordBytes + Offset.ExpectedPointsAdded)

let inline leverageIndex (v: DataView) (i: int) : float =
    f32be v (i * RecordBytes + Offset.LeverageIndex)

/// The scoring flag, read as a BYTE and compared, never as a bool.
///
/// `MemoryMarshal.Cast` over a `bool` field is the one genuine memory-safety
/// bug in the pattern this replaces, and it survives on .NET too. A bool off the
/// wire can hold any value 0-255; the CLR assumes 0 or 1, so a byte of 2 is an
/// invalid instance and `if b` and `if not b` can both take the branch you did
/// not expect. Here the byte is the storage and the comparison is explicit, so
/// every value in 0-255 has one defined meaning.
let inline isScoringPlay (v: DataView) (i: int) : bool =
    u8 v (i * RecordBytes + Offset.ScoringFlag) <> 0

// --- writing -----------------------------------------------------------------
//
// The same offset table, used in the other direction.
//
// This is not test scaffolding that leaked into the module. A frame writer is
// what a replay tool, a fixture generator or a mock producer all need, and
// putting it here is what makes the layout have ONE definition rather than two
// that are free to drift. `Suite.fs` reads these to round-trip against bytes it
// wrote itself, so an assertion can never be satisfied by the reader agreeing
// with itself.
//
// Byte-level and explicitly big-endian, for the same reason the readers are:
// the byte order is visible at the call site, not buried in a helper named
// `write`.
module Wire =

    [<Emit("new ArrayBuffer($0)")>]
    let private buffer (bytes: int) : ArrayBuffer = jsNative

    [<Emit("new DataView($0)")>]
    let private viewOverRaw (b: ArrayBuffer) : DataView = jsNative

    [<Emit("$0.setUint8($1, $2)")>]
    let private putByteRaw (v: DataView) (offset: int) (x: int) : unit = jsNative

    /// A buffer sized for exactly `records` whole records, every one of them
    /// already stamped with `FormatVersion`.
    ///
    /// Stamped here rather than left to the caller because the alternative was
    /// measured: adding the version byte turned six existing checks red at once,
    /// all of them hand-building a buffer and hand-writing two fields into it.
    /// They were not wrong — a raw `ArrayBuffer` is zeroed, so every record
    /// declared layout 0 and was correctly refused. Making the allocator stamp
    /// gives the invariant a name: a buffer from `allocate` IS a valid frame of
    /// this layout, and a caller cannot forget the one byte that makes it
    /// readable. `allocateBytes` stays raw, because its whole job is producing
    /// lengths that are not whole records.
    let allocate (records: int) : ArrayBuffer =
        let b = buffer (records * RecordBytes)
        let v = viewOverRaw b
        for i in 0 .. records - 1 do
            putByteRaw v (i * RecordBytes + Offset.FormatVersion) FormatVersion
        b

    /// A buffer of an arbitrary byte length — for exercising the lengths that
    /// are NOT a whole number of records, which is the case `frame` exists for.
    let allocateBytes (bytes: int) : ArrayBuffer = buffer bytes

    [<Emit("new DataView($0)")>]
    let viewOver (b: ArrayBuffer) : DataView = jsNative

    [<Emit("$0.setUint8($1, $2)")>]
    let putByte (v: DataView) (offset: int) (x: int) : unit = jsNative

    [<Emit("$0.setUint32($1, $2, false)")>]
    let putUint32 (v: DataView) (offset: int) (x: float) : unit = jsNative

    [<Emit("$0.setFloat32($1, $2, false)")>]
    let putFloat32 (v: DataView) (offset: int) (x: float) : unit = jsNative

    /// The offset of field `field` in record `i`. Callers write through this
    /// rather than computing `i * 24 + k` themselves, so the stride lives in one
    /// place for writers as well as readers.
    let at (i: int) (field: int) : int = i * RecordBytes + field

    /// One play, as a producer supplies it.
    ///
    /// A record, and it allocates — deliberately. Producing is not the hot path;
    /// a frame is built once and read many times, and the zero-allocation posture
    /// is a claim about the READ side. Using this type to hold decoded values
    /// would undo the whole point of the accessors above, so it is named for the
    /// direction it serves.
    type Outgoing =
        { PlayId: float
          /// `None` when nothing measured it. Written as NaN, read back by
          /// `isPresent` as absent — never as 0.0, which is a real probability.
          WinProbability: float option
          ExpectedPointsAdded: float
          /// `None` always, today: nothing in any FIELD repository computes a
          /// leverage index. The field is in the layout because the layout came
          /// with it.
          LeverageIndex: float option
          IsScoringPlay: bool }

    /// `None` becomes NaN on the wire. The only place absence is encoded.
    let private orAbsent = function Some x -> x | None -> nan

    /// Write one play at record index `i`.
    ///
    /// The id splits into two 32-bit halves, the inverse of what `playId` does
    /// when reading. A value above 2^53-1 is already imprecise as an F# `float`
    /// before it arrives here, so this cannot detect that case and does not
    /// pretend to — `playIdIsExact` is the counterpart, and it is on the read
    /// side because that is where the bytes are authoritative.
    let writeRecord (v: DataView) (i: int) (r: Outgoing) : unit =
        let hi = floor (r.PlayId / 4294967296.0)
        putUint32 v (at i Offset.PlayId) hi
        putUint32 v (at i Offset.PlayId + 4) (r.PlayId - hi * 4294967296.0)
        putFloat32 v (at i Offset.WinProbability) (orAbsent r.WinProbability)
        putFloat32 v (at i Offset.ExpectedPointsAdded) r.ExpectedPointsAdded
        putFloat32 v (at i Offset.LeverageIndex) (orAbsent r.LeverageIndex)
        putByte v (at i Offset.ScoringFlag) (if r.IsScoringPlay then 1 else 0)
        putByte v (at i Offset.FormatVersion) FormatVersion

    /// A whole frame. The producer's counterpart to `frame`.
    let encode (plays: Outgoing list) : ArrayBuffer =
        let b = allocate (List.length plays)
        let v = viewOver b
        plays |> List.iteri (fun i r -> writeRecord v i r)
        b
