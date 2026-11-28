#!/usr/bin/env python3
"""Mutation sweep of the path-filter reader in scripts/check-script-orphans.mjs (Rule 90: the tests are trusted only once they have failed on purpose).

Every mutant is ONE change to the reader's code (from `const FILTER_KEY` to the end of `workflowText`): an operator flipped, a constant moved, a regular-expression anchor or class changed,
a character removed from the token-boundary string, or a whole line deleted. It is written to a scratch copy and run with `--self-test` (20 s limit). A mutant the self-test does not
catch is then compared with the original on a corpus made of: (1) the texts the fuzz generated (outbox/orphan-paths-fuzz-2026-11-28.py, dumped with FUZZ_DUMP), (2) the texts of the
self-test's own fixtures (read out of the guard's source between `const JOBS` and `const wrong`), and (3) any further corpus files named on the command line. Different edge sets on any
text = the mutant is NOT equivalent and the self-test lacks a fixture for it (`GAP`); the same edge sets on every text = `agrees with the original on every corpus text`, which is
NOT a proof of equivalence: it is a statement about those texts and nothing else, and a survivor stays a candidate until someone has read its line. Rule 91: the output prints how many
mutants there were, how many did not compile (skipped, not counted as caught), how many were caught by a failing row and how many only by the 20 s limit (a mutant that makes the reader
loop forever: counted as caught, shown apart), and each corpus's size.

    FUZZ_DUMP=corpus.json python3 -I outbox/orphan-paths-fuzz-2026-11-28.py 3000 424242
    python3 -I outbox/orphan-paths-mutant-sweep-2026-11-28.py corpus.json [more-corpus.json ...]    # each file: a JSON list of {"text": ...}
"""
import json, os, re, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

SRC = 'scripts/check-script-orphans.mjs'
FIXTURES_JS = r"""
import { readFileSync } from 'node:fs'
const src = readFileSync(process.env.GUARD, 'utf8')
const a = src.indexOf('  const JOBS = '), b = src.indexOf('  const wrong = (group)')
if (a < 0 || b < 0) throw new Error('fixture markers not found in the guard')
const mod = await import(process.env.GUARD)
const { dropped, staysAnEdge, mixed } = new Function('workflowText', 'scriptFiles', src.slice(a, b) + '\nreturn { dropped, staysAnEdge, mixed }')(mod.workflowText, mod.scriptFiles)
console.log(JSON.stringify([...dropped, ...staysAnEdge, ...mixed].map(r => r[0])))
"""
fixture_texts = json.loads(subprocess.run(['node', '--input-type=module', '-e', FIXTURES_JS], capture_output=True, text=True, check=True, env={**os.environ, 'GUARD': os.path.abspath(SRC)}).stdout)
parts = [('fuzz corpus ' + sys.argv[1], [d['text'] for d in json.load(open(sys.argv[1]))]), ('self-test fixtures', fixture_texts)]
for extra in sys.argv[2:]: parts.append(('extra corpus ' + extra, [d['text'] for d in json.load(open(extra))]))
corpus = [t for _, ts in parts for t in ts]
text = open(SRC).read()
a = text.index('const FILTER_KEY')
b = text.index('export const workflowText')
b = text.index('\n', b) + 1
region = text[a:b]

OPS = [(r'===', '!=='), (r'!==', '==='), (r' >= ', ' > '), (r' > ', ' >= '), (r' <= ', ' < '), (r' < ', ' <= '), (r'&&', '||'), (r'\|\|', '&&'),
       (r'\btrue\b', 'false'), (r'\bfalse\b', 'true'), (r' \+ 1\b', ' - 1'), (r' - 1\b', ' + 1'), (r'\bcontinue\b', 'break'), (r'\bbreak\b', 'continue'),
       (r'\bk\+\+', 'k += 2'), (r'\bdepth\+\+', 'depth += 2'), (r'\bdepth--', 'depth -= 2'), (r'\.at\(-1\)', '.at(0)'), (r'\.at\(-2\)', '.at(-1)'), (r'\b256\b', '2'),
       (r'\^', ''), (r'\\s', r'\\S'), (r'\\S', r'\\s'), (r'\.trim\(\)', ''), (r'\.trimStart\(\)', ''), (r'\[ \\t\]\*', ''), (r'\(\?:', '(?:x'),
       (r'\bs\.length\b', '0'), (r'\blines\.length\b', '0'), (r'\bi \+= 2\b', 'i += 1'), (r' \? ', ' ? !'), (r'!\/', '/')]


def mutants():
    lines = region.split('\n')
    pos = 0
    out = []
    for n, line in enumerate(lines):
        code = line.lstrip()
        start = pos
        pos += len(line) + 1
        if code.startswith(('//', '/**', '*')) or not code: continue
        # operators
        for pat, rep in OPS:
            for m in re.finditer(pat, line):
                out.append((f'line {n + 1}: {pat} -> {rep!r} at col {m.start()}', start + m.start(), start + m.end(), rep if not rep.startswith('\\') else rep))
        # characters of the token-boundary strings
        for m in re.finditer(r"'(\\n\[\{,:\?)'|\[\\s\{,\]", line):
            body = m.group(0)
            for k in range(1, len(body) - 1):
                if body[k] in '\\': continue
                out.append((f'line {n + 1}: drop {body[k]!r} from {body}', start + m.start() + k, start + m.start() + k + 1, ''))
        # whole-line deletion
        if code.rstrip().endswith((';', ')', '}', 'continue', 'break')) or '=' in code:
            out.append((f'line {n + 1}: delete the line', start, start + len(line), ''))
    return out


def check_syntax(path):
    return subprocess.run(['node', '--check', path], capture_output=True).returncode == 0


tmp = tempfile.mkdtemp(prefix='orph-sweep-')
os.makedirs(os.path.join(tmp, 'orig', 'scripts'))
for f in ('checks.mjs', 'strip-non-code.mjs'):
    shutil.copy(os.path.join('scripts', f), os.path.join(tmp, 'orig', 'scripts', f))
shutil.copy(SRC, os.path.join(tmp, 'orig', 'scripts', 'check-script-orphans.mjs'))
for f in os.listdir('scripts'):          # whatever those two import
    if f.endswith('.mjs') and not os.path.exists(os.path.join(tmp, 'orig', 'scripts', f)) and f in ('classify-lines.mjs',): shutil.copy(os.path.join('scripts', f), os.path.join(tmp, 'orig', 'scripts', f))

HARNESS = r"""
import { scriptFiles, workflowText } from './scripts/check-script-orphans.mjs'
const texts = JSON.parse(await new Promise(r => { let s = ''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => r(s)) }))
console.log(JSON.stringify(texts.map(t => { try { return [...new Set(scriptFiles(workflowText([t])))].sort() } catch (e) { return 'THROW' } })))
"""


def edges(dirpath, texts):
    h = os.path.join(dirpath, 'h.mjs')
    open(h, 'w').write(HARNESS)
    r = subprocess.run(['node', 'h.mjs'], cwd=dirpath, input=json.dumps(texts), capture_output=True, text=True, timeout=120)
    return json.loads(r.stdout) if r.returncode == 0 else 'CRASH'


def run_one(idx_m):
    idx, (why, s0, e0, rep) = idx_m
    d = os.path.join(tmp, f'm{idx}')
    shutil.copytree(os.path.join(tmp, 'orig'), d)
    code = text[:a] + region[:s0] + rep + region[e0:] + text[b:]
    p = os.path.join(d, 'scripts', 'check-script-orphans.mjs')
    open(p, 'w').write(code)
    if code == text or not check_syntax(p): shutil.rmtree(d); return (why, 'SKIPPED (identical or does not compile)', None)
    try:
        r = subprocess.run(['node', 'scripts/check-script-orphans.mjs', '--self-test'], cwd=d, capture_output=True, text=True, timeout=20)
        caught = r.returncode != 0
        how = 'CAUGHT by a failing row or a crash'
    except subprocess.TimeoutExpired:
        caught = True
        how = 'CAUGHT only by the 20 s limit (a hang)'
    if caught: shutil.rmtree(d); return (why, how, None)
    try: got = edges(d, corpus)
    except Exception: got = 'CRASH'
    shutil.rmtree(d)
    return (why, 'SURVIVED', got)


ms = mutants()
base = edges(os.path.join(tmp, 'orig'), corpus)
with ThreadPoolExecutor(4) as ex: res = list(ex.map(run_one, enumerate(ms)))
skipped = [r for r in res if r[1].startswith('SKIPPED')]
caught = [r for r in res if r[1].startswith('CAUGHT')]
hangs = [r for r in res if r[1].startswith('CAUGHT only')]
surv = [r for r in res if r[1] == 'SURVIVED']
def where(i):
    for n, ts in parts:
        if i < len(ts): return n.split()[0] + ' ' + n.split()[1] if n.startswith(('fuzz', 'extra')) else n
        i -= len(ts)
gaps = []
for w, _, g in surv:
    if g == 'CRASH' or g != base:
        diff = [i for i, (x, y) in enumerate(zip(g, base)) if x != y] if g != 'CRASH' else []
        short = min(diff, key=lambda i: len(corpus[i])) if diff else None
        gaps.append((w, len(diff), None if short is None else (where(short), corpus[short])))
equiv = [w for w, _, g in surv if g != 'CRASH' and g == base]
print(f'{len(ms)} mutants of the reader (lines of code from `const FILTER_KEY` to `workflowText`)')
print('corpus: ' + '; '.join(f'{n}: {len(ts)} texts' for n, ts in parts) + f'; {len(corpus)} texts in all')
print(f'  caught: {len(caught)} (by a failing row or a crash: {len(caught) - len(hangs)}; only by the 20 s limit, a mutant that hangs: {len(hangs)}); skipped (identical to the source, or does not compile): {len(skipped)}; survived the self-test: {len(surv)}')
print(f'  of the survivors, GAP (a text in the corpus gets a different edge set, so a fixture is missing): {len(gaps)}; agree with the original on every one of the {len(corpus)} corpus texts: {len(equiv)}')
for w, nd, sh in gaps:
    print(f'    GAP  {w}  ({nd if nd else "crash"} corpus texts differ)')
    if sh: print(f'         shortest differing text, from the {sh[0]} ({len(sh[1])} characters): {sh[1][:700]!r}')
for w in equiv: print(f'    agrees-on-every-corpus-text  {w}')
shutil.rmtree(tmp, ignore_errors=True)
sys.exit(1 if gaps else 0)
