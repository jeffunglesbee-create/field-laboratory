# CC-CMD-2026-08-22-i-have-adhd-skill

**Filed from:** field-laboratory
**Ask to:** field-relay-nba **and** jubilant-bassoon — the same independent change
in each repo, not a paired cross-repo change
**Status:** open — filed because this session cannot write to those repos'
`.claude/skills/` directory; field-laboratory and field-playground already carry
the skill.

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
source, not reconstructed**.

**Automated path (one command, self-verifying).** field-laboratory ships a
portable installer that fetches the source, writes the file, and reads it back to
confirm the on-disk copy is byte-identical — refusing to install anything that
fails the skill front-matter invariant. It writes relative to the current
directory and has no repo-specific paths, so it installs correctly when run from
any repo root, including straight from its raw URL with no copy step. From each
target repo's root:

```bash
curl -sS https://raw.githubusercontent.com/jeffunglesbee-create/field-laboratory/main/scripts/install-adhd-skill.mjs | node -
```

It is idempotent (a no-op when the copy already matches) and needs Node 22+.

**To keep it verbatim, not just install it once,** copy that script into the repo
and wire its `--check` mode into an existing scheduled workflow — no new CI. That
is what field-laboratory does: `check:adhd-skill` runs
`install-adhd-skill.mjs --self-test && install-adhd-skill.mjs --check` on every
drift-sentinel run, and `--check` re-verifies the byte match (warning, not
failing, if the source CDN is briefly unreachable).

**Manual fallback,** if Node is not available:

```bash
mkdir -p .claude/skills/i-have-adhd
curl -sS https://raw.githubusercontent.com/ayghri/i-have-adhd/main/skills/i-have-adhd/SKILL.md \
  -o .claude/skills/i-have-adhd/SKILL.md
```

Source of truth: `skills/i-have-adhd/SKILL.md` on `ayghri/i-have-adhd@main`. As
fetched 2026-08-22 it is **6813 bytes, 140 lines**, front-matter
`name: i-have-adhd`, `disable-model-invocation: true`, `license: MIT`. It is a
single file — no `references/`, scripts, or assets (probed and 404). Do not
retype it; download it, so "verbatim" is a `diff`, not a transcription.

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

## The automation that does and does not exist

**Does:** in field-laboratory, `check:adhd-skill` verifies the byte match on every
drift-sentinel run, so this repo's copy cannot silently drift from source. Any
sibling that copies the installer gets the same guard for free in its own
sentinel — that is the "keep it verbatim" half of the ask.

**Does not:** `scripts/cc-cmd-followup.mjs` probes the relay's HTTP routes for the
observable consequence of an ask, and a skill file in another repo's working tree
is not visible on any relay route. The cross-repo install cannot be driven from
here without write access to those repos — which this session does not have, and
which is why this is a CC-CMD rather than a commit. The automation stops exactly
at the access boundary: one self-verifying command for whoever runs it there, and
a drift guard that travels with the script.
