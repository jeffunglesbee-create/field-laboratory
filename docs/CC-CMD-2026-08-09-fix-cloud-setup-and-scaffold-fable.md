# CC-CMD-2026-08-09-fix-cloud-setup-and-scaffold-fable

**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR
**Status:** **BUILT.** Verified 2026-08-27 against repo state, not against this
document's prose (Rule 72). `src/Laboratory.fsproj` and 20+ `src/*.fs` exist and
compile — `npm run check:proof` runs the real F# compiler, and `verify` is green.
Session doc: `outbox/cc-session-2026-08-09-fix-cloud-setup-and-scaffold-fable.md`.

**Residual, for a human, unchanged since filing.** The cloud environment's **setup-script field is still unpasted** — a human step at
claude.ai/code that no session has tool access to, and explicitly out of scope in
the original ask. Every cold session pays ~30s installing the .NET SDK through the
fallback SessionStart hook. Speed cost only; nothing is broken without it.

One-liner:
```
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull. Read docs/CC-CMD-2026-08-09-fix-cloud-setup-and-scaffold-fable.md. Execute all tasks.
Do not commit unless confidence >= 95. If score < 95, report verbatim and stop.
```

---

## The real failure, and what this fixes vs. doesn't

A real cloud session failed with `Setup script failed with exit code 254`
— `npm error code ENOENT ... path /home/user/package.json`. Two real,
separate things are stacked here, confirmed directly against
Anthropic's own current Claude Code documentation
(`code.claude.com/docs/en/cloud-environments.md`), not assumed:

1. **Wrong mechanism.** The docs are explicit: *"Use a setup script to
   provision the VM itself: toolchains and CLI tools that aren't
   pre-installed. Use a SessionStart hook for project setup that
   should run everywhere, cloud and local, like `npm install`."*
   Project install belongs in a SessionStart hook, not the
   environment's own setup-script field.
2. **Nothing to install.** `field-laboratory` currently has only a
   README — no `package.json` exists at all, so `npm install` was
   always going to fail here regardless of which mechanism ran it.

This CC-CMD fixes #2 directly (a real, minimal, genuine Fable
scaffold) and fixes #1 the documented way (a repo-committed
SessionStart hook, using Anthropic's own example pattern). **It does
NOT and cannot fix the cloud environment's own setup-script field** —
that lives in the environment settings dialog at claude.ai/code,
which has no API and no file this session can write to. If that field
still contains a bare `npm install`, it will keep failing sessions
until a human edits it there directly, regardless of what this
CC-CMD ships. State this plainly in the outbox rather than implying
it's handled.

## Task 1 — Re-verify from HEAD before writing anything (Rule 87)

- Confirm the repo is still genuinely empty of any project scaffolding
  beyond the README before assuming Task 2 is additive, not
  overwriting real work.
- Re-fetch `code.claude.com/docs/en/cloud-environments.md` fresh if
  meaningful time has passed since this doc was written — Claude Code
  documentation is actively maintained and could have changed.

## Task 2 — Scaffold real, minimal Fable project structure

Not the desk/scoreboard feature itself — that's explicitly the next
session's own work, per the original prompt that started this. Only
enough for `npm install` and a real Fable build to genuinely succeed:

- `package.json` — real `fable-compiler` as a dev dependency (confirm
  the real, current package name and a real, current version from npm
  directly rather than guessing one), a `build` script that runs
  `fable`, and `solid-js` as a dependency (matching this project's
  existing frontend convention across its other repos — re-verify
  that's still the real intended target here rather than assumed from
  the original prompt's "start with building desk/scoreboard" alone).
- A minimal `.fsproj` file listing one real, trivial `.fs` source file
  in build order (F# project files are order-sensitive — confirm the
  real, correct minimal shape rather than guessing XML structure).
- One minimal, real `Program.fs` — enough to compile and produce real
  JS output via Fable, not a full application. A "hello world"-level
  entry point is correct scope here; the desk/scoreboard build itself
  is out of scope.
- Verify for real: `npm install` genuinely succeeds, and a real Fable
  build genuinely produces JS output — not just that the files exist
  and look plausible.

## Task 3 — Move project setup into a real SessionStart hook

Using Anthropic's own documented example pattern directly (re-read it
fresh rather than reconstruct from memory):

- `.claude/settings.json` with a `SessionStart` hook matching `startup|
  resume`, running a script from the repo.
- `scripts/install_pkgs.sh` — checks `CLAUDE_CODE_REMOTE == "true"`
  first and exits immediately if not (so local sessions are
  untouched), then runs the real, correct install command(s) for
  Task 2's actual scaffold (`npm install`, and anything Fable itself
  needs to bootstrap — confirm the real, current bootstrap step
  rather than assuming `npm install` alone is sufficient for a Fable
  project).
- Verify this is genuinely a different mechanism from the environment
  setup script, not a second copy of the same failure — confirm this
  hook does not run before Claude Code launches (it shouldn't,
  per the documented ordering), and confirm it degrades safely
  (real `|| true` or equivalent) rather than hard-failing a session
  the same way the original setup script did.

## Task 4 — Real verification

- Confirm Task 2's build genuinely works via a real, direct check
  (actual Fable output produced), not inferred from the files being
  present.
- State plainly, in the outbox, that the cloud environment's own
  setup-script field has NOT been touched and cannot be touched by
  this CC-CMD — a real, explicit note for Jeff, not an implied
  assumption that this is fully resolved.

---

## Explicitly NOT in scope

- Do not build the desk/scoreboard feature itself.
- Do not attempt to edit the cloud environment's setup-script
  configuration — no tool access exists for this from a CC-CMD
  session; it requires a human editing the dialog at claude.ai/code
  directly.
- Do not invent a Fable/F# project structure beyond the real minimum
  needed to prove `npm install` and a build succeed.

---

## Outbox

`outbox/cc-session-2026-08-09-fix-cloud-setup-and-scaffold-fable.md`:
the real scaffold shipped, real proof the build works, the real
SessionStart hook committed, and an explicit, undiluted statement that
the cloud environment's own setup-script field is still unfixed and
requires direct human action.
