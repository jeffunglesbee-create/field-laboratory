#!/usr/bin/env python3
"""Differential fuzz of scripts/check-script-orphans.mjs's workflow reader against a real YAML parser.

Question: which scripts/X.mjs does a workflow NAME in a place that runs or feeds a run (everything except the values of `on.<event>.paths` / `paths-ignore`)? Ground truth is PyYAML on the
text with LF line ends and no BOM: every string scalar except those two lists, whole-line comments dropped (the detector drops them on purpose). The detector side is the real module,
`scriptFiles(workflowText([text]))`, run in one node process on the text as generated (some files get CRLF, CR or a BOM). The OLD reader (`scriptFiles(stripYamlComments(text))`, no filter
stripping) is run over the same corpus so the fuzz is shown able to fail: Rule 90, applied to the harness. Rule 91: the printed result gives the denominators, the shapes that were
generated (counted in OCCURRENCES, a file can hold several), the shapes that were NOT generated, and how many generated texts were discarded as invalid YAML.

    python3 -I outbox/orphan-paths-fuzz-2026-11-28.py [N] [SEED]
    FUZZ_MUTANT=<id of an orphans-* entry of scripts/mutation-check.mjs> python3 -I outbox/orphan-paths-fuzz-2026-11-28.py [N] [SEED]

With FUZZ_MUTANT the detector side is a scratch copy of the guard with that entry's change applied (Rule 90 for this harness: it must go red when the reader is broken in a way the new
shapes are meant to catch; it prints which entry it ran). The result is then expected to be FAIL.

NOT GENERATED, and so not claimed: an explicit key (`? paths`); a flow collection whose continuation lines start in column 0; a second YAML document in one file; a whole document indented;
a script named by a trailing `#` comment outside a filter or by an action input read as a filter (`with: filters:`); a NBSP or a tab where YAML wants a space; the same key twice; several
files at once (each file is read on its own: the self-test pins that); an alias (`*a`) or merge key; a continuation line of a multi-line plain scalar that starts with a quote character;
a multi-line quoted scalar in a block list with continuation lines indented less than its dash. The first four and the last
four are listed in the guard's own NOT-covered paragraph. Round 2 of the review (2026-11-28) found that the first version of this generator did not produce `''` followed by text that
looks like a comment or a key, an anchor or tag before a quoted scalar, `paths:` glued to text, a block-scalar header with a comment, or a quoted key straight before its colon in a
flow mapping: those are generated now (see the printed list), and the old generator's PASS said nothing about them.
"""
import json, os, random, re, subprocess, sys, collections
import yaml

N = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 20261128
R = random.Random(SEED)
NAMES = ['fa', 'fb', 'fc', 'fd', 'fe', 'ff']
RX = re.compile(r'scripts/([A-Za-z0-9._-]+\.m?js)')
feat = collections.Counter()


ANCH = [0]


def anchor():
    ANCH[0] += 1
    return f'&u{ANCH[0]}'


def sp(n=None): return f"scripts/{n or R.choice(NAMES)}.mjs"


def q(s):
    special = any(c in s for c in '*[] #{},&!|>%@`:"\'') or s.startswith(('-', '?'))
    style = R.choice(['s', 'd']) if special else R.choice(['n', 's', 'd'])
    if style == 's': s = s.replace("'", "''")
    if style == 'd': s = s.replace('\\', '\\\\').replace('"', '\\"')
    return {'n': s, 's': "'" + s + "'", 'd': '"' + s + '"'}[style]


def entries():
    out = []
    for _ in range(R.randint(1, 3)):
        out.append(sp() if R.random() < .6 else R.choice(['docs/**', '**/*.md', 'src/[ab].fs', 'a#b/c', 'x y/z', 'weird]/x', 'br[ac]ck/et', "it's/x", 'say "hi"/y']))
    return out


def props():
    k = R.random()
    if k < .08: feat['anchor on the key'] += 1; return ' &a' + str(R.randint(1, 9))
    if k < .14: feat['tag on the key'] += 1; return ' !!seq'
    if k < .17: feat['verbatim tag (with commas) on the key'] += 1; return ' !<tag:yaml.org,2002:seq>'
    return ''


def keycomment():
    if R.random() < .12: feat['comment on the key line'] += 1; return '  # ' + R.choice(['why', "it's why", sp()])
    return ''


def block_list(key, K):
    dash = K + R.choice([0, 2, 2, 4])
    feat['block list, dashes at the key indent' if dash == K else 'block list, dashes deeper'] += 1
    L = [' ' * K + key + ':' + props() + keycomment()]
    for e in entries():
        v = q(e)
        t = ' ' * dash + '- ' + v
        if R.random() < .25: t += '  # ' + R.choice([sp(), "don't"]); feat['block item with a trailing comment'] += 1
        if R.random() < .1 and e.startswith('scripts/'):
            L.append(' ' * dash + '- >'); L.append(' ' * (dash + 2) + e); feat['block item folded onto a continuation line'] += 1; continue
        if R.random() < .08:
            L.append(' ' * dash + '-'); L.append(' ' * (dash + 2) + v); feat['bare dash, value on the next line'] += 1; continue
        L.append(t)
        r = R.random()
        if r < .18: L.append(' ' * R.choice([K, dash, dash + 2]) + '# ' + sp()); feat['whole-line comment between items'] += 1
        elif r < .26: L.append(''); feat['blank line between items'] += 1
        elif r < .31: L.append('   '); feat['line of spaces between items'] += 1
    return L


def flow_list(key, K):
    items = [q(e) for e in entries()]
    if R.random() < .12: items.insert(0, "it's"); feat['plain flow item with an apostrophe'] += 1
    p = props()
    if R.random() < .5:
        feat['flow list on one line'] += 1
        return [' ' * K + key + ':' + p + ' [' + ', '.join(items) + ']' + ('  # ' + R.choice([sp(), "don't"]) if R.random() < .2 else '')]
    feat['flow list over several lines'] += 1
    L = [' ' * K + key + ':' + p + ' [']
    for n, it in enumerate(items):
        L.append(' ' * (K + 2) + it + (',' if n < len(items) - 1 or R.random() < .5 else '') + (('  # ' + sp() + ' ]') if R.random() < .2 else ''))
    return L + [' ' * K + ']']


def nextline_flow(key, K):
    items = [q(e) for e in entries()]
    p = props()
    if R.random() < .5:
        feat['flow list on the line after the key, one line'] += 1
        return [' ' * K + key + ':' + p + keycomment(), ' ' * (K + 2) + '[' + ', '.join(items) + ']']
    feat['flow list on the line after the key (Prettier shape)'] += 1
    return [' ' * K + key + ':' + p + keycomment(), ' ' * (K + 2) + '['] + [' ' * (K + 4) + it + ',' for it in items] + [' ' * (K + 2) + ']']


def scalar(key, K):
    if R.random() < .35:
        feat['scalar on the line after the key'] += 1
        return [' ' * K + key + ':' + keycomment(), ' ' * (K + 2) + q(sp())]
    feat['scalar on the key line'] += 1
    return [' ' * K + key + ': ' + q(sp())]


def filt(K, key):
    if R.random() < .1: key = "'" + key + "'" if R.random() < .5 else '"' + key + '"'; feat['quoted key'] += 1
    spaced = R.random() < .05
    if spaced: feat['space before the colon'] += 1
    L = R.choice([block_list, block_list, flow_list, flow_list, nextline_flow, scalar])(key, K)
    if spaced: L[0] = L[0].replace(key + ':', key + ' :', 1)
    return L


def sibling(K):
    if R.random() < .5:
        feat['a real edge in a sibling of a filter'] += 1
        return [' ' * K + 'branches: [' + sp() + ']']
    return [' ' * K + 'branches: [main]']


def plain_descriptions(K):
    L = []
    k = R.random()
    if k < .3:
        feat['plain scalar with an apostrophe (description)'] += 1
        L += [' ' * K + "description: Don't run " + R.choice(['twice', sp(), 'it'])]
    elif k < .5:
        feat['double-quoted description with escaped quotes and filter-looking text'] += 1
        L += [' ' * K + 'description: "say \\"paths: [' + sp() + ']\\" now"']
    elif k < .7:
        feat['block scalar body holding paths: lines and an apostrophe'] += 1
        L += [' ' * K + 'description: ' + R.choice(['|', '>-', '>']), ' ' * (K + 2) + "it's paths:", ' ' * (K + 4) + '- ' + sp(), ' ' * (K + 2) + 'end']
    elif k < .75:
        feat["single-quoted description: '' then text that looks like a comment"] += 1
        L += [' ' * K + "description: 'don''t # see " + sp() + "'"]
    elif k < .8:
        feat["single-quoted description: '' then text that looks like a filter key"] += 1
        L += [' ' * K + "description: 'it''s paths: [" + sp() + "]'"]
    elif k < .85:
        feat['quoted description after an anchor or a tag'] += 1
        L += [' ' * K + 'description: ' + R.choice([anchor(), '!!str']) + R.choice([' "x # ' + sp() + '"', " 'x # " + sp() + "'", ' "paths: [' + sp() + ']"'])]
    elif k < .9:
        feat['block scalar header with a comment naming a script (the comment is not an edge)'] += 1
        L += [' ' * K + 'description: ' + R.choice(['|', '>-']) + ' # ' + sp(), ' ' * (K + 2) + 'body ' + sp()]
    elif k < .95:
        feat['plain scalar with paths: glued to text, a real edge after it'] += 1
        L += [' ' * K + 'description: see paths:' + sp(), ' ' * K + 'type: string']
    return L


def on_block():
    shape = R.random()
    if shape < .12:
        feat['flow-mapping on, one line'] += 1
        ev = []
        for e in R.sample(['push', 'pull_request'], R.randint(1, 2)):
            key = R.choice(['paths', 'paths-ignore'])
            val = R.choice(['[' + ', '.join(q(x) for x in entries()) + ']', q(sp())])
            tail = R.choice(['branches: [main]', f'branches: [{sp()}]'])
            if val.startswith('[') and R.random() < .3: feat['flow-mapping on: a flow list straight after the colon of an unquoted key'] += 1; val = ':' + val
            if 'branches: [scripts' in tail: feat['flow-mapping on: a real edge after the filter on the same line'] += 1
            ev.append(f"{e}: {{ {key}{val if val.startswith(':') else ': ' + val}, {tail} }}")
        return ['on: { ' + ', '.join(ev) + ' }']
    if shape < .16:
        feat['flow-mapping on, JSON style: quoted keys straight before their colons'] += 1
        key = R.choice(['paths', 'paths-ignore'])
        val = R.choice(['[' + ', '.join(q(x) for x in entries()) + ']', q(sp())])
        return ['on: {"push":{"' + key + '":' + val + ',"branches":[' + (f'"{sp()}"' if R.random() < .5 else '"main"') + ']},"workflow_dispatch":{}}']
    if shape < .2:
        feat['flow-mapping on, several lines'] += 1
        key = R.choice(['paths', 'paths-ignore'])
        if R.random() < .5:
            feat['flow-mapping on, several lines: a scalar filter first on its line, a sibling after it on the line'] += 1
            return ['on: {', '  push: {', f"    {key}: {q(sp())}, branches: [{sp() if R.random() < .5 else 'main'}]", '  },', '  workflow_dispatch: {}', '}']
        return ['on: {', '  push: {', f"    {key}: [{', '.join(q(x) for x in entries())}],", '    branches: [main]', '  },', '  workflow_dispatch: {}', '}']
    head = R.choice(['on:'] * 8 + ["'on':", '"on":'])
    if head != 'on:': feat['quoted on key'] += 1
    L = [head]
    for e in R.sample(['push', 'pull_request', 'workflow_dispatch', 'schedule'], R.randint(1, 3)):
        if e == 'schedule': L += ['  schedule:', "    - cron: '0 3 * * *'"]; continue
        if e == 'workflow_dispatch':
            L.append('  workflow_dispatch:')
            if R.random() < .6:
                L += ['    inputs:', '      who:'] + plain_descriptions(8) + ['        type: string']
                if R.random() < .4: L += ['      script:', '        type: choice', '        options:', f'          - {sp()}']; feat['choice input naming scripts'] += 1
            continue
        L.append(f'  {e}:')
        parts = [sibling(4)] if R.random() < .6 else []
        for key in R.sample(['paths', 'paths-ignore'], R.randint(0, 2)): parts.append(filt(4, key))
        R.shuffle(parts)
        for p in parts: L += p
        if not parts: L[-1] += ' {}'
    k = R.random()   # one workflow_call at most
    if k < .3:
        feat['workflow_call input named paths (a mapping)'] += 1
        L += ['  workflow_call:', '    inputs:', '      paths:' + R.choice(['', ' !!map', ' &m1']), '        description: a list of files', f'        default: {sp()}', '        type: string']
    elif k < .4:
        feat['workflow_call input named paths, flow mapping'] += 1
        L += ['  workflow_call:', '    inputs:', f"      paths: {{ description: x, default: '{sp()}', type: string }}"]
    elif k < .5:
        feat['workflow_call input whose default is a block scalar with paths: lines'] += 1
        L += ['  workflow_call:', '    inputs:', '      x:', '        default: |', '          paths:', f'            - {sp()}']
    return L


def jobs_block():
    L = ['jobs:', '  j1:', '    runs-on: ubuntu-latest']
    if R.random() < .5: L += ['    env:', f'      TOOL: {sp()}']; feat['script in an env value'] += 1
    L += ['    steps:']
    for _ in range(R.randint(1, 3)):
        k = R.random()
        if k < .4: L += [f'      - run: node {sp()}']
        elif k < .6: L += ['      - run: |', '          echo start', f'          node {sp()} --x']
        elif k < .75: L += ['      - run: |', '          cat <<EOF', '          paths:', f'            - {sp()}', '          EOF']; feat['paths: text in a run block'] += 1
        elif k < .9: L += ['      - uses: some/action', '        with:', f'          paths: {sp()}']; feat['paths: input of an action under jobs'] += 1
        else: L += [f'      - name: runs {sp()}', '        run: echo ok']
    return L


def one():
    on, jobs = on_block(), jobs_block()
    L = []
    if R.random() < .3: L.append('# ' + sp())
    L.append('name: fuzz')
    if R.random() < .15 and not on[0].startswith('on: {'):
        feat['on: after jobs'] += 1
        L += jobs + on
    else:
        L += on
        if R.random() < .3: L.append('# ' + sp())
        L += ['env: { X: ' + sp() + ' }'] if R.random() < .2 else []
        L += jobs
    return '\n'.join(L) + '\n'


def transform(t):
    k = R.random()
    if k < .10: feat['file with CRLF line ends'] += 1; return t.replace('\n', '\r\n')
    if k < .14: feat['file with CR line ends'] += 1; return t.replace('\n', '\r')
    if k < .20: feat['file with a BOM'] += 1; return '﻿' + t
    return t


def truth(text):
    d = yaml.safe_load(text)
    out = set()

    def walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items(): walk(v, path + [('on' if k is True else k)])
        elif isinstance(o, list):
            for i, v in enumerate(o): walk(v, path + [i])
        elif isinstance(o, str):
            if len(path) >= 3 and path[0] == 'on' and path[2] in ('paths', 'paths-ignore'): return
            for line in o.split('\n'):
                if not re.match(r'^\s*#', line): out.update(RX.findall(line))
    walk(d, [])
    return out


corpus, discarded = [], 0
while len(corpus) < N:
    t = one()
    try: tr = truth(t)
    except Exception: discarded += 1; continue
    corpus.append((transform(t), tr))
if os.environ.get('FUZZ_DUMP'):   # the mutation sweep (outbox/orphan-paths-mutant-sweep-2026-11-28.py) reuses the corpus
    json.dump([{'text': t, 'truth': sorted(tr)} for t, tr in corpus], open(os.environ['FUZZ_DUMP'], 'w'))
real = []
for f in sorted(os.listdir('.github/workflows')):
    if f.endswith(('.yml', '.yaml')):
        t = open('.github/workflows/' + f).read()
        real.append((f, t, truth(t)))

SCRATCH = None
if os.environ.get('FUZZ_MUTANT'):
    import shutil, tempfile
    tbl = open('scripts/mutation-check.mjs', encoding='utf-8').read()
    hit = re.search(r'    id: ("' + re.escape(os.environ['FUZZ_MUTANT']) + r'"),\n    file: "[^"]*",\n    claim: ("(?:[^"\\]|\\.)*"),\n    find: ("(?:[^"\\]|\\.)*"),\n    replace: ("(?:[^"\\]|\\.)*"),', tbl)
    if not hit: sys.exit('FUZZ_MUTANT: no such entry in scripts/mutation-check.mjs: ' + os.environ['FUZZ_MUTANT'])
    claim, find, replace = (json.loads(hit.group(i)) for i in (2, 3, 4))
    SCRATCH = tempfile.mkdtemp(prefix='fuzz-mutant-')
    os.makedirs(SCRATCH + '/scripts')
    for f in ('checks.mjs', 'strip-non-code.mjs'): shutil.copy('scripts/' + f, SCRATCH + '/scripts/' + f)
    guard = open('scripts/check-script-orphans.mjs', encoding='utf-8').read()
    assert guard.count(find) == 1, 'the entry anchor is not unique in the guard'
    open(SCRATCH + '/scripts/check-script-orphans.mjs', 'w', encoding='utf-8').write(guard.replace(find, replace, 1))
    print(f'MUTANT {os.environ["FUZZ_MUTANT"]}: {claim}')

NODE = r"""
import { scriptFiles, workflowText, stripYamlComments } from './scripts/check-script-orphans.mjs'
const texts = JSON.parse(await new Promise(r => { let s = ''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => r(s)) }))
const edges = t => [...new Set(scriptFiles(workflowText([t])))].sort()
const old = t => [...new Set(scriptFiles(stripYamlComments(t)))].sort()
console.log(JSON.stringify(texts.map(t => [edges(t), old(t)])))
"""
res = json.loads(subprocess.run(['node', '--input-type=module', '-e', NODE], input=json.dumps([t for t, _ in corpus] + [t for _, t, _ in real]),
                                capture_output=True, text=True, check=True, cwd=SCRATCH).stdout)
gen_res, real_res = res[:len(corpus)], res[len(corpus):]
bad_new, bad_old, ex = 0, 0, []
for (t, tr), (new, old) in zip(corpus, gen_res):
    if set(new) != tr:
        bad_new += 1
        if len(ex) < 4: ex.append((t, sorted(tr), new))
    if set(old) != tr: bad_old += 1
rbad_new = [f for (f, t, tr), (new, old) in zip(real, real_res) if set(new) != tr]
rbad_old = [f for (f, t, tr), (new, old) in zip(real, real_res) if set(old) != tr]

print(f'seed {SEED}; {len(corpus)} generated workflows ({discarded} generated texts discarded as not valid YAML) and {len(real)} real workflow files; ground truth: PyYAML {yaml.__version__}')
print('shapes generated (OCCURRENCES, not files: one file can hold several):')
for k, v in sorted(feat.items()): print(f'  {v:5d}  {k}')
print('NOT GENERATED (not claimed): explicit key (? paths); flow collection continuing in column 0; second YAML document; indented document; trailing # comment naming a script outside a filter;')
print('  action input read as a filter; NBSP or tab; duplicate keys; several files at once (the self-test pins per-file reading); an alias (*a) or merge key; a continuation line of a multi-line')
print('  plain scalar that starts with a quote character; a multi-line quoted scalar in a block list whose continuation lines are indented less than its dash')
print(f'NEW reader (scriptFiles(workflowText)): generated disagreements {bad_new} of {len(corpus)}; real files disagreeing {len(rbad_new)} of {len(real)}')
print(f'OLD reader (no filter stripping), same corpus: generated disagreements {bad_old} of {len(corpus)}; real files disagreeing {len(rbad_old)} of {len(real)}  {rbad_old}')
for t, tr, new in ex:
    print('--- DISAGREEMENT (truth vs detector)', tr, new); print(repr(t) if '\r' in t or '﻿' in t else t)
ok = bad_new == 0 and not rbad_new and bad_old > 0
print(('PASS' if ok else 'FAIL') + f': on the generated shapes listed above ({len(corpus)} files) and the {len(real)} real files the new reader agrees with the parser on {len(corpus) + len(real) - bad_new - len(rbad_new)} of {len(corpus) + len(real)}; the old reader disagrees on {bad_old} generated and {len(rbad_old)} real (the fuzz can fail)')
sys.exit(0 if ok else 1)
