import { describe, expect, it } from "vitest";

import { parallel, sleep } from "./async";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Let every pending microtask and timer callback run. */
const settle = () => sleep(0);

describe("parallel", () => {
  it("runs every task and returns results in task order", async () => {
    const results = await parallel([
      async () => {
        await sleep(10);
        return "slow";
      },
      async () => "fast",
      async () => "middle",
    ]);

    expect(results).toEqual(["slow", "fast", "middle"]);
  });

  it("never runs more than `concurrency` tasks at once", async () => {
    let inFlight = 0;
    let peak = 0;
    let started = 0;

    const tasks = Array.from({ length: 10 }, () => async () => {
      started += 1;
      const id = started;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(1);
      inFlight -= 1;
      return id;
    });

    const results = await parallel(tasks, 3);

    expect(peak).toBeLessThanOrEqual(3);
    expect(results).toHaveLength(10);
    expect(new Set(results).size).toBe(10);
  });

  it("keeps the result of the task that settled first in its own slot", async () => {
    const first = deferred();
    const second = deferred();

    const promise = parallel(
      [
        async () => {
          await first.promise;
          return "first";
        },
        async () => {
          await second.promise;
          return "second";
        },
      ],
      2
    );

    // Complete them in the opposite order to the array.
    second.resolve();
    await settle();
    first.resolve();

    await expect(promise).resolves.toEqual(["first", "second"]);
  });

  it("returns [] for no tasks", async () => {
    await expect(parallel([])).resolves.toEqual([]);
  });

  it("rejects when a task rejects", async () => {
    await expect(
      parallel([
        async () => "ok",
        async () => {
          throw new Error("boom");
        },
      ])
    ).rejects.toThrow("boom");
  });

  it("rejects a concurrency below 1 instead of hanging", async () => {
    await expect(parallel([], 0)).rejects.toThrow(RangeError);
  });
});
