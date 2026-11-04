// What the pid in a run marker means.
//
// `proof-check.mjs` and `mutation-check.mjs` each leave a marker naming the process that is
// about to modify tracked files, so the next run can tell a KILLED run (repair what it left)
// from a LIVE one (refuse). They asked `process.kill(pid, 0)`, and a pid is not an identity:
//
//   - a pid can be recycled, so a marker from before a container restart can name whatever
//     process holds that number now, and the live-run refusal then fires on a clean tree and
//     recommends `kill <pid>` against a process that is not ours (by construction; the
//     recycled case is exercised in the self-tests with a pid and a wrong start time);
//   - a zombie (dead, not yet reaped by its parent) answers signal 0 as alive. Measured
//     2026-11-04 on this Linux: a child that had exited, its parent not yet waiting,
//     read `kill(pid, 0)` alive and `/proc/<pid>/stat` state `Z`. A Node process makes one
//     the same way (spawn a child that exits at once and do not let the event loop turn, which
//     libuv needs in order to reap it), and `proof-check.mjs --self-test` does exactly that.
//     How long a zombie lasts depends on the parent (or init) reaping it.
//
// So the marker also records the process's START TIME (field 22 of /proc/<pid>/stat, in
// clock ticks since boot), and a process counts as the recorded run only if it is running
// and started when the marker says. Where /proc can be read, a zombie or a process being
// torn down is dead whatever the marker says, and a marker with no recorded start is judged
// by the pid and its state alone. Only where /proc cannot be read is the signal's answer
// all there is.
//
// Pure where it can be: `parseStat` and `isLive` take the readers as arguments, so the
// self-tests can exercise a zombie and a recycled pid without making either (and one clause
// makes a real zombie).

import { readFileSync } from 'node:fs'

/**
 * `/proc/<pid>/stat` text to `{ state, start }`, or null if it does not parse.
 *
 * The second field is the command name in parentheses and may itself hold spaces and
 * parentheses, so everything is read from after the LAST `)`. From there the fields are
 * the state letter (field 3) and, 19 fields later, the start time (field 22).
 */
export const parseStat = text => {
  const close = text.lastIndexOf(')')
  if (close < 0) return null
  const rest = text.slice(close + 2).split(' ')
  if (rest.length < 20 || rest[0].length !== 1) return null
  return { state: rest[0], start: rest[19] }
}

/** The state and start time of a live process, or null when there is no /proc entry to read. */
export const statOf = (pid, read = p => readFileSync(p, 'utf8')) => {
  try { return parseStat(read(`/proc/${pid}/stat`)) } catch { return null }
}

/** The start time to record in a marker, or null where it cannot be read. */
export const startOf = (pid, stat = statOf) => stat(pid)?.start ?? null

/**
 * Is `{ pid, start }` a process that is running now AND is the one that was recorded?
 *
 * EPERM from signal 0 means the process exists and belongs to somebody else, which is
 * alive. A zombie or a process being torn down is not. If /proc cannot be read the
 * signal's answer stands; if the marker has no start time it is judged by the pid alone.
 */
export const isLive = ({ pid, start }, { kill = process.kill.bind(process), stat = statOf } = {}) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    kill(pid, 0)
  } catch (e) {
    if (e.code !== 'EPERM') return false
  }
  const s = stat(pid)
  if (s === null) return true
  if (s.state === 'Z' || s.state === 'X') return false
  return start === undefined || start === null || String(start) === s.start
}
