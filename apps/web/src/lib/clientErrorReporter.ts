/**
 * Reports uncaught browser errors to `/api/client-errors`.
 *
 * Installed once from the root layout. Two things keep it from being a nuisance
 * to the app it lives in:
 *
 *  - **Bounded per session.** At most `MAX_REPORTS` distinct errors are sent,
 *    deduped by message+path. A render loop that throws on every frame would
 *    otherwise turn one bug into a traffic spike against our own API.
 *  - **No query strings.** `location.pathname` only: a share link or a reset
 *    link carries a token in the query, and a log line is not the place for it.
 *
 * Never throws and never blocks: a failure to report is not worth surfacing.
 */

export const MAX_REPORTS = 5;

interface Reportable {
  message: string;
  path: string;
  digest?: string;
  stack?: string;
}

/** Strips the query and hash, and bounds what leaves the browser. */
export function toClientError(
  message: unknown,
  location: { pathname: string },
  extra: { stack?: string; digest?: string } = {}
): Reportable {
  const text =
    typeof message === "string" && message.trim()
      ? message.trim()
      : "Unknown client error";

  return {
    message: text.slice(0, 500),
    path: location.pathname.slice(0, 200) || "/",
    ...(extra.digest ? { digest: extra.digest.slice(0, 64) } : {}),
    ...(extra.stack ? { stack: extra.stack.slice(0, 2000) } : {}),
  };
}

export interface InstallOptions {
  endpoint?: string;
  send?: (payload: Reportable) => void;
}

/**
 * Install the listeners. Returns a cleanup function.
 *
 * `send` is injectable so the tests can assert what would have been sent without
 * touching the network.
 */
export function installClientErrorReporter(
  win: Pick<Window, "addEventListener" | "removeEventListener" | "location"> = window,
  options: InstallOptions = {}
): () => void {
  const endpoint = options.endpoint ?? "/api/client-errors";
  const seen = new Set<string>();
  let sent = 0;

  const send =
    options.send ??
    ((payload: Reportable) => {
      try {
        void fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          // Survives the navigation that an uncaught error usually precedes.
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* reporting must never throw */
      }
    });

  function report(payload: Reportable) {
    const key = `${payload.message}|${payload.path}`;

    if (seen.has(key) || sent >= MAX_REPORTS) return;

    seen.add(key);
    sent += 1;
    send(payload);
  }

  const onError = (event: ErrorEvent) => {
    report(
      toClientError(event.message, win.location, {
        stack: event.error instanceof Error ? event.error.stack : undefined,
      })
    );
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;

    report(
      toClientError(
        reason instanceof Error ? reason.message : String(reason),
        win.location,
        { stack: reason instanceof Error ? reason.stack : undefined }
      )
    );
  };

  win.addEventListener("error", onError as EventListener);
  win.addEventListener("unhandledrejection", onRejection as EventListener);

  return () => {
    win.removeEventListener("error", onError as EventListener);
    win.removeEventListener("unhandledrejection", onRejection as EventListener);
  };
}
