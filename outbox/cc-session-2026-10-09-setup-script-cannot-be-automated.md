# 2026-10-09 — the setup script cannot be automated, and it is not empty

**Asked:** "automate this setup script if possible"
**Answer:** not possible from here — and the action is to **clear** the field, not
populate it. I had advised the opposite, twice.
**Credits spent at any vendor:** 0

---

## The finding that matters: there is a live outage

`docs/SETUP-SCRIPT.md` records three sessions dying on 2026-08-26 with
`error_kind: "init_script"`, `recoverable: "false"`, and says the field should be
cleared until its log has been read. An outbox entry from 2026-08-27 reads
"still unpasted". **Both readings are wrong about the present**, and I verified
the correction first-hand rather than taking an agent's word for it:

```
get_session session_01XDamZhBsymwPyQJ5FBdTWt
  created_at      2026-09-22T15:22:58Z        origin: ios
  environment_id  env_01Vs994fYs6XDBw5fQfVJauH    ← the only environment
  last_init_error at 2026-09-22T15:23:49Z
                  error_kind "init_script"  message "Setup script failed"
                  recoverable "false"       worker_epoch "1"
```

Dead 51 seconds after creation. **An empty field cannot produce "Setup script
failed."** So the field was populated and fatally failing on 2026-09-22 — four
weeks after the outage the doc describes, which means it was never cleared.

And the cost is already being paid, by name:

```
get_trigger trig_01F5beAeTgNKG9v9a4s6Sxus
  name       "field-playground comparison refresh — PAUSED until the env
              setup script is cleared"
  enabled    false            cron  0 7 * * *     creator  Jeff
  updated_at 2026-08-27T18:44:33Z
  last_run   FAILED / RUN_ERRORED at 2026-08-27T07:09:59Z
```

A daily routine, paused **43 days**, with the blocker written into its own
title. Every new session in this environment dies at init; this one survives
only because it resumes.

## Why I was wrong, twice

I told the owner to paste `scripts/install_pkgs.sh` into that field, on two
consecutive turns. Wrong on both axes:

- **Wrong direction.** The field is not empty and needs clearing. The doc's own
  cost table: populated buys ~30 seconds on a cold VM and risks "every new
  session, indefinitely"; empty buys nothing and risks nothing, because
  `scripts/install_dotnet.sh` covers from `SessionStart`. Recommending a paste
  while the field is already fatally failing adds a second unknown to an
  unresolved one.
- **Wrong content.** The doc quotes the guidance that draws the line: a setup
  script provisions the VM — toolchains; a `SessionStart` hook does project
  setup, "like `npm install`". `install_pkgs.sh` runs `dotnet tool restore`,
  `npm install` and `git config core.hooksPath`. All three are project setup,
  and they are already in the hook where they belong.

## Can it be automated? No — and the barrier is authentication, not absence

Four probes, each adversarially re-measured by a second agent told to default to
*refuted* if it could not reproduce the evidence. Two of the four were refuted;
the correction to one of them is the outage above.

**NOT-WRITABLE-FROM-HERE.** The strongest refutation candidate is the one
component that genuinely carries the field: `/opt/env-runner/environment-manager`,
the session's own provisioner, whose binary contains the literal strings
`task_setup_script` and `init_script`. It refutes nothing, because the direction
is inbound — `environment-manager task-run --help` says the payload arrives
"via stdin" as `{startup_context, environment, auth}` from the API. The container
is *handed* the setup script. Talking back needs `ENVIRONMENT_SERVICE_KEY`, which
is unset, as are `ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN`.

Corroborating, from the tool surface:

| probe | result |
|---|---|
| ~8 ToolSearch keyword sets for environment writes | zero tools |
| `list_environments` response | six fields, **no provisioning key at all** |
| `create_session` schema | fourteen parameters, no setup-script field |
| `read_documentation` (`environment.setup_script`) | routes the fix to the human; its `actions: ["edit_environment"]` is a settings-page card, not a callable tool |
| `claude --help` | `--cloud`, `--environment` both *select*; neither configures |

Stated exactly: **not writable from inside this container.** An undocumented
write endpoint was not probed — I forbade write requests to undocumented
endpoints — so this is not proof that none exists.

## My apt fingerprint could not have answered the question, and I thought it had

I read `/var/log/apt/history.log`, found the dotnet install carrying no
`-o DPkg::Lock::Timeout=60`, and concluded the field "is not in effect". The
conclusion is right; the reasoning was weaker than I presented it.

The first-party evidence is better and says something I had not asked:

```
/tmp/environment-manager-2615089446.diag.log
{"data":{"session_mode":"resume"},"event":"init_script_skipped",
 "source":"env_manager","timestamp":"2026-10-09T03:59:33.555Z"}
```

6.2 seconds after boot, 0.2s before `claude_code_start`. 56 such events since
2026-09-22, every one `session_mode: "resume"` — matching `task-run --help`'s
`'resume' (skip git clone and setup scripts)`.

**So on a resume the skip fires before the field's contents are ever consulted.**
An empty field and a populated-failing field emit byte-identical diagnostics on
every run this container has recorded. My fingerprint answered "did the setup
script install dotnet here" — it could never have answered "is the field
empty", and I reported the second as though it followed from the first. What
settled it was a dead session in another container, not this one.

## What I automated instead

The field's whole upside is ~30 seconds. What actually cost something was that
an un-bootstrapped session was **indistinguishable from a bootstrapped one** —
nothing in the repo asserted the bootstrap had run, so twelve commits shipped
source with no outbox entry and a CI gate found out four days later.

### `scripts/session-ready-check.mjs`

Three facts, separately, because they are three failures with three remedies:

```
  guard  (core.hooksPath) : installed | unset | elsewhere
  dotnet (SDK 10)         : present   | absent | wrong-major
  deps   (node_modules)   : present   | absent | empty
```

Only `guard` fails the check — it is the correctness one; the other two are
convenience and are reported. `unset` and `elsewhere` are kept apart because a
`core.hooksPath` aimed elsewhere is a deliberate override, not a missing
bootstrap; `absent` and `empty` node_modules likewise.

Wired as **`prebuild`**, so it fires on the first `npm run build` of a session
rather than only when someone names it, plus `npm run check:session`.

On a runner it reports instead of asserting, and that is not a loosened rule:
a GitHub Actions checkout has no `core.hooksPath` by design, and the runner-side
equivalent is the explicit `staged-outbox-check.mjs` step that three committing
workflows already run. A verify step exercises that branch, which is otherwise
never taken.

Mutated, not just passed — the exact 2026-10-09 state, reproduced on purpose:

```
$ git config --unset core.hooksPath
  guard  (core.hooksPath) : unset
FAIL  the outbox guard is installed in git (core.hooksPath -> .githooks)
      → ... Twelve such commits shipped on 2026-10-08/09 from exactly this
        state. Fix: bash scripts/install_pkgs.sh
rc=1
```

Then restored. 7 self-tests, one of which *is* that state as a fixture.

### And the orphan checker was blind to npm lifecycle scripts

Adding the `prebuild` immediately made `check:script-orphans` call
`session-ready-check.mjs` unreachable — while `npm run build` was printing its
output two lines above. npm runs `prebuild` before `build` with nothing naming
it, so a walk that follows only named invocations cannot see it.

The walk is now an exported `reachableFiles(scripts, roots)` that follows
`pre<name>` and `post<name>`, which also made it self-testable: it had been
inline and therefore unprovable. 14 self-tests, up from 7, including that a
self-referential `prebuild` terminates. The pre-commit hook's own `npm run`
names became roots of the same single walk rather than a second post-hoc pass.

That is this file's own documented failure mode — a detector whose name and
measurement disagree — for the fifth recorded time, and it was found by using
it rather than by reading it.

## The irreducible residual, stated plainly

`git commit` is not an npm script, and no npm lifecycle event precedes it. Git
consults only `.git/hooks/` and `core.hooksPath`, neither of which is trackable.
**So no repo-side mechanism can install the outbox guard before a session's
first commit** — which is exactly the step whose absence produced the twelve
violations. Two deliveries now exist (the git hook, and the PreToolUse hook
shipped earlier today), both dependent on something firing first; this probe
makes the un-bootstrapped state *say so* rather than closing the gap.

## What is left for a human, and it is one click plus one field

1. Open a failed session at claude.ai/code and expand **"Ran setup script"**.
   That log is the only evidence; everything above is inference from outside it,
   and no session can read it.
2. **Clear the field** (environment menu in the title bar → Edit → Setup
   script). That ends the outage; `scripts/install_dotnet.sh` covers the install
   from `SessionStart` at a cost of ~30 seconds on a cold VM.
3. Re-enable `trig_01F5beAeTgNKG9v9a4s6Sxus`, whose title already says this is
   what it was waiting for.
