# CC session — pinning the i-have-adhd divergence instead of erasing it

**Date:** 2026-10-11
**Repo:** field-laboratory
**Asked for:** sync the adhd skill → then, mid-turn: *"Do not alter the adhd skill
from current usage"* → then: pin the reference.

**`.claude/skills/i-have-adhd/SKILL.md` is byte-for-byte unchanged.** It was read
and hashed, never written. Every destructive test ran against a copy in a
scratch directory.

---

## What the drift actually was

Six bytes, in an example:

```diff
-Good: "Run `npm install jsonwebtoken`, then edit `src/auth.ts:42`."   ← ours
+Good: "Edit `src/auth.ts:42` to update the token validation."         ← upstream
```

7,207 bytes against 7,201. Rule 1's *illustration* was reworded upstream. No
rule text, no behaviour, no front-matter, and not the Rule 9 carve-out CLAUDE.md
records as settled — that paragraph is identical in both.

## The premise that was wrong, before anything was edited

The plan was to teach `skill-drift-check.mjs` an exemption. Its own header
refutes that:

> It does NOT compare against the upstream author's repo. `sync-adhd-skill.mjs`
> already tracks upstream, and folding that in here would make this check go red
> the day someone else edits their own `main`

That script compares **sibling copies**, not upstream. And `sync:adhd-skill`
turned out to write to *other repositories* through the GitHub API — not a local
fix at all, and not something to run on a guess. The red step is
`install-adhd-skill.mjs --check`, found by reading `drift-sentinel.yml:141`.

Three scripts, three different jobs, similar names. One read of the workflow
settled it.

---

## The pin

`docs/adhd-skill-pin.json` records **two** hashes and the reason:

```
localSha256            3170b16ace00aecb0dd7feb54c0b5aa642e7502acda06ecd24fd89a11c7127e9
acceptedUpstreamSha256 88955c019bbb1419ff4b49dbb1f80a867467de6233d7865af2e06a7d7b76c7d3
```

Naming both is the whole design. `install-adhd-skill.mjs` exists to rule out a
hand-edit or a partial reconstruction, so an exemption has to be narrower than
"ignore the difference":

| state | verdict |
|---|---|
| local and upstream agree | `identical` — and the pin is reported as redundant |
| both hashes match the pin | `pinned` — passes, **and prints the divergence** |
| local copy edited since the pin | `local-edited` — **fatal** |
| upstream moved again | `upstream-moved` — **fatal** |
| they differ, no pin | `drifted` — exactly the old behaviour |

A pin that survived either direction would be a permanent exemption wearing a
hash.

### It binds the write path too

A pin that only taught `--check` to stay quiet would be undone by the next
person running the script without a flag — which is literally what the old error
message told them to do (*"re-run without --check to reinstall it verbatim"*).
So the install path refuses a pinned file and says why. Measured in the
sandbox: refusal, exit 1, file unchanged.

### It stays loud

The pinned run prints both hashes, the reason and the diff on every sentinel
run. `scripts/check-adhd-pin-reports.mjs` asserts that it does, because the
sentinel reads only an exit code and would never notice the report going quiet.
An exemption nobody is reminded of is an exemption nobody revisits.

### It is optional, which keeps the file portable

`install-adhd-skill.mjs` is installable straight from a URL into a sibling repo.
No pin file means no pin logic and byte-identical behaviour to before.

---

## What the checks caught, in me, this hour

**`import-purity-check` — within the hour the exports were added.** Adding
`sha256`, `readPin` and `verdict` as exports pulled this file into the purity
check's population for the first time, and its top-level install code is not
`isMain`-gated:

```
scripts/install-adhd-skill.mjs: the import terminated the process (exit 1) — code after the import never ran
```

**The obvious fix was wrong, and measuring said so.** Gating on `checks.mjs`'s
`isMain` would have silently broken the documented portable install, because
`isMain` compares against `process.argv[1]`:

```
node scripts/install-adhd-skill.mjs   argv[1] = the script path
curl … | node -                       argv[1] = "-"
imported from another module          argv[1] = the importer, or undefined
```

Under the pipe `isMain` is **false**, so the install command in the file's own
header would have become a no-op. `IS_ENTRY` keys on `"-"` as well, and all four
modes were then run: direct `--check`, `--self-test`, piped, and imported.

---

## Verification

| | |
|---|---|
| installer self-tests | 4 → **15** |
| pin-reports self-tests | **8** |
| end-to-end scenarios, in a scratch copy | **4** — pristine, local edit, upstream moved, no pin |
| invocation modes exercised | **4** — direct, self-test, piped, imported |
| mutations added | **3**, all caught |
| skill file bytes changed | **0** |

The three mutations each grant the pin something it must not have: blessing a
hand-edited local copy, blessing a moved upstream, and going quiet.

## Not covered

- **The sibling repos are not pinned.** `sync-adhd-skill.mjs` installs upstream's
  copy into field-relay-nba, jubilant-bassoon and field-playground and knows
  nothing about this pin. If that workflow runs with a token, those three will
  take upstream's wording while this repo keeps ours. That is a divergence
  `skill-drift-check.mjs` compares and would report — stated here rather than
  discovered later.
- **One upstream revision observed.** The accepted hash is what upstream served
  on 2026-10-11. Nothing says it is stable.

---

## The sentinel is still red, and the skill is not why

Dispatched after the push — run `38163516333`:

```
 8 success The i-have-adhd skill is still verbatim
 9 success A pinned skill divergence is still reported
15 failure Fail if the sentinel failed
```

Step 15 is `if: always() && steps.sentinel.outputs.code != '0'`. It reacts to
step 5, the live-payload sentinel, which reported **`odds-coverage-lost`**.

**An earlier characterisation of mine was incomplete and is corrected here.**
Run `38160306402` was described as red *on the skill drift*. It had TWO failing
steps — the skill one and this one — and only the first was the skill's. The
odds condition is independent, predates this work, and recurs in the drift log
on 2026-10-07, 10-10 and twice on 10-11:

```
| 2026-10-11 17:36 | 2026-10-11 | 46 | odds-coverage-lost | … NFL:0/13 NBA:0/4 NHL:0/3 La Liga:0/4 …
```

Not chased here. It is a live-data question with its own history, and widening
this change to cover it would be the "while I'm here" the repo's own Rule 69
prohibits. Stated so the next reader does not re-dispatch the sentinel expecting
green and conclude the pin failed.

**What the pin was asked to do, it does:** the skill-verbatim step passes, the
divergence is reported in full on every run, and both fatal directions were
shown firing.
