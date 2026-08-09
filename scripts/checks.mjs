// Shared check harness.
//
// This exists because of a specific, recorded complaint. The FIELD codex entry
// `field-unification-thesis-2026-07-23` observes that ambient-skeleton-probe.js
// and chip_overflow_probe.js are structurally near-identical verification
// scripts with no shared harness, and predicts that the next such script will
// be a third near-duplicate rather than a reuse.
//
// render-check.mjs was the third. drift-check.mjs would have been the fourth.
// They genuinely cannot be one script — one drives a headless browser, the other
// runs no browser at all — but the part they actually share is this: accumulate
// named pass/fail results, print them uniformly, exit non-zero if any failed.
// So that part is shared, and the probes stay separate.

export function createChecks() {
  const checks = []

  return {
    /** Record a named result. `detail` is printed only on failure. */
    check(name, pass, detail) {
      checks.push({ name, pass: Boolean(pass), detail })
    },

    /** Print all results and exit non-zero if any failed. */
    summarize() {
      for (const c of checks) {
        console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : `\n      → ${c.detail}`}`)
      }
      const failed = checks.filter(c => !c.pass)
      console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
      return failed.length
    },
  }
}

/**
 * Fable compiles F# lists to linked-list objects, not JS arrays — `.length` is
 * undefined on them. They are iterable, so Array.from converts. Wrapped here
 * because every consumer of the compiled decoders hits this.
 */
export const toArray = xs => (xs == null ? [] : Array.from(xs))

/**
 * Tag values of the `Nested<'T>` union from src/Desk.fs, in declaration order.
 * Anything reading decoder output needs these, and a bare `2` in a comparison
 * is unreadable.
 */
export const NESTED = { NotPresent: 0, Decoded: 1, Malformed: 2 }
