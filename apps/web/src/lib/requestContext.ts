/**
 * Request-scoped context for server code.
 *
 * The proxy already stamps every response with an `X-Request-Id`, and handlers
 * that remember to pass it log a correlatable line. The rest do not: a PayPal
 * failure logged three call frames deep had no way to say which request it
 * belonged to, so an operator could see *that* something broke but not *where*.
 *
 * Threading the id through every function signature would touch the whole
 * server for one field. `AsyncLocalStorage` keeps it out of the signatures:
 * `withErrorHandler` opens the scope, and anything below it - including the
 * logger - can read the id without being told.
 *
 * Node-only on purpose (`node:async_hooks`). The proxy runs on the edge runtime
 * and does not import this; it earns its correlation from the header it sets.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { setRequestIdProvider } from "./logger";
import { setRequestScopeRunner } from "./requestScope";

export interface RequestContext {
  /** `X-Request-Id` from the proxy, or the platform's own request id. */
  requestId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` with `context` visible to everything it awaits.
 *
 * Nested calls merge instead of replacing: an inner scope that knows only a
 * request id keeps the outer one's fields, so a helper can add detail without
 * erasing what the caller established.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  const existing = storage.getStore();

  return storage.run({ ...existing, ...context }, fn);
}

/** The current request's context, or undefined outside a scoped call. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** The current request's id, if a scope was opened for it. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

// Two readers hang off this module, both injected rather than imported by the
// client-reachable files: the logger fills `context.requestId` from the first,
// and `utils/errors` runs each handler inside the scope through the second.
// Both keep `node:async_hooks` out of the browser bundle.
setRequestIdProvider(currentRequestId);
setRequestScopeRunner(runWithRequestContext);
