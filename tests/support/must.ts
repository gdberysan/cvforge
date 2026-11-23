/**
 * The value, or a failed test that says what was missing — instead of a
 * non-null assertion, which turns a missing value into a confusing
 * "cannot read properties of undefined" three lines later.
 */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`expected ${what}, got ${value}`)
  return value
}
