# A roster that could not audit itself

**Date:** 2026-08-31
**Scope:** `scripts/skill-drift-check.mjs`

`scroll-craft` was installed on 2026-08-29 by request and has been invoked on
nearly every message since. `skill-drift-check.mjs` never compared it. For two
days it was a skill this repo carries, in the one repository positioned to see
all four copies, with no observer.

```
=== skills present here:        === roster compared:
i-have-adhd                     i-have-adhd
scrollcraft                     unslop-ui
unslop-ui
```

## Why nothing noticed

The roster was the only source of truth about its own scope. A skill absent
from the list is absent from the output, so the check reported on everything it
knew about and knew about less than it should. Its summary line —
`4 copy/copies compared, 0 drifted, 0 went dark` — was true and complete about a
set that was silently too small.

That is the same shape as `check-script-orphans` guarding
`docs/unreachable-scripts.txt`, and as the sport registry reading its DU case
count out of the F# source rather than trusting a literal. **`.claude/skills` is
the source. The roster is a copy of it.**

## The guard

`skillsOnDisk()` reads the directory; `rosterGaps()` names what the roster
misses. **Fatal**, unlike the check's other non-fatal states, and the difference
is who can cause it:

- `UNREADABLE` — a sibling's repo is private or never carried the skill. Outside
  this repo's control, indistinguishable from outside, correctly not a finding.
- `undeclared` — a sibling installed a skill. Legitimate growth; failing on it
  would redden this build for someone else's correct action.
- **a roster gap** — entirely inside this repo. Nobody else can cause it and
  nothing outside can fix it.

## Teeth, measured on the real tree

```
scrollcraft removed from the roster   →  node exit 1
                                        "1 skill(s) on disk that this check does not compare"
restored                             →  node exit 0
```

### The first measurement of that was wrong

I ran `node scripts/skill-drift-check.mjs | tail -5; echo "exit=$?"` and read
`exit=0` — concluding the mutant had passed and the guard had no teeth. `$?`
after a pipeline is **`tail`'s** exit code, not node's. The guard was fatal the
whole time; the instrument was reading the wrong process.

Same class as everything else this session: a check that looks at the wrong
thing reports confidently about it. Re-measured by redirecting to a file and
reading node's own status.

## Live output, with scrollcraft in

```
scrollcraft  (21958 bytes here)
  UNREADABLE  field-relay-nba    HTTP 404
  UNREADABLE  jubilant-bassoon   HTTP 404
  UNREADABLE  field-playground   HTTP 404
```

Three UNREADABLE and non-fatal, which is correct — scroll-craft is installed
only here. The value is not that it found drift today. It is that the day a
sibling installs it, this check will start comparing bytes instead of not
knowing the file exists.

## Census that led here

27 candidate "findings computed, printed, never gated" across 89 scripts. Three
of the four most suspicious turned out to gate via `process.exit` in a form the
census regex missed — `staged-verifier-check`, `venue-coverage-check`,
`extract-production-tables` are all fine. The one real hit,
`skill-drift-check`'s `undeclared`, is non-fatal **by an argued decision** stated
in its own comment, and correctly so.

So the census found no new instance of the class. It found this instead, by
making me read the file the class lives in.

## Verified

```
node scripts/skill-drift-check.mjs --self-test   19/19
node scripts/skill-drift-check.mjs               exit 0, 4 compared, 0 drifted, 0 dark
```
