module WeatherView

open Browser.Types
open Browser
open Fable.Core
open Fable.Core.JsInterop
open Fetch
open Weather

// The weather panel: one row per located venue, plus the open-air verdict line.
//
// Fetched directly from Open-Meteo in the browser — no key, no relay hop. The
// relay's own /weather/today route 403s and was confirmed dead in production, so
// there is nothing to hop through.
//
// WHAT IS DIFFERENT FROM PLAYGROUND'S PANEL, and why
//
// Playground renders venues it has coordinates for and throws when a non-empty
// venue list returns zero readings, to avoid rendering the misleading "no venues
// with known coordinates" empty state during a total outage. That is the right
// distinction; here it is a `SlateWeather` case rather than a throw, so this
// renderer handles all three or does not compile.
//
// It also renders the venues it could NOT locate. Playground drops them, and a
// dropped name is indistinguishable from a venue with no weather — the same
// collapse the empty state suffers, one level earlier.

let private el (tag: string) (className: string) (text: string) : HTMLElement =
    let node = document.createElement tag
    if className <> "" then node.className <- className
    if text <> "" then node.textContent <- text
    node

let private child (parent: HTMLElement) (node: HTMLElement) =
    parent.appendChild node |> ignore
    node

/// The roof note. Every case named, and the retractable one says what is not
/// known rather than implying the roof was open.
let private roofNote (roof: RoofType) =
    match roof, roofState roof with
    | OpenAir, _ -> "open air"
    | Dome, _ -> "fixed roof — this is the weather outside it"
    | Retractable, UnknownRoofState -> "retractable — not known whether the roof was closed"
    // Unreachable by `roofState`, and named anyway: if that mapping ever changes,
    // this is a compile error rather than a blank note.
    | Retractable, PlayedInTheOpen
    | Retractable, Covered -> "retractable"

let private venueRow (mount: HTMLElement) (vw: VenueWeather) =
    let row = child mount (el "div" "wx-row" "")
    row.setAttribute ("data-venue", vw.Venue)
    row.setAttribute ("data-roof", (match vw.Roof with
                                    | OpenAir -> "open"
                                    | Retractable -> "retractable"
                                    | Dome -> "dome"))
    child row (el "div" "wx-row__venue" vw.Venue) |> ignore
    child row (el "div" "wx-row__conditions" (describeConditions vw.Reading)) |> ignore
    let note = child row (el "div" "wx-row__roof" (roofNote vw.Roof))
    // The honest limit, in the accessible name as well as the text. Playground
    // puts it in a title attribute; a title is not read by every reader.
    note.setAttribute ("title", roofNote vw.Roof)

/// The verdict line. Open-air venues only — a covered venue's location weather
/// is not necessarily what the game experienced, and `rankable` is what enforces
/// that rather than this function remembering to filter.
let private verdictLine (mount: HTMLElement) (readings: VenueWeather list) =
    match extremes readings with
    | None ->
        child mount (el "p" "wx-verdict wx-verdict--none"
                        "No open-air venue on this slate, so there is nothing to rank.") |> ignore
    | Some(warmest, coldest) ->
        let line =
            if warmest.Venue = coldest.Venue then
                sprintf "One open-air venue: %s at %s"
                    warmest.Venue (describeConditions warmest.Reading)
            else
                sprintf "Warmest open-air: %s (%d°F). Coldest: %s (%d°F)."
                    warmest.Venue (int (System.Math.Round(float warmest.Reading.Temperature)))
                    coldest.Venue (int (System.Math.Round(float coldest.Reading.Temperature)))
        child mount (el "p" "wx-verdict" line) |> ignore

/// Before anything has been asked for.
///
/// Deliberately NOT a `SlateWeather` case. "Not requested yet" is a fact about
/// this panel, not about the slate, and folding it into the union would put a
/// fourth meaning into the very type that exists to keep three apart — the
/// collapse this whole file is written against, committed by the file itself.
let renderIdle (mount: HTMLElement) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "wx-panel" "")
    child panel (el "h2" "" "Weather") |> ignore
    child panel (el "p" "wx-idle" "Loading conditions…") |> ignore

/// Render an outcome. Total over `SlateWeather` — the three cases the union
/// exists to keep apart.
let render (mount: HTMLElement) (outcome: SlateWeather) (unlocated: string list) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "wx-panel" "")
    child panel (el "h2" "" "Weather") |> ignore
    child panel (el "p" "wx-panel__what"
                    ("Conditions at tonight's venues, from Open-Meteo. Every located venue gets a "
                     + "reading — a retractable roof has real weather at its location, and the roof "
                     + "decision is often made on it.")) |> ignore

    match outcome with
    | NoVenuesWithCoordinates ->
        child panel (el "p" "wx-empty"
                        "No venue on this slate is in the location table, so there is nothing to ask about.")
        |> ignore

    | EveryFetchFailed(attempted, why) ->
        // Not the empty state. This is an outage and says so.
        let box = child panel (el "p" "wx-error"
                                  (sprintf "Weather is unavailable: all %d venue requests failed."
                                           (List.length attempted)))
        box.setAttribute ("role", "status")
        // ...and says WHAT each one reported. `Readings` has printed its
        // failures since it was written; this case printed a count and dropped
        // the reasons, so the one outcome where the reason is the whole story
        // was the one that threw it away. "HTTP 429" and "Failed to fetch" are
        // different failures with different fixes and this line is where they
        // become distinguishable — on the page, and to any check that reads it.
        if not (List.isEmpty why) then
            child panel (el "p" "wx-error__why" (sprintf "Reported: %s" (String.concat "; " why)))
            |> ignore

    | Readings(readings, failed) ->
        verdictLine panel readings
        let rows = child panel (el "div" "wx-rows" "")
        for vw in readings |> List.sortBy (fun v -> v.Venue) do
            venueRow rows vw
        if not (List.isEmpty failed) then
            child panel (el "p" "wx-partial"
                            (sprintf "%d venue(s) did not answer: %s"
                                     (List.length failed) (String.concat ", " failed))) |> ignore

    // Venues the table could not locate, always shown. A name that is missing
    // from the table is a fact about the table, not about the weather.
    if not (List.isEmpty unlocated) then
        child panel (el "p" "wx-unlocated"
                        (sprintf "Not in the location table: %s" (String.concat ", " unlocated))) |> ignore

/// Fill each scoreboard card's weather slot from a resolved outcome.
///
/// Direct DOM writes rather than a signal per card. The cards are rebuilt on
/// every slate render and the weather is refetched with them, so there is no
/// window in which a card survives its reading — which is the stale-node bug
/// this repo was founded on, and the reason this is written down rather than
/// assumed.
///
/// Cards with no reading are left EMPTY, not filled with a dash or an "n/a".
/// An empty slot says nothing; a dash says "we looked and there is nothing",
/// which is a different claim and usually false. The panel is where the
/// difference between "not in the table", "did not answer" and "outage" is
/// stated, and that is one click away.
let fillCards (outcome: SlateWeather) =
    match outcome with
    | NoVenuesWithCoordinates
    | EveryFetchFailed _ -> ()
    | Readings(readings, _) ->
        for vw in readings do
            let selector = sprintf ".desk-card[data-venue=\"%s\"] .desk-card__wx" vw.Venue
            for i in 0 .. int (document.querySelectorAll selector).length - 1 do
                match (document.querySelectorAll selector).[i] with
                | null -> ()
                | node ->
                    let element = node :?> HTMLElement
                    element.textContent <- cardChip vw
                    // The caveat rides along and is never dropped to fit the
                    // chip. `title` and `aria-label` both, because a title is
                    // not announced by every reader.
                    element.setAttribute ("title", cardChipTitle vw)
                    element.setAttribute ("aria-label", cardChipTitle vw)

// --- fetching ----------------------------------------------------------------

/// One request per DISTINCT COORDINATE, never per venue.
///
/// `distinctLocations` collapses aliases, so Minute Maid Park and Daikin Park
/// are one request. Failures resolve rather than reject — the JS equivalent of
/// `Promise.allSettled`, and for the same reason playground gives: one bad venue
/// should degrade to that venue missing, not hide every success behind one
/// transient error.
/// A deadline on every request.
///
/// verify run 33034386499 (2026-08-27) reported `0 chip(s) filled ... The page
/// reported: Loading conditions…`. That string is `.wx-idle`, which `renderIdle`
/// writes and `render` REPLACES. So the panel was not showing an outage twenty
/// seconds in — it was still waiting. `fetchOne` catches every rejection, which
/// makes a failure safe; it had no deadline, which makes a request that simply
/// never answers fatal. Its wave's `Promise.all` stays pending forever, and the
/// waves below run in SEQUENCE, so one silent socket stalls all four and the
/// weather surface never resolves at all — no chips, no outage line, no reason.
///
/// The node-side `weather-live-check.mjs` has always passed
/// `AbortSignal.timeout(15_000)` on its probe. The page asking the same service
/// had nothing.
///
/// 4000ms is arithmetic, not taste: the waves are sequential, so the slate's
/// worst case is waves x timeout = 4 x 4s = 16s, inside live-check's 20s chip
/// wait. For scale, the whole thirteen-venue slate answered in about three
/// seconds on run 33032652416 — this is roughly four times that, applied to
/// each single request rather than to all of them.
[<Emit("AbortSignal.timeout($0)")>]
let private timeoutSignal (ms: int) : AbortSignal = jsNative

let private requestTimeoutMs = 4000

let private fetchOne (venue: Venues.Venue) : JS.Promise<Result<VenueWeather, string>> =
    promise {
        try
            let! response = fetch (forecastUrl venue.Where) [ Signal(timeoutSignal requestTimeoutMs) ]
            if not response.Ok then
                return Error(sprintf "%s: HTTP %d" venue.Name response.Status)
            else
                let! body = response.text ()
                match decodeReading body with
                | Ok reading ->
                    return Ok { Venue = venue.Name; Where = venue.Where; Roof = venue.Roof; Reading = reading }
                | Error why -> return Error(sprintf "%s: %s" venue.Name why)
        with e ->
            return Error(sprintf "%s: %s" venue.Name e.Message)
    }

/// How many Open-Meteo requests may be in flight at once.
///
/// This was unbounded — `targets |> List.map fetchOne |> Promise.all` — which
/// fires one request per distinct coordinate SIMULTANEOUSLY. On 2026-08-15 a
/// twelve-venue slate did exactly that and Open-Meteo answered one of them with
/// `429 Too Many Requests`, costing that venue its chip and turning live-check
/// red on three assertions at once ("no page or console errors", "the chips all
/// filled within the wait", "every card whose venue the table knows carries a
/// live chip" — 11 of 12).
///
/// That is this page's own doing, not an outage, and it is why the fix is a
/// bound rather than tolerating the 429. A 429 is the server saying the client
/// is asking too fast; swallowing it would leave the page still asking too fast
/// and merely stop reporting the consequence.
///
/// Four is not tuned to a published quota — Open-Meteo documents per-minute and
/// per-day ceilings, and neither is what twelve-at-once trips. It is chosen to
/// keep the burst small while leaving the whole slate well inside live-check's
/// 20s chip wait: twelve venues become three waves, not twelve.
let private maxInFlight = 4

/// Split into bounded waves. Deliberately not a general utility — nothing else
/// in this repo fans out to a third party, and a shared helper would invite one.
let private waves (size: int) (xs: 'a list) : 'a list list =
    let rec go acc rest =
        match rest with
        | [] -> List.rev acc
        | _ -> go (List.truncate size rest :: acc) (List.skip (min size (List.length rest)) rest)
    go [] xs

/// Fetch the slate's weather and build the outcome.
///
/// The outcome is built by `slateWeather`, which is the only constructor — so
/// "no venues located" and "every request failed" cannot be conflated by this
/// function any more than by the renderer.
let fetchSlate (venueNames: string list) : JS.Promise<SlateWeather * string list> =
    promise {
        let located, unlocated = Venues.weatherEligible venueNames
        let targets = Venues.distinctLocations located |> List.map snd
        if List.isEmpty targets then
            return slateWeather [] [] [], unlocated
        else
            // Waves run in sequence; each wave's requests run together. Order is
            // preserved so a failure still names the venue it belongs to.
            let mutable settledAll : Result<VenueWeather, string> list = []
            for wave in waves maxInFlight targets do
                let! settled = wave |> List.map fetchOne |> Promise.all
                settledAll <- settledAll @ List.ofSeq settled
            let results = settledAll
            let readings = results |> List.choose (function Ok r -> Some r | Error _ -> None)
            let failed = results |> List.choose (function Error e -> Some e | Ok _ -> None)
            let attempted = targets |> List.map (fun v -> v.Name)
            return slateWeather attempted readings failed, unlocated
    }
