# cc-session-2026-08-09-fix-cloud-setup-and-scaffold-fable

**CC-CMD:** `docs/CC-CMD-2026-08-09-fix-cloud-setup-and-scaffold-fable.md`
**Repo:** field-laboratory · **Branch:** main (per the CC-CMD header)
**Confidence:** 96 — every claim below is a real, executed check, not an
inference from files existing.

---

## Read this first: the setup-script field is still broken

The cloud environment's own **setup-script field has not been touched and
cannot be touched from this session.** It lives in the environment settings
dialog at claude.ai/code, which has no API and no file in this repo. If that
field still contains a bare `npm install`, it will keep failing sessions with
`exit code 254` regardless of everything shipped here. **A human has to edit
that dialog directly.**

What this CC-CMD shipped removes the *second* half of the failure — there is
now genuinely something for `npm install` to install — and moves project setup
onto the documented mechanism. It does not and cannot clear the first half.

There is also a **concrete recommendation for what that field should contain**,
which is new information from this session — see "The .NET question" below.

---

## Task 1 — Re-verified from HEAD

- Repo confirmed genuinely empty of project scaffolding before writing:
  `README.md`, `docs/mcp-access-confirmed.md`, and the CC-CMD itself. Nothing
  was overwritten; Task 2 was purely additive.
- `code.claude.com/docs/en/cloud-environments.md` re-fetched fresh this
  session rather than reconstructed from memory. The guidance the CC-CMD
  quotes is still current, verbatim: *"Use a setup script to provision the VM
  itself: toolchains and CLI tools that aren't pre-installed. Use a
  SessionStart hook for project setup that should run everywhere, cloud and
  local, like `npm install`."*
- Documented ordering confirmed, which is what makes this a genuinely
  different mechanism and not a second copy of the same failure: (1) the setup
  script runs first, before Claude Code launches, and only when no cached
  environment exists; (2) Claude Code launches, *then* runs SessionStart
  hooks. The hook cannot fail a session before Claude Code exists, because it
  does not run until after Claude Code is already up.

## Task 2 — Real Fable scaffold, and one deliberate deviation

Shipped: `package.json`, `src/Laboratory.fsproj`, `src/Program.fs`,
`scripts/build.sh`, `.gitignore`.

### The deviation, stated plainly

The CC-CMD asked for **`fable-compiler` as a dev dependency**, and in the same
sentence asked to *confirm the real, current package name and version from npm
directly rather than guessing one*. That confirmation is what produced the
deviation, so it is being followed, not overridden:

```
npm view fable-compiler version time.modified
  version = '2.13.0'
  time.modified = '2022-06-17'      # published 2020, Fable 2 era
```

**`fable-compiler` on npm is dead.** It is six years stale and is not current
Fable. Modern Fable (5.x) ships primarily as a .NET tool. The one genuinely
current npm distribution is:

```
@fable-org/fable-compiler-js  2.11.0   published 2026-07-24   bin: fable
```

That is what this scaffold uses. Same maintainers as the Fable project, actively
published three weeks ago, exposes the `fable` binary the CC-CMD's build script
expects.

### Real proof the build works

Not "the files exist and look plausible" — actually executed, from a clean
`rm -rf node_modules build package-lock.json`:

```
$ npm install
added 8 packages in 996ms                          exit 0

$ npm run build
fable-compiler-js v2.11.0
Project: src/Laboratory.fsproj, FCS time: 2147 ms
File: /home/user/field-laboratory/src/Program.fs, Fable time: 107 ms
build.sh: OK — build/Program.js produced.          exit 0

$ node build/Program.js
FIELD Laboratory: Fable toolchain live
```

Real F# went in, real JavaScript came out, and the JavaScript really ran.

### A real defect found in the compiler, and handled

`@fable-org/fable-compiler-js` **exits 0 even when compilation fails.** Found
empirically, not suspected: a project referencing an unresolvable NuGet package
printed `ERROR: Cannot find package ...`, emitted no JavaScript, and still
returned exit code 0.

A bare `"build": "fable ..."` script would therefore report **success on a
broken build** — silently green CI over a build that produced nothing. So the
build script is a thin wrapper (`scripts/build.sh`) that fails on Fable's error
output and on missing output. Negative test, executed:

```
# Program.fs deliberately broken with an undefined value
$ npm run build
src/Program.fs (2,8): Error: The value or constructor 'thisDoesNotExist' is not defined.
build.sh: Fable reported errors (see output above).
NEGATIVE TEST exit code: 1        # ← correctly fails
```

Then restored and rebuilt clean at exit 0. The guard is load-bearing, not
decorative.

### solid-js — verified as real convention, not assumed

The CC-CMD asked to re-verify `solid-js` rather than carry it over from the
original prompt. Checked against the FIELD codex directly, and it holds:
`rule-solid-js-island-rubric` and its blast-radius addendum are real, dated
project rules governing where Solid is used (islands mounted into vanilla
sections, never a framework migration). `solid-js@^1.9.14` is declared as a
real dependency.

**Being precise about what that does and does not mean today:** it is a
declared JS dependency. The F# side is *not* wired to Solid, and cannot be yet
— see below.

## Task 3 — SessionStart hook, on the documented pattern

`.claude/settings.json` and `scripts/install_pkgs.sh`, following Anthropic's own
current example directly (re-read this session, matcher `startup|resume`,
`bash "$CLAUDE_PROJECT_DIR"/scripts/install_pkgs.sh`).

Executed checks on the hook script:

| Check | Result |
| --- | --- |
| `CLAUDE_CODE_REMOTE` unset (local machine) | exits 0 immediately, installs nothing |
| `CLAUDE_CODE_REMOTE=true` (cloud) | runs `npm install`, exits 0 |
| `npm` forced to fail (exit 7) | script still **exits 0** — degrades safely |
| `.claude/settings.json` | parses as valid JSON |

That third row is the point. The original setup script hard-failed the whole
session on a bad install; this one cannot, by construction (`npm install ||
true`, explicit `exit 0`).

**On "anything Fable itself needs to bootstrap":** the CC-CMD was right to
insist this be confirmed rather than assumed. Confirmed answer — **`npm install`
alone is genuinely sufficient here.** There is no `dotnet tool restore` and no
`dotnet restore` step, because with the JS-hosted compiler there is no .NET SDK
dependency at all: `@fable-org/fable-metadata` bundles the reference assemblies
(FSharp.Core, Fable.Core, Browser.*, core BCL). Proven by the fact that the
build above succeeded on a machine where `dotnet` is *not installed at all*
(`dotnet: command not found`).

## Task 4 — The .NET question, which is the real finding for Jeff

This is new, it was not anticipated by the CC-CMD, and it directly shapes what
that unfixed setup-script field should eventually contain.

Anthropic's docs state explicitly: *"Toolchains outside this list, **such as
the .NET SDK**, aren't pre-installed even when their package registries are on
the default allowlist. Install them with a setup script."* Confirmed on this
VM — `dotnet` is absent.

The scaffold sidesteps that entirely, which is why it builds today. But the
sidestep has a hard, measured boundary:

```
# PackageReference to Fable.Core (bundled in fable-metadata)
→ compiles fine, no .NET SDK needed

# PackageReference to Thoth.Json (not bundled)
→ ERROR: Cannot find package /root/.nuget/packages/thoth.json/10.2.0
→ no output produced
```

**Any NuGet package outside the bundled set requires a real `dotnet restore`,
which requires the .NET SDK.** That matters immediately for the work queued
next: both libraries named in the F#/Fable design conversation — **Thoth.Json**
(runtime decoding) and **Fable.Solid** (the F# bindings that would connect
`solid-js` to F# at all) — are NuGet packages outside the bundled set. The
desk/scoreboard build will hit this wall the first time it reaches for either.

**So the recommendation for the setup-script field is not "empty it".** It is:
replace `npm install` (wrong mechanism, now handled by the hook) with the .NET
SDK install (right mechanism, genuinely needed soon, and exactly what the docs
say setup scripts are for). Still a human edit at claude.ai/code — this session
has no way to make it.

---

## What shipped

```
.claude/settings.json          SessionStart hook (startup|resume)
scripts/install_pkgs.sh        cloud-scoped project setup, degrades safely
scripts/build.sh               Fable build + real failure detection
package.json                   @fable-org/fable-compiler-js 2.11.0, solid-js 1.9.14
src/Laboratory.fsproj          minimal, order-sensitive Compile list
src/Program.fs                 trivial entry point — scaffold scope only
.gitignore                     node_modules, build, bin, obj
```

Held to scope: **the desk/scoreboard feature itself was not built**, per the
CC-CMD's explicit exclusion. Nothing beyond the minimum needed to prove
`npm install` and a real build succeed was invented.

## Open items requiring a human

1. **Edit the environment setup-script field at claude.ai/code** — still
   unfixed, still capable of failing every session. Suggested contents: .NET
   SDK install, not `npm install`.
2. **Decide the .NET SDK question before desk/scoreboard starts.** Staying on
   the JS-hosted compiler means no Thoth.Json and no Fable.Solid — which means
   no F# binding to `solid-js`, and none of the runtime-decoding safety that
   motivated choosing F# in the first place.
