#!/usr/bin/env python3
"""INDEPENDENT RECOMPUTATION of outbox/forecast-fit-2026-11-08.mjs: a different language, a different optimiser (scipy BFGS / L-BFGS-B / Nelder-Mead against the
script's own Nelder-Mead and golden-section search), and a separate implementation of the objective, the cross-validation, the scores and the calibration slope.

Why it exists (field-relay-nba Rule 90, MUTATE-FIRST-A, and this repo's probe-first rule): the fit script checks its optimiser against a second optimiser that
minimises the SAME objective, so a wrong objective would pass every one of those checks. This file re-derives the objective itself.

What it takes as given: the per-match ratings and outcomes (rh, ra, o) dumped by the script with --dump-features. Those were checked in the script against the
compiled F# model on all 460 forecasts of both seasons and against the earlier committed records. What it recomputes: the log-likelihood, both maximum-likelihood
fits, the 5-fold cross-validation, the selection z, the hold-out and cross-validated Brier scores and their paired z, the opening-week scores, and the home-win
calibration slope with its standard error.

USAGE.  node outbox/forecast-fit-2026-11-08.mjs <sources-dir> outbox/forecast-fit-holdout-2026-11-08.json --dump-features=<features.json>
        python3 outbox/forecast-fit-crosscheck-2026-11-08.py <features.json>
Exit 0 only if every check holds. Coverage is printed on the last line."""
import json, math, sys
import numpy as np
from scipy.optimize import minimize

def nan_for_null(x):
    """JSON.stringify writes NaN and Infinity as null. Put NaN back, so that a value the script could not compute makes a comparison FAIL instead of crashing this file."""
    if x is None:
        return float('nan')
    if isinstance(x, dict):
        return {k: nan_for_null(v) for k, v in x.items()}
    if isinstance(x, list):
        return [nan_for_null(v) for v in x]
    return x

d = nan_for_null(json.load(open(sys.argv[1])))
TH0, THS, JS = d['TH0'], d['thS'], d['js']
checks = []
def check(name, ok, detail=''):
    checks.append((name, bool(ok), detail))

def arr(rows):
    return (np.array([r['rh'] for r in rows], float), np.array([r['ra'] for r in rows], float), np.array([r['o'] for r in rows], int))

def probs(rh, ra, home, scale, drawBase, drawDecay):
    g = rh - ra + home
    pD = drawBase * np.exp(-np.abs(g) / drawDecay)
    pH = (1 - pD) / (1 + np.exp(-g / scale))
    return np.stack([pH, pD, 1 - pD - pH], axis=1)

def logloss_vec(P, o):
    return -np.log(np.maximum(P[np.arange(len(o)), o], 1e-12))

def brier_vec(P, o):
    Y = np.zeros_like(P); Y[np.arange(len(o)), o] = 1.0
    return ((P - Y) ** 2).sum(axis=1)

def paired(a, b):
    diff = np.asarray(a) - np.asarray(b)
    se = diff.std(ddof=1) / math.sqrt(len(diff))
    return diff.mean(), se, diff.mean() / se

def to_theta(u, free, base):
    t = dict(base)
    for k, v in zip(free, u):
        t[k] = v if k == 'home' else math.exp(v) if k in ('scale', 'drawDecay') else 0.9 / (1 + math.exp(-v))
    return t

def start_for(t, free):
    return [t['home'] if k == 'home' else math.log(t[k]) if k in ('scale', 'drawDecay') else math.log((t[k] / 0.9) / (1 - t[k] / 0.9)) for k in free]

def fit(rows, free, base, extra_starts=()):
    rh, ra, o = arr(rows)
    f = lambda u: float(logloss_vec(probs(rh, ra, **to_theta(u, free, base)), o).sum())
    bounds = [(-3, 14) if k == 'drawDecay' else (None, None) for k in free]
    best = None
    for u0 in [start_for(base, free)] + [start_for({**base, **e}, free) for e in extra_starts]:
        r1 = minimize(f, u0, method='L-BFGS-B', bounds=bounds, options={'ftol': 1e-15, 'gtol': 1e-10, 'maxiter': 5000})
        r2 = minimize(f, r1.x, method='Nelder-Mead', bounds=bounds, options={'xatol': 1e-10, 'fatol': 1e-13, 'maxiter': 40000})
        for r in (r1, r2):
            if best is None or r.fun < best.fun:
                best = r
    return to_theta(best.x, free, base), float(best.fun)

def total_nll(rows, th):
    rh, ra, o = arr(rows)
    return float(logloss_vec(probs(rh, ra, **th), o).sum())

FREE = {'A': ['home', 'scale'], 'B': ['home', 'scale', 'drawBase', 'drawDecay']}
STARTS = {'A': [{'home': 0.1, 'scale': 2.0}, {'home': 0.6, 'scale': 0.3}], 'B': [{'home': 0.4, 'scale': 1.2, 'drawBase': 0.27, 'drawDecay': 30.0}, {'home': 0.2, 'scale': 0.8, 'drawBase': 0.30, 'drawDecay': 3.0}]}
train, hold, tOpen, hOpen = d['train'], d['hold'], d['trainOpen'], d['holdOpen']

# 1. the objective, at three points, against the script's own reported totals
check(f"objective: table-v1's total log loss on the {len(train)} training forecasts equals the script's ({total_nll(train, TH0):.6f} vs {JS['v1Nll']:.6f})", abs(total_nll(train, TH0) - JS['v1Nll']) < 1e-8)
for c in 'AB':
    th = JS[c]['th']
    check(f"objective: at the script's own {c} constants the total log loss equals the script's ({total_nll(train, th):.6f} vs {JS[c]['nll']:.6f})", abs(total_nll(train, th) - JS[c]['nll']) < 1e-8)

# 2. the maximum-likelihood fits
fits = {}
for c in 'AB':
    th, nll = fit(train, FREE[c], TH0, STARTS[c]); fits[c] = (th, nll)
    check(f"fit {c}: scipy's optimum is no higher than the script's ({nll:.6f} vs {JS[c]['nll']:.6f}) and within {'1e-6' if c == 'A' else '0.01'} of it", nll <= JS[c]['nll'] + 1e-7 and JS[c]['nll'] - nll < (1e-6 if c == 'A' else 0.01))
thA = fits['A'][0]
check(f"fit A: the constants agree (home {thA['home']:.4f} vs {JS['A']['th']['home']:.4f}, scale {thA['scale']:.4f} vs {JS['A']['th']['scale']:.4f}) to 2e-3", abs(thA['home'] - JS['A']['th']['home']) < 2e-3 and abs(thA['scale'] - JS['A']['th']['scale']) < 2e-3)
thB = fits['B'][0]
check(f"fit B: scipy also finds no finite draw decay (it stops at {thB['drawDecay']:.1f}; the script at {JS['B']['th']['drawDecay']:.1f}; both above 20), and the other constants agree to 0.02 (home {thB['home']:.3f} vs {JS['B']['th']['home']:.3f}, scale {thB['scale']:.3f} vs {JS['B']['th']['scale']:.3f}, base {thB['drawBase']:.3f} vs {JS['B']['th']['drawBase']:.3f})",
      thB['drawDecay'] > 20 and JS['B']['th']['drawDecay'] > 20 and abs(thB['home'] - JS['B']['th']['home']) < 0.02 and abs(thB['scale'] - JS['B']['th']['scale']) < 0.02 and abs(thB['drawBase'] - JS['B']['th']['drawBase']) < 0.02)

# 3. 5-fold cross-validation, the same folds (row index mod 5), fitted here with scipy
K = d['cvFolds']
def cv_preds(rows, free, starts):
    P = np.zeros((len(rows), 3))
    for k in range(K):
        tr = [r for i, r in enumerate(rows) if i % K != k]
        te_idx = [i for i in range(len(rows)) if i % K == k]
        assert not set(range(len(rows))) - set(i for i in range(len(rows)) if i % K != k) - set(te_idx)
        th, _ = fit(tr, free, TH0, starts)
        rh, ra, _o = arr([rows[i] for i in te_idx])
        P[te_idx] = probs(rh, ra, **th)
    return P
rh, ra, o = arr(train)
cvP = {c: cv_preds(train, FREE[c], STARTS[c]) for c in 'AB'}
cvLL = {c: logloss_vec(cvP[c], o) for c in 'AB'}
for c in 'AB':
    tol = 1e-4 if c == 'A' else 2e-3
    check(f"cross-validation {c}: log loss per match {cvLL[c].mean():.5f} vs the script's {JS[c]['cvLL']:.5f} (tolerance {tol})", abs(cvLL[c].mean() - JS[c]['cvLL']) < tol)
_, _, selz = paired(cvLL['B'], cvLL['A'])
check(f"selection: the paired z of B against A is {selz:.2f} vs the script's {JS['selZ']:.2f} (tolerance 0.05) and picks the same candidate ({'B' if selz <= -2.0 else 'A'} vs {JS['S']})", abs(selz - JS['selZ']) < 0.05 and ('B' if selz <= -2.0 else 'A') == JS['S'])

# 4. scores of S (the script's rounded constants) and of table-v1
S = JS['S']
def score(rows, th):
    a, b, oo = arr(rows)
    return brier_vec(probs(a, b, **th), oo)
v1_h, s_h = score(hold, TH0), score(hold, THS)
m, se, z = paired(s_h, v1_h)
check(f"R1 inputs: hold-out Brier S {s_h.mean():.4f} / table-v1 {v1_h.mean():.4f}, paired z {z:.3f}; the script's {JS['r1']['brierS']:.4f} / {JS['r1']['brierV']:.4f}, z {JS['r1']['z']:.3f} (n {len(hold)})",
      abs(s_h.mean() - JS['r1']['brierS']) < 1e-9 and abs(v1_h.mean() - JS['r1']['brierV']) < 1e-9 and abs(z - JS['r1']['z']) < 1e-9)
cvBrierS = brier_vec(cvP[S], o); v1_t = score(train, TH0)
_, _, z3 = paired(cvBrierS, v1_t); _, _, z2 = paired(cvBrierS, np.full(len(o), 2 / 3))
check(f"R3 inputs: cross-validated paired z against table-v1 {z3:.2f} vs the script's {JS['r3z']:.2f} (tolerance 0.05); R2 inputs: against a uniform guess {z2:.2f} vs {JS['r2z']:.2f} (tolerance 0.05)", abs(z3 - JS['r3z']) < 0.05 and abs(z2 - JS['r2z']) < 0.05)
check(f"R4 inputs: opening-week Brier last season S {score(tOpen, THS).mean():.4f} / table-v1 {score(tOpen, TH0).mean():.4f}, this season {score(hOpen, THS).mean():.4f} / {score(hOpen, TH0).mean():.4f}; the script's {JS['open']['trainS']:.4f} / {JS['open']['trainV']:.4f}, {JS['open']['holdS']:.4f} / {JS['open']['holdV']:.4f}",
      all(abs(a - b) < 1e-9 for a, b in [(score(tOpen, THS).mean(), JS['open']['trainS']), (score(tOpen, TH0).mean(), JS['open']['trainV']), (score(hOpen, THS).mean(), JS['open']['holdS']), (score(hOpen, TH0).mean(), JS['open']['holdV'])]))

# 5. the calibration slope: logistic regression of a home win on logit(pHome), Newton in numpy
x = np.log(cvP[S][:, 0] / (1 - cvP[S][:, 0])); y = (o == 0).astype(float)
X = np.stack([np.ones_like(x), x], axis=1); beta = np.zeros(2)
for _ in range(100):
    p = 1 / (1 + np.exp(-X @ beta)); W = p * (1 - p)
    step = np.linalg.solve(X.T @ (X * W[:, None]), X.T @ (y - p)); beta += step
    if np.abs(step).max() < 1e-12:
        break
se_b = math.sqrt(np.linalg.inv(X.T @ (X * W[:, None]))[1, 1])
check(f"R5 inputs: cross-validated home-win slope {beta[1]:.3f} +/- {se_b:.3f} vs the script's {JS['slCV']['b']:.3f} +/- {JS['slCV']['se']:.3f} (tolerance 0.03 on the slope, 0.01 on its error)", abs(beta[1] - JS['slCV']['b']) < 0.03 and abs(se_b - JS['slCV']['se']) < 0.01)

for n, ok, det in checks:
    print('PASS' if ok else 'FAIL', n)
bad = sum(1 for _, ok, _d in checks if not ok)
print(f"\n{len(checks) - bad} of {len(checks)} checks hold; coverage: {len(train)} training rows, {len(hold)} hold-out rows, {len(tOpen)} + {len(hOpen)} opening-week rows recomputed from the script's feature dump; the ratings themselves are not re-derived here")
sys.exit(0 if bad == 0 else 1)
