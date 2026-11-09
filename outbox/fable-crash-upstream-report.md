# DRAFT, NOT FILED — a report for the Fable repository (fable-compiler/Fable)

**2026-11-09:** the owner said to file it. This session could not: attaching `fable-compiler/Fable` was denied by the permission layer (the session reaches four repositories, none of them Fable) and the `gh` token on the machine is invalid. The paste-ready version, with the internal references removed and every number re-checked against `outbox/fable-crash-probe-latest.json` (1 crash in 400 builds, pooled 95% Wilson interval 0.04% to 1.40%), is `outbox/fable-crash-upstream-issue.md`.

Filing it posts outside this repository, so it is the owner's call. Written 2026-11-03 from `docs/CC-CMD-2026-11-03-fable-compiler-crash.md`; every number is from the runs named there.

**Title:** `dotnet fable` (5.13.0): sporadic "internal error: Object reference not set to an instance of an object. (code 193)" on an unchanged project, on Linux CI

**What happens.** A whole-project `dotnet fable src/Laboratory.fsproj --outDir <dir>` of source that compiles fails, about once in a few hundred builds, with the compiler's internal error reported at many files at once:

```
./build/fable_modules/Thoth.Json.10.5.1/Types.fs(33,1): (37,6) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)
./build/fable_modules/Thoth.Json.10.5.1/Decode.fs(201,23): (201,67) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)
./src/Journalism.fs(310,5): (310,36) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)
```

Often with diagnostics beside them that look real but are consequences of whatever failed to resolve (code 72 and 752 "Lookup on object of indeterminate type", code 1 "The type ... is not compatible with ...", code 39 "The type 'ExtraCoders' does not define the field, constructor or member 'Coders'", "A unique overload for method 'DateTime' could not be determined"). The exit code is 1 and the build prints "Compilation failed". Run again on the same source, it passes.

**Environment.** Fable 5.13.0 (dotnet tool, rollForward false). GitHub-hosted runners, ubuntu-26.04 images 20261025 and 20261026, 4 cores; .NET SDK 10.0.403 (the image's) and 10.0.113 (pinned with a `global.json`, `rollForward: disable`). Also seen once locally on SDK 10.0.113 under a Linux VM, in a run that had just run a headless browser check.

**Rate.** A probe of 400 builds (100 per cell: two SDKs, fresh output directory per build, and one reused) found one crash, on SDK 10.0.113 with a fresh output directory (1 in 400, 95% interval 0.04% to 1.4%); the same source crashed a few times (two or more) in each of three runs of about 260 builds that were interleaved with browser checks, and once in a plain first build on a clean checkout. It clusters: three builds in a row failed once. No watch-mode incremental compile failed in well over a thousand; the first compile of a watch process failed the same way once.

**What is not known.** A cause. No SDK version, output directory handling or idleness separates the cells at this power. No stack trace is available (the message is the compiler's own).

**Workaround in use.** The build is repeated when it fails, and a diagnostic is believed only when the next build prints the same first diagnostic (`scripts/build-steady.mjs`).
