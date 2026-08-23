# CC-CMD-2026-08-22-i-have-adhd-skill

**Filed from:** field-laboratory
**Ask to:** field-relay-nba **and** jubilant-bassoon — the same independent change
in each repo, not a paired cross-repo change
**Status:** DONE, verified 2026-08-23. `.claude/skills/i-have-adhd/SKILL.md` is
installed in all four repos at 6813 bytes, byte-identical; `npm run check:adhd-skill`
passes 4/4 including its negative case ("it rejects a different skill wearing
valid-looking front-matter").
(`.github/workflows/adhd-skill-sync.yml`); it is one repository secret away from
running with no manual command. field-laboratory and field-playground already
carry the skill.

One-liner:
```
The i-have-adhd response-style rules are adopted in CLAUDE.md but not installed
as an invocable skill in field-relay-nba or jubilant-bassoon. Add
.claude/skills/i-have-adhd/SKILL.md, byte-verbatim from the published source, so
/i-have-adhd works in those repos the way it now does in field-laboratory and
field-playground.
```

---

## Probe block — run first, from HEAD (Rule 87)

```bash
git log --oneline -5

# Is the skill already present, and does it match the source byte-for-byte?
DEST=.claude/skills/i-have-adhd/SKILL.md
SRC=https://raw.githubusercontent.com/ayghri/i-have-adhd/main/skills/i-have-adhd/SKILL.md
if [ -f "$DEST" ]; then curl -sS "$SRC" | diff - "$DEST" && echo "IDENTICAL"; else echo "absent"; fi
```

## Why now

CLAUDE.md in each repo adopted the `i-have-adhd` (ayghri) rules as response style
on 2026-08-17. "Adopted in CLAUDE.md" and "installed as a skill" are different
states: the skill is invocable with `/i-have-adhd`, carries
`disable-model-invocation: true`, and stays off until called. field-playground
shipped it verbatim; field-laboratory added it on 2026-08-22
(`.claude/skills/i-have-adhd/SKILL.md`, byte-identical to source). These two
repos lag only because this session's write-allowlist does not cover
`.claude/skills/` in them — the same restriction that keeps it out of
`.github/workflows/`.

## The ask

Add `.claude/skills/i-have-adhd/SKILL.md` to each repo, **byte-verbatim from the
source, not reconstructed**. There is now no manual step for the maintainer of
these repos — the install runs on a runner.

**Automated path (a runner installs it — nothing to run by hand).**
field-laboratory ships `.github/workflows/adhd-skill-sync.yml`, dispatch-only,
which installs the skill into both target repos through the GitHub Contents API
and commits only when the file is absent or has drifted. The runner cannot
self-provision a credential for another repo, so the one setup step is a
repository secret on field-laboratory:

1. Add secret `SIBLING_REPO_TOKEN` — a token with `contents:write` on
   field-relay-nba and jubilant-bassoon.
2. Run the **adhd-skill-sync** workflow (dry-run first; it reports what it would
   do). Re-run with dry-run off to install.

It is idempotent — a second run reports `skip … already byte-identical`.

**Per-repo alternative (one self-verifying command),** if you would rather run it
in the repo than from a runner. From the target repo's root:

```bash
curl -sS https://raw.githubusercontent.com/jeffunglesbee-create/field-laboratory/main/scripts/install-adhd-skill.mjs | node -
```

Same installer the runner path is built on: fetch, write, read back, confirm
byte-identical, refuse malformed front-matter. Node 22+.

**To keep it verbatim, not just install it once,** copy `install-adhd-skill.mjs`
into the repo and wire its `--check` mode into an existing scheduled workflow — no
new CI. field-laboratory does this: `check:adhd-skill` re-verifies the byte match
on every drift-sentinel run (warning, not failing, if the source CDN is briefly
unreachable).

Source of truth: `skills/i-have-adhd/SKILL.md` on `ayghri/i-have-adhd@main`. As
fetched 2026-08-22 it is **6813 bytes, 140 lines**, front-matter
`name: i-have-adhd`, `disable-model-invocation: true`, `license: MIT`. It is a
single file — no `references/`, scripts, or assets (probed and 404). Do not
retype it; the tooling downloads it, so "verbatim" is a `diff`, not a
transcription.

## Artifact

Per repo, enumerable, not a judgement:

1. `.claude/skills/i-have-adhd/SKILL.md` exists.
2. It is byte-identical to the source — `curl -sS "$SRC" | diff - "$DEST"` is
   empty (exit 0).
3. Front-matter `disable-model-invocation: true` is present, so the skill is
   installed-but-off until `/i-have-adhd` is invoked.

## Scope boundary

- **Verbatim, not reconstructed.** The value is that all four repos run the same
  rules; a hand-edited copy defeats that. If the source updates, re-`diff` and
  re-pull rather than editing in place.
- **`disable-model-invocation: true` stays true.** This installs the skill; it
  does not turn it on. Adopting it as always-on response style is the CLAUDE.md
  change already made, separate from this.
- **Not the global install.** `~/.claude/skills/` is the user's own machine,
  outside every repo and every session — `npx -y skills add ayghri/i-have-adhd
  --agent claude-code -g`. Recorded so "install it everywhere" is not read as
  including that; it is the user's to run.
- **No CI cost.** `SKILL.md` is a `.md` file; both repos' `verify` path ignores
  `**/*.md`, so this deploys nothing and gates nothing.

## The automation, and its one irreducible manual step

**Install:** `adhd-skill-sync.yml` installs the skill into both target repos from
a runner — no command run by hand. **Verify-forever (this repo):**
`check:adhd-skill` re-checks the byte match on every drift-sentinel run, so
field-laboratory's copy cannot silently drift; a sibling that copies the
installer gets the same guard in its own sentinel.

The single thing a runner cannot do for itself is mint a credential for another
repo — the built-in `GITHUB_TOKEN` is scoped to its own repo. So one manual step
remains: add the `SIBLING_REPO_TOKEN` secret once. That is the true access
boundary, and it is a secret to paste, not a command to run. After it, the
install is a button, re-runnable and idempotent.

Not wired into `scripts/cc-cmd-followup.mjs`: that probes the relay's HTTP routes,
and a skill file in another repo's tree is on no relay route. The sync workflow's
own dry-run is the observable check for this ask instead.
