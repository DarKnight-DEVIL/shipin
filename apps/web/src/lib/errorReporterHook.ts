/**
 * The seam between shared error handling and server-side tracking.
 *
 * `utils/errors/index.ts` is imported by client components as well as routes, so
 * it cannot import the tracker directly: `lib/errorTracking` is `server-only` and
 * pulls the Redis client, and a static import put both into the browser bundle -
 * the production build failed on it.
 *
 * So the shared module reports through this hook, and the server installs the
 * real implementation once at boot (`instrumentation.register`). In a browser the
 * hook stays empty and reporting is a no-op, which is correct: a client-side
 * error has no server context to attach.
 */

import type { CaptureErrorOptions } from "./errorTracking";

type ErrorReporter = (error: unknown, options: CaptureErrorOptions) => void;

let reporter: ErrorReporter | null = null;

/** Install the implementation. Called once from `instrumentation.register`. */
export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

/** Report a handled failure. Never throws, never blocks, and is a no-op in the browser. */
export function reportHandledError(
  error: unknown,
  options: CaptureErrorOptions
): void {
  if (!reporter) return;

  try {
    reporter(error, options);
  } catch {
    // Reporting must not create the failure it was meant to describe.
  }
}

/** Test hook. */
export function resetErrorReporterForTests(): void {
  reporter = null;
}
