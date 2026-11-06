# Session record: the printed coverage of mutate-copy-check is a list the self-test proves

**Date:** 2026-11-05. **Scope:** review 7, low L3 (assignment G1). New file because `check:staged-outbox` needs one under `outbox/` for a commit that stages `scripts/`; no existing outbox file is edited.

## Reproduction (Rule 100, run before building)

Node 22.22.0, the node guard extracted from `scripts/mutate-copy-check.mjs`, each form attempted in a scratch root (the first run of this probe chained its attempts on shared fixtures and later ones read ENOENT, which is a fixture artefact, so the list below comes from the fresh-fixture probe that is now part of `--self-test`):

- Callback `fs.writeFile`, `fs.appendFile`, `fs.copyFile`, `fs.rename`, `fs.unlink`, `fs.rm`, `fs.truncate`: allowed, nothing logged (guard log: 0 lines for the callback probe).
- `fs.promises.writeFile`, `fs.createWriteStream`, `openSync` with a write flag plus `writeSync`, `mkdirSync`, `mkdtempSync`, `rmdirSync`, `symlinkSync`, `linkSync`, `chmodSync`, `utimesSync`, a `file:` URL path, a write through a symlinked directory, a shell-out: allowed. The URL and symlinked-directory writes are logged under garbage paths (`WROTE ROOT/file:/...`, `WROTE ROOT/other/sl/...`).
- Python: `os.symlink`, `os.link`, `os.mkdir`, `os.chmod`, `os.utime`, an open through a symlinked directory: allowed. `shutil.copytree` into `scripts/` is refused (its copies go through an open for writing).
- cpSync: the printed text said it is not seen. On this Node a FILE copy into `scripts/` is refused (`cpSync('other/o', 'scripts/cp')` printed `EACCES`, logged `BLOCKED .../scripts/cp`: it calls the wrapped `copyFileSync`), and a DIRECTORY copy is allowed and not logged (`cpSync('other/d', 'scripts/dcopy', {recursive: true})` wrote `scripts/dcopy`). The printed claim was false for files and true for directories.

## What was built

- `scripts/mutate-copy-check.mjs`: the forms neither guard sees are now data, `UNSEEN_NODE` (20 attempts under 10 printed statements) and `UNSEEN_PY` (10 attempts under 6), each with the attempt that proves it. The verdict prints the statements from that data. `--self-test` attempts every one on a fresh fixture in a root of its own per language and requires each to succeed with no refusal logged (2 clauses), has a clause that the test of the list fails when a form is refused, was never attempted, or a refusal was logged (the same function the two clauses apply), and a clause that the printed text names every statement and says what cpSync does only as a dated measurement. `--self-test` 21 to 25 clauses. The printed text now reads "attempts N forms under those statements, each on a fresh fixture".
- The directory probe of the previous commit restored `scripts/` with `mkdirSync` after each attempt, so a guard that learned `mkdirSync` also reddened the directory clause. The restore is not needed (nothing moves when the guard works; when it does not, the clause is red anyway) and is removed.
- `scripts/mutation-check.mjs`: 7 entries added after the existing mutate-copy / mutate-push-lands entries: the node guard learns `mkdirSync`, the python guard learns `os.mkdir`, the test of the list vacuous / ignoring refusals / ignoring a form never attempted, the printed coverage built from nothing, the cpSync sentence undated. Expect `mutate-copy-check.mjs --self-test`.

## Red evidence (Rule 90)

In a scratch rig: node guard wrapping `mkdirSync` gave `24/25`, red clause `EVERY ONE OF THE 20 FORMS THE PRINTED COVERAGE SAYS THE NODE GUARD DOES NOT SEE IS NOT SEEN`; python guard handling `os.mkdir` gave `24/25`, red clause `EVERY ONE OF THE 10 FORMS ... PYTHON GUARD ...`; the test of the list made vacuous gave `24/25`, red clause `THE TEST OF THE LIST HOLDS WHEN EVERY FORM SUCCEEDED AND FAILS WHEN ...`. The first run of the first two also reddened the directory clause, which is what exposed the `mkdirSync` restore above. All 7 entries (and the 4 of the previous commit, re-run after the probe change) caught through `node scripts/mutation-check.mjs --ids ...`.

## Not built, needs a decision

- cpSync of a DIRECTORY into `scripts/` is not guarded on Node 22.22.0, and restoring `scripts/` from a backup with `cpSync(backup, 'scripts', {recursive: true})` is the same idiom as the directory swap the previous commit guards. Wrapping `cpSync` (destination = argument 1) would make it deterministic on every Node, but it adds a logged write to every script's own copy step, which changes what clause 6 and clause 7 see; it is not made here. The verdict states the measurement and does not promise either behaviour.
