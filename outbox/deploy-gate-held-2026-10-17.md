# The hourly deploy gate says "held", not "could NOT BE READ"

CC-CMD: `docs/CC-CMD-2026-10-17-deploy-gate-unverified-tree.md`, option 1 (owner
ruling 2026-10-17: "option 1"). Words, not behaviour: what ships is unchanged.

## The change

`scripts/deploy-gate.mjs` gains a fifth outcome, `held`, alongside go, red,
in-flight and unknown.

- `reinterpret(decision, skipDirective)` turns `unknown` into `held` only
  when the commit verify was asked about carries the skip directive (read from
  that commit's message with `git log -1`, using `deployable.mjs`'s
  `carriesSkipDirective`, the same predicate deploy-landed uses).
- A real verdict is never overridden: red, go and in-flight stand even on a
  skip-directive commit. That can happen if someone dispatches verify on it.
- If the message cannot be read, the verdict stays `unknown`. Not knowing is
  not a reason.
- `held` does not proceed, exactly as `unknown` did not. Nothing verify has
  not seen is published; the census bytes wait for the next verified commit,
  whose verify run covers them.

Heading on such a commit:

> Deploy held — `<sha>` carries the skip directive, so verify never runs on it

## Fails on purpose

Self-test 21/21. Its assertions:
- four distinct headings (red, in-flight, unknown, held);
- held does not proceed;
- the held heading names the commit and the reason, without the unreadable
  wording;
- unknown on an ordinary commit stays unknown;
- real verdicts are not overridden.

`scripts/mutate-deploy-gate.mjs`, wired into verify's "The deploy gate can
still refuse" step, 4 of 4 caught:
- G1: held merged back into unknown (the CC-CMD's done-condition mutation).
- G2: a held tree proceeds, which would change what ships.
- G3: a real verdict overridden.
- G4: every unknown explained away as held.

## End to end, against the real GitHub API

Run locally with `GITHUB_EVENT_NAME=schedule`, on a throwaway worktree.

On a never-pushed `data/` commit carrying the directive, on top of main:

```
Deploy held — `f80dda4` carries the skip directive, so verify never runs on it
`f80dda4` is the newest change to the published tree and verify has no verdict on it, by design: its commit message asked CI to skip. Its bytes are held back, not lost — the next verified commit publishes them, with verify having seen them.

Not red, not unreadable. Nothing unverified is published.
```

With that commit removed: `Deploy proceeding — verify is green on `d9f2cce``.

## Gate

Full gate on a runner (the sandbox has no .NET 10 or Playwright packages):
`verify-full` run 39044130530 scored **530/530 = 100** on `dc63004`.

The first attempt, run 39040753116 on `1176e6d`, scored 500/530 = 94, and was
not landed. Cause: this file was dated `2026-10-16`, the CC-CMD's day, while the
gate's FIELD day was 2026-10-17. That failed "this session wrote its outbox"
and, through the mutation row's own unmutated baseline, "breaking each
invariant makes a check fail". Renamed, amended, re-scored.

Landed as `d7fadc0`: the same diff rebased over six docs/outbox-only commits
on main, alone in its push so the push head did not carry the skip directive.
On `d7fadc0`, all green:
- verify 39050631131
- guards 39050631124
- deploy 39050837010
- live-check 39050891097
