namespace FieldLaboratory.Surface

open System
open System.Buffers.Binary
open System.Runtime.InteropServices
open Browser.Types
open Fable.Core
open Fable.Core.JsInterop
open Feliz
open Feliz.Solid

// ============================================================================
// 1. 24-BYTE PLAYFRAME CONTRACT & WPA-SHOOTOUT-RESIDUAL GATE
// ============================================================================

[<Struct; StructLayout(LayoutKind.Explicit, Size = 24)>]
type PlayFrame =
    [<FieldOffset(0)>]  val mutable PlayId : uint64
    [<FieldOffset(8)>]  val mutable WinProbability : float32
    [<FieldOffset(12)>] val mutable ExpectedPointsAdded : float32
    [<FieldOffset(16)>] val mutable LeverageIndex : float32
    [<FieldOffset(20)>] val mutable ScoringFlag : byte
    [<FieldOffset(21)>] val mutable FormatVersion : byte
    [<FieldOffset(22)>] val mutable Reserved : uint16

type HexInspectRow = {
    IdHex: string
    WpHex: string
    EpaHex: string
    LiHex: string
    FlagHex: string
    VerHex: string
    PadHex: string
    FlagWarn: bool
    PadErr: bool
}

type TelemetryProjection =
    | StandardFrame of playId: uint64 * wp: float32 * wpaResidual: float32 * epa: float32 * li: float32 * fontWeight: int * hex: HexInspectRow
    | ShootoutTruncated of playId: uint64 * wp: float32 * li: float32 * fontWeight: int * hex: HexInspectRow
    | QuarantinedFrame of playId: uint64 * reason: string * fontWeight: int * hex: HexInspectRow

module TelemetryContract =
    [<Literal>]
    let ExpectedVersion = 1uy

    [<Literal>]
    let FlagShootout = 2uy

    let inline computeFontWeight (li: float32) =
        let clamped = Math.Clamp(li, 0.5f, 4.0f)
        int (400.0f + (clamped / 4.0f) * 400.0f)

    let formatUInt64Be (v: uint64) =
        let b = BitConverter.GetBytes(v)
        if BitConverter.IsLittleEndian then Array.Reverse(b)
        b |> Array.map (sprintf "%02X") |> String.concat " "

    let formatFloat32Be (v: float32) =
        let b = BitConverter.GetBytes(v)
        if BitConverter.IsLittleEndian then Array.Reverse(b)
        b |> Array.map (sprintf "%02X") |> String.concat " "

    let formatUInt16Be (v: uint16) =
        let b = BitConverter.GetBytes(v)
        if BitConverter.IsLittleEndian then Array.Reverse(b)
        b |> Array.map (sprintf "%02X") |> String.concat " "

    let projectFrame (prevWp: float32) (frame: inref<PlayFrame>) : TelemetryProjection =
        let idStr = sprintf "%s (#%u)" (formatUInt64Be frame.PlayId) frame.PlayId
        let verStr = sprintf "%02X (v%d)" frame.FormatVersion frame.FormatVersion

        if frame.FormatVersion <> ExpectedVersion then
            let hex = {
                IdHex = idStr; WpHex = "-- (QUARANTINED)"; EpaHex = "-- (QUARANTINED)"
                LiHex = "-- (QUARANTINED)"; FlagHex = sprintf "%02X" frame.ScoringFlag
                VerHex = verStr; PadHex = sprintf "%s" (formatUInt16Be frame.Reserved)
                FlagWarn = false; PadErr = true
            }
            QuarantinedFrame (frame.PlayId, sprintf "ERR_VERSION (%d)" frame.FormatVersion, 420, hex)

        elif frame.Reserved <> 0us then
            let hex = {
                IdHex = idStr; WpHex = "-- (QUARANTINED)"; EpaHex = "-- (QUARANTINED)"
                LiHex = "-- (QUARANTINED)"; FlagHex = sprintf "%02X (NONE)" frame.ScoringFlag
                VerHex = verStr; PadHex = sprintf "%s (ERR_PAD)" (formatUInt16Be frame.Reserved)
                FlagWarn = false; PadErr = true
            }
            QuarantinedFrame (frame.PlayId, sprintf "REJECTED PADDING ERROR // 0x%04X" frame.Reserved, 420, hex)

        elif frame.ScoringFlag = FlagShootout then
            let w = computeFontWeight frame.LeverageIndex
            let hex = {
                IdHex = idStr
                WpHex = sprintf "%s (%.1f%%)" (formatFloat32Be frame.WinProbability) (frame.WinProbability * 100.0f)
                EpaHex = "00 00 00 00 (TRUNC)"
                LiHex = sprintf "%s (%.2f)" (formatFloat32Be frame.LeverageIndex) frame.LeverageIndex
                FlagHex = "02 (SHOOTOUT)"
                VerHex = verStr
                PadHex = "00 00 (OK)"
                FlagWarn = true; PadErr = false
            }
            ShootoutTruncated (frame.PlayId, frame.WinProbability, frame.LeverageIndex, w, hex)

        else
            let w = computeFontWeight frame.LeverageIndex
            let wpaResidual = frame.WinProbability - prevWp
            let hex = {
                IdHex = idStr
                WpHex = sprintf "%s (%.1f%%)" (formatFloat32Be frame.WinProbability) (frame.WinProbability * 100.0f)
                EpaHex = sprintf "%s (%+.2f)" (formatFloat32Be frame.ExpectedPointsAdded) frame.ExpectedPointsAdded
                LiHex = sprintf "%s (%.2f)" (formatFloat32Be frame.LeverageIndex) frame.LeverageIndex
                FlagHex = sprintf "%02X (REG)" frame.ScoringFlag
                VerHex = verStr
                PadHex = "00 00 (OK)"
                FlagWarn = false; PadErr = false
            }
            StandardFrame (frame.PlayId, frame.WinProbability, wpaResidual, frame.ExpectedPointsAdded, frame.LeverageIndex, w, hex)

// ============================================================================
// 2. 7-STATE PREDICTED-XI-RENDER-DECISION CONTRACT
// ============================================================================

type LineupStatus =
    | StatusConfirmed
    | StatusPredicted
    | StatusDoubtful
    | StatusInjured
    | StatusSuspended
    | StatusMissing
    | StatusUnrecognised of rawCode: string

type TacticalNode = {
    Number: int
    Name: string
    Role3421: string
    ConfidenceText: string
    SourceTag: string
    LeftPct: float
    TopPct: float
    Primary: LineupStatus
    Secondary: LineupStatus list
}

type XiRenderDecision =
    | AnchorConfirmed of nodes: TacticalNode list
    | RenderPredictedAmber of nodes: TacticalNode list * conflicts: (string * string) list
    | DetachLineupDom of reason: string

module XiGate =
    let hasStarterInjuryConflict (node: TacticalNode) =
        let isStarter =
            match node.Primary with
            | StatusConfirmed | StatusPredicted -> true
            | _ -> false
        let isUnavailable =
            node.Secondary
            |> List.exists (function StatusInjured | StatusSuspended -> true | _ -> false)
        isStarter && isUnavailable

    let evaluate (feedStatus: LineupStatus) (nodes: TacticalNode list) : XiRenderDecision =
        match feedStatus with
        | StatusUnrecognised raw ->
            DetachLineupDom (sprintf "status-unrecognised ('%s')" raw)
        | StatusMissing | StatusInjured | StatusSuspended ->
            DetachLineupDom (sprintf "invalid-team-status (%A)" feedStatus)
        | StatusConfirmed when nodes.Length = 11 ->
            AnchorConfirmed nodes
        | StatusPredicted | StatusDoubtful | StatusConfirmed ->
            let conflicts =
                nodes
                |> List.filter hasStarterInjuryConflict
                |> List.map (fun n -> n.Name, "flagged as both StatusPredicted (Starter) and StatusInjured")
            RenderPredictedAmber (nodes, conflicts)

// ============================================================================
// 3. SEED DATA MATCHING UNIFIED HTML TEST HARNESS
// ============================================================================

module DefaultSeed =
    let buildFrames () : TelemetryProjection array =
        let mutable f0 = PlayFrame(PlayId = 1042UL, WinProbability = 0.642f, ExpectedPointsAdded = 1.85f, LeverageIndex = 2.10f, ScoringFlag = 1uy, FormatVersion = 1uy, Reserved = 0us)
        let mutable f1 = PlayFrame(PlayId = 1043UL, WinProbability = 0.815f, ExpectedPointsAdded = 0.0f,  LeverageIndex = 3.75f, ScoringFlag = 2uy, FormatVersion = 1uy, Reserved = 0us)
        let mutable f2 = PlayFrame(PlayId = 1044UL, WinProbability = 0.815f, ExpectedPointsAdded = 0.0f,  LeverageIndex = 3.75f, ScoringFlag = 0uy, FormatVersion = 1uy, Reserved = 0x00FFus)
        [|
            TelemetryContract.projectFrame 0.500f &f0
            TelemetryContract.projectFrame 0.642f &f1
            TelemetryContract.projectFrame 0.815f &f2
        |]

    let palace3421Nodes : TacticalNode list = [
        { Number = 14; Name = "MATETA";    Role3421 = "ST-PIN";  ConfidenceText = "92%";  SourceTag = "BSD";  LeftPct = 50.0; TopPct = 13.0; Primary = StatusPredicted; Secondary = [] }
        { Number = 7;  Name = "SARR";      Role3421 = "LAM-10";  ConfidenceText = "88%";  SourceTag = "BSD";  LeftPct = 33.0; TopPct = 30.0; Primary = StatusPredicted; Secondary = [] }
        { Number = 11; Name = "TOKLOMATI"; Role3421 = "RAM-10";  ConfidenceText = "ERR";  SourceTag = "RAW";  LeftPct = 67.0; TopPct = 30.0; Primary = StatusPredicted; Secondary = [ StatusInjured ] }
        { Number = 3;  Name = "MITCHELL";  Role3421 = "LWB";     ConfidenceText = "91%";  SourceTag = "BSD";  LeftPct = 13.0; TopPct = 50.0; Primary = StatusPredicted; Secondary = [] }
        { Number = 20; Name = "WHARTON";   Role3421 = "DLP-6";   ConfidenceText = "54%";  SourceTag = "LATE"; LeftPct = 39.0; TopPct = 51.0; Primary = StatusDoubtful;  Secondary = [] }
        { Number = 19; Name = "HUGHES";    Role3421 = "B2B-8";   ConfidenceText = "84%";  SourceTag = "BSD";  LeftPct = 61.0; TopPct = 51.0; Primary = StatusPredicted; Secondary = [] }
        { Number = 12; Name = "MUNOZ";     Role3421 = "RWB";     ConfidenceText = "95%";  SourceTag = "BSD";  LeftPct = 87.0; TopPct = 50.0; Primary = StatusPredicted; Secondary = [] }
        { Number = 6;  Name = "GUEHI";     Role3421 = "LCB";     ConfidenceText = "100%"; SourceTag = "LOCK"; LeftPct = 26.0; TopPct = 72.0; Primary = StatusConfirmed; Secondary = [] }
        { Number = 5;  Name = "LACROIX";   Role3421 = "CCB";     ConfidenceText = "94%";  SourceTag = "BSD";  LeftPct = 50.0; TopPct = 72.0; Primary = StatusPredicted; Secondary = [] }
        { Number = 26; Name = "RICHARDS";  Role3421 = "RCB";     ConfidenceText = "89%";  SourceTag = "BSD";  LeftPct = 74.0; TopPct = 72.0; Primary = StatusPredicted; Secondary = [] }
        { Number = 1;  Name = "HENDERSON"; Role3421 = "GK";      ConfidenceText = "100%"; SourceTag = "LOCK"; LeftPct = 50.0; TopPct = 90.0; Primary = StatusConfirmed; Secondary = [] }
    ]

// ============================================================================
// 4. FULL FABLE.SOLID REACTIVE HUD (100% PARITY WITH HTML HARNESS)
// ============================================================================

module FieldLaboratoryView =

    [<Emit("$0.remove()")>]
    let removeElement (el: HTMLElement) : unit = jsNative

    let private renderHexInspector (hex: HexInspectRow) =
        Html.div [
            prop.className "hex-bar"
            prop.id "hex-inspector"
            prop.children [
                Html.div [ prop.className "hex-seg"; prop.children [ Html.span "[00..07] PlayId (u64)"; Html.strong hex.IdHex ] ]
                Html.div [ prop.className "hex-seg"; prop.children [ Html.span "[08..11] WinProb (f32)"; Html.strong hex.WpHex ] ]
                Html.div [ prop.className "hex-seg"; prop.children [ Html.span "[12..15] EPA (f32)"; Html.strong hex.EpaHex ] ]
                Html.div [ prop.className "hex-seg"; prop.children [ Html.span "[16..19] Leverage (f32)"; Html.strong hex.LiHex ] ]
                Html.div [
                    prop.className (if hex.FlagWarn then "hex-seg warn" else "hex-seg")
                    prop.children [ Html.span "[20] Flag"; Html.strong hex.FlagHex ]
                ]
                Html.div [ prop.className "hex-seg"; prop.children [ Html.span "[21] Ver"; Html.strong hex.VerHex ] ]
                Html.div [
                    prop.className (if hex.PadErr then "hex-seg err" else "hex-seg")
                    prop.children [ Html.span "[22..23] Pad"; Html.strong hex.PadHex ]
                ]
            ]
        ]

    let private renderPitchSvg () =
        Svg.svg [
            svg.className "pitch-svg"
            svg.viewBox (0, 0, 860, 430)
             prop.custom ("preserveAspectRatio", "none")
            svg.children [
                Svg.rect [ svg.x 30; svg.y 15; svg.width 800; svg.height 400; svg.fill "none"; svg.stroke "#1E293B"; svg.strokeWidth 1.5 ]
                Svg.line [ svg.x1 30; svg.y1 215; svg.x2 830; svg.y2 215; svg.stroke "#1E293B"; svg.strokeWidth 1.5 ]
                Svg.circle [ svg.cx 430; svg.cy 215; svg.r 48; svg.fill "none"; svg.stroke "#1E293B"; svg.strokeWidth 1.5 ]
                Svg.rect [ svg.x 250; svg.y 15; svg.width 360; svg.height 75; svg.fill "none"; svg.stroke "#1E293B"; svg.strokeWidth 1.5 ]
                Svg.rect [ svg.x 250; svg.y 340; svg.width 360; svg.height 75; svg.fill "none"; svg.stroke "#1E293B"; svg.strokeWidth 1.5 ]
                Svg.g [
                    svg.stroke "rgba(245,158,11,0.22)"
                    svg.strokeWidth 1.2
                    prop.custom ("strokeDasharray", "3 3")
                    svg.children [
                        Svg.line [ svg.x1 430; svg.y1 55;  svg.x2 290; svg.y2 130 ]
                        Svg.line [ svg.x1 430; svg.y1 55;  svg.x2 570; svg.y2 130 ]
                        Svg.line [ svg.x1 290; svg.y1 130; svg.x2 345; svg.y2 215 ]
                        Svg.line [ svg.x1 570; svg.y1 130; svg.x2 515; svg.y2 215 ]
                        Svg.line [ svg.x1 345; svg.y1 215; svg.x2 515; svg.y2 215 ]
                        Svg.line [ svg.x1 230; svg.y1 310; svg.x2 630; svg.y2 310 ]
                    ]
                ]
            ]
        ]

    [<SolidComponent>]
    let UnifiedSurfaceWithProps (frames: TelemetryProjection array) (initialNodes: TacticalNode list) =
        let selectedIdx, setSelectedIdx = Solid.createSignal 0
        let feedStatus, setFeedStatus = Solid.createSignal StatusPredicted
        let mutable lineupAnchorRef : HTMLElement option = None

        let triggerHardRefusal (rawCode: string) =
            setFeedStatus (StatusUnrecognised rawCode)
            match lineupAnchorRef with
            | Some anchor -> removeElement anchor
            | None -> ()

        let activeFrame () = frames.[selectedIdx()]

        let activeFontWeight () =
            match activeFrame() with
            | StandardFrame (_, _, _, _, _, w, _) -> w
            | ShootoutTruncated (_, _, _, w, _) -> w
            | QuarantinedFrame (_, _, w, _) -> w

        let activeHex () =
            match activeFrame() with
            | StandardFrame (_, _, _, _, _, _, h) -> h
            | ShootoutTruncated (_, _, _, _, h) -> h
            | QuarantinedFrame (_, _, _, h) -> h

        let channelColor () =
            match feedStatus() with
            | StatusConfirmed -> "#10B981"
            | _ -> "#F59E0B"

        Html.div [
            prop.className "master-shell"
            prop.style [
                style.custom ("--kinetic-weight", string (activeFontWeight()))
                style.custom ("--channel-color", channelColor())
            ]
            prop.children [

                // ============================================================
                // UPPER DECK: 24-BYTE PLAYFRAME TELEMETRY ENGINE
                // ============================================================
                Html.div [
                    prop.className "hud-panel"
                    prop.children [
                        Html.div [
                            prop.className "hud-header"
                            prop.children [
                                Html.div [
                                    Html.span [ prop.className "brand-title"; prop.text "FIELD LABORATORY" ]
                                    Html.span [ prop.className "brand-sub"; prop.text "24-BYTE PLAYFRAME TELEMETRY ENGINE // ZERO-ALLOCATION SPAN CAST" ]
                                ]
                                Html.div [
                                    prop.style [ style.fontSize 10; style.color "#94A3B8" ]
                                    prop.children [
                                        Html.span "KINETIC WEIGHT: "
                                        Html.strong [
                                            prop.style [ style.color "#F59E0B" ]
                                            prop.text (string (activeFontWeight()))
                                        ]
                                    ]
                                ]
                            ]
                        ]

                        // 7-Segment 24-Byte Hex Inspector
                        renderHexInspector (activeHex())

                        // 3 Telemetry Rows with Oscilloscope SVGs
                        Html.div [
                            prop.className "telemetry-rows"
                            prop.children [
                                for idx in 0 .. frames.Length - 1 do
                                    let isSelected = (selectedIdx() = idx)
                                    match frames.[idx] with
                                    | StandardFrame (id, wp, wpa, epa, li, w, _) ->
                                        Html.div [
                                            prop.className (if isSelected then "t-row active" else "t-row")
                                            prop.onClick (fun _ -> setSelectedIdx idx)
                                            prop.children [
                                                Html.div [
                                                    prop.className "t-play-box"
                                                    prop.children [
                                                        Html.div [
                                                            prop.className "play-num"
                                                            prop.style [ style.color "#F59E0B" ]
                                                            prop.children [
                                                                Html.span (sprintf "PLAY %u " id)
                                                                Html.span [
                                                                    prop.style [ style.backgroundColor "#E2E8F0"; style.color "#06090D"; style.fontSize 10; style.padding (1, 5) ]
                                                                    prop.text "STANDARD"
                                                                ]
                                                            ]
                                                        ]
                                                        Html.div [
                                                            prop.className "play-sub"
                                                            prop.text (sprintf "WP: %.1f%% | WPA: %+.3f | EPA: %+.2f" (wp * 100.0f) wpa epa)
                                                        ]
                                                    ]
                                                ]
                                                Html.div [
                                                    prop.className "wave-box"
                                                    prop.children [
                                                        Html.div [
                                                            prop.className "wave-meta"
                                                            prop.children [
                                                                Html.span "DUR: 00:12.42"
                                                                Html.span "FPS: 60"
                                                                Html.span "FRAMES: 745"
                                                                Html.span "BUFFER: 100%"
                                                                Html.span [ prop.style [ style.color "#10B981" ]; prop.text "SIGNAL: NOMINAL" ]
                                                            ]
                                                        ]
                                                        Svg.svg [
                                                            svg.viewBox (0, 0, 500, 28)
                                                            svg.height 28
                                                            svg.width "100%"
                                                            svg.children [
                                                                Svg.path [
                                                                    svg.d "M0,14 L40,14 L45,6 L50,22 L55,10 L60,18 L65,14 L140,14 L145,4 L150,24 L155,3 L160,25 L165,9 L170,14 L270,14 L275,2 L280,26 L285,4 L290,24 L295,14 L500,14"
                                                                    svg.fill "none"
                                                                    svg.stroke "#94A3B8"
                                                                    svg.strokeWidth 1.3
                                                                ]
                                                            ]
                                                        ]
                                                    ]
                                                ]
                                                Html.div [
                                                    prop.className "t-diag"
                                                    prop.children [
                                                        Html.span [ prop.className "badge-ok"; prop.text "STATUS: OK" ]
                                                        Html.span [ prop.style [ style.color "#94A3B8" ]; prop.text (sprintf "LI: %.2f -> W:%d" li w) ]
                                                    ]
                                                ]
                                            ]
                                        ]

                                    | ShootoutTruncated (id, wp, _, w, _) ->
                                        Html.div [
                                            prop.className (if isSelected then "t-row trunc active" else "t-row trunc")
                                            prop.onClick (fun _ -> setSelectedIdx idx)
                                            prop.children [
                                                Html.div [
                                                    prop.className "t-play-box"
                                                    prop.children [
                                                        Html.div [ prop.className "play-num"; prop.style [ style.color "#CBD5E1" ]; prop.text (sprintf "PLAY %u" id) ]
                                                        Html.div [ prop.className "play-sub"; prop.style [ style.color "#F59E0B" ]; prop.text "[ SHOOTOUT TRUNCATED ]" ]
                                                    ]
                                                ]
                                                Html.div [
                                                    prop.className "wave-box"
                                                    prop.children [
                                                        Html.div [
                                                            prop.className "wave-meta"
                                                            prop.children [
                                                                Html.span "DUR: 00:04.18 (TRUNC)"
                                                                Html.span "FRAMES: 251"
                                                                Html.span (sprintf "WP: %.1f%%" (wp * 100.0f))
                                                                Html.span [ prop.style [ style.color "#F59E0B" ]; prop.text "SIGNAL: INTERRUPTED" ]
                                                            ]
                                                        ]
                                                        Svg.svg [
                                                            svg.viewBox (0, 0, 500, 28)
                                                            svg.height 28
                                                            svg.width "100%"
                                                            svg.children [
                                                                Svg.rect [ svg.x 240; svg.y 0; svg.width 60; svg.height 28; svg.fill "rgba(245,158,11,0.18)" ]
                                                                Svg.path [
                                                                    svg.d "M0,14 L60,14 L65,7 L70,21 L75,14 L160,14 L165,5 L170,23 L175,14 L240,14 L245,2 L250,26 L255,2 L260,26 L265,4 L270,24 L275,14"
                                                                    svg.fill "none"
                                                                    svg.stroke "#CBD5E1"
                                                                    svg.strokeWidth 1.3
                                                                ]
                                                                Svg.line [
                                                                    svg.x1 275; svg.y1 14; svg.x2 500; svg.y2 14
                                                                    svg.stroke "#F59E0B"; svg.strokeWidth 1.5
                                                                    prop.custom ("strokeDasharray", "6 4")
                                                                ]
                                                            ]
                                                        ]
                                                    ]
                                                ]
                                                Html.div [
                                                    prop.className "t-diag"
                                                    prop.children [
                                                        Html.span [ prop.className "badge-trunc"; prop.text "STATUS: TRUNC" ]
                                                        Html.span [ prop.style [ style.color "#F59E0B" ]; prop.text (sprintf "ScoringFlag=2uy -> W:%d" w) ]
                                                    ]
                                                ]
                                            ]
                                        ]

                                    | QuarantinedFrame (id, reason, _, _) ->
                                        Html.div [
                                            prop.className (if isSelected then "t-row reject active" else "t-row reject")
                                            prop.onClick (fun _ -> setSelectedIdx idx)
                                            prop.children [
                                                Html.div [
                                                    prop.className "t-play-box"
                                                    prop.children [
                                                        Html.div [
                                                            prop.className "play-num"
                                                            prop.style [ style.backgroundColor "#F59E0B"; style.color "#06090D"; style.display.inlineBlock; style.padding (0, 6) ]
                                                            prop.text (sprintf "PLAY %u" id)
                                                        ]
                                                        Html.div [ prop.className "play-sub"; prop.style [ style.color "#EF4444" ]; prop.text reason ]
                                                    ]
                                                ]
                                                Html.div [
                                                    prop.className "wave-box"
                                                    prop.style [
                                                        style.custom ("background", "repeating-linear-gradient(-45deg,rgba(245,158,11,0.12),rgba(245,158,11,0.12) 8px,#080C11 8px,#080C11 16px)")
                                                    ]
                                                    prop.children [
                                                        Html.div [
                                                            prop.className "wave-meta"
                                                            prop.children [
                                                                Html.span "DUR: --:--.--"
                                                                Html.span "FPS: 0"
                                                                Html.span "BUFFER: FAIL"
                                                                Html.span [ prop.style [ style.color "#EF4444" ]; prop.text "SIGNAL: ERR_PAD" ]
                                                            ]
                                                        ]
                                                        Svg.svg [
                                                            svg.viewBox (0, 0, 500, 28)
                                                            svg.height 28
                                                            svg.width "100%"
                                                            svg.children [
                                                                Svg.line [ svg.x1 0; svg.y1 14; svg.x2 220; svg.y2 14; svg.stroke "#F59E0B"; svg.strokeWidth 1.2 ]
                                                                Svg.text [ svg.x 260; svg.y 18; svg.fill "#64748B"; prop.style [ style.fontSize 10 ]; svg.text "VOID // QUARANTINED" ]
                                                            ]
                                                        ]
                                                    ]
                                                ]
                                                Html.div [
                                                    prop.className "t-diag"
                                                    prop.children [
                                                        Html.span [ prop.className "badge-err"; prop.text "REJECTED // ERR_PADDING" ]
                                                        Html.span [ prop.style [ style.color "#EF4444" ]; prop.text "Reserved != 0us" ]
                                                    ]
                                                ]
                                            ]
                                        ]
                            ]
                        ]
                    ]
                ]

                // ============================================================
                // LOWER DECK: 3-4-2-1 LINEUP INTEGRITY HUD (WITH ANCHOR.REMOVE)
                // ============================================================
                Html.div [
                    prop.id "lineup-anchor"
                    prop.className "hud-panel amber-accent"
                    prop.ref (fun el -> if not (isNull el) then lineupAnchorRef <- Some (el :?> HTMLElement))
                    prop.children [
                        match XiGate.evaluate (feedStatus()) initialNodes with
                        | DetachLineupDom reason ->
                            Html.div [ prop.text (sprintf "DETACHED: %s" reason) ]

                        | AnchorConfirmed nodes ->
                            let conflicts =
                                nodes
                                |> List.filter XiGate.hasStarterInjuryConflict
                                |> List.map (fun n -> n.Name, "flagged as both StatusPredicted (Starter) and StatusInjured")
                            renderLowerDeck feedStatus setFeedStatus triggerHardRefusal nodes conflicts

                        | RenderPredictedAmber (nodes, conflicts) ->
                            renderLowerDeck feedStatus setFeedStatus triggerHardRefusal nodes conflicts
                    ]
                ]
            ]
        ]

    and private renderLowerDeck
        (feedStatus: unit -> LineupStatus)
        (setFeedStatus: LineupStatus -> unit)
        (triggerHardRefusal: string -> unit)
        (nodes: TacticalNode list)
        (conflicts: (string * string) list) =

        let isConfirmedChannel = (feedStatus() = StatusConfirmed)

        React.fragment [
            Html.div [
                prop.className "hud-header"
                prop.children [
                    Html.div [
                        Html.span [ prop.className "brand-title"; prop.text "PREDICTED-XI-RENDER-DECISION" ]
                        Html.span [ prop.className "brand-sub"; prop.text "GLASNER 3-4-2-1 // 7-STATE DISCRIMINATED UNION GATE" ]
                    ]
                    Html.div [
                        prop.className "status-pill"
                        prop.style [ style.backgroundColor (if isConfirmedChannel then "#10B981" else "#F59E0B") ]
                        prop.text (if isConfirmedChannel then "CHANNEL: CONFIRMED_LOCKED" else "CHANNEL: PREDICTED_AMBER")
                    ]
                ]
            ]

            Html.div [
                prop.className "telemetry-strip"
                prop.children [
                    Html.span "CONTRACT: 7-STATE DU ✓"
                    Html.span "ANCHOR: #lineup-anchor"
                    Html.span "FORMATION: 3-4-2-1"
                    Html.span [
                        prop.style [ style.marginLeft.auto; style.color "#F59E0B" ]
                        prop.text (sprintf "AUDIT: %d VENDOR CONFLICT EXPOSED VERBATIM" conflicts.Length)
                    ]
                ]
            ]

            Html.div [
                prop.className "pitch-stage"
                prop.children [
                    renderPitchSvg ()

                    for node in nodes do
                        let isConflict = XiGate.hasStarterInjuryConflict node
                        let nodeClass =
                            if isConflict then "node conflict"
                            elif isConfirmedChannel || node.Primary = StatusConfirmed then "node confirmed"
                            elif node.Primary = StatusDoubtful then "node doubtful"
                            else "node"

                        Html.div [
                            prop.className nodeClass
                            prop.style [
                                style.left (length.percent node.LeftPct)
                                style.top (length.percent node.TopPct)
                            ]
                            prop.children [
                                Html.div [
                                    prop.className "node-top"
                                    prop.children [
                                        Html.span node.Role3421
                                        Html.span (sprintf "#%02d" node.Number)
                                    ]
                                ]
                                Html.div [
                                    prop.className "node-name"
                                    prop.children [
                                        Html.span node.Name
                                        Html.span node.ConfidenceText
                                    ]
                                ]
                                Html.div [
                                    prop.className "node-status"
                                    prop.children [
                                        if isConflict then
                                            Html.span [ prop.className "tag-crimson"; prop.text "STARTER + INJURED" ]
                                        elif isConfirmedChannel || node.Primary = StatusConfirmed then
                                            Html.span [ prop.className "tag-emerald"; prop.text "■ CONFIRMED" ]
                                        elif node.Primary = StatusDoubtful then
                                            Html.span [ prop.style [ style.color "#EF4444" ]; prop.text "▲ DOUBTFUL" ]
                                        else
                                            Html.span [ prop.className "tag-amber"; prop.text "● PREDICTED" ]
                                        Html.span node.SourceTag
                                    ]
                                ]
                            ]
                        ]
                ]
            ]

            for (playerName, conflictDesc) in conflicts do
                Html.div [
                    prop.className "hazard-bar"
                    prop.children [
                        Html.span [
                            Html.strong [ prop.style [ style.color "#F59E0B" ]; prop.text "RAW VENDOR DISCREPANCY: " ]
                            Html.b playerName
                            Html.span (" " + conflictDesc)
                        ]
                        Html.span [
                            prop.className "tag-crimson"
                            prop.style [ style.fontWeight 700; style.padding (3, 7) ]
                            prop.text "EXPOSED VERBATIM"
                        ]
                    ]
                ]

            Html.div [
                prop.className "controls-bar"
                prop.children [
                    Html.div [
                        prop.style [ style.display.flex; style.gap 8 ]
                        prop.children [
                            Html.button [
                                prop.onClick (fun _ -> setFeedStatus StatusPredicted)
                                prop.text "State: RenderPredictedAmber"
                            ]
                            Html.button [
                                prop.onClick (fun _ -> setFeedStatus StatusConfirmed)
                                prop.text "State: AnchorConfirmed"
                            ]
                        ]
                    ]
                    Html.button [
                        prop.className "btn-danger"
                        prop.onClick (fun _ -> triggerHardRefusal "ver_2_unknown")
                        prop.text "Trigger StatusUnrecognised -> anchor.remove()"
                    ]
                ]
            ]
        ]

    /// Zero-config entry point pre-populated with PLAY 1042/1043/1044 & Palace 3-4-2-1
    [<SolidComponent>]
    let UnifiedSurface () =
        UnifiedSurfaceWithProps (DefaultSeed.buildFrames()) DefaultSeed.palace3421Nodes
