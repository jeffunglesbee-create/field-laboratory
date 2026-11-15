import re, json, subprocess, os, sys, concurrent.futures as cf
from pathlib import Path
src = Path("scripts/mutation-check.mjs").read_text()
cmds = {}
for m in re.finditer(r'\bexpect:\s*(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\')', src):
    c = next(x for x in m.groups() if x is not None).encode().decode("unicode_escape")
    cmds[c] = cmds.get(c, 0) + 1
distinct = sorted(cmds)
selftests = [c for c in distinct if c.endswith("--self-test") or " --self-test" in c]
todo = [c for c in distinct if c not in selftests]
print(f"distinct expectation commands: {len(distinct)}; --self-test (never launches, measured by scripts/no-launch-check.mjs): {len(selftests)}; probed here: {len(todo)}", flush=True)
env = {k: v for k, v in os.environ.items() if k not in ("PW_CHROMIUM",)}
env["PLAYWRIGHT_BROWSERS_PATH"] = "/nonexistent-browsers"


def run(c):
    try:
        r = subprocess.run(["bash", "-c", c], capture_output=True, text=True, timeout=240, env=env)
        return {"cmd": c, "status": r.returncode, "text": (r.stdout or "") + (r.stderr or "")}
    except subprocess.TimeoutExpired:
        return {"cmd": c, "status": None, "text": "TIMEOUT 240s"}


serial = [c for c in todo if "proof-check" in c or "doc claims are compiler" in c or "build is clean" in c or "F# harness" in c]
par = [c for c in todo if c not in serial]
with cf.ThreadPoolExecutor(4) as ex:
    res = list(ex.map(run, par))
res += [run(c) for c in serial]
print("browser dir seen by the commands:", sorted(os.listdir("/opt/pw-browsers")), flush=True)
Path("/tmp/claude-0/-home-user/16a8e715-96e9-5e19-915e-4deaf2e6c856/scratchpad/nobrowser-results.json").write_text(json.dumps({"selftests": len(selftests), "distinct": len(distinct), "results": res}))
print("done", len(res))
