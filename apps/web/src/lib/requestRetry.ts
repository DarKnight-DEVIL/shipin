/**
 * Client-side signal for requests that are waiting to be retried.
 *
 * `apiFetch` replays idempotent requests once, after a short backoff and
 * honouring `Retry-After`. That wait is invisible: the page has already
 * rendered, nothing is spinning, and on a slow upstream the user is left
 * staring at stale content with no idea whether anything is happening. The
 * retry itself is fine; its silence is the bug.
 *
 * A counter rather than a boolean: several requests can be backing off at once,
 * and the notice must stay up until the last one settles.
 */

type Listener = () => void;

let pending = 0;

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** A retry is about to wait, then replay its request. */
export function beginRetryNotice(): void {
  pending += 1;
  emit();
}

/**
 * That retry finished — success or failure. Never drops below zero: a mismatched
 * pair must not leave the notice stuck on screen.
 */
export function endRetryNotice(): void {
  if (pending === 0) return;

  pending -= 1;
  emit();
}

/** Whether any request is currently backing off. */
export function isRetryPending(): boolean {
  return pending > 0;
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribeRetryNotice(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
