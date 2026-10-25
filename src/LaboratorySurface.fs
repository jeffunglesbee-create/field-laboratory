module LaboratorySurface

// What the binary play-feed decoder says about the frames it is handed, as tiles.
// The Metrics tab's "Play frames" section draws these (MetricsView.fs).
//
// A PROJECTION, NOT A DECODER. `PlayFrame.frame` classifies a payload; this file
// only names each classification and says, in numbers, what the bytes say. It
// reads PlayFrame and never edits it: that file stays frozen at 6f23c76
// (outbox/2026-08-27-playframe-frozen-and-the-days-accounting.md). Reading it from
// a consumer is the second of that note's three ways to unfreeze it.
//
// NOTHING IN THIS REPOSITORY PRODUCES A LIVE FRAME. The exhibit below is
// CONSTRUCTED here through `PlayFrame.Wire`, and the section that draws it says so
// in its provenance line. A live feed needs the open decision recorded at the end
// of docs/CC-CMD-2026-08-27-relay-per-play-epa.md: PlayId is a 64-bit number and
// ESPN's play id is a string.
//
// WHAT IS LEFT OUT, ON PURPOSE.
//   * The leverage index. Nothing in any FIELD repository computes it
//     (PlayFrame.fs header), and a weight or size driven by it would be a mark
//     whose size says "this play mattered": ADR-002's question, answered by a
//     number that has no producer.
//   * FPS, buffer fill, signal and duration. A frame carries none of them.
//
// THE SHOOTOUT FLAG. A scoring-flag byte of 2 marks a shootout play, which is
// excluded from WPA. That meaning is the owner's proposal
// (field-laboratory branch jeffunglesbee-create-patch-1, FieldLaboratorySurface.fs).
// PlayFrame itself defines only nonzero versus zero, and no writer on main emits
// a 2: the exhibit writes the byte itself.

let [<Literal>] ShootoutFlag = 2

type Tone =
    | Standard
    | Excluded
    | Refused
    | Quiet

type Tile =
    { Title: string
      State: string
      Tone: Tone
      Lines: string list }

let private pct (x: float) = sprintf "%.1f%%" (x * 100.0)

/// One tile per record. WPA is this play's win probability minus the previous
/// play's, and only between two measured, non-shootout plays: a shootout play has
/// no WPA, and the play after it has no earlier play to differ from.
let private records (v: PlayFrame.DataView) (n: int) : Tile list =
    let flagAt i = PlayFrame.u8 v (i * PlayFrame.RecordBytes + PlayFrame.Offset.ScoringFlag)
    [ for i in 0 .. n - 1 ->
        let wp = PlayFrame.winProbability v i
        let epa = PlayFrame.expectedPointsAdded v i
        let wpText = if PlayFrame.isPresent wp then pct wp else "absent"
        let title = sprintf "PLAY %.0f" (PlayFrame.playId v i)
        if flagAt i = ShootoutFlag then
            { Title = title; State = "SHOOTOUT"; Tone = Excluded; Lines = [ sprintf "WP %s" wpText; "WPA excluded" ] }
        else
            let wpa =
                if i > 0 && flagAt (i - 1) <> ShootoutFlag then
                    let prev = PlayFrame.winProbability v (i - 1)
                    if PlayFrame.isPresent wp && PlayFrame.isPresent prev then sprintf "%+.3f" (wp - prev) else "n/a"
                else
                    "n/a"
            let epaText = if PlayFrame.isPresent epa then sprintf "%+.2f" epa else "absent"
            { Title = title; State = "STANDARD"; Tone = Standard
              Lines = [ sprintf "WP %s" wpText; sprintf "WPA %s" wpa; sprintf "EPA %s" epaText ] } ]

/// What `PlayFrame.frame` made of a payload, as tiles. `label` titles the tiles
/// of every state that is about the payload rather than about one play.
let project (label: string) (buffer: PlayFrame.ArrayBuffer) : Tile list =
    match PlayFrame.frame buffer with
    | PlayFrame.NoRecords ->
        [ { Title = label; State = "NO RECORDS"; Tone = Quiet; Lines = [ "0 bytes: a quiet answer, not an error" ] } ]
    | PlayFrame.Records(v, n) -> records v n
    | PlayFrame.PartialRecord(len, rem) ->
        [ { Title = label; State = "PARTIAL RECORD"; Tone = Refused
            Lines = [ sprintf "%d bytes, %d left over after whole records of %d" len rem PlayFrame.RecordBytes ] } ]
    | PlayFrame.UnknownLayout(ver, at) ->
        [ { Title = label; State = "UNKNOWN LAYOUT"; Tone = Refused
            Lines = [ sprintf "version %d at record %d" ver at; sprintf "this reader knows version %d" PlayFrame.FormatVersion ] } ]
    | PlayFrame.ReservedInUse at ->
        [ { Title = label; State = "RESERVED IN USE"; Tone = Refused
            Lines = [ sprintf "bytes 22-23 are not zero at record %d" at ] } ]

// --- the exhibit ----------------------------------------------------------------

let private sequence =
    let b = PlayFrame.Wire.allocate 4
    let v = PlayFrame.Wire.viewOver b
    let play i id wp epa flag =
        PlayFrame.Wire.writeRecord v i
            { PlayId = id; WinProbability = Some wp; ExpectedPointsAdded = epa; LeverageIndex = None; IsScoringPlay = false }
        PlayFrame.Wire.putByte v (PlayFrame.Wire.at i PlayFrame.Offset.ScoringFlag) flag
    play 0 1040.0 0.5 0.0 0
    play 1 1041.0 0.75 1.25 0
    play 2 1042.0 0.625 -0.5 0
    play 3 1043.0 0.625 0.0 ShootoutFlag
    b

let private oneRecord (id: float) (patch: PlayFrame.DataView -> unit) =
    let b = PlayFrame.Wire.allocate 1
    let v = PlayFrame.Wire.viewOver b
    PlayFrame.Wire.writeRecord v 0
        { PlayId = id; WinProbability = Some 0.5; ExpectedPointsAdded = 0.0; LeverageIndex = None; IsScoringPlay = false }
    patch v
    b

/// The six payloads, one per state `PlayFrame.frame` can name, built here and
/// not received from anywhere. The first is four plays; every other is one
/// payload that one state describes.
let exhibit : (string * PlayFrame.ArrayBuffer) list =
    [ "plays 1040 to 1043", sequence
      "PLAY 1044", oneRecord 1044.0 (fun v -> PlayFrame.Wire.putByte v (PlayFrame.Wire.at 0 PlayFrame.Offset.Reserved) 7)
      "PLAY 1045", oneRecord 1045.0 (fun v -> PlayFrame.Wire.putByte v (PlayFrame.Wire.at 0 PlayFrame.Offset.FormatVersion) 2)
      "PLAY 1046", PlayFrame.Wire.allocateBytes 30
      "PLAY 1047", PlayFrame.Wire.allocateBytes 0 ]

let exhibitTiles : Tile list = exhibit |> List.collect (fun (label, b) -> project label b)

/// The states the exhibit shows, in order, without repeats.
let exhibitStates : string list = exhibitTiles |> List.map (fun t -> t.State) |> List.distinct

/// The whole class string, written out. `computed-chrome-check` finds a class by
/// matching a literal string in a view source, so a name assembled with sprintf
/// from "mx-frame--%s" is invisible to it and the stylesheet's rule for it reads
/// as dead (verify run 40233288181 failed on exactly that).
let toneClass =
    function
    | Standard -> "mx-frame mx-frame--standard"
    | Excluded -> "mx-frame mx-frame--excluded"
    | Refused -> "mx-frame mx-frame--refused"
    | Quiet -> "mx-frame mx-frame--quiet"
