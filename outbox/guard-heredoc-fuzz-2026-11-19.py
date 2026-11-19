#!/usr/bin/env python3
"""A differential test of scripts/check-browser-gate.py against bash, for heredocs and strings that span lines (docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md, item 1).

Each seed generates a small script from units that stress the new reading: heredocs (quoted, unquoted, `<<-`, `<<\\X`, two on a line, in `$( )`, in a group, in an `if`, piped to `bash`, with no terminator,
with a delimiter the reader cannot parse, nested inside another heredoc's body), strings that span lines (double, single, ANSI-C, with a `$( )`, never closing) and plain lines. A bare `mark_ran` is
the marker: a function the harness defines that appends to a file. The script is RUN by bash (`bash --norc -c`, stdin closed) and READ by the guard (`read_step`, `hides_a_launcher`). The property is:

    the guard accepts the script (reads it clean, or keeps it as opaque) => the marker did NOT run in bash.

`mark_ran` is no head the guard allows, so a script in which bash ran it and the guard saw nothing is a false green. The same scripts are read by the guard as it was before the change (OLD), so the
output says how many more scripts are accepted now than by OLD (`accepted_by_new_not_old`) and how many fewer (`accepted_by_old_not_new`): with OLD = the parent 39459bd2 the second is 0 (the parent refused every heredoc and read a string that
spans lines line by line); with OLD = an earlier reader of this feature (c95eebcf, the carried-state one) it is the design cost of the strict reader, scripts that reader accepted and this one refuses. Rule 91: the output
starts with the count of scripts, and says how many of the scripts the guard accepts reach the new code (the REACHED lines: a heredoc read as data, a string joined over lines).

    GUARD=scripts/check-browser-gate.py OLD=/path/to/old-guard.py python3 outbox/guard-heredoc-fuzz-2026-11-19.py <count> <first seed> [2|3]
    (GUARD=<a mutated copy> shows that the test can fail: see outbox/guard-heredoc-fuzz-2026-11-19.txt.)

A third argument `2` draws the scripts from the SECOND generator (gen2), written after the independent review of 1806bf8a (workflow wf_e852d66e-255) found false greens in shapes the first one never draws
(it drew a line break only as `\\n`, a heredoc operator only on the line of its reader, a body from 24 lines with no `case`, no `EOF)` and no `#` inside a `$( )`). gen2 draws, for each unit: an operator context (a plain
reader, `(( ))`, `${ }`, `$(( ))`, `$[ ]`, a quoted or backslashed `<<`, a `$( )` or a backtick pair left open or closed on the line, a trailing comment, `;` or `|`, a backslash that splits the operator or
joins the line, a form feed, U+2028 or a carriage return right after the delimiter); a terminator (the delimiter alone, with `)`, ` )`, `);`, a form feed, a carriage return, a tab, a space, an extra letter, or none);
a body line from a pool that holds `#`, `case`, `EOF)`, a nested heredoc and unbalanced quotes and parentheses in a `$( )`; a string that spans lines (a `"$( )"` closed on a later line, a `"$(` and its `) echo "`,
`$$'...\\'`, a `#` that holds the `)`, a form feed in a comment); and a tail of lines after it that holds the marker next to apostrophes, quotes and `$( )`. The printed result lists the alphabet (Rule 91): the number of DISTINCT members of each list.

A third argument `4` draws from gen4, written after the third review (workflow wf_a221fda7-c68, of 0ba7f399), which found that gen, gen2 and gen3 reach the accept path of the strict reader in under 1 script of 1000 and draw
none of the shapes behind its false greens (see the comment above ORD4). gen4 draws ordinary lines between the contested ones and counts how often the accept path is reached.

A third argument `3` draws from the THIRD generator (gen3), written after the second independent review (workflow wf_c6a2a2b4-b6b) found that the first two never draw an opener on one line and its operator on
the next (0 of 30000 gen2 scripts), which is where the second review's false greens were (an open `$(`, `${`, `$[`, `((` or backtick left by an earlier line; an operator line that opens a `$(` after the
operator; a `#` in a `$( )` on the operator's line; a stray `]` or `)` before a `$[` or `((`; two operators on a line, one in a `$( )`). gen3 draws an opener line (`V=$(`, `x="$(`, `echo ${x:-`, `((`, `$[`,
`$((`, a backtick, `<(`, `{`, `(`, `case x in`...), a line or two before the operator (a command, a comment that holds a `)`), the operator line (a prefix with a stray closer, a reader, the operator, a
suffix that opens a `$(` or holds a comment), a body, a terminator, the closer on its own line or on the terminator line, and a tail.
"""
import sys, os, random, subprocess, importlib.util, json, signal
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
OPEN3 = [("V=$(", ")"), ("x=$(", ")"), ("echo ${x:-", "}"), ("((", "))"), ("true $[", "]"), ("true $((", "))"), ("x=`", "`"), ("diff <(", ") /dev/null"), ("echo $(", ")"), ("{", "}"), ("(", ")"),
         ("if true; then", "fi"), ("case x in", "esac"), ('x="$(', ')"'), ("echo ${x:-a", "}"), ("for ((", ";;))"), ("while true; do", "break; done"), ("echo $(echo $(", "))")]
PRE3 = ["", "true\n", "echo a\n", "# c\n", "# ) c\n", "echo ]\n", "echo [\n", "mark_ran\n", "a) true ;;\n"]
STRAY3 = ["", "", "", "echo ]; ", "true ${x:-))}; ", "echo \\) \\) ; ", "echo ) ; ", "echo '(' ; ", "case x in a) true;; esac; "]
POST3 = ["", "", "", " $(", " ; V=$(", " >$(echo f", " $(echo a # )", " # (x", " ${x:-$(", " $(echo", " ; ( ", " # note ) "]
CLOSE3 = lambda close: [close, close, "\n" + close, close + " mark_ran", "", "x\n" + close]
def unit3(rng):
    d = rng.choice(["EOF", "E_1", "_E1"]); op = rng.choice([f"<<{d}", f"<<-{d}", f"<<'{d}'", f'<<"{d}"', f"<<\\{d}", f"<< {d}"])
    opener, close = rng.choice(OPEN3); reader = rng.choice(READERS2)
    oper = rng.choice(STRAY3) + f"{reader} {op}" + rng.choice(POST3)
    if rng.random() < 0.15: oper = f"{reader} {op} {rng.choice(READERS2)} $({reader} <<B)"
    body = [rng.choice(BODY2) for _ in range(rng.randint(0, 3))]; term = rng.choice(TERMS2(d))
    inner = rng.choice(PRE3) + oper
    lines = [opener, inner] + body + ([term] if term is not None else []) + [rng.choice(CLOSE3(close))]
    return "\n".join(lines)
def gen3(seed):
    rng = random.Random(seed); units = []
    for _ in range(rng.randint(1, 3)):
        k = rng.random()
        if k < 0.75: units.append(unit3(rng))
        elif k < 0.88: units.append(rng.choice(STR2).replace("{SEP}", rng.choice(SEP2)))
        else: units.append(rng.choice(TAIL2))
        if rng.random() < 0.6: units.append(rng.choice(TAIL2))
    return "\n".join(units)
# gen4 (review 3, workflow wf_a221fda7-c68, of 0ba7f399): the review found that gen, gen2 and gen3 draw none of the shapes behind its false greens (`#$(mark_ran)` as a body line, a `)` in a `${ }` or a `$[ ]` in a
# `$( )`, a `#` glued to the `)` of a `<( )` or an array, a `(( (x) cat <<EOF ))`, a subscript after a stray closer) and reach the accept path of the strict reader in under 1 script of 1000 (gen 789, gen2 134, gen3 17
# of 20000): its openers are all lines that the stop refuses. gen4 draws ORDINARY lines (a counter, a `[[ ]]` or `[ ]` test, a `$(date)`, a `$(cat "$F")`, a summary heredoc, a message over lines) between the
# contested ones, so that the accept path is reached at volume, and counts in its result how often (the REACHED lines).
ORD4 = ["n=$((n+1))", 'if [[ -n "$A" ]]; then', "fi", 'if [ -n "$A" ]; then', 'echo "built $(date -u +%F)"', 'X=$(cat "$F")', "(( i++ ))", "a=(1 2)", "a[1]=2", "true", "echo hi", "mark_ran",
        "echo ]; a[1", ": <(true)#\"", "a=(true)#'", ": <(true)", "(( (true)", "for ((i=0;i<2;i++)); do :; done", "echo $[1+1]", "diff <(echo a) <(echo b)", "x=$(echo ${v})", "f() {", "}", "echo ${x:-]}"]
BODY4 = ["## Report", "- ok", "`code` and \\`escaped\\`", "built $(date -u +%F)", "$((N - 1)) of $N", "#$(mark_ran)", "$(mark_ran)", "$(echo ${y:-)}; mark_ran)", "$(echo ${x%)}; mark_ran)",
         "$(echo $[1)]; mark_ran)", "# $(mark_ran)", "plain text", "it's", "mark_ran", "x # y", "$(echo a) $(mark_ran)", "`mark_ran`", "${y:-)}"]
OPLINE4 = ['cat >> "$GITHUB_STEP_SUMMARY" <<EOF', "cat <<EOF", "tee -a f <<EOF", "cat <<'EOF'", "grep x <<EOF", "bash <<EOF", "cat <<EOF >/dev/null", "(( (true) cat <<EOF )) || true", "a=( cat <<EOF",
           "cat <<EOF $(echo $[ )", "x=$(cat <<EOF", "tee $[ <<EOF ]"]
STR4 = ['echo "a\nb $(date -u +%F) c"', "echo 'a\nb `x` c'", 'echo "a\n$(echo ${y:-)}; mark_ran) b"', 'echo "a\nb $(false && echo $[1)]; mark_ran )"', "echo 'a\n$(mark_ran)\nb'", 'git commit -m "feat: x\n\nCloses #12"',
        "node -e '\n  const d = `a ${b}`\n  console.log(d)\n'", 'echo "a\n$(echo ${x:-)}; mark_ran)\nb"', "echo \"a $(echo 'b')\nc\""]
# not drawn: `>&'x` + newline + `$(mark_ran)` + newline + `y'` (a multi-line surface of the parent's reading of the word after `>&`; recorded in the residual CC-CMD, item 1f and item 4), which would add a known violation to every script that holds it.
def gen4(seed):
    rng = random.Random(seed); units = []
    for _ in range(rng.randint(2, 6)):
        k = rng.random()
        if k < 0.35: units.append(rng.choice(ORD4))
        elif k < 0.7:
            term = rng.choices(["EOF", None], [93, 7])[0]
            units.append("\n".join([rng.choice(OPLINE4)] + [rng.choice(BODY4) for _ in range(rng.randint(0, 3))] + ([term] if term else [])))
        else: units.append(rng.choice(STR4))
    return "\n".join(units)
ALPHABET = {"gen4": {"ordinary and contested lines": len(set(ORD4)), "operator lines": len(set(OPLINE4)), "body lines": len(set(BODY4)), "string units": len(set(STR4))}, "gen2": {"operator contexts": len(set(CTX)), "readers": len(set(READERS2)), "terminators": len(set(TERMS2("D"))), "body lines": len(set(BODY2)), "string units": len(set(STR2)), "tail lines": len(set(TAIL2)), "line separators": sorted(set(SEP2), key=repr)}, "gen3": {"openers": len(OPEN3), "lines before the operator": len(set(PRE3)), "operator prefixes": len(set(STRAY3)), "operator suffixes": len(set(POST3)), "closers": len(set(CLOSE3("C"))), "readers": len(set(READERS2)), "terminators": len(set(TERMS2("D"))), "body lines": len(set(BODY2)), "tail lines": len(set(TAIL2))}}
G = {}
def init(which):
    G["new"] = load(os.environ.get("GUARD"), "gnew"); G["old"] = load(os.environ.get("OLD"), "gold")
def rd(p): raise KeyError(p)
MK = "/dev/shm/hdmk"
def ran(script, mark):
    try: os.unlink(mark)
    except FileNotFoundError: pass
    pre = 'mark_ran() { echo x >> "$MARK"; }\n'
    # Review 3 (TT-5): a `mark_ran` that runs in a process substitution (`<( )`, `>( )`) races bash's exit, so the old oracle (stdout and stderr to /dev/null, no wait) counted such a script about half the time (30 runs of
    # seed 3007585: 14 with the marker, 16 without). Now bash's output is a pipe and communicate() returns when EVERY process that holds it has exited, a process substitution's child included; bash runs in its own
    # process group, which is killed afterwards, so nothing it started (an `until false` loop) outlives the script.
    p = subprocess.Popen(["bash", "--norc", "--noprofile", "-c", pre + script], cwd=MK, env={"MARK": mark, "PATH": os.environ["PATH"]}, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try: p.communicate(timeout=5)
    except subprocess.TimeoutExpired: pass
    finally:
        try: os.killpg(p.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        try: p.communicate(timeout=5)
        except Exception: pass
    return os.path.exists(mark)
MODE = os.environ.get("MODE", "1")
def work(seed):
    s = {"2": gen2, "3": gen3, "4": gen4}.get(MODE, gen)(seed); r = ran(s, f"{MK}/{os.getpid()}"); res = {"seed": seed, "ran": r}
    for k in ("new", "old"):
        g = G[k]
        try:
            st = g.read_step({"run": s}, {}, rd)
            res[k] = not g.hides_a_launcher(st["unresolved"], s); res[k + "_clean"] = st["unresolved"] == []
            if k == "new" and res[k]:
                lines, bodies = g.command_lines(s); res["heredoc_data"] = bool(bodies); res["joined"] = any("\n" in l for l in lines)
        except Exception as e:
            res[k] = None; res[k + "_clean"] = None; res[k + "_err"] = repr(e)[:80]
    res["script"] = s; return res
if __name__ == "__main__":
    N = int(sys.argv[1]); base = int(sys.argv[2]); MODE = sys.argv[3] if len(sys.argv) > 3 else "1"; os.environ["MODE"] = MODE; os.makedirs(MK, exist_ok=True)
    print("generator:", {"2": "gen2", "3": "gen3", "4": "gen4"}.get(MODE, "gen"), "alphabet:", json.dumps(ALPHABET[{"2": "gen2", "3": "gen3", "4": "gen4"}[MODE]]) if MODE in ("2", "3", "4") else "see the lists at the top of this file")
    with Pool(4, initializer=init, initargs=(0,)) as p: rs = p.map(work, range(base, base + N), chunksize=200)
    st = {"scripts": len(rs), "marker_ran": sum(r["ran"] for r in rs)}
    for k in ("new", "old"):
        st[k + "_accepts_opaque_ok"] = sum(1 for r in rs if r[k]); st[k + "_accepts_plain"] = sum(1 for r in rs if r[k + "_clean"]); st[k + "_errors"] = sum(1 for r in rs if r[k] is None)
        st[k + "_VIOLATIONS(accepted & ran)"] = sum(1 for r in rs if r[k] and r["ran"]); st[k + "_VIOLATIONS_plain"] = sum(1 for r in rs if r[k + "_clean"] and r["ran"])
    acc = [r for r in rs if r["new"]]
    st["REACHED: scripts the new guard accepts"] = len(acc); st["REACHED: ...of them with a heredoc read as data"] = sum(1 for r in acc if r.get("heredoc_data")); st["REACHED: ...of them with a string joined over lines"] = sum(1 for r in acc if r.get("joined"))
    st["accepted_by_new_not_old"] = sum(1 for r in rs if r["new"] and not r["old"]); st["accepted_by_old_not_new"] = sum(1 for r in rs if r["old"] and not r["new"])
    print(json.dumps(st, indent=1))
    for r in [r for r in rs if (r["new"] and r["ran"]) or r.get("new_err")][:6]: print("-----", r["seed"], r.get("new_err"), "\n" + r["script"])
