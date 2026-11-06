// Network use a gate row's scripts have on purpose, or reach only behind a flag the row does not pass: the table `row-confidence.mjs` scores the determinism half of a row against, and the table
// `network-exempt-check.mjs` RUNS. It is a module of its own because `row-confidence.mjs` does its work at module scope (it prints a table when it is imported) and the check needs the same
// entries; this file imports nothing and does nothing when imported (`scripts/import-purity-check.mjs`).
//
// One entry per ROW and script, because rows are scored one at a time (a script two rows run needs two).
//
// `flag`: the script fetches only when it is given this flag: `drift-check.mjs` only from the `--url` it is given, `venue-coverage-check.mjs` only under `--report --url`. The drift sentinel passes
// them and no gate row does. The entry holds only while the row's OWN text, in `gate-checks.mjs`, does not pass that flag to that script: a row that adds `--url` is red whatever this table says.
// `sanctioned`: the ONE network read a gate row is allowed to make, with the reason: the shard wait of `verify-full`. `mutation-await.mjs` has no flag to key on, it reaches the GitHub API whenever it
// runs, and the row runs it whenever `verify-full` sets `GATE_MUTATION_SHARDS` (a clause in `row-confidence.mjs` pins that there is exactly one sanctioned read).
// An entry with neither exempts nothing. An entry that names a row the gate does not have, or a script that row does not run, is itself an objection (`staleExemptions`).
//
// `control`: a command that makes the script reach the network, which is how the entry is proved rather than read. `args` follow the script's path (`node <script> <args>`), `env` is added to the
// environment. For a flag entry the args carry the flag. For the sanctioned wait they carry what the script needs to get as far as its first request, and `within` is the only address it may ask:
// every attempt has to begin with it.
//
// WHAT RUNS THEM: `network-exempt-check.mjs` (`npm run check:network-exempt`), under `no-network-preload.mjs`, which ends a process at its first attempt on the network and writes the attempt down.
// For a flag entry it requires that (1) the script's source reads the flag as a quoted literal, (2) the control, which passes the flag, is stopped on an attempt, and (3) the commands of the row,
// run as the gate runs them, make no attempt and pass. For the sanction it requires that the script's attempts all fall under `within`, and that there is one. What it cannot see: a request on a
// path the row's commands do not take, which the row does not make either; a request through something the preload does not close (a child process, `dns`). For the sanction it runs the wait once with a single
// attempt, so it sees the wait's FIRST request (the artifact list of its run) and no later one: the job list is under the same path, and the artifact download is under `/repos/<repo>/actions/artifacts/`, which is not.
//
// The row-side text of the sanction is checked elsewhere: `sharded-row-check.mjs` requires `verify-full.yml` to set `GATE_MUTATION_SHARDS` on the step that runs the gate, and the row's other branch,
// which runs the suite in-process when it is unset, so that a local gate does not run the wait.

/** An address no resolver answers (`.invalid` is reserved): the preload ends the attempt before anything is looked up, and if it did not, the lookup would fail. */
const CONTROL_URL = 'http://control.invalid/x'

export const NETWORK_EXEMPT = [
  { row: 'decoders accept both real captures', script: 'scripts/drift-check.mjs', flag: '--url', control: { args: ['--url', CONTROL_URL] } },
  { row: 'decoders accept both real captures', script: 'scripts/venue-coverage-check.mjs', flag: '--report', control: { args: ['--report', '--url', CONTROL_URL] } },
  { row: 'decoders still REJECT the corrupted fixture', script: 'scripts/drift-check.mjs', flag: '--url', control: { args: ['--url', CONTROL_URL] } },
  { row: 'breaking each invariant makes a check fail', script: 'scripts/mutation-await.mjs', sanctioned: 'the shard wait: verify-full sets GATE_MUTATION_SHARDS (sharded-row-check.mjs reads it there), and this script lists the artifacts and jobs of the run at the GitHub API so the row can read the shards (network-exempt-check.mjs runs it with the network closed and requires every attempt to be under that run\'s API path); a local gate does not run it (the row runs the suite in-process when the variable is unset)', control: { args: ['network-exempt-control', '--of', '2', '--attempts', '1', '--interval', '0'], env: { GITHUB_API_URL: 'https://api.github.example', GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '1', GITHUB_TOKEN: 'control-token' }, within: 'https://api.github.example/repos/owner/repo/actions/runs/1/' } },
]
