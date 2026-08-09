module Program

/// Scaffold-only entry point. Its single job is to prove the F# -> JavaScript
/// toolchain genuinely compiles and runs; the desk/scoreboard build is a
/// separate piece of work and does not belong here.
let greeting (name: string) = sprintf "FIELD Laboratory: %s toolchain live" name

printfn "%s" (greeting "Fable")
