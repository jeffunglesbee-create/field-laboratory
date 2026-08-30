# scrollcraft installed as a third-party skill

**Date:** 2026-08-29
**Source:** `nateherkai/scroll-craft`, plugin `nateherk-design`, skill
`scrollcraft` v0.2.0, MIT.
**Installed to:** `.claude/skills/scrollcraft/` — 22 files, 400K.

## What it is

A Claude Code plugin-marketplace repo, not a bare skill. Its
`.claude-plugin/marketplace.json` publishes one plugin (`nateherk-design`)
carrying one skill. The skill builds scroll-driven landing pages: scroll as the
timeline, video scrubbed frame by frame, sections that pin, and — the part that
matters for this repo's habits — a verification step that screenshots the page
and checks its own contrast, motion and accessibility.

It is installed the way `i-have-adhd` and `unslop-ui` already are: the skill
directory copied into `.claude/skills/`, not via `/plugin marketplace add`,
which is an interactive CLI command a session cannot run. Whole directory, not a
subset — a partial install of a skill that reads its own `references/` drifts
silently.

## Diligence before adding third-party code to this repo

Read rather than assumed, on the cloned source:

| | |
|---|---|
| outbound hosts | `api.kie.ai/api/v1/jobs` and `kieai.redpandaai.co/api` — the asset-generation provider the skill documents, and nothing else |
| credentials read | `KIE_AI_API_KEY` only, opt-in and absent here |
| other env | `SCROLLCRAFT_CHROME`, `SCROLLCRAFT_FFMPEG`, `SCROLLCRAFT_HOME`, `HOME`, `USERPROFILE` — tool paths |
| shell-outs | `execFileSync` in `doctor.mjs`, `spawnSync` on ffmpeg in `shoot.mjs`. No `rm -rf`, no piped `curl` |

```
grep -ohE "https?://[a-zA-Z0-9./_-]+" scripts/*.mjs scripts/*.sh engine/*.js
grep -ohE "process\.env\.[A-Z_]+" scripts/*.mjs engine/*.js
grep -nE "execFileSync|spawn|exec\(|rm -rf|curl |child_process" scripts/*.mjs
```

Nothing surprising, and nothing that contradicts its own description.

## No interaction with this repo's gates

`check:script-orphans` walks `scripts/` at the repo root; this skill's scripts
live under `.claude/skills/scrollcraft/scripts/` and are outside that walk. No
ledger entry is needed and none was added — a skill's own tooling is not a repo
script that a workflow depends on.

`staged-outbox-check.mjs:30` scopes source to `^(src/|scripts/)`, so `.claude/`
does not require this entry. It is here anyway: adding 22 files of third-party
code to the tree is exactly the kind of change a later session should be able to
find a record of.

## No key is installed

The upstream repo ships a `.env.example` naming `KIE_AI_API_KEY`. It was not
copied and no key was set. Asset generation through kie.ai will not work until
someone provides one; every other part of the skill does not need it.
