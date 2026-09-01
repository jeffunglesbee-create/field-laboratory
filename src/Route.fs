module Route

/// The URL grammar for the page's view state.
///
/// SEPARATE FROM Program.fs ON PURPOSE. Program is the entry point: it calls
/// `start ()` at module level, so anything importing it in Node runs the whole
/// app against a `document` that is not there. `Suite.fs` compiles after
/// Program and must not reach into it, which would leave this logic — pure,
/// and the part with real rules in it — testable only through a browser.
///
/// The rules are not obvious, and each one exists because the obvious version
/// is wrong:
///
///   PRESERVE, NEVER REBUILD. Rebuilding the query from known parameters drops
///   the ones you forgot. `data=` pins the page to a committed capture; a tab
///   click that rebuilt the query would silently unpin it on the next reload.
///
///   NEVER ADD `date`. A bare load means "today". Stamping today's date into
///   the URL on a tab click would pin a shared link to this calendar day, so
///   opening it tomorrow shows yesterday's slate under a link that promised
///   the current one.
///
///   THE DEFAULT SURFACE IS OMITTED. `?tab=scoreboard` and no `tab` at all mean
///   the same thing, so only one of them should exist — otherwise every link
///   that already works acquires a second, longer spelling.

/// `tab-briefs` -> `briefs`.
let slugOf (tabId: string) = tabId.Substring 4

/// `briefs` -> `tab-briefs`.
let tabIdOf (slug: string) = "tab-" + slug

/// The surface a URL with no `tab` means.
let [<Literal>] DEFAULT_TAB = "scoreboard"

/// Rewrite a query string with `tab` set, preserving every other parameter.
let withTab (search: string) (slug: string) =
    let kept =
        (if search.StartsWith "?" then search.Substring 1 else search).Split '&'
        |> Array.filter (fun p -> p <> "" && not (p.StartsWith "tab="))
    let parts =
        if slug = DEFAULT_TAB then kept
        else Array.append kept [| "tab=" + slug |]
    // Returns the QUERY ONLY, empty when there is none. The caller prepends the
    // path. Returning "" straight into `replaceState` would be a bug: an empty
    // url argument resolves to the CURRENT url, so clearing the last parameter
    // would silently leave it in place — the one case this function exists to
    // handle, failing in the one way that looks like nothing happened.
    if parts.Length = 0 then "" else "?" + String.concat "&" parts

/// The surface a query string selects.
let tabOf (search: string) =
    (if search.StartsWith "?" then search.Substring 1 else search).Split '&'
    |> Array.tryPick (fun p -> if p.StartsWith "tab=" then Some (p.Substring 4) else None)
    |> Option.filter (fun v -> v <> "")
    |> Option.defaultValue DEFAULT_TAB
