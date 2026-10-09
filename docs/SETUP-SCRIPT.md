# Cloud environment setup script

This is the one piece of this repo's setup that **cannot be committed**. It has
to be pasted into a UI field by a human. No session, CC-CMD, or API can write
it.

## Paste this into the environment's Setup script field

At [claude.ai/code](https://claude.ai/code) → environment selector (the cloud
icon above the message box) → gear icon on the environment → **Setup script**:

```bash
#!/bin/bash
timeout 120 bash -c '
  apt-get -o DPkg::Lock::Timeout=60 update
  apt-get -o DPkg::Lock::Timeout=60 install -y --no-install-recommends dotnet-sdk-10.0
' || echo "setup: .NET SDK install did not complete; the SessionStart hook will retry."
dotnet --version || true
exit 0
```

Measured cold, from a container with no .NET at all: **31.6 seconds**, exit 0,
`dotnet 10.0.110` installed.

### Why this shape and not a one-liner

The obvious version — `apt-get update && apt-get install ... || true` — is what
was tried first, and a real session reported **"Setup script failed"** with it.
That failure was never reproduced when this was written. **It is reproducible
now — see "Reproduced on demand" below.** What was ruled out by direct test:

- **Not the exit code.** That one-liner exits 0 in every case tested: normal
  run, `apt-get` returning 100, and under both `set -e` and `set -eo pipefail`.
  Bash parses it as `(update && install) || true`, so it cannot propagate a
  failure.
- **Not a blocked host.** `archive.ubuntu.com`, `security.ubuntu.com`, and
  `*.ubuntu.com` are all on the documented default allowlist.
- **Not `apt-get update` failing.** It exits 0 on this image (see the PPA note
  below).

So the hardening targets what could not be ruled out:

- `timeout 120` caps the whole install so a hang — e.g. apt lock contention
  with a boot-time `apt-daily` job — fails fast instead of blowing the budget.
  **It was 240 until 2026-10-09, and 240 was sized against a mechanism that is
  wrong.** The setup script does not get its own clock: the init script runs
  INSIDE the same `env_init` phase as the repository checkout, and after it.
  Measured on this environment's only `session_mode: "new"` boot —
  `sources_processing` 51.855 s, of which `jubilant-bassoon` alone was 42.49 s
  for 465,871,184 bytes — so 52 + 240 left about 8 seconds of margin against the
  ~300 s phase budget, on an environment whose largest clone keeps growing. A
  slow clone day would have converted this remedy into a phase timeout: the same
  dead container, with no npm error left to point at.
  `scripts/setup-script-check.mjs` now refuses any block above 120 s, and it
  caught this one on its first run.
- `-o DPkg::Lock::Timeout=60` makes apt wait a bounded time for the dpkg lock
  rather than potentially blocking indefinitely.
- An explicit `exit 0` on its own line removes any dependence on operator
  precedence for the script's final status.
- `dotnet --version` at the end puts the installed version in the setup log, so
  the next failure is diagnosable from the log alone.

**If it fails again, expand the "Ran setup script" step in the failed session and
read the actual error.** Everything above is inference; that log is evidence.

### Unknown, and worth knowing

Two PPAs baked into the base image (`deadsnakes`, `ondrej/php`) 403 through the
proxy on every `apt-get update`:

```
Err:5 https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu noble InRelease
  Invalid response from proxy: HTTP/1.1 403 Forbidden
```

The allowlist carries `ppa.launchpad.net` and `launchpad.net`, but Launchpad
serves PPA content from **`ppa.launchpadcontent.net`**, which is neither — the
same host-vs-hostname gap as `builds.dotnet.microsoft.com`. It is harmless here:
apt reports them as warnings, still exits 0, and the Ubuntu archives it actually
needs are reachable. Recorded so the noise in the setup log is not mistaken for
the cause of a failure.

### How to tell whether it actually ran

A working `dotnet --version` proves nothing about the setup script, because the
SessionStart fallback produces exactly the same result. The two are
distinguishable from inside any session, because `apt` records the command line
it was invoked with — options included — in `/var/log/apt/history.log`:

```bash
grep -B1 -A1 'Commandline.*dotnet-sdk-10.0' /var/log/apt/history.log
```

- `apt-get -o DPkg::Lock::Timeout=60 install ...` → the **setup script** ran.
- `apt-get install ...` (no `-o`) → `scripts/install_dotnet.sh` ran, i.e. the
  setup-script field is not in effect and the fallback covered for it.
- **No 2026 entry at all** → the SDK came from the environment's cached
  snapshot, which is the fully-working steady state.

That `-o` flag was added as a hang guard, but it doubles as a fingerprint. Keep
it on the `install` line, not just `update`, so the distinction stays readable.

Corroborate with the clock. `/proc/uptime` gives the boot time; the setup script
runs to completion *before* the session starts, so a `history.log` entry that
begins fewer than ~30 seconds after boot cannot be the setup script — a cold run
of it measures 31.6s on its own.

**Measured 2026-08-09, session `dotnet-sdk-setup-bvtxkh`:** boot 23:15:30,
dotnet install `23:15:56 → 23:16:05`, command line recorded with no `-o` flag.
Both signals agree: the setup-script field was **not** in effect, and the
SessionStart fallback installed the SDK 26 seconds after boot. The session was
fully functional — `dotnet 10.0.110`, `fable 5.13.0` restored, `npm run build`
compiled 13 source files in 14.8s, `npm run check` 6/6 — so the fallback did its
job. The ~30s cold-start cost is the thing still being paid, and pasting the
script into the field is still what removes it.

The method was verified rather than assumed: installing an unrelated package
*with* the flag (`apt-get -o DPkg::Lock::Timeout=60 install -y tree`) and
reading it back out of `history.log` confirms apt preserves `-o` options
verbatim, so their absence on the dotnet entry is real evidence and not a
logging artifact.

## Why it belongs there and not in the repo

Claude Code's cloud-environments documentation draws the line explicitly:

> Use a setup script to provision the VM itself: toolchains and CLI tools that
> aren't pre-installed. Use a SessionStart hook for project setup that should
> run everywhere, cloud and local, like `npm install`.

The .NET SDK is a toolchain, and the docs name it directly: *"Toolchains outside
this list, such as the .NET SDK, aren't pre-installed even when their package
registries are on the default allowlist. Install them with a setup script."*

The practical reason is the environment cache. The setup script runs once, then
Anthropic snapshots the filesystem and reuses it. Pasting this in makes the
install **disappear from every subsequent session's startup**. Left to the
SessionStart hook fallback, it costs ~30 seconds on any session that lands on a
cold VM.

## Do not use the official installer

`dotnet-install.sh` is the documented route and it **does not work here**.
Measured:

| Host | Result |
| --- | --- |
| `dot.net` → redirects to the binary host | **403 CONNECT tunnel failed** |
| `builds.dotnet.microsoft.com` | **403 — gateway policy denial** |
| `dotnet.microsoft.com` | 200 — marketing site, no binaries |
| `archive.ubuntu.com` | 200 |
| `api.nuget.org` | 200 |

The default allowlist includes the bare `dotnet.microsoft.com` and `dot.net`
entries, but the host that actually serves the binaries is
`builds.dotnet.microsoft.com` — a different host, not covered, and denied. The
allowlist looks like it permits the official installer and doesn't.

Ubuntu's own archive carries the SDK, is reachable, and needs no third-party
repository.

## Why version 10, specifically

Not preference. Fable 5.x ships `tools/net10.0/` only — confirmed by unpacking
the real `.nupkg` for both 5.5.0 and 5.13.0, so this is a property of the whole
5.x line and not of one release. Under SDK 8 the tool install fails outright:

```
Microsoft.DotNet.ToolPackage.ToolConfigurationException:
Settings file 'DotnetToolSettings.xml' was not found in the package.
```

`dotnet-sdk-9.0` is not available in Ubuntu noble at all.

## The `apt-get update` is not optional

Without it, the install fails on a stale package index:

```
E: Failed to fetch http://security.ubuntu.com/.../dotnet-sdk-10.0_10.0.110-...deb  404  Not Found
```

That was the real first failure when this was worked out, not a hypothetical.

## What happens if you don't paste it

Nothing breaks. `scripts/install_dotnet.sh` runs from the SessionStart hook and
performs the same install as a fallback, and it is written to exit 0 even on
failure so it can never block a session. You just pay ~30 seconds on cold
sessions instead of zero, forever.

**That paragraph is about an ABSENT setup script, and it does not extend to a
FAILING one.** The distinction was implicit here and it is the difference
between a 30-second cost and no sessions at all:

- **Field empty** → no setup script runs → the container comes up → SessionStart
  fires → the fallback installs the SDK. This is the case above.
- **Field non-empty and exiting non-zero** → the worker reports
  `error_kind: init_script`, `"Setup script failed"`, `recoverable: false`, and
  **the container never comes up**. SessionStart never fires, so the fallback
  cannot run. It is not a slower session; it is no session.

The fallback covers a setup script that succeeds without installing. Nothing
covers one that fails.

---

## Reproduced on demand, 2026-08-26

The section above says the original `"Setup script failed"` was never
reproduced. It is now, three times in one afternoon, and the failure is
deterministic rather than intermittent.

```
07:11:22Z  scheduled     field-playground comparison refresh   died 07:11:27Z   5s
18:53:00Z  fire_trigger  same routine, forced by hand          died 18:53:05Z   5s
20:01:14Z  create_session, NO REPOS ATTACHED                   died 20:01:19Z   5s
```

Each one: `error_kind: "init_script"`, `error_type: "init_script"`,
`message: "Setup script failed"`, `recoverable: "false"`, `worker_epoch: 1`.

**The third sample is the one that matters.** It was created with no sources at
all, so it rules out every repository-side explanation in one shot: not the
routine's prompt, not any of the four repos, not `field-laboratory`'s or
`jubilant-bassoon`'s `SessionStart` hooks, not `jubilant-bassoon/.devcontainer`.
Nothing repo-shaped is in the path of a session with no repos.

Five seconds is also evidence. A cold run of the script in this file measures
**31.6s**. Whatever is in the field now is not timing out at 240s and is not
completing an apt install — it is exiting non-zero almost immediately.

### Why this was not noticed for days

The environment's snapshot cache. A session created before the field changed
keeps running on the container it already has: `session_017FXC1oRxRstzY2xGJBFu2k`
was created **2026-08-23** and has been working normally throughout, which is the
only reason any of this could be measured at all. Every session created since is
dead on arrival. The symptom a person sees is not "sessions are broken" — it is
"my daily routine stopped producing anything", which is what
`field-playground comparison refresh` had been reporting since 2026-08-25.

### The remedy, in order

1. Open the failed session at claude.ai/code and **expand the "Ran setup script"
   step**. That log is the evidence; everything else in this file is inference.
   No session can read it — `get_session` returns only `error_kind:
   "init_script"` and there is no events or logs tool — so if a human does not
   look, nobody ever will, which is how this reached its second occurrence
   undiagnosed. One click, and it is the only click that produces knowledge.
2. **Then clear the field, or replace it with the block at the top of this file
   verbatim.** Either ends the outage. See the trade below before choosing.
3. Confirm with a throwaway session. A container that comes up at all is the
   pass condition for this failure.
4. `dotnet --version` and the `history.log` fingerprint above then distinguish
   "the setup script ran" from "the fallback covered for it".

### Clearing the field is a legitimate answer, and an earlier draft of this
### section said it was not

That draft read: *"Do NOT clear the field to work around this."* It was written
before the two sides were put next to each other, and it conflates clearing the
field **instead of** reading the log with clearing it **after**. Only the first
is a mistake. The numbers:

| | benefit | cost when it breaks |
| --- | --- | --- |
| field populated | ~30s saved on a cold VM | **every new session, indefinitely** |
| field empty | none | none — `scripts/install_dotnet.sh` runs from SessionStart |

A mechanism whose entire upside is thirty seconds should never be able to cost
100% of new sessions. That is not a close call, and the ~30s is paid only on a
cold VM — the steady state is the environment's cached snapshot, where neither
path runs at all.

**This is not choosing a fallback over a fix.** The fix — `scripts/install_dotnet.sh`
and the `SessionStart` hook that calls it — is committed, in this repository,
under version control, and was measured working end to end on 2026-08-09
(`dotnet 10.0.110`, `fable 5.13.0` restored, `npm run build` 13 files in 14.8s,
`npm run check` 6/6). The setup-script field is the part that is *not* in the
repo, cannot be reviewed, cannot be tested before it runs, and takes the whole
environment down when it is wrong. Emptying it moves provisioning to the copy
that is version-controlled.

Populate the field again once its log has been read and the cause is known.


---

## DIAGNOSED 2026-10-09 — the field held a bare `npm install`

The remedy section above ends "Open the failed session and expand the 'Ran
setup script' step. That log is the evidence; everything above is inference."
A human did that on 2026-10-09 and pasted it:

```
Setup script failed with exit code 254.
Script output:
npm error code ENOENT
npm error syscall open
npm error path /home/user/package.json
npm error errno -2
npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/home/user/package.json'
npm error enoent This is related to npm not being able to find a file.
npm error enoent
npm error A complete log of this run can be found in: /root/.npm/_logs/2026-10-09T12_22_09_287Z-debug-0.log
```

That is the whole cause. The field ran `npm install` with working directory
`/home/user`, where there is no `package.json` and never will be.

### `npm install`, not `npm ci`, and the difference is decidable

Reproduced byte-identically in an empty directory — same eight lines, same
order, same wording, exit 254. `npm ci` is excluded two ways:

| command | empty dir | exit | leaves behind |
|---|---|---|---|
| `npm install` | the eight lines above | **254** | `package-lock.json` named after the cwd's basename |
| `npm ci` | `EUSAGE` + usage help | 1 | nothing |

### And the fossil is still on disk

```
$ cat /home/user/package-lock.json
{ "name": "user", "lockfileVersion": 3, "requires": true, "packages": {} }
$ stat -c 'born %w' /home/user/package-lock.json
born 2026-09-22 00:36:55.760264789 +0000
```

`"name": "user"` is `basename /home/user`. It is the lockfile `npm install`
writes in an empty directory, and it was written **26.6 ms** before
`environment_init_failed` on the only `session_mode: "new"` boot this
environment has logged.

### The mechanism, corrected

An earlier draft of this analysis said the setup script "runs before and outside
any repository checkout." **It does not.** The init script runs inside the same
`env_init` phase, after checkout. The failed boot's own event order:

```
00:36:02.452  env_init_started
00:36:54.312  sources_processing_completed   {"duration_ms":51855,"success_count":4}
00:36:55.760  ← /home/user/package-lock.json written   (1.448 s later)
00:36:55.787  environment_init_failed       {"session_mode":"new"}
00:36:55.787  end_task_run_failure
```

All four repositories were fully on disk when npm ran. So checkout ordering is
not the variable and never was — **the working directory is.** `npm` resolves a
`package.json` only by walking UP, and there is none at `/home/user`, `/home` or
`/`; the four repositories clone into subdirectories, each with its own. The
ENOENT is deterministic, which is why the deaths were deterministic.

That correction is not pedantry. It is what mis-sized the `timeout` above.

### Sixty-one days, and this file already knew

`docs/CC-CMD-2026-08-09-fix-cloud-setup-and-scaffold-fable.md` records the same
eight lines and the same exit code on **2026-08-09**, and names the cause
exactly: *"If that field still contains a bare `npm install`, it will keep
failing sessions until a human edits it there directly."* It did, and it kept
failing, for 61 days. The 2026-08-26 section above reads as a new mystery; it
was a recurrence of a diagnosed one.

### The most likely source of the pasted text

`jubilant-bassoon/.devcontainer/devcontainer.json` carries
`"postCreateCommand": "npm install && npm install -g wrangler@3.109.0"`. It is
the only artifact across the four repositories that matches the pasted log on
**both** output and exit code: a bare `npm install`, unguarded, with `&&`
short-circuiting so 254 propagates. `scripts/install_pkgs.sh` can produce the
same eight lines — its `npm install` has no `cd` and the primary working
directory is `/home/user` — but not the exit code, because every step is
guarded with `|| true` and it ends `exit 0`.

### What is checked now

`scripts/setup-script-check.mjs` parses the block at the top of this file and
refuses it for naming npm, yarn or pnpm, for naming a repository path, for
declaring no timeout or one above 120 s, or for not ending in a bare `exit 0`.
The field cannot be read or written from a session; the text a human is told to
copy can be, and that is the part that was wrong.
