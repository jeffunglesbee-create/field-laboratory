module Market

open Units

// Win-probability carries its MARKET SHAPE as a type.
//
// THE DEFECT THIS REMOVES
//
// Found live in jubilant-bassoon (the FIELD app): `score.wp` is written from
// four sites carrying three different quantities, and one fallback computes the
// away probability as the two-way complement of home:
//
//     _wpA = _wpOdds.awayWP ?? (1 - _wpH)
//
// `1 - homeWP` IS the away probability — in a TWO-WAY market. In a THREE-WAY
// market (soccer: home/draw/away) the complement of home is away PLUS draw. So a
// three-way game reaching that branch renders 0.45 / 0.28 / 0.27 as home 45% /
// away 55% / no draw, the draw's probability folded silently into the away side
// and shown at full confidence. The relay de-vigs correctly; the client is the
// layer that lets a three-way component and a two-way complement share one bare
// `number`.
//
// This is the `implied` vs `prob` proof (docs/UNITS-PROOF.md, docs/ODDS-PROOF.md)
// one axis further. There the confusion was MEANING at one scale — a vigged
// price is not a probability. Here it is SHAPE at one meaning — a two-way
// complement is not the away probability of a three-way market. Both are removed
// the same way: give the quantity a type that makes the wrong operation fail to
// compile. `awayComplement` exists for `TwoWay` and cannot be called on a
// `ThreeWay`, so `1 - homeWP` on a soccer market does not build.
//
// HONEST LIMIT (recorded, per the finding that prompted this): the client's
// two-way fallback path is reachable, but a three-way game was not confirmed to
// hit it live — it is a latent defect on a permitted branch, not a confirmed
// live miscalculation. The type removes the branch regardless of whether today's
// data happens to reach it, which is the same "compliant only by accident of the
// data" reasoning the amnesty gate is built on. scripts/wp-check.mjs demonstrates
// the arithmetic on real de-vigged three-way numbers; confirming a live soccer
// game reaches the client branch is the client's to probe, not the laboratory's.

/// The tolerance a probability set may miss 1.0 by — float rounding only, not a
/// slack that would let a genuinely un-normalised set masquerade as one.
let private SUM_EPS = 1e-9

/// A two-way market: home and away, summing to 1. The away side IS the
/// complement of home, so `awayComplement` is meaningful here — and only here.
type TwoWay = private TwoWay of home: float<prob> * away: float<prob>

/// A three-way market: home, draw, away, summing to 1. The complement of home is
/// away PLUS draw, so there is deliberately no `1 - home` path: the only way to
/// the away side is to carry the draw.
type ThreeWay = private ThreeWay of home: float<prob> * draw: float<prob> * away: float<prob>

/// Smart constructors validate the sum, so a set that does not normalise cannot
/// be built and then mislabelled a probability set. `None` is a real refusal,
/// the same device `devig` uses for a market that sums to zero.
let twoWay (home: float<prob>) (away: float<prob>) : TwoWay option =
    if abs (float home + float away - 1.0) <= SUM_EPS then Some(TwoWay(home, away)) else None

let threeWay (home: float<prob>) (draw: float<prob>) (away: float<prob>) : ThreeWay option =
    if abs (float home + float draw + float away - 1.0) <= SUM_EPS then Some(ThreeWay(home, draw, away)) else None

let twoWayHome (TwoWay (h, _)) = h
let twoWayAway (TwoWay (_, a)) = a
let threeWayHome (ThreeWay (h, _, _)) = h
let threeWayDraw (ThreeWay (_, d, _)) = d
let threeWayAway (ThreeWay (_, _, a)) = a

/// The away probability as the complement of home. Valid ONLY for a two-way
/// market — THIS is the operation the client got wrong. There is no `ThreeWay`
/// counterpart on purpose: on a three-way market `1 - home` names away+draw, not
/// away, so the type refuses to let the question be asked of the wrong shape.
let awayComplement (TwoWay (home, _)) : float<prob> = 1.0<prob> - home

/// De-vig a two-way market from a pair of implied prices — `Units.devig`, lifted
/// into a shape-typed market so the result cannot be used as a three-way set.
let devigTwoWay (home: float<implied>) (away: float<implied>) : TwoWay option =
    devig home away |> Option.bind (fun (h, a) -> twoWay h a)

/// De-vig a three-way market: the three-way analogue of `devig`, normalising the
/// three implied prices to sum to 1. The same proportional-margin assumption as
/// `devig`, kept in one place so it has exactly one home.
let devigThreeWay (home: float<implied>) (draw: float<implied>) (away: float<implied>) : ThreeWay option =
    let total = float home + float draw + float away
    if total <= 0.0 then None
    else threeWay (float home / total * 1.0<prob>) (float draw / total * 1.0<prob>) (float away / total * 1.0<prob>)
