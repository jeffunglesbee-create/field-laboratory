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

type TelemetryProjection =
    | StandardFrame of playId: uint64 * wp: float32 * wpaResidual: float32 * epa: float32 * fontWeight: int
    | ShootoutTruncated of playId: uint64 * wp: float32 * fontWeight: int
    | QuarantinedFrame of playId: uint64 * reason: string

module TelemetryContract =
    [<Literal>]
    let ExpectedVersion = 1uy

    [<Literal>]
    let FlagShootout = 2uy

    let inline computeFontWeight (li: float32) =
        let clamped = Math.Clamp(li, 0.5f, 4.0f)
        int (400.0f + (clamped / 4.0f) * 400.0f)

    let projectFrame (prevWp: float32) (frame: inref<PlayFrame>) : TelemetryProjection =
        if frame.FormatVersion <> ExpectedVersion then
            QuarantinedFrame (frame.PlayId, sprintf "ERR_VERSION (%d)" frame.FormatVersion)
        elif frame.Reserved <> 0us then
            QuarantinedFrame (frame.PlayId, sprintf "ERR_PADDING (0x%04X)" frame.Reserved)
        elif frame.ScoringFlag = FlagShootout then
            // wpa-shootout-residual: truncate shootout events from core WPA residuals
            ShootoutTruncated (frame.PlayId, frame.WinProbability, computeFontWeight frame.LeverageIndex)
        else
            let wpaResidual = frame.WinProbability - prevWp
            StandardFrame (
                frame.PlayId,
                frame.WinProbability,
                wpaResidual,
                frame.ExpectedPointsAdded,
                computeFontWeight frame.LeverageIndex
            )

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
                |> List.map (fun n -> n.Name, "Listed as Starter + Injured simultaneously")
            RenderPredictedAmber (nodes, conflicts)

// ============================================================================
// 3. UNIFIED FABLE.SOLID REACTIVE SURFACE
// ============================================================================

module FieldLaboratoryView =

    [<Emit("$0.remove()")>]
    let removeElement (el: HTMLElement) : unit = jsNative

    [<SolidComponent>]
    let UnifiedSurface (initialFrames: TelemetryProjection array) (initialNodes: TacticalNode list) =
        let selectedIdx, setSelectedIdx = Solid.createSignal 0
        let feedStatus, setFeedStatus = Solid.createSignal StatusPredicted
        let mutable lineupAnchorRef : HTMLElement option = None

        let triggerHardRefusal (rawCode: string) =
            setFeedStatus (StatusUnrecognised rawCode)
            match lineupAnchorRef with
            | Some anchor -> removeElement anchor
            | None -> ()

        let activeFontWeight () =
            match initialFrames.[selectedIdx()] with
            | StandardFrame (_, _, _, _, w) -> w
            | ShootoutTruncated (_, _, w) -> w
            | QuarantinedFrame _ -> 420

        Html.div [
            prop.className "master-shell"
            prop.style [ style.custom ("--kinetic-weight", string (activeFontWeight())) ]
            prop.children [

                // UPPER DECK: 24-BYTE TELEMETRY ENGINE
                Html.div [
                    prop.className "hud-panel"
                    prop.children [
                        Html.div [
                            prop.className "hud-header"
                            prop.children [
                                Html.span [ prop.className "brand-title"; prop.text "FIELD LABORATORY" ]
                                Html.span [
                                    prop.className "status-pill"
                                    prop.text (sprintf "KINETIC WEIGHT: %d" (activeFontWeight()))
                                ]
                            ]
                        ]
                        Html.div [
                            prop.className "telemetry-rows"
                            prop.children [
                                for idx in 0 .. initialFrames.Length - 1 do
                                    let frame = initialFrames.[idx]
                                    Html.div [
                                        prop.className (if selectedIdx() = idx then "t-row active" else "t-row")
                                        prop.onClick (fun _ -> setSelectedIdx idx)
                                        prop.children [
                                            match frame with
                                            | StandardFrame (id, wp, wpa, epa, w) ->
                                                Html.div [
                                                    prop.text (sprintf "PLAY %u [STANDARD] | WP: %.1f%% | WPA: %+.3f | EPA: %+.2f | W:%d" id (wp * 100.0f) wpa epa w)
                                                ]
                                            | ShootoutTruncated (id, wp, w) ->
                                                Html.div [
                                                    prop.text (sprintf "PLAY %u [SHOOTOUT TRUNCATED] | WP: %.1f%% | WPA: TRUNC | W:%d" id (wp * 100.0f) w)
                                                ]
                                            | QuarantinedFrame (id, reason) ->
                                                Html.div [
                                                    prop.text (sprintf "PLAY %u [REJECTED] -> %s" id reason)
                                                ]
                                        ]
                                    ]
                            ]
                        ]
                    ]
                ]

                // LOWER DECK: 3-4-2-1 LINEUP INTEGRITY HUD (WITH ANCHOR.REMOVE REF)
                Html.div [
                    prop.id "lineup-anchor"
                    prop.className "hud-panel amber-accent"
                    prop.ref (fun el -> if not (isNull el) then lineupAnchorRef <- Some (el :?> HTMLElement))
                    prop.children [
                        match XiGate.evaluate (feedStatus()) initialNodes with
                        | DetachLineupDom reason ->
                            Html.div [ prop.text (sprintf "DETACHED: %s" reason) ]

                        | AnchorConfirmed nodes
                        | RenderPredictedAmber (nodes, _) ->
                            Html.div [
                                prop.className "hud-header"
                                prop.children [
                                    Html.span [ prop.className "brand-title"; prop.text "PREDICTED-XI-RENDER-DECISION (3-4-2-1)" ]
                                    Html.span [
                                        prop.className "status-pill"
                                        prop.text (
                                            match feedStatus() with
                                            | StatusConfirmed -> "CHANNEL: CONFIRMED_LOCKED"
                                            | _ -> "CHANNEL: PREDICTED_AMBER"
                                        )
                                    ]
                                ]
                            ]

                            Html.div [
                                prop.className "pitch-stage"
                                prop.children [
                                    for node in nodes do
                                        let isConflict = XiGate.hasStarterInjuryConflict node
                                        let nodeClass =
                                            if isConflict then "node conflict"
                                            elif node.Primary = StatusConfirmed then "node confirmed"
                                            elif node.Primary = StatusDoubtful then "node doubtful"
                                            else "node"

                                        Html.div [
                                            prop.className nodeClass
                                            prop.style [
                                                style.left (length.percent node.LeftPct)
                                                style.top (length.percent node.TopPct)
                                            ]
                                            prop.children [
                                                Html.div [ prop.className "node-top"; prop.text (sprintf "%s #%02d" node.Role3421 node.Number) ]
                                                Html.div [ prop.className "node-name"; prop.text node.Name ]
                                                Html.div [
                                                    prop.className "node-status"
                                                    prop.text (
                                                        if isConflict then "STARTER + INJURED [RAW]"
                                                        else sprintf "%A" node.Primary
                                                    )
                                                ]
                                            ]
                                        ]
                                ]
                            ]

                            Html.div [
                                prop.className "controls-bar"
                                prop.children [
                                    Html.button [
                                        prop.onClick (fun _ -> setFeedStatus StatusPredicted)
                                        prop.text "State: RenderPredictedAmber"
                                    ]
                                    Html.button [
                                        prop.onClick (fun _ -> setFeedStatus StatusConfirmed)
                                        prop.text "State: AnchorConfirmed"
                                    ]
                                    Html.button [
                                        prop.className "btn-danger"
                                        prop.onClick (fun _ -> triggerHardRefusal "ver_2_unknown")
                                        prop.text "Trigger StatusUnrecognised -> anchor.remove()"
                                    ]
                                ]
                            ]
                    ]
                ]
            ]
        ]
