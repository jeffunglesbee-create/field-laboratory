#!/usr/bin/env python3
"""A differential test of scripts/check-browser-gate.py against bash, for heredocs and strings that span lines (docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md, item 1).

Each seed generates a small script from units that stress the new reading: heredocs (quoted, unquoted, `<<-`, `<<\\X`, two on a line, in `$( )`, in a group, in an `if`, piped to `bash`, with no terminator,
with a delimiter the reader cannot parse, nested inside another heredoc's body), strings that span lines (double, single, ANSI-C, with a `$( )`, never closing) and plain lines. A bare `mark_ran` is
the marker: a function the harness defines that appends to a file. The script is RUN by bash (`bash --norc -c`, stdin closed) and READ by the guard (`read_step`, `hides_a_launcher`). The property is:

    the guard accepts the script (reads it clean, or keeps it as opaque) => the marker did NOT run in bash.

`mark_ran` is no head the guard allows, so a script in which bash ran it and the guard saw nothing is a false green. The same scripts are read by the guard as it was before the change (OLD), so the
output says how many more scripts are accepted now (all of them false reds before) and that no script is refused now that was accepted before. Rule 91: the output starts with the count of scripts.

    GUARD=scripts/check-browser-gate.py OLD=/path/to/old-guard.py python3 outbox/guard-heredoc-fuzz-2026-11-19.py <count> <first seed> [2]
    (GUARD=<a mutated copy> shows that the test can fail: see outbox/guard-heredoc-fuzz-2026-11-19.txt.)

A third argument `2` draws the scripts from the SECOND generator (gen2), written after the independent review of 1806bf8a (workflow wf_e852d66e-255) found false greens in shapes the first one never draws
(it drew a line break only as `\\n`, a heredoc operator only after a plain reader, and a body from 24 lines with no `#`, no `case` and no `EOF)`). gen2 draws, for each unit: an operator context (a plain
reader, `(( ))`, `${ }`, `$(( ))`, `$[ ]`, a quoted or backslashed `<<`, a `$( )` or a backtick pair left open or closed on the line, a trailing comment, `;` or `|`, a backslash that splits the operator or
joins the line, a form feed, U+2028 or a carriage return right after the delimiter); a terminator (the delimiter alone, with `)`, ` )`, `);`, a form feed, a carriage return, a tab, a space, an extra letter, or none);
a body line from a pool that holds `#`, `case`, `EOF)`, a nested heredoc and unbalanced quotes and parentheses in a `$( )`; a string that spans lines (a `"$( )"` closed on a later line, a `"$(` and its `) echo "`,
`$$'...\\'`, a `#` that holds the `)`, a form feed in a comment); and a tail of lines after it that holds the marker next to apostrophes, quotes and `$( )`. The printed result lists the alphabet (Rule 91).
"""
import sys, os, random, subprocess, importlib.util, json
from multiprocessing import Pool
def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); sys.argv = ["x"]; spec.loader.exec_module(m); return m
DELIMS = ["EOF", "END", "E_1"]
OPS = lambda d: random.choice([f"<<{d}", f"<<-{d}", f"<<'{d}'", f'<<"{d}"', f"<<\\{d}", f"<< {d}", f"<<{d}", f"<<'{d}'"])
READERS = ["cat", "tee /dev/null", "grep -c x", "wc -l", "tr a b", "bash", "read -r v", "sed p", "cat > /dev/null", "cat | bash", "cat | wc -l", "{ cat; }", "if cat; then :; fi",
           "while read -r l; do :; done", "x=$(cat)", "cat | sh", "cat >> /dev/null"]
BODY = ["hello", "$(mark_ran)", "`mark_ran`", "\\$(mark_ran)", "'$(mark_ran)'", "it's", "that's", '"q"', "a \\", "# c", "mark_ran", "${x:-$(mark_ran)}", "$((1+2))", "plain text here",
        'say "hi" $(mark_ran)', "$\\", "(mark_ran)", "EOF", "END", "it's $(mark_ran)", "`mark_ran", "$(mark_ran", "x ' y", 'x " y']
UNITS_PLAIN = ["echo hi", "true", "mark_ran", "echo \"a $(mark_ran)\"", "x=1", "echo 'it'", ": # don't", "echo ok # it's", "mark_ran # c"]
STRINGS = ['echo "a\n$(mark_ran)\nb"', "echo 'a\n$(mark_ran)\nb'", 'echo "a\n# not\nb"', "echo 'it\nmark_ran\nthat'", 'echo "a\nmark_ran\nb"', 'echo "x\n`mark_ran`\ny"', "echo $'a\nb'",
           'x="a\nb"', 'echo "a $(\nmark_ran\n)"', "echo 'never closes\nmark_ran", 'echo "never\nmark_ran', "echo \"it's\"\nmark_ran", "echo 'a' \"b\nmark_ran\nc\" d"]
EXTRA = ["cat <<[\ncat <<'Q'\n$(mark_ran)\nQ\n[", "cat <<[\n$(mark_ran)\n[", "cat <<$X\ncat <<'Q'\n$(mark_ran)\nQ\n$X", "cat <<E\"OF\"\ncat <<'Q'\n$(mark_ran)\nQ\nEOF", "echo $((1<<2)) <<EOF\ncat <<'Q'\n$(mark_ran)\nQ\nEOF",
         "cat <<EOF\ncat <<'Q'\n$(mark_ran)\nQ\nEOF", "cat <<EOF\nhello\ncat <<'Q'\n$(mark_ran)\nQ", 'cat <<"A B"\n$(mark_ran)\ncat <<\'Q\'\n$(mark_ran)\nQ\nA B', "cat <<EOF\nit's\ncat <<'Q'\n$(mark_ran)\nQ\nthat's", "cat <<$X\n$(mark_ran)\ncat <<'Q'\nz\nQ",
         "x=$(cat <<EOF\n$B\nEOF\n)", "cat \\\n<<EOF\n$B\nEOF", "cat <<A <<B\n$B\nA\n$B\nB", 'echo "<<EOF"', "echo $((1<<2))", "echo 'a <<EOF'", "mark_ran <<EOF\n$B\nEOF", "cat <<EOF; mark_ran\n$B\nEOF",
         "cat <<EOF && mark_ran\n$B\nEOF", "echo a # <<EOF", "cat <<EOF >/dev/null\n$B\nEOF", "cat <<'EOF' | cat\n$B\nEOF", "cat <<EOF\nEOF", "cat <<-EOF\n\t$B\n\tEOF", "(cat <<EOF\n$B\nEOF\n)",
         "x=`cat <<EOF\n$B\nEOF\n`", "cat <<EOF\n$B\nEOF\nmark_ran", "tee /dev/null <<'EOF' >/dev/null\n$B\nEOF", "echo $(cat <<EOF\n$B\nEOF\n)", "if true; then cat <<EOF\n$B\nEOF\nfi"]
def heredoc_unit(rng):
    if rng.random() < 0.3:
        return rng.choice(EXTRA).replace("$B", rng.choice(BODY))
    d = rng.choice(DELIMS); op = OPS(d); reader = rng.choice(READERS)
    if reader == "cat | bash": line = f"cat {op} | bash"
    elif reader == "cat | sh": line = f"cat {op} | sh"
    elif reader.startswith("{"): line = f"{{ cat; }} {op}"
    elif reader.startswith("if"): line = f"if cat {op}; then :; fi"
    elif reader.startswith("while"): line = f"while read -r l; do :; done {op}"
    elif reader.startswith("x=$"): line = f"x=$(cat {op})"
    else: line = f"{reader} {op}"
    body = [rng.choice(BODY) for _ in range(rng.randint(0, 4))]
    term = rng.choices([d, d + " ", "\t" + d, None, " " + d], [70, 8, 10, 7, 5])[0]
    return "\n".join([line] + body + ([term] if term is not None else []))
def gen(seed):
    rng = random.Random(seed); random.seed(seed); units = []
    for _ in range(rng.randint(1, 5)):
        k = rng.random()
        if k < 0.45: units.append(heredoc_unit(rng))
        elif k < 0.7: units.append(rng.choice(STRINGS))
        else: units.append(rng.choice(UNITS_PLAIN))
    return "\n".join(units)
SEP2 = ["\n"] * 6 + ["\x0c", "\u2028", "\r", "\x0b", "\x85"]
CTX = ["{R} {OP}", "(( {R}{OP} ))", "{R} ${{x:- {OP} }}", "$(( {R}{OP}+(1) ))", "tee $[ {OP} ]", "{R} {OP} # note", "{R} {OP};", "{R} {OP} | cat", "x=$({R} {OP}", "x=$({R} {OP})", "x=`{R} {OP}",
       "echo $({R} {OP})", "{R} \\{OP}", "{R} '{OP}'", "{R} <\\\n<{D}", "{R} {OP} \\\n> /dev/null", "{R} <<{D}{SEP}", "{R} <<{D}{SEP} >/dev/null", "{R} <<{D}{SEP}; mark_ran", "{R} {OP}\r", "{R} {OP}", "{R} {OP}",
       "{R} <<E\\\nOF", "x=$({R} {OP}) y", "{{ {R} {OP}\n}}", "({R} {OP})"]
READERS2 = ["cat", "tee /dev/null", "grep -c x", "wc -l", "tr a b", "jq .", "bash", "read -r v", "sed p", "cat | bash", "cat >/dev/null"]
TERMS2 = lambda d: [d, d, d, d + ")", d + " )", d + ");", d + "\x0c", d + "\r", "\t" + d, d + " ", d + "X", None]
BODY2 = BODY + ["$(echo a # )", "$(case x in x)", "mark_ran;; esac)", "mark_ran)", "$(cat <<X)", "X", "#c", "case x in", "EOF)", "it's $(date # )", "${x:-$(mark_ran)}", "$(echo 'a", "$(echo \"a", "mark_ran # '", "mark_ran # \""]
STR2 = ['OUT="$(\n  true\n)"', 'x="$(\ntrue\n) echo "', 'x="$(\ntrue\n)cat "', 'echo "$(echo a # )', 'echo "$(case x in x) true;; esac', 'echo "$(date # )', "echo $$'a\\'", "echo $$'a'", "echo a #c{SEP}echo '", 'echo "a $(date) b',
        'x=$(echo "a', 'x=$(\n  echo "a\nb"\n)', "echo 'a\nb'", 'echo "it\'s"', "echo $'a\\'b'", 'y="a\nb" # c', 'echo "$(cat <<X', 'cat <<EOF\n$(echo a # )', "echo \"$(date)\"\\", "echo a\\"]
TAIL2 = ["mark_ran", "mark_ran # '", "echo ok # it's", 'mark_ran)"', "TS=$(date)", "tr -d '\"' < /dev/null", "# don't edit the line above", "echo 'z", 'echo "z', ")", "}", "mark_ran\n)", "echo done", "true"]
def gen2(seed):
    rng = random.Random(seed); units = []
    for _ in range(rng.randint(1, 4)):
        k = rng.random()
        if k < 0.6:
            d = rng.choice(["EOF", "E_1", "_E1"]); op = rng.choice([f"<<{d}", f"<<-{d}", f"<<'{d}'", f'<<"{d}"', f"<<\\{d}", f"<< {d}", f"<<{d}", f"<<{d}"])
            sep = rng.choice(SEP2); ctx = rng.choice(CTX).format(R=rng.choice(READERS2), OP=op, D=d, SEP=sep)
            body = [rng.choice(BODY2) for _ in range(rng.randint(0, 4))]; term = rng.choice(TERMS2(d))
            units.append("\n".join([ctx] + body + ([term] if term is not None else [])))
        elif k < 0.85: units.append(rng.choice(STR2).replace("{SEP}", rng.choice(SEP2)))
        else: units.append(rng.choice(TAIL2))
        if rng.random() < 0.6: units.append(rng.choice(TAIL2))
    return "\n".join(units)
ALPHABET = {"operator contexts": len(CTX), "readers": len(READERS2), "terminators": 12, "body lines": len(BODY2), "string units": len(STR2), "tail lines": len(TAIL2), "line separators": sorted(set(SEP2), key=repr)}
G = {}
def init(which):
    G["new"] = load(os.environ.get("GUARD"), "gnew"); G["old"] = load(os.environ.get("OLD"), "gold")
def rd(p): raise KeyError(p)
MK = "/dev/shm/hdmk"
def ran(script, mark):
    try: os.unlink(mark)
    except FileNotFoundError: pass
    pre = 'mark_ran() { echo x >> "$MARK"; }\n'
    try:
        subprocess.run(["bash", "--norc", "--noprofile", "-c", pre + script], cwd=MK, env={"MARK": mark, "PATH": os.environ["PATH"]}, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
    except subprocess.TimeoutExpired: pass
    return os.path.exists(mark)
MODE = os.environ.get("MODE", "1")
def work(seed):
    s = (gen2 if MODE == "2" else gen)(seed); r = ran(s, f"{MK}/{os.getpid()}"); res = {"seed": seed, "ran": r}
    for k in ("new", "old"):
        g = G[k]
        try:
            st = g.read_step({"run": s}, {}, rd)
            res[k] = not g.hides_a_launcher(st["unresolved"], s); res[k + "_clean"] = st["unresolved"] == []
        except Exception as e:
            res[k] = None; res[k + "_clean"] = None; res[k + "_err"] = repr(e)[:80]
    res["script"] = s; return res
if __name__ == "__main__":
    N = int(sys.argv[1]); base = int(sys.argv[2]); MODE = sys.argv[3] if len(sys.argv) > 3 else "1"; os.environ["MODE"] = MODE; os.makedirs(MK, exist_ok=True)
    print("generator:", "gen2" if MODE == "2" else "gen", "alphabet:", json.dumps(ALPHABET) if MODE == "2" else "see the lists at the top of this file")
    with Pool(4, initializer=init, initargs=(0,)) as p: rs = p.map(work, range(base, base + N), chunksize=200)
    st = {"scripts": len(rs), "marker_ran": sum(r["ran"] for r in rs)}
    for k in ("new", "old"):
        st[k + "_accepts_opaque_ok"] = sum(1 for r in rs if r[k]); st[k + "_accepts_plain"] = sum(1 for r in rs if r[k + "_clean"]); st[k + "_errors"] = sum(1 for r in rs if r[k] is None)
        st[k + "_VIOLATIONS(accepted & ran)"] = sum(1 for r in rs if r[k] and r["ran"]); st[k + "_VIOLATIONS_plain"] = sum(1 for r in rs if r[k + "_clean"] and r["ran"])
    st["accepted_by_new_not_old"] = sum(1 for r in rs if r["new"] and not r["old"]); st["accepted_by_old_not_new"] = sum(1 for r in rs if r["old"] and not r["new"])
    print(json.dumps(st, indent=1))
    for r in [r for r in rs if (r["new"] and r["ran"]) or r.get("new_err")][:6]: print("-----", r["seed"], r.get("new_err"), "\n" + r["script"])
