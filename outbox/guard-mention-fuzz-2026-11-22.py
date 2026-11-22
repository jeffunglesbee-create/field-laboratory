#!/usr/bin/env python3
"""Differential fuzz for residual CC-CMD item 9 (a mention of .npmrc, $GITHUB_PATH or $GITHUB_ENV is not a write).

Each script is one step: mention-only commands (echo / printf of a message, a read-only [ -f X ] test) mixed with real writes to the three targets, joined by newline, `;`, `&&` or `||`.
bash runs it in a fresh directory with GITHUB_PATH and GITHUB_ENV pointing at files in it. A WRITE happened when .npmrc or GITHUB_PATH is non-empty or GITHUB_ENV holds NODE_OPTIONS.
The guard REFUSES a step (read_step unresolved) with a reason that names .npmrc, $GITHUB_PATH or $GITHUB_ENV. A false green is: a write happened and the guard ACCEPTS the step (plain, or in an always() step).
Printed (Rule 91): the scripts, how many wrote, how many the guard refused, false greens, and the false reds the change removed (mention-only scripts, no write, refused by the guard before it).

    python3 outbox/guard-mention-fuzz-2026-11-22.py N SEED [path-of-a-guard-to-test]
"""
import importlib.util, os, random, shutil, subprocess, sys, tempfile
def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(spec); a = sys.argv; sys.argv = ["x"]; spec.loader.exec_module(m); sys.argv = a; return m
N, SEED = int(sys.argv[1]), int(sys.argv[2])
G = load(sys.argv[3] if len(sys.argv) > 3 else "scripts/check-browser-gate.py", "g")
OLD = load(os.environ["OLD"], "old") if os.environ.get("OLD") else None
MSGS = ["using .npmrc", "$GITHUB_PATH", "NODE_OPTIONS=x", "$GITHUB_ENV", "a b", "see $GITHUB_ENV and .npmrc"]
def mention(rng):
    m = rng.choice(MSGS)
    return rng.choice([f'echo "{m}"', f"printf '%s\\n' '{m}'", f"echo {m.split()[0]}" if "$" not in m and "=" not in m else 'echo ok', '[ -f .npmrc ]', 'test -e .npmrc', '[[ -d "$GITHUB_PATH" ]]',
                       'if [ -f .npmrc ]; then echo found; fi', f'echo -n "{m}"', f"echo '{m}'"])
WRITES = ['echo "NODE_OPTIONS=--require /tmp/x.cjs" >> "$GITHUB_ENV"', 'echo /tmp/evil >> "$GITHUB_PATH"', 'echo registry=x > .npmrc', 'echo registry=x | tee .npmrc', '{ echo "NODE_OPTIONS=x"; } >> "$GITHUB_ENV"',
          "printf 'NODE_OPTIONS=x\\n' | tee -a \"$GITHUB_ENV\"", 'cat >> "$GITHUB_ENV" <<EOF\nNODE_OPTIONS=x\nEOF', ': > .npmrc; echo x >> .npmrc', 'echo "msg" >> .npmrc', 'echo "msg">>.npmrc', 'echo "x" 2>> .npmrc',
          'echo "NODE_OPTIONS=x" >> "$GITHUB_ENV" && echo "using .npmrc"', 'echo "using .npmrc" && echo /x >> "$GITHUB_PATH"', 'echo a |  tee -a "$GITHUB_PATH"', 'printf "%s" /y > "$GITHUB_PATH"',
          'echo "a" \\\n  >> .npmrc', '( echo "NODE_OPTIONS=x" ) >> "$GITHUB_ENV"', 'if [ -f .npmrc ]; then echo x >> .npmrc; fi', '[ -f .npmrc ] || echo x > .npmrc', 'echo "$(echo x >> .npmrc)"', 'echo "NODE_OPTIONS=x" | tee "$GITHUB_ENV"']
def gen(seed):
    rng = random.Random(seed); parts = []; has_write = False
    for _ in range(rng.randint(1, 4)):
        if rng.random() < 0.35: parts.append(rng.choice(WRITES)); has_write = True
        else: parts.append(mention(rng))
    out = parts[0]
    for p in parts[1:]:
        out += rng.choice(["\n", "\n", "; ", " && ", " || "]) + p
    return out, has_write
MK = tempfile.mkdtemp(prefix="mention-fuzz-")
def wrote(script, tag):
    d = f"{MK}/{tag}"; shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    open(f"{d}/GITHUB_PATH", "w").close(); open(f"{d}/GITHUB_ENV", "w").close()
    p = subprocess.Popen(["bash", "--norc", "--noprofile", "-c", script], cwd=d, env={"PATH": os.environ["PATH"], "GITHUB_PATH": f"{d}/GITHUB_PATH", "GITHUB_ENV": f"{d}/GITHUB_ENV"}, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    try: p.wait(timeout=5)
    except subprocess.TimeoutExpired: pass
    finally:
        try: os.killpg(p.pid, 9)
        except ProcessLookupError: pass
    n = lambda f: os.path.exists(f"{d}/{f}") and os.path.getsize(f"{d}/{f}") > 0
    return n(".npmrc") or n("GITHUB_PATH") or ("NODE_OPTIONS" in open(f"{d}/GITHUB_ENV").read())
def refused(g, script):
    """Whether the guard refuses the step FOR the reason this item is about (a reason that names .npmrc, $GITHUB_PATH or $GITHUB_ENV): the false-red measure."""
    r = g.read_step({"run": script}, {}, lambda p: "")
    return any(k in u for u in r["unresolved"] for k in (".npmrc", "$GITHUB_PATH", "$GITHUB_ENV"))
def accepted(g, script):
    """Whether the guard accepts the step as a whole, plain (nothing unresolved) or in an always() step (hides_a_launcher is False): the false-green measure."""
    r = g.read_step({"run": script}, {}, lambda p: "")
    return r["unresolved"] == [] or not g.hides_a_launcher(r["unresolved"], script)
stats = dict(scripts=N, wrote=0, refused=0, FALSE_GREENS=0, mention_only=0, false_reds_old=0, false_reds_new=0)
shown = 0
for i in range(N):
    s, has_write = gen(SEED + i); w = wrote(s, "w"); r = refused(G, s)
    stats["wrote"] += w; stats["refused"] += r
    if w and accepted(G, s):
        stats["FALSE_GREENS"] += 1
        if shown < 5: shown += 1; print("FALSE GREEN", repr(s))
    if not has_write:                                   # only mention-only units: bash writes nothing, so a refusal is a false red
        stats["mention_only"] += 1; stats["false_reds_new"] += r
        if OLD is not None: stats["false_reds_old"] += refused(OLD, s)
print(stats); shutil.rmtree(MK, ignore_errors=True)
