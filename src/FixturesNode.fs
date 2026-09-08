module FixturesNode

open Fable.Core

// The node half of `Fixtures.fs`: reads the captures from disk and hands them
// over.
//
// A SEPARATE MODULE FOR ONE IMPORT, and that import is the whole reason. While
// `readFileSync` lived inside `Fixtures.fs`, that module was node-only, so
// `Suite.fs` was node-only, so the suite compiled below `Program.fs` and could
// never reach the page. Fable emits `import { readFileSync } from "node:fs"` at
// the top of whatever module names it, and a browser refuses that at load —
// there is no guard clause that helps, because the failure is the import
// statement, not a call.
//
// So the import is quarantined here, below `Program.fs` where the browser bundle
// cannot reach it, and `VerifyMain` calls `loadAll ()` before running anything.
// The browser fills the same registry by fetching the same files.

[<Import("readFileSync", "node:fs")>]
let private readFileSync (path: string, encoding: string) : string = jsNative

/// Load every path `Fixtures` declares.
///
/// Driven by `Fixtures.paths` rather than a list repeated here. A second list
/// would be a second place to forget a file, and forgetting one is not a
/// compile error — it is a `failwithf` at the first row that needs it, which
/// would read as a suite failure rather than a wiring one.
let loadAll () =
    for path in Fixtures.paths do
        Fixtures.load path (readFileSync (path, "utf8"))
