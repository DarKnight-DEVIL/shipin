/**
 * The client-safe half of request-scoped context.
 *
 * `requestContext.ts` owns the `AsyncLocalStorage`, and `node:async_hooks` must
 * never reach a browser bundle: `utils/errors` is imported by the API client
 * for `serializeError`, and Turbopack refuses to build a page whose chunk graph
 * contains a Node core module. So the scope is opened through this indirection
 * instead of a direct import.
 *
 * On the server, `requestContext.ts` registers the runner at import time and
 * everything below a handler sees the request id. In a client bundle nothing
 * registers it, `runScoped` just calls the function, and no id is invented.
 */

export interface RequestScope {
  requestId?: string;
}

type ScopedRunner = <T>(scope: RequestScope, fn: () => T) => T;

let runner: ScopedRunner | undefined;

/** Registered once by the server-side owner of the storage. */
export function setRequestScopeRunner(next: ScopedRunner | undefined): void {
  runner = next;
}

/**
 * Run `fn` inside the request scope, if one is available.
 *
 * A missing runner is not an error: it is the browser case, and the caller
 * behaves exactly as it would outside any scope.
 */
export function runScoped<T>(scope: RequestScope, fn: () => T): T {
  return runner ? runner(scope, fn) : fn();
}
