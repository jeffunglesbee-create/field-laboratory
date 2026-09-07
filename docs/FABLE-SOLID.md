# Fable.Solid — the dependency decision, made

**Decided 2026-08-27. Keep it.** Open since 2026-08-10, when the Aug 2–10
session series closed with two items "requiring direct human action", of which
this was the second.

## What was actually asked

Whether Fable.Solid's *"four-year-old, no-stable-release status"* is an
acceptable long-term dependency. That framing invites a judgement. It is
answerable with two measurements.

## Measurement 1 — the release situation, from NuGet directly

```
GET https://api.nuget.org/v3-flatcontainer/fable.solid/index.json
{ "versions": ["1.0.0-beta-001","1.0.0-beta-002","1.0.0-beta-003","1.0.0-beta-004"] }
```

Four versions, all beta, newest `1.0.0-beta-004`.
`src/Laboratory.fsproj:83` pins `1.0.0-beta-004`.

**There is nothing to upgrade to, and nothing has shipped since.** The concern
is accurate. It is also the whole of the downside — a package that never
changes cannot break you by changing.

## Measurement 2 — the exposure, which is the part nobody had counted

```
6 call sites, 2 files, 12 lines mentioning `Solid`, out of 8,126 lines of F#
```

Four primitives, all of them `[<Import>]` bindings to `solid-js` functions:

| primitive | sites |
| --- | --- |
| `Solid.createRoot` | `src/Program.fs:325` |
| `Solid.createSignal` | `src/Scoreboard.fs:284` |
| `Solid.createMemo` | `src/Scoreboard.fs:288, 289, 293` |
| `Solid.createEffect` | `src/Scoreboard.fs:270` |

`Feliz.JSX.Solid` is **not** a dependency. `src/Scoreboard.fs:14` records the
reason: the view layer uses `Fable.Browser.Dom` rather than JSX, deliberately.
So the surface is the reactive primitives and nothing else.

`solid-js` itself is pinned `^1.9.14` in `package.json` — a mature runtime with
a stable API since 1.0. **Fable.Solid is a binding, not the runtime.** The beta
label attaches to ~20 lines of import declarations, not to the reactive system
the app depends on.

## The decision, and the test that reverses it

**Keep it.** If Fable.Solid ever fails to compile against a future Fable, the
replacement is writing four `[<Import(...)>]` declarations against the same
`solid-js` package — smaller than the migration document would be, and with the
call sites already enumerated above.

**Revisit if any of these becomes true:**

1. `Solid.*` appears in more than 20 lines of F#. At that point the binding is
   load-bearing rather than incidental and the count above stops being the
   answer. Verify: `grep -c "Solid\." src/*.fs`
2. `Feliz.JSX.Solid` enters `Laboratory.fsproj`. That is the dependency the
   concern was really about, and this decision does not cover it.
3. `solid-js` goes to 2.x with a breaking reactive API, which is the only change
   that could strand a binding nobody maintains. Verify: `npm view solid-js version`

None of the three holds today. Re-run all three before citing this document
after 2026-09-10, per Rule 73.
