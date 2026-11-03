#!/usr/bin/env python3
"""Does the relay's /espn-summary route refuse this caller, for which events, from which Cloudflare
data centre, measured live and not from a cache?

WHY. field-relay-nba's Drama backfill (run 41235124610, 2026-10-31) was refused with HTTP 403 on its first
ESPN request, Bayern v Dortmund (event 401884754), and stored the refusal as a score. Events read seconds later
in that run answered 200. On 2026-11-03 the one-row reset (relay run 41593921289), run from a GitHub runner,
was refused for the same event, while the MCP probe tool and the dev sandbox got 200 for the same URL. One
sample per vantage does not say who refused (ESPN through the Worker's fetch, the relay, or Cloudflare in
front of it), whether the refusal belongs to the event, to the data centre that served the runner or to the
minute, or whether the 200s were live answers or copies.

METHOD. Read from the relay source (field-relay-nba main 46dcb17c, src/index.js and src/cache-helpers.js):
  - the route forwards the query string to ESPN (targetUrl = ESPN_SUMMARY_BASE + cleanPath + url.search) and
    tests its allow-list on the path only;
  - relayFetch answers from caches.default (per data centre, keyed by the full target URL, TTL 25 s) and
    stores ONLY successful ESPN answers. A non-OK answer comes back fresh as `espn-summary returned <status>`
    with `X-RELAY-Error: espn-summary-<status>` and is never stored.
So a 200 carrying `cf-cache-status: HIT` is a copy of an earlier success and cannot say whether ESPN would
answer this caller now. A request with a throw-away query parameter (`_=<nonce>`) is a new cache key: a live
read, made from the data centre that served it (the suffix of `cf-ray` names it). That ESPN ignores an unknown
parameter is an ASSUMPTION; the control events show whether it holds (a known-good event must still answer 200
with the parameter).

Per round, per event: the cache-busted read first, then the plain URL. The first event is read first in the
script, as the backfill read it first in its run. Controls: an event id that does not exist (ESPN's 404 passed
through: proves the route is reachable and the status is passed on) and /v2/games (a different route on the
same Worker).

The script does not judge. It exits 1 only when no request got an HTTP answer at all (nothing was measured);
every other outcome, including all-403, is a result.

Writes <out>/espn-summary-reach-probe-<UTC>.md. Stdlib only.

Usage:
  python3 scripts/probe-espn-summary-reach.py --events 401884754,401884748 --rounds 6 [--out outbox] [--pause 1.5]
"""
import argparse
import datetime
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request
import uuid

RELAY = "https://field-relay-nba.jeffunglesbee.workers.dev"
SUMMARY = "/espn-summary/sports/soccer/fifa.world/summary?event="


def utc():
    return datetime.datetime.now(datetime.timezone.utc)


def clean(text, n):
    """One table cell: no pipes, no line breaks, no control characters, at most n characters."""
    return "".join(c if c.isprintable() else " " for c in text[:n]).replace("|", "/").strip()


def get(path, timeout=30):
    req = urllib.request.Request(RELAY + path, headers={"User-Agent": "field-laboratory-probe/1"})
    t0 = time.monotonic()
    at = utc().strftime("%H:%M:%S")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, body, h = r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        status, body, h = e.code, e.read(), e.headers
    except Exception as e:  # noqa: BLE001 - a transport failure is a result, not a crash
        return {"status": None, "at": at, "error": clean(f"{type(e).__name__}: {e}", 120),
                "ms": round((time.monotonic() - t0) * 1000)}
    ray = h.get("cf-ray") or ""
    return {
        "status": status, "at": at, "ms": round((time.monotonic() - t0) * 1000), "bytes": len(body),
        "colo": ray.rsplit("-", 1)[-1] if "-" in ray else "", "cache": h.get("cf-cache-status") or "",
        "age": h.get("age") or "", "relay_err": h.get("x-relay-error") or "",
        "head": "" if status == 200 else clean(body[:80].decode("latin-1"), 80),
    }


def cells(r):
    if r["status"] is None:
        return [f"no answer: {r['error']}", "", "", "", "", "", ""]
    return [str(r["status"]), str(r["bytes"]), r["colo"] or "-", r["cache"] or "-", r["age"] or "-",
            r["relay_err"] or "-", r["head"] or "-"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", required=True, help="comma-separated ESPN soccer event ids; the first is read first")
    ap.add_argument("--rounds", type=int, default=6)
    ap.add_argument("--out", default="outbox")
    ap.add_argument("--pause", type=float, default=1.5)
    a = ap.parse_args()
    events = [e for e in a.events.split(",") if e]
    if not events or a.rounds < 1:
        print("FAIL: need at least one event and one round")
        return 2
    started = utc()
    today = started.strftime("%Y-%m-%d")

    rows = []  # (round, label, variant, result)

    def one(rnd, label, path, variant):
        r = get(path)
        rows.append((rnd, label, variant, r))
        print(f"{r['at']} round {rnd} {label:<22} {variant:<6} " + " | ".join(cells(r)), flush=True)
        time.sleep(a.pause)

    def nonce():
        return uuid.uuid4().hex[:12]

    for rnd in range(1, a.rounds + 1):
        for ev in events:
            one(rnd, f"event {ev}", f"{SUMMARY}{ev}&_={nonce()}", "nonce")
            one(rnd, f"event {ev}", f"{SUMMARY}{ev}", "plain")
        one(rnd, "control: no such event", f"{SUMMARY}1&_={nonce()}", "nonce")
        one(rnd, "control: /v2/games", f"/v2/games?sport=epl&date={today}&_={nonce()}", "nonce")
    finished = utc()

    keys = []
    for _, label, variant, _r in rows:
        if (label, variant) not in keys:
            keys.append((label, variant))

    run_id = os.environ.get("GITHUB_RUN_ID", "")
    run = (f"https://github.com/{os.environ.get('GITHUB_REPOSITORY', '')}/actions/runs/{run_id}" if run_id
           else "not run in Actions (the vantage is this machine, not a runner)")
    out = [f"# ESPN summary reach probe, {started.strftime('%Y%m%dT%H%M%SZ')}", "",
           f"- Run: {run}",
           f"- Runner image: {os.environ.get('ImageOS', '-')} {os.environ.get('ImageVersion', '')}".rstrip(),
           f"- Relay: {RELAY}",
           f"- Events (first = the refused one): {', '.join(events)}",
           f"- {a.rounds} rounds, {a.pause} s between requests, {started.strftime('%H:%M:%S')} to {finished.strftime('%H:%M:%S')} UTC",
           "- `nonce` = the same URL plus `&_=<random>`: a new cache key, so a live read. `plain` = the URL as the backfill sends it.",
           "", "## Summary", "",
           "| what | variant | statuses | data centres, by status | X-RELAY-Error, by status |", "|---|---|---|---|---|"]
    for label, variant in keys:
        rs = [r for _, l, v, r in rows if l == label and v == variant]
        stat, colos, errs, caches = {}, {}, {}, {}
        for r in rs:
            s = r["status"] if r["status"] is not None else "no answer"
            stat[s] = stat.get(s, 0) + 1
            colos.setdefault(s, set()).add(r.get("colo") or "-")
            errs.setdefault(s, set()).add(r.get("relay_err") or "-")
            caches.setdefault(s, set()).add(r.get("cache") or "-")
        order = sorted(stat, key=str)
        out.append(f"| {label} | {variant} | " + ", ".join(f"{s} x{stat[s]}" for s in order) +
                   " | " + "; ".join(f"{s}: {'/'.join(sorted(colos[s]))}" for s in order) +
                   " | " + "; ".join(f"{s}: {'/'.join(sorted(errs[s]))}" for s in order) + " |")
    out += ["", "## Every response", "",
            "| round | time (UTC) | what | variant | status | bytes | data centre | cf-cache-status | age | X-RELAY-Error | body start (non-200) |",
            "|---|---|---|---|---|---|---|---|---|---|---|"]
    for rnd, label, variant, r in rows:
        out.append(f"| {rnd} | {r['at']} | {label} | {variant} | " + " | ".join(cells(r)) + " |")

    path = pathlib.Path(a.out)
    path.mkdir(parents=True, exist_ok=True)
    f = path / f"espn-summary-reach-probe-{started.strftime('%Y%m%dT%H%M%SZ')}.md"
    f.write_text("\n".join(out) + "\n")

    answered = sum(1 for _, _, _, r in rows if r["status"] is not None)
    print(f"\nWrote {f}\n")
    print("\n".join(l for l in out[out.index("## Summary") + 2: out.index("## Every response") - 1]))
    print(f"\n{answered} of {len(rows)} requests got an HTTP answer.")
    if answered == 0:
        print("NOT MEASURED: no request got an HTTP answer, so this run says nothing about the route.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
