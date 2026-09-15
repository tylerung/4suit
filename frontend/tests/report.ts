/**
 * Each suite counts its own failures and hands the total back here; the runner
 * reads it off the global and turns it into the process exit code.
 */
export function reportResult(failures: number): void {
  ;(globalThis as { __4suitFailures?: number }).__4suitFailures = failures
}
