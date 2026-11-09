#!/usr/bin/env python3
"""INDEPENDENT RE-DERIVATION for outbox/forecast-season-2024-25-2026-11-09.mjs and outbox/forecast-fit-c-2026-11-09.mjs (field-relay-nba's Rule 90: a check that has only ever
passed has proven nothing; and this repo's question: is it the source, or a copy of the source?). Python, a different parser and a different way of finding each date's year,
written to agree with the JavaScript only if both are right.

  python3 -I outbox/forecast-fit-c-crosscheck-2026-11-09.py data <sources-dir> <2024-25 bundle .json>
      Re-parses the four RAW 2024-25 files and requires the committed bundle to equal what this parse finds: 380 fixtures field by field, ESPN's 20 table rows, FPL's 380 fixtures
      and 20 team names, the club mapping found by a second method (constraint intersection, not the JavaScript's iterative matching), and the raw files' sha256.
      It prints booleans and counts, never a tally of results.
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

if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == 'data':
        sys.exit(mode_data(sys.argv[2], sys.argv[3]))
    print(__doc__); sys.exit(2)
