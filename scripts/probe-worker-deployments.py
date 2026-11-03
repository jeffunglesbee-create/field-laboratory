#!/usr/bin/env python3
"""Read a Worker's own deployment and version history from Cloudflare's API, and write it down.

WHY THIS EXISTS. The owner's 2026-11-02 could-not-verify list ended with "Worker version ids other than the last
deploy". Every version id the relay's records quote comes from the line `Current Version ID: ...` that
`wrangler deploy` prints into a deploy workflow's log. That is a COPY of Cloudflare's record, made at deploy
time. It cannot show a deploy made from anywhere else (a laptop, the dashboard, a rollback), and the Cloudflare
tool available to sessions returns only a script's name and id. The relay exposes no version header and no
version-metadata binding (`/version` answers 403, wrangler.toml has none), so the live id cannot be read from
outside either. This asks Cloudflare itself, from a runner that holds the account's API token.

WHAT IT DOES. Per script name, two read-only GETs:
  GET /accounts/<id>/workers/scripts/<name>/deployments
  GET /accounts/<id>/workers/scripts/<name>/versions
It prints a table of each deployment (time, id, source, version ids with their traffic share) and each version
(time, number, id), then the raw answers with the author's email removed, so a reader can see the real shape if a
field is not where this script looked. The token is read from the environment. So is the account id; when that is
unset it is taken from GET /accounts if the token sees exactly one account, and the output says so. Neither is
printed. It writes nothing to Cloudflare.

VERSION DETAIL (--version-ids). The two lists name versions but say nothing about what is inside one. With
`--version-ids a,b,c` the probe also asks, per script and per id,
  GET /accounts/<id>/workers/scripts/<name>/versions/<version id>
and prints the fields that can tell two versions' code apart without printing any configuration value: the
script's etag (the value the API reports under resources.script; its definition was not found in Cloudflare's
documentation when this was written, so equal etags are evidence that two versions hold the same script and
differing ones are evidence they do not, not a proven content hash), its handlers, the compatibility date, and
the number of bindings with a sha256 of the canonical list (so two versions' bindings can be compared and no
binding value is written into the repository). It then says whether the etags are all equal, or differ, or
could not be read for some id; a field the answer does not carry is printed as `?` and is never guessed. The raw
detail answer is NOT written: it holds the bindings. Only the NAMES of the keys under `resources.script` are
printed, so the next reader can see the real shape.

EXIT CODE. 0 when at least one list answered 200 for at least one script. 1 when none did: every refusal is
printed with its HTTP status and the API's own error code and message, which is the finding in that case (for
example a token that can deploy but cannot read).

Usage (a runner, with CLOUDFLARE_API_TOKEN in the environment, and CLOUDFLARE_ACCOUNT_ID if the token sees more
than one account):
  python3 scripts/probe-worker-deployments.py --scripts field-relay-nba [--out outbox/worker-deployments-probe-<UTC>.md]
"""
import argparse
import datetime
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.cloudflare.com/client/v4"


def get(path, token):
    """One GET. Returns (status, parsed JSON or None, raw text). Never raises on an HTTP error status."""
    req = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode("utf-8", "replace")
            status = r.status
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")
        status = e.code
    except Exception as e:  # DNS, TLS, timeout: no HTTP status exists
        return None, None, f"{type(e).__name__}: {e}"
    try:
        return status, json.loads(text), text
    except ValueError:
        return status, None, text


def scrub(node):
    """Remove author emails from an answer before it is written into the repository."""
    if isinstance(node, dict):
        return {k: ("<removed>" if k in ("author_email", "email") else scrub(v)) for k, v in node.items()}
    if isinstance(node, list):
        return [scrub(v) for v in node]
    return node


def items_of(body):
    """The list inside an answer, wherever this API version puts it. None when there is none to find."""
    if not isinstance(body, dict):
        return None
    res = body.get("result")
    if isinstance(res, list):
        return res
    if isinstance(res, dict):
        for key in ("deployments", "items", "versions"):
            if isinstance(res.get(key), list):
                return res[key]
    return None


def errors_of(body, text):
    if isinstance(body, dict) and body.get("errors"):
        return "; ".join(f"code {e.get('code')}: {e.get('message')}" for e in body["errors"] if isinstance(e, dict))
    return (text or "")[:200]


def dict_of(node, key):
    """node[key] when it is a dict, else {}: an answer that lacks a level must not raise, and is not guessed at."""
    v = node.get(key) if isinstance(node, dict) else None
    return v if isinstance(v, dict) else {}


def version_detail(account, name, ids, token):
    """Per version id: the fields that tell two versions' code apart, with no configuration value printed.

    Returns lines of markdown. A field the answer does not carry is `?`. The etags are compared only when every
    id answered with one; otherwise the comparison says which could not be read.
    """
    lines = [f"### Version detail for `{name}`", "",
             "| version id | number | created (UTC) | script etag | handlers | compatibility date | bindings (count, sha256 of the canonical list) |",
             "|---|---|---|---|---|---|---|"]
    etags = {}
    shapes = []
    for vid in ids:
        status, body, text = get(f"/accounts/{account}/workers/scripts/{name}/versions/{vid}", token)
        if status != 200:
            lines.append(f"| `{vid}` | HTTP {status}: {errors_of(body, text)} | | | | | |")
            etags[vid] = None
            continue
        res = dict_of(body, "result")
        resources = dict_of(res, "resources")
        script = dict_of(resources, "script")
        runtime = dict_of(resources, "script_runtime")
        meta = dict_of(res, "metadata")
        bindings = resources.get("bindings")
        if isinstance(bindings, list):
            canon = json.dumps(bindings, sort_keys=True, separators=(",", ":"))
            bound = f"{len(bindings)}, {hashlib.sha256(canon.encode()).hexdigest()[:16]}"
        else:
            bound = "?"
        etag = script.get("etag")
        etags[vid] = etag if isinstance(etag, str) and etag else None
        handlers = script.get("handlers")
        handlers = ", ".join(str(h) for h in handlers) if isinstance(handlers, list) else "?"
        lines.append(f"| `{res.get('id', vid)}` | {res.get('number', '?')} | {meta.get('created_on', res.get('created_on', '?'))} | "
                     f"`{etags[vid] or '?'}` | {handlers} | {runtime.get('compatibility_date', '?')} | {bound} |")
        shapes.append(f"`{vid[:8]}` result keys {sorted(res.keys())}; resources keys {sorted(resources.keys())}; resources.script keys {sorted(script.keys())}")
    lines.append("")
    unread = [v for v, e in etags.items() if e is None]
    if unread:
        lines.append(f"**etag comparison: not made.** No etag could be read for: {', '.join(f'`{v[:8]}`' for v in unread)}.")
    elif len(set(etags.values())) == 1:
        lines.append(f"**etag comparison: all {len(etags)} version(s) carry the same script etag.**")
    else:
        lines.append("**etag comparison: the etags DIFFER:** " + "; ".join(f"`{v[:8]}` = `{e}`" for v, e in etags.items()))
    lines.append("")
    for s in shapes:
        lines.append(f"- shape: {s}")
    lines.append("")
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scripts", default="field-relay-nba")
    ap.add_argument("--out", default=None)
    ap.add_argument("--version-ids", default="", help="comma-separated version ids to read in detail (script etag, handlers, bindings hash)")
    args = ap.parse_args()

    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    if not token:
        print("FAIL: not set in the environment: CLOUDFLARE_API_TOKEN")
        return 1

    # The laboratory repository has CLOUDFLARE_API_TOKEN and no CLOUDFLARE_ACCOUNT_ID (the first dispatch,
    # run 41599815091, printed the variable empty). Its own deploy runs `wrangler deploy`, which finds the
    # account from the token when there is exactly one. This does the same and no more: exactly one account
    # is used and said to be derived; none, several, or a refusal stops the probe and says what was seen.
    derived = False
    if not account:
        status, body, text = get("/accounts?per_page=50", token)
        accounts = body.get("result") if isinstance(body, dict) else None
        if status != 200 or not isinstance(accounts, list):
            print(f"FAIL: CLOUDFLARE_ACCOUNT_ID is not set and GET /accounts answered HTTP {status}: {errors_of(body, text)}")
            return 1
        if len(accounts) != 1:
            print(f"FAIL: CLOUDFLARE_ACCOUNT_ID is not set and the token sees {len(accounts)} accounts; refusing to choose one. Set the variable.")
            return 1
        account = accounts[0].get("id", "")
        derived = True
        if not account:
            print("FAIL: GET /accounts returned one account with no id")
            return 1

    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = [f"# Worker deployment history from Cloudflare's API, read {now}", ""]
    out.append("Read-only. Two GETs per script. The token and the account id are not printed. Author emails are removed from the raw answers.")
    out.append("Account: " + ("derived from the token (GET /accounts returned exactly one account)." if derived else "given in the environment."))
    out.append("")
    answered = 0

    for name in [s.strip() for s in args.scripts.split(",") if s.strip()]:
        out.append(f"## `{name}`")
        out.append("")
        for label, path in (("deployments", f"/accounts/{account}/workers/scripts/{name}/deployments"),
                            ("versions", f"/accounts/{account}/workers/scripts/{name}/versions?per_page=50")):
            status, body, text = get(path, token)
            if status != 200:
                out.append(f"**{label}**: HTTP {status}. {errors_of(body, text)}")
                out.append("")
                continue
            answered += 1
            items = items_of(body)
            if items is None:
                out.append(f"**{label}**: HTTP 200 and no list where this script looks (`result`, `result.deployments`, `result.items`, `result.versions`); see the raw answer below.")
            elif label == "deployments":
                out.append(f"**deployments**: {len(items)} (newest first as the API returns them)")
                out.append("")
                out.append("| created (UTC) | deployment id | source | versions (traffic %) | annotations |")
                out.append("|---|---|---|---|---|")
                for d in items:
                    vs = ", ".join(f"`{v.get('version_id', '?')}` {v.get('percentage', '?')}" for v in d.get("versions", []) or [])
                    ann = d.get("annotations") or {}
                    out.append(f"| {d.get('created_on', '?')} | `{d.get('id', '?')}` | {d.get('source', '?')} | {vs or '?'} | {json.dumps(ann, sort_keys=True)[:160]} |")
            else:
                out.append(f"**versions**: {len(items)}")
                out.append("")
                out.append("| created (UTC) | number | version id | source |")
                out.append("|---|---|---|---|")
                for v in items:
                    meta = v.get("metadata") or {}
                    out.append(f"| {meta.get('created_on', v.get('created_on', '?'))} | {v.get('number', '?')} | `{v.get('id', '?')}` | {meta.get('source', v.get('source', '?'))} |")
            out.append("")
            out.append(f"<details><summary>raw {label} answer</summary>\n\n```json\n{json.dumps(scrub(body), indent=1)[:12000]}\n```\n</details>")
            out.append("")

        ids = [v.strip() for v in args.version_ids.split(",") if v.strip()]
        if ids:
            out.extend(version_detail(account, name, ids, token))

    text = "\n".join(out) + "\n"
    print(text)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text)
    return 0 if answered else 1


if __name__ == "__main__":
    sys.exit(main())
