export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const retry = async <T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
  backoff = 2
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await sleep(delay);
    return retry(fn, retries - 1, delay * backoff, backoff);
  }
};

export const timeout = <T>(
  promise: Promise<T>,
  ms: number,
  errorMessage = "Operation timed out"
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    ),
  ]);
};

/**
 * Run `tasks` with at most `concurrency` in flight, returning results in the
 * order the tasks were given rather than the order they finished.
 *
 * The previous version tried to find the settled promise with
 * `p === Promise.resolve(p).then(() => {})`, which creates a *new* promise and
 * is therefore never true: the lookup returned -1 and `splice(-1, 1)` dropped
 * whichever promise happened to be last in the array. A pending task could be
 * dropped from the tracked set, so `Promise.all` at the end no longer waited
 * for it and its result went missing from the returned array. Fixed slots of
 * workers avoid both problems: a worker claims the next index, so nothing is
 * double-counted, and the index is where the result is stored.
 *
 * A rejected task rejects the whole call once the in-flight tasks settle; the
 * tasks that had not started are not run.
 */
export const parallel = async <T>(
  tasks: Array<() => Promise<T>>,
  concurrency = 3
): Promise<T[]> => {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(
      `parallel() needs a concurrency of at least 1, got ${concurrency}`
    );
  }

  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    worker
  );
  await Promise.all(workers);

  return results;
};

export const debounce = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

export const throttle = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};
