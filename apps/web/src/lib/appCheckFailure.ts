/**
 * Client-side signal for an App Check rejection.
 *
 * `apiFetch` throws a normal `ApiError` for every failure, and pages turn that
 * into a toast. An App Check rejection is different: it is not the user's
 * action failing, it is the device failing attestation. `apiFetch` already
 * retries once with a force-refreshed token before reaching this module, so
 * anything published here survived that retry — which is exactly why the banner
 * offers a reload rather than a silent background attempt. One banner mounted
 * by the shells renders it with a retry.
 *
 * A plain module store rather than context: `apiFetch` has no React tree, and
 * both the platform and admin shells need the same state.
 */

type Listener = () => void;

let active = false;

/**
 * Set when the user hides the banner.
 *
 * Kept separate from `active` on purpose: the rejection is still outstanding,
 * so a later success can clear it and a later failure must bring the banner
 * back. Folding the two together would make a dismissed banner permanent for
 * the rest of the session.
 */
let dismissed = false;

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Called when a response comes back with code APP_CHECK_FAILED.
 *
 * A fresh rejection re-opens a dismissed banner: the user hid it because that
 * request was blocked, not because they want to miss the next one.
 */
export function notifyAppCheckFailure(): void {
  if (active && !dismissed) return;

  active = true;
  dismissed = false;
  emit();
}

/**
 * Called when a later request succeeds: the attestation recovered, so the
 * banner must not keep telling the user to retry.
 */
export function clearAppCheckFailure(): void {
  if (!active && !dismissed) return;

  active = false;
  dismissed = false;
  emit();
}

/** Hide the banner without claiming the rejection is resolved. */
export function dismissAppCheckFailure(): void {
  if (!active || dismissed) return;

  dismissed = true;
  emit();
}

/** Whether a rejection is currently outstanding, dismissed or not. */
export function isAppCheckFailureActive(): boolean {
  return active;
}

/** Whether the banner should be on screen right now. */
export function isAppCheckBannerVisible(): boolean {
  return active && !dismissed;
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribeAppCheckFailure(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
