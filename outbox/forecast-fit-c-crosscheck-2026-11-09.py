#!/usr/bin/env python3
"""INDEPENDENT RE-DERIVATION for outbox/forecast-season-2024-25-2026-11-09.mjs and outbox/forecast-fit-c-2026-11-09.mjs (field-relay-nba's Rule 90: a check that has only ever
passed has proven nothing; and this repo's question: is it the source, or a copy of the source?). Python, a different parser and a different way of finding each date's year,
written to agree with the JavaScript only if both are right.

  python3 -I outbox/forecast-fit-c-crosscheck-2026-11-09.py data <sources-dir> <2024-25 bundle .json>
      Re-parses the four RAW 2024-25 files and requires the committed bundle to equal what this parse finds: 380 fixtures field by field, ESPN's 20 table rows, FPL's 380 fixtures
      and 20 team names, the club mapping found by a second method (constraint intersection, not the JavaScript's iterative matching), and the raw files' sha256.
      It prints booleans and counts, never a tally of results.

  python3 -I outbox/forecast-fit-c-crosscheck-2026-11-09.py fit <features .json from the C script's --dump-features> <2024-25 bundle .json>
      Re-derives the 2024-25 forecasts' features from the BUNDLE by an independent replay, refits C on 2025-26 with a gradient method (the JavaScript uses Nelder-Mead and
      golden-section coordinate descent), rescores everything, finds the home-win slopes by BFGS, and recomputes rules N1-N6 from its own numbers. N7 (every integrity check) is the
      JavaScript script's own list and is not repeated here. The 2025-26 and 2026-27 features are taken from the JavaScript's dump (they were tied to committed records of table-v1
      by the script's reproduction checks); that is stated in the output, as a coverage line.
"""
import csv, datetime, hashlib, io, json, re, sys

checks = []
def check(name, ok, detail=''):
    checks.append((name, bool(ok), detail))

def finish():
    for name, ok, detail in checks:
        print(('PASS ' if ok else 'FAIL ') + name + (f' [{detail}]' if detail else ''))
    bad = sum(1 for _, ok, _ in checks if not ok)
    print(f'\n{len(checks) - bad} of {len(checks)} checks hold')
    return 0 if bad == 0 else 1

FILES = {'openfootball': 'openfootball-2024-25.txt', 'fplFixtures': 'fpl-fixtures-2024-25.csv', 'fplTeams': 'fpl-teams-2024-25.csv', 'espnFinal': 'espn-final-2024.json'}
MONTHS = {m: i + 1 for i, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])}

def parse_openfootball(text):
    """Fixtures in file order. The year of each date line is FOUND by weekday (the first year in which that day-and-month falls on the named weekday, trying the carried year then
    the next), not carried by a month wrap as the JavaScript does."""
    out, md, date, dow, tm, year = [], None, None, None, None, None
    for ln, raw in enumerate(text.split('\n'), 1):
        line = raw.rstrip('\r')
        if not line.strip() or line.startswith('=') or line.startswith('#'):
            continue
        if line.startswith('▪ Matchday '):
            md = int(line.split()[-1]); continue
        m = re.match(r'^  ([A-Z][a-z]{2}) ([A-Z][a-z]{2}) (\d{1,2})(?: (\d{4}))?\s*$', line)
        if m:
            wd, mon, day = m.group(1), MONTHS[m.group(2)], int(m.group(3))
            cands = [int(m.group(4))] if m.group(4) else [year, year + 1]
            found = [y for y in cands if y is not None and datetime.date(y, mon, day).strftime('%a') == wd]
            assert len(found) == 1, f'line {ln}: no single year makes {wd} {mon}/{day} a {wd}'
            year, date, dow, tm = found[0], f'{found[0]:04d}-{mon:02d}-{day:02d}', wd, None
            continue
        s = line.strip()
        mt = re.match(r'^(\d\d:\d\d)\s+(.*)$', s)
        if mt:
            tm, s = mt.group(1), mt.group(2)
        mtail = re.search(r'\s(\d+)-(\d+)(?:\s+\((\d+)-(\d+)\))?$', s)
        assert mtail, f'line {ln}: not a fixture: {s[:60]}'
        parts = re.split(r'\s+v\s+', s[:mtail.start()])
        assert len(parts) == 2 and tm is not None and md is not None and date is not None, f'line {ln}: unparsed'
        out.append({'i': len(out), 'ln': ln, 'matchday': md, 'date': date, 'time': tm, 'dow': dow, 'home': parts[0].strip(), 'away': parts[1].strip(), 'hg': int(mtail.group(1)), 'ag': int(mtail.group(2))})
    return out

def table_of(ms):
    t = {}
    for m in ms:
        for club, gf, ga in ((m['home'], m['hg'], m['ag']), (m['away'], m['ag'], m['hg'])):
            r = t.setdefault(club, [0, 0, 0, 0]); r[0] += 1; r[2] += gf; r[3] += ga
            r[1] += 3 if gf > ga else 1 if gf == ga else 0
    return t

def mode_data(src, bundle_path):
    b = json.load(open(bundle_path))
    raw = {k: open(f'{src}/{f}', 'rb').read() for k, f in FILES.items()}
    check('the four raw files are the ones the bundle pins, by bytes and sha256',
          all(len(raw[k]) == b['raw'][k]['bytes'] and hashlib.sha256(raw[k]).hexdigest() == b['raw'][k]['sha256'] for k in FILES))
    fx = parse_openfootball(raw['openfootball'].decode('utf-8'))
    check(f'openfootball re-parsed independently: {len(fx)} fixtures, and the bundle holds the same {len(b["matches"])}', len(fx) == 380 == len(b['matches']))
    keys = ['i', 'ln', 'matchday', 'date', 'time', 'dow', 'home', 'away', 'hg', 'ag']
    same = sum(1 for a, c in zip(fx, b['matches']) if all(a[k] == c[k] for k in keys))
    check(f'every fixture equals the bundle\'s, field by field: i, line, matchday, date, kick-off, weekday, both clubs, both scores ({same} of {len(fx)})', same == len(fx) == 380)
    hdr = {}
    for line in raw['openfootball'].decode('utf-8').split('\n'):
        mm = re.match(r'^# (Teams|Matches)\s+(\d+)', line.rstrip('\r'))
        if mm: hdr[mm.group(1)] = int(mm.group(2))
    dates = sorted(f['date'] for f in fx)
    check('the file header\'s team count, match count and first and last day are what the bundle records',
          hdr.get('Teams') == b['header']['teams'] == len({f['home'] for f in fx} | {f['away'] for f in fx}) and hdr.get('Matches') == b['header']['matches'] == len(fx)
          and dates[0] == b['header']['first'] and dates[-1] == b['header']['last'])
    # ESPN, read straight from the JSON (not through the F# decoder)
    ej = json.loads(raw['espnFinal'].decode('utf-8'))
    ents = ej['children'][0]['standings']['entries']
    def stat(e, name): return next(s['value'] for s in e['stats'] if s['name'] == name)
    espn = sorted((int(stat(e, 'gamesPlayed')), int(stat(e, 'points')), int(stat(e, 'pointsFor')), int(stat(e, 'pointsAgainst'))) for e in ents)
    mine = sorted(tuple(v) for v in table_of(fx).values())
    check('ESPN, read straight from its JSON (20 entries; games played, points, goals for and against): equal to the table the re-parsed results make, club by club', len(ents) == 20 and espn == mine)
    check('ESPN: the bundle\'s 20 standings rows are the same tuples', sorted((r['played'], r['points'], r['gf'], r['ga']) for r in b['standings']) == espn)
    check('ESPN: no entry carries a deduction, and the payload names the 2024-25 season', all(stat(e, 'deductions') == 0 for e in ents) and ej['season']['year'] == 2024 and ej['children'][0]['name'] == 'English Premier League 2024-2025' == b['espn']['name'])
    # FPL, with the csv module
    rows = list(csv.DictReader(io.StringIO(raw['fplFixtures'].decode('utf-8'), newline='')))
    fpl = [(r['kickoff_time'][:10], int(r['team_h']), int(r['team_a']), int(r['team_h_score']), int(r['team_a_score'])) for r in rows]
    check('FPL, read with the csv module: 380 fixtures, all marked finished', len(rows) == 380 and all(r['finished'] == 'True' for r in rows))
    check('FPL: the bundle\'s 380 fixtures are the same, in the same order', fpl == [(f['date'], f['h'], f['a'], f['hg'], f['ag']) for f in b['fpl']])
    names = {r['id']: r['name'] for r in csv.DictReader(io.StringIO(raw['fplTeams'].decode('utf-8'), newline=''))}
    check('FPL: the bundle\'s 20 team names are the teams file\'s', names == b['fplNames'] and len(names) == 20)
    # a second way to map clubs to FPL ids: each club's id is the one id that fits EVERY one of its 38 matches (intersection of candidates), then check it is a bijection
    bucket = {}
    for d, h, a, hg, ag in fpl: bucket.setdefault((d, hg, ag), []).append((h, a))
    cand = {}
    for f in fx:
        pairs = bucket.get((f['date'], f['hg'], f['ag']), [])
        cand[f['home']] = cand.get(f['home'], {h for h, _ in pairs}) & {h for h, _ in pairs}
        cand[f['away']] = cand.get(f['away'], {a for _, a in pairs}) & {a for _, a in pairs}
    mapping = {c: next(iter(s)) for c, s in cand.items() if len(s) == 1}
    check(f'club to FPL id by intersection of candidates: every one of {len(cand)} clubs resolves to exactly one id, and the map is one-to-one ({len(mapping)} resolved)', len(cand) == 20 and len(mapping) == 20 and len(set(mapping.values())) == 20)
    ok = len(mapping) == 20 and sorted((f['date'], mapping[f['home']], mapping[f['away']], f['hg'], f['ag']) for f in fx) == sorted(fpl)
    check('with that map, the 380 re-parsed results are exactly FPL\'s 380 fixtures (date, both ids, both scores), as sets', ok)
    return finish()

def rating(t):
    return None if t[0] <= 0 else t[1] / t[0] + 0.25 * ((t[2] - t[3]) / t[0]) + 0.10 * (t[2] / t[0])

def replay_features(matches):
    """Play-order features from the table BEFORE each match. t = [played, points, goals for, goals against]."""
    T, out = {}, []
    for m in sorted(matches, key=lambda m: (m['date'], m['time'], m['i'])):
        h, a = T.setdefault(m['home'], [0, 0, 0, 0]), T.setdefault(m['away'], [0, 0, 0, 0])
        out.append({'pre': min(h[0], a[0]), 'rh': rating(h), 'ra': rating(a), 'o': 0 if m['hg'] > m['ag'] else 1 if m['hg'] == m['ag'] else 2})
        for t, gf, ga in ((h, m['hg'], m['ag']), (a, m['ag'], m['hg'])):
            t[0] += 1; t[2] += gf; t[3] += ga; t[1] += 3 if gf > ga else 1 if gf == ga else 0
    return out

def mode_fit(feat_path, bundle_path):
    import math
    import numpy as np
    from scipy.optimize import minimize
    J = json.load(open(feat_path)); js = J['js']
    B = json.load(open(bundle_path))
    near = lambda a, b, tol=1e-9: abs(a - b) <= tol * max(1.0, abs(b))

    # ---- 2024-25 features, re-derived from the bundle
    feats = replay_features(B['matches'])
    usable = [f for f in feats if f['rh'] is not None and f['ra'] is not None]
    mine = {'fresh': [f for f in usable if f['pre'] >= 5], 'freshOpen': [f for f in usable if 1 <= f['pre'] <= 4], 'freshAll': usable}
    for key in ('fresh', 'freshOpen', 'freshAll'):
        theirs = J[key]
        same = len(theirs) == len(mine[key]) and all(near(a['rh'], b['rh'], 1e-12) and near(a['ra'], b['ra'], 1e-12) and a['o'] == b['o'] for a, b in zip(theirs, mine[key]))
        check(f'2024-25 features re-derived from the bundle by an independent replay equal the JavaScript\'s: {key} ({len(mine[key])} forecasts, rating home, rating away, outcome)', same, f'{len(theirs)} vs {len(mine[key])}')

    arr = lambda rows: (np.array([r['rh'] for r in rows]), np.array([r['ra'] for r in rows]), np.array([r['o'] for r in rows], dtype=int))
    def probs_c(rh, ra, home, scale, share):
        d = rh - ra + home
        pH = (1 - share) / (1 + np.exp(-d / scale))
        return np.column_stack([pH, np.full(len(d), share), 1 - share - pH])
    def probs_v1(rh, ra):
        d = rh - ra + 0.30
        pD = 0.28 * np.exp(-np.abs(d) / 1.10)
        pH = (1 - pD) / (1 + np.exp(-d / 0.55))
        return np.column_stack([pH, pD, 1 - pD - pH])
    def brier(P, o): Y = np.eye(3)[o]; return ((P - Y) ** 2).sum(axis=1)
    def nll(P, o): return -np.log(np.maximum(P[np.arange(len(o)), o], 1e-12))
    def paired(a, b): d = a - b; return d.mean() / (d.std(ddof=1) / math.sqrt(len(d)))
    half_up = lambda x: math.floor(x * 100 + 0.5) / 100

    # ---- fit C on 2025-26 with BFGS from two starts, in natural coordinates mapped to be unconstrained
    trh, tra, to = arr(J['train'])
    def unpack(x): return float(x[0]), math.exp(x[1]), 0.9 / (1 + math.exp(-x[2]))
    def fit_c(rh, ra, o, x0):
        f = lambda x: nll(probs_c(rh, ra, *unpack(x)), o).sum()
        return minimize(f, x0, method='BFGS', options={'gtol': 1e-9, 'maxiter': 2000})
    r1 = fit_c(trh, tra, to, [0.10, math.log(0.9), math.log(0.25 / 0.9 / (1 - 0.25 / 0.9))])
    r2 = fit_c(trh, tra, to, [0.80, math.log(0.4), math.log(0.45 / 0.9 / (1 - 0.45 / 0.9))])
    th1, th2 = unpack(r1.x), unpack(r2.x)
    best, thB = (r1, th1) if r1.fun <= r2.fun else (r2, th2)
    jf = js['fit']['th']; jth = (jf['home'], jf['scale'], jf['drawBase'])
    check('C fitted on the 2025-26 forecasts by BFGS from two starts: the starts agree, and the constants equal the JavaScript\'s to 1e-3', abs(r1.fun - r2.fun) < 1e-6 and all(abs(a - b) < 1e-3 for a, b in zip(th1, th2)) and all(abs(a - b) < 1e-3 for a, b in zip(thB, jth)), f'python {tuple(round(v, 4) for v in thB)} vs js {tuple(round(v, 4) for v in jth)}')
    check('the JavaScript\'s log loss at its constants is no lower than the optimum found here, and no more than 1e-6 above it (its solvers did not stop short)', js['fit']['nll'] >= best.fun - 1e-9 and js['fit']['nll'] - best.fun < 1e-6, f'{js["fit"]["nll"]:.9f} vs {best.fun:.9f}')
    thC = tuple(half_up(v) for v in thB)
    jc = J['thC']
    check('the constants rounded to two decimals equal the JavaScript\'s', thC == (jc['home'], jc['scale'], jc['drawBase']), f'{thC}')
    # well posed, judged here: gradient, Hessian, bounds
    xs = np.array(thB)
    f_nat = lambda v: nll(probs_c(trh, tra, v[0], v[1], v[2]), to).sum()
    H = np.zeros((3, 3))
    for i in range(3):
        for j in range(3):
            hi, hj = 1e-4 * max(1, abs(xs[i])), 1e-4 * max(1, abs(xs[j]))
            def at(di, dj):
                v = xs.copy(); v[i] += di; v[j] += dj; return f_nat(v)
            H[i, j] = (at(hi, hj) - at(hi, -hj) - at(-hi, hj) + at(-hi, -hj)) / (4 * hi * hj)
    pd = bool(np.all(np.linalg.eigvalsh((H + H.T) / 2) > 0))
    on_bound = not (-1.5 <= xs[0] <= 1.5 and 0.1 <= xs[1] <= 5 and 0.05 <= xs[2] <= 0.6)
    well = pd and not on_bound and np.linalg.norm(best.jac) < 1e-3 and abs(r1.fun - r2.fun) < 1e-6
    check(f'well posed, judged here: the two starts agree, the gradient is ~0 (|g| {np.linalg.norm(best.jac):.1e}), the Hessian is positive definite, no constant on a bound', well and js['fit']['wellPosed'] is True, f'js says {js["fit"]["wellPosed"]}')

    # ---- scores
    base = np.array(J['base'])
    check('the base-rate forecast is the home / draw / away shares of the 330 training matches', len(J['train']) == 330 and np.allclose(base, [np.mean(to == k) for k in range(3)], atol=1e-12))
    frh, fra, fo = arr(J['fresh'])
    Pc, Pv = probs_c(frh, fra, *thC), probs_v1(frh, fra)
    bc, bv, bb = brier(Pc, fo), brier(Pv, fo), brier(np.tile(base, (len(fo), 1)), fo)
    z1, z2, zu = paired(bc, bv), paired(bc, bb), paired(bc, np.full(len(fo), 2 / 3))
    n1 = js['n1']
    check(f'2024-25 rule set ({len(fo)} forecasts): mean Brier of C, table-v1 and the base rate equal the JavaScript\'s', near(bc.mean(), n1['brierC']) and near(bv.mean(), n1['brierV']) and near(bb.mean(), n1['brierB']), f'{bc.mean():.6f} {bv.mean():.6f} {bb.mean():.6f}')
    check('2024-25 rule set: the paired z of C against table-v1, against the base rate and against a uniform guess equal the JavaScript\'s', near(z1, n1['zV'], 1e-8) and near(z2, n1['zB'], 1e-8) and near(zu, n1['zU'], 1e-8), f'{z1:.4f} {z2:.4f} {zu:.4f}')
    def slope(P, o):
        x = np.log(P[:, 0] / (1 - P[:, 0])); y = (o == 0).astype(float)
        f = lambda w: np.sum(np.logaddexp(0, w[0] + w[1] * x) - y * (w[0] + w[1] * x))
        r = minimize(f, [0.0, 1.0], method='BFGS', options={'gtol': 1e-10})
        z = r.x[0] + r.x[1] * x; p = 1 / (1 + np.exp(-z)); w = p * (1 - p)
        Hh = np.array([[w.sum(), (w * x).sum()], [(w * x).sum(), (w * x * x).sum()]])
        return r.x[1], math.sqrt(np.linalg.inv(Hh)[1, 1])
    sb, sse = slope(Pc, fo)
    check('2024-25 rule set: C\'s home-win slope and its standard error, by BFGS and the analytic Hessian, equal the JavaScript\'s Newton solution', near(sb, js['slope']['b'], 1e-6) and near(sse, js['slope']['se'], 1e-6), f'{sb:.4f} +/- {sse:.4f}')
    orh, ora, oo = arr(J['freshOpen']); hrh, hra, ho = arr(J['hold']); horh, hora, hoo = arr(J['holdOpen'])
    oc, ov = brier(probs_c(orh, ora, *thC), oo).mean(), brier(probs_v1(orh, ora), oo).mean()
    hc, hv = brier(probs_c(horh, hora, *thC), hoo).mean(), brier(probs_v1(horh, hora), hoo).mean()
    jo = js['open']
    check('opening weeks: mean Brier of C and table-v1 on 2024-25 and on 2026-27 equal the JavaScript\'s', near(oc, jo['freshC']) and near(ov, jo['freshV']) and near(hc, jo['holdC']) and near(hv, jo['holdV']), f'{oc:.4f}/{ov:.4f} {hc:.4f}/{hv:.4f}')
    Ph, Phv = probs_c(hrh, hra, *thC), probs_v1(hrh, hra)
    z5 = paired(brier(Ph, ho), brier(Phv, ho))
    check(f'2026-27 rule set ({len(ho)} forecasts): C against table-v1, paired z, equals the JavaScript\'s', near(z5, js['hold']['zV'], 1e-8) and near(brier(Ph, ho).mean(), js['hold']['brierC']), f'{z5:.4f}')
    # ---- the 2025-26 cross-validated numbers the rule quotes, refitted fold by fold with BFGS
    K = J['cvFolds']; idx = np.arange(len(to)); Pcv = np.zeros((len(to), 3)); Pcl = np.zeros((len(to), 3))
    for k in range(K):
        tr, te = idx % K != k, idx % K == k
        r = fit_c(trh[tr], tra[tr], to[tr], [0.4, math.log(1.1), math.log(0.27 / 0.9 / (1 - 0.27 / 0.9))])
        Pcv[te] = probs_c(trh[te], tra[te], *unpack(r.x)); Pcl[te] = np.array([np.mean(to[tr] == c) for c in range(3)])
    cb, cv_, cl = brier(Pcv, to), brier(probs_v1(trh, tra), to), brier(Pcl, to)
    cvs, cvse = slope(Pcv, to); jc_ = js['cv']
    check('2025-26 five-fold cross-validated Brier of C, table-v1 and the base rate, refitted fold by fold by BFGS, equal the JavaScript\'s to 1e-6', near(cb.mean(), jc_['brierC'], 1e-6) and near(cv_.mean(), jc_['brierV'], 1e-9) and near(cl.mean(), jc_['brierB'], 1e-9), f'{cb.mean():.6f} {cv_.mean():.6f} {cl.mean():.6f}')
    check('2025-26 cross-validated paired z (against table-v1 and the base rate) and home-win slope with its SE equal the JavaScript\'s', near(paired(cb, cv_), jc_['zV'], 1e-5) and near(paired(cb, cl), jc_['zB'], 1e-5) and near(cvs, jc_['slope'], 1e-5) and near(cvse, jc_['se'], 1e-5), f'{paired(cb, cv_):.3f} {paired(cb, cl):.3f} {cvs:.3f}')
    # ---- the rule, written out again here from its text: N1 z1 <= -2.0; N2 z2 <= -1.645; N3 |slope-1| <= 1.96 SE; N4 openings no worse (both seasons); N5 z5 < 0; N6 well posed
    mine_rules = {k: bool(v) for k, v in {'N1': z1 <= -2.0, 'N2': z2 <= -1.645, 'N3': abs(sb - 1) <= 1.96 * sse, 'N4': oc <= ov and hc <= hv, 'N5': z5 < 0, 'N6': well}.items()}
    check('rules N1-N6, recomputed here from this script\'s own numbers and the rule\'s text, each give the same pass or fail as the JavaScript\'s', mine_rules == js['rules'], f'python {mine_rules} vs js {js["rules"]}')
    print('PY verdict on N1-N6: ' + ('all six hold' if all(mine_rules.values()) else 'FAILED: ' + ', '.join(k for k, v in mine_rules.items() if not v)) + '  (N7, the integrity checks, is the JavaScript\'s own list)')
    print(f'PY coverage: {len(mine["freshAll"])} of {len(B["matches"])} 2024-25 matches\' features re-derived from the bundle; 2025-26 ({len(J["train"])} + {len(J["trainOpen"])}) and 2026-27 ({len(J["hold"])} + {len(J["holdOpen"])}) features taken from the JavaScript dump')
    return finish()

if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == 'data':
        sys.exit(mode_data(sys.argv[2], sys.argv[3]))
    if len(sys.argv) == 4 and sys.argv[1] == 'fit':
        sys.exit(mode_fit(sys.argv[2], sys.argv[3]))
    print(__doc__); sys.exit(2)
