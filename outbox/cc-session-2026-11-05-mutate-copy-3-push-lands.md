# Session record — mutate-push-lands.py breaks a copy too (residuals Task 2, adjacent script)

Date 2026-11-05. Scope: `scripts/mutate-push-lands.py`, its guard in
`scripts/mutate-copy-check.mjs`, and 15 table entries
(`docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 2: the owner's assignment said to
convert it the same way only if the premise held).

## Premise command, run first (Rule 100)
`PYTHONPATH=<a sitecustomize that holds every --self-test child 2.5 s> python3
scripts/mutate-push-lands.py`, SIGKILLed 4.5 s in: `git status --short` printed
` M scripts/check-push-lands.py`, and a rerun printed `FAIL — scripts/check-push-lands.py has
unstaged changes; restore would lose them.` with the file still mutated. `git checkout`
of that one file put it back. The premise holds, so the script was converted.

## Built
- `mutate-push-lands.py` copies the checker into a `tempfile.TemporaryDirectory`, writes
  the mutation there, runs the self-test on the copy and only reads the tracked file. The
  `git diff --quiet` refusal is gone (the tracked file is never written, so there is
  nothing to lose). A positive control is printed and enforced. Output against the
  in-place run: identical apart from the `positive control:` line.
- `mutate-copy-check.mjs` now covers 8 scripts. A `.py` script runs under a
  `sitecustomize.py` that installs an audit hook: it refuses an open for writing, an
  `os.rename`, `os.remove`, `os.truncate` and a `shutil.rmtree` on a path under
  `<root>/scripts/`, and logs the rest. The self-test is 13 clauses (10 before): a probe
  of the python guard, a python in-place stand-in and a python copy-based stand-in were
  added. The real run prints `checked 8 of 8 mutate scripts; 67 of 67 mutations caught`.
- Table: 3 `mutate-push-lands-*` entries (write the tracked file; delete the control;
  delete only its enforcing line), 12 `mutate-copy-check-py-*` entries on the python
  guard, and the node entry `mutate-copy-check-guard-root-wrong` re-anchored on
  `const tracked = path.join(root, 'scripts') + path.sep`, because the python guard has a
  line with the same shape.

## What the mutants found while this was being built
- A python guard without an event of its own for `shutil.rmtree` still printed EACCES for
  the probe, and the mutant that dropped the event SURVIVED. Cause: `rmtree` deletes the
  files in a tree with `os.unlink(name, dir_fd=fd)`, a path the remove event cannot place
  (it resolves a bare name against the current directory); only the final `os.rmdir` was
  refused, after the file inside was gone. The event stays, and the probe clause now also
  requires `scripts/sub/x.py` to still exist.
- The mutant dropping `os.remove` made the probe delete its own fixture and the next
  `readFileSync` in the check threw: caught, but by a crash and not by a clause. The
  fixture reads are now crash-proof, so it fails the probe clause.

## Red evidence
- the check over the script as it was at HEAD, in a scratch git repository: `1/6 checks
  passed`, `BLOCKED .../scripts/check-push-lands.py` and `PermissionError: ... wrote the
  tracked tree`, sha1 of the tracked file unchanged.
- all 52 `mutate-*` entries through the harness: `ran 9 of 9 distinct expectation(s) ...
  0 failing`, 52 PASS, `53/53 checks passed`, 102 s wall on a machine shared by three
  streams. Each of the 52 applied by hand in a scratch tree fails at least one named
  clause and none ends in a crash.
- a real SIGKILL 6.3 s into `mutate-push-lands.py` (the temp copy differed from the
  tracked file at that moment): sha1 of `scripts/check-push-lands.py` identical, `git
  status` clean, a 12 KB directory left in `$TMPDIR`.

## Not verified
- The workflow step has not run on a runner. The `verify` job has no `setup-python` step;
  the checker starts `python3`, which the `push-lands` job in the same file already relies
  on ("a checkout and python3 and nothing else"). `sys.orig_argv` needs Python 3.10; the
  figures above are from 3.13.
- The python guard does not see `os.mkdir`, `os.rmdir`, a remove relative to a directory
  descriptor outside `rmtree`, a file descriptor, `chmod`, `utime` or a shell-out. The
  check prints that.
