module Journalism

// The J-layer types: who answered, when a fact is true, and what a draft may be
// judged against.
//
// THREE DEFECTS THIS MODULE IS BUILT AROUND, ALL OBSERVED
//
// 1. THE MODEL FIELD RECORDS CONFIGURATION, NOT OUTCOME.
//
//    The relay's LLM topology: a request goes to `field-claude-proxy` with an
//    Anthropic Messages body. Gemini 3.1 Flash-Lite is the PRIMARY and is chosen
//    by the proxy; the body's `model` field names the FALLBACK
//    (`claude-haiku-4-5-20251001`). Which model actually answered comes back in
//    the `X-FIELD-Model` response header.
//
//    `field-relay-nba/src/index.js` never reads `X-FIELD-Model`. Searched
//    2026-08-15: the header appears in scripts, in CLAUDE.md and in CC-CMDs, and
//    nowhere in the worker source. The `model` column stored on every brief is
//    therefore a per-call-site constant — verified in the archive, where it
//    partitions perfectly by writer path (game_recap+cron always Haiku,
//    pre_game+cron always Gemini, backfill always Gemini) and never varies
//    within a path, which per-request fallback would.
//
//    So `AnsweringModel` is UNCONSTRUCTIBLE from stored data, and `ProxySilent`
//    is not a defensive case — it is the state of every archived row.
//
// 2. THE FALLBACK BRANCH HAS NEVER RUN.
//
//    Six of six sampled calls answered from Gemini with `X-FIELD-Gemini-Error`
//    empty. The Haiku path is shipped, depended upon, and unexercised. A stub
//    generator is the only way to reach it, which is the whole argument for
//    modelling generation as a function rather than a call site.
//
// 3. A NUMBER WITHOUT A TIME IS NOT A FACT.
//
//    `FIELD_PROSE_STYLE` forbids bare numbers, and the relay's Dim 8 measures
//    compliance — but nothing has ever counted the violations across the corpus.
//    `Fact` carries a MANDATORY `TimeWindow`, so "23.2 points" cannot be
//    constructed without saying when it was true.
//
// WHAT IS AND IS NOT GUARANTEED
//
//   GUARANTEED. A configured model name cannot be reported as the answering one.
//   A draft cannot be judged against a context that did not generate it. A fact
//   cannot exist without a time window. docs/JOURNALISM-PROOF.md compiles all of
//   these as build failures.
//
//   NOT GUARANTEED. Whether the prose is any good. That is the voice judge and no
//   type reaches it.

open System.Text.RegularExpressions

// --- brief types -------------------------------------------------------------

/// The brief types production actually writes.
///
/// `Unmodelled` follows `Desk.Sport`'s precedent rather than the closed 12-case
/// union first sketched: the relay adds brief types without asking, and a closed
/// union would mean laboratory silently mis-decoding one. The cases below are
/// the ones OBSERVED in `/quality/report` on 2026-08-15 — nine, not the twelve
/// the plan guessed at. Writing three imaginary cases to reach a number would be
/// the invention this repository exists to catch.
type BriefType =
    | GameRecap
    | PreGame
    | GameBrief
    | Slate
    | NightOwl
    | MlbGame
    | EplMatch
    | NarrativeContext
    | Compound
    | Unmodelled of raw: string

/// THE registry. Adding a case without adding it here does not compile.
let briefTypeName (t: BriefType) : string =
    match t with
    | GameRecap -> "game_recap"
    | PreGame -> "pre_game"
    | GameBrief -> "game_brief"
    | Slate -> "slate"
    | NightOwl -> "night_owl"
    | MlbGame -> "mlb_game"
    | EplMatch -> "epl_match"
    | NarrativeContext -> "narrative_context"
    | Compound -> "compound"
    | Unmodelled raw -> raw

let briefTypeOfString (raw: string) : BriefType =
    match raw with
    | "game_recap" -> GameRecap
    | "pre_game" -> PreGame
    | "game_brief" -> GameBrief
    | "slate" -> Slate
    | "night_owl" -> NightOwl
    | "mlb_game" -> MlbGame
    | "epl_match" -> EplMatch
    | "narrative_context" -> NarrativeContext
    | "compound" -> Compound
    | other -> Unmodelled other

let isModelled (t: BriefType) =
    match t with
    | Unmodelled _ -> false
    | _ -> true

// --- who answered ------------------------------------------------------------

/// What the request body's `model` field names.
///
/// Under this topology that is the FALLBACK, not the primary. The name is
/// deliberate: `model` reads like "the model used" and is not.
type FallbackModel = private FallbackModel of string

/// Which model actually produced the text.
///
/// Private, and the only constructor reads the `X-FIELD-Model` response header.
/// There is deliberately no way to build one from a stored `model` column,
/// because that column is a configuration constant.
type AnsweringModel = private AnsweringModel of string

let fallbackModel (nameInRequestBody: string) : FallbackModel = FallbackModel nameInRequestBody

/// The ONLY constructor. Takes the header by name so a call site cannot pass the
/// stored `model` column by accident and have it type-check.
let answeringModelFromHeader (xFieldModel: string) : AnsweringModel option =
    let trimmed = xFieldModel.Trim()
    if trimmed = "" then None else Some(AnsweringModel trimmed)

let fallbackName (FallbackModel n) = n
let answeringName (AnsweringModel n) = n

/// What can be known about who answered.
type Answered =
    /// The header named a model and it is usable.
    | By of AnsweringModel
    /// No `X-FIELD-Model` came back, or nothing read it. Provenance is absent —
    /// NOT "the fallback answered", and not "the primary answered".
    | ProxySilent
    /// Gemini failed and something other than the model we named answered.
    | Unexpected of FallbackModel * AnsweringModel
    /// A header arrived that cannot be used as provenance.
    | Unusable of AnsweringModel * detail: string

/// Decide provenance from what the proxy returned.
///
/// `geminiError` is `X-FIELD-Gemini-Error`: present means the primary failed and
/// the fallback should have run.
let answeredFrom
    (declaredFallback: FallbackModel)
    (xFieldModel: string option)
    (geminiError: string option)
    : Answered =
    match xFieldModel |> Option.bind answeringModelFromHeader with
    // The production case. No provenance header is read anywhere, so this is
    // what every archived brief actually is.
    | None -> ProxySilent
    | Some answering ->
        let named = answeringName answering
        if named.Contains " " then
            Unusable(answering, "provenance header is not a model id")
        else
            match geminiError with
            // Primary answered. Nothing to reconcile.
            | None -> By answering
            // Primary failed, so the fallback branch ran. It must be the model we
            // named — anything else is the proxy substituting silently.
            | Some _ ->
                if named = fallbackName declaredFallback then By answering
                else Unexpected(declaredFallback, answering)

/// Did the fallback branch actually run, and was it the model we asked for?
///
/// Deliberately total and deliberately NOT a bool: "we cannot tell" is a third
/// answer and collapsing it into `false` is the defect in item 1 above.
let fallbackRan (declaredFallback: FallbackModel) (a: Answered) : bool option =
    match a with
    | ProxySilent -> None
    | Unusable _ -> None
    | By m -> Some(answeringName m = fallbackName declaredFallback)
    | Unexpected _ -> Some false

// --- when a fact is true -----------------------------------------------------

/// The temporal anchors `FIELD_PROSE_STYLE` accepts, taken from the relay's own
/// Dim 8 `TEMPORAL_RE` rather than invented here.
type TimeWindow =
    | Tonight
    | ThisSeason
    | ThisSeries
    | ThisPostseason
    | ThisYear
    | OnTheYear
    | PerGame
    | Career
    | InThePlayoffs
    | InGame of number: int
    | InYear of year: int
    | SinceYear of year: int
    | LastNGames of games: int

/// THE registry, following `Desk.sportMeta` and `briefTypeName`. Adding a
/// `TimeWindow` case without naming it here does not compile, and the label is
/// the phrase `FIELD_PROSE_STYLE` accepts — so a consumer can render the window
/// back into prose rather than inventing wording for it.
let windowLabel (w: TimeWindow) : string =
    match w with
    | Tonight -> "tonight"
    | ThisSeason -> "this season"
    | ThisSeries -> "this series"
    | ThisPostseason -> "this postseason"
    | ThisYear -> "this year"
    | OnTheYear -> "on the year"
    | PerGame -> "per game"
    | Career -> "career"
    | InThePlayoffs -> "in the playoffs"
    | InGame n -> sprintf "in game %d" n
    | InYear y -> sprintf "in %d" y
    | SinceYear y -> sprintf "since %d" y
    | LastNGames n -> sprintf "last %d games" n

/// A number that means something, because it says when it was true.
///
/// Private, with a mandatory window. `{ Text = "23.2 points" }` is not a `Fact`
/// and cannot be made into one by leaving a field off.
type Fact = private { Claim: string; Window: TimeWindow }

let fact (claim: string) (window: TimeWindow) : Fact = { Claim = claim; Window = window }
let claimOf (f: Fact) = f.Claim
let windowOf (f: Fact) = f.Window

// --- the relay's Dim 8, reproduced -------------------------------------------
//
// Copied from `field-relay-nba/src/journalism-quality.js` `_temporalPrecision`.
// Note the sentence split here is `.filter(Boolean)` — NON-EMPTY — while
// `scoreProse` a few functions away filters `s.length > 3`. Two different
// tokenisations in one file. Reproduced rather than reconciled, because the
// agreement check below is worthless if this quietly computes something tidier.

// The relay writes the last alternative as `\+\/\-`. Fable emits regexes with
// the `u` flag, under which `\-` outside a character class is an invalid escape
// and the module fails to load at all. `\+/-` matches the identical three
// characters — the deviation is in the ESCAPING, not the language, and it is
// forced. Every other character is verbatim, and the corpus agreement check
// against the untouched JS original is what keeps that honest.
let private STAT_RE =
    Regex(@"\d+\.?\d*\s*(ppg|apg|rpg|pts?|points?|rebounds?|assists?|goals?|saves?|era|ops|mph|yards?|rbi|%|\+/-)",
          RegexOptions.IgnoreCase)

let private TEMPORAL_RE =
    Regex(@"\b(this series|this season|this postseason|in game \d|game \d|in \d{4}|since \d{4}|last \d+ games?|per game|on the year|this year|career|tonight|in the playoffs?|in these playoffs?)\b",
          RegexOptions.IgnoreCase)

let private dim8Sentences (text: string) =
    text.Split([| '.'; '!'; '?' |])
    |> Array.map (fun s -> s.Trim())
    |> Array.filter (fun s -> s <> "")

/// Sentences carrying a stat, and how many of those are time-anchored.
let anchoring (text: string) : int * int =
    let mutable stat = 0
    let mutable anchored = 0
    for s in dim8Sentences text do
        if STAT_RE.IsMatch s then
            stat <- stat + 1
            if TEMPORAL_RE.IsMatch s then anchored <- anchored + 1
    stat, anchored

/// Dim 8, weight 20. Returns the relay's neutral 10 when no sentence carries a
/// stat — an absence of stats is not an absence of anchoring.
let temporalPrecision (text: string) : int =
    let stat, anchored = anchoring text
    if stat = 0 then 10
    else int (System.Math.Round(float anchored / float stat * 20.0))

/// Sentences that carry a stat and no time window — the violations
/// `FIELD_PROSE_STYLE` forbids and nothing has counted.
let unanchoredStatSentences (text: string) : string list =
    dim8Sentences text
    |> Array.filter (fun s -> STAT_RE.IsMatch s && not (TEMPORAL_RE.IsMatch s))
    |> List.ofArray

// --- generation --------------------------------------------------------------

/// What a brief is about. Private so a prompt cannot be re-pointed after it is
/// built.
type BriefContext = private { Kind: BriefType; Subject: string }

let briefContext (kind: BriefType) (subject: string) : BriefContext =
    { Kind = kind; Subject = subject }

let contextKind (c: BriefContext) = c.Kind
let contextSubject (c: BriefContext) = c.Subject

/// A prompt, carrying the context that produced it.
type Prompt = private { Instruction: string; Context: BriefContext }

let prompt (context: BriefContext) (instruction: string) : Prompt =
    { Instruction = instruction; Context = context }

let instructionOf (p: Prompt) = p.Instruction
let promptContext (p: Prompt) = p.Context

/// Generated text, carrying the prompt that produced it AND the provenance of
/// the model that wrote it.
///
/// Both are attached at construction. A draft that has lost track of either is
/// not representable, which is what makes "judge this draft against that context"
/// a compile error rather than a review comment.
type Draft = private { Body: string; Source: Prompt; Provenance: Answered }

let draft (source: Prompt) (provenance: Answered) (body: string) : Draft =
    { Body = body; Source = source; Provenance = provenance }

let bodyOf (d: Draft) = d.Body
let draftPrompt (d: Draft) = d.Source
let provenanceOf (d: Draft) = d.Provenance

type GenerationFailure =
    /// Primary failed AND the fallback failed. Must not be representable as a
    /// successful draft, which is why the generator returns a Result.
    | BothPathsFailed of primary: string * fallback: string
    | NoResponse of detail: string
    | EmptyBody

type Generator = Prompt -> Async<Result<Draft, GenerationFailure>>

// --- judging -----------------------------------------------------------------

type Verdict =
    | Held
    | Failed of reason: string
    | Unreadable

/// Judge a draft against a context.
///
/// The context argument is not decoration: `judge` requires the draft to have
/// been generated FROM the context it is judged against. Passing a different one
/// returns `Unreadable` rather than a verdict, because a verdict about the wrong
/// subject is worse than no verdict.
let judge (against: BriefContext) (d: Draft) : Verdict =
    if promptContext (draftPrompt d) <> against then
        Unreadable
    elif bodyOf d = "" then
        Failed "empty draft"
    else
        match unanchoredStatSentences (bodyOf d) with
        | [] -> Held
        | violations -> Failed(sprintf "%d stat sentence(s) with no time window" (List.length violations))
