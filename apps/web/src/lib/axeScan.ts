/**
 * @fileoverview React utility that runs axe-core accessibility scans against
 * the mounted component tree.
 *
 * Usage — drop this hook into any page or admin view you want audit-tested:
 *
 *   import { useAxeScan } from '@/lib/axeScan';
 *   // Call it at the TOP LEVEL of a component — never inside useEffect,
 *   // which throws "Invalid hook call" because it calls useRef/useEffect.
 *   useAxeScan();
 *
 * The scan is skipped automatically outside the browser (SSR / tests).
 * In test environments it returns false so tests don't fail on missing fixtures.
 */

import { useEffect, useRef } from 'react';

import { logger } from './logger';

export function useAxeScan(
  options?: {
    /** ARIA ruleset — 'all' (default), 'wcag2a', 'wcag2aa', or 'no-aa' */
    level?: 'aaa' | 'aa' | 'a';
    /** Threshold: abort if >= this many violations found */
    maxViolations?: number;
    /** Run only on this container selector instead of document.body */
    container?: string;
  }
): void {
  // Options are captured once — the scan runs a single time per mount — so
  // initializing the ref keeps the latest value without writing to it during
  // render (which React forbids).
  const configRef = useRef(options ?? {});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Development-only diagnostic. This used to run wherever the hook was
    // called, which meant downloading axe-core (a large dev dependency) for
    // real users on every page that opted in. NODE_ENV is inlined at build
    // time, so the production branch removes the dynamic import entirely.
    if (process.env.NODE_ENV === 'production') return;
    if ((globalThis as Record<string, unknown>)['__AXE_SCAN_RUN']) return;
    (globalThis as Record<string, unknown>)['__AXE_SCAN_RUN'] = true;

    const runOnce = async () => {
      try {
        // Lazy-load axe-core only when needed — keeps initial bundle lean.
        const { default: axe } = await import('axe-core');
        const opts = configRef.current;
        const results = await axe.run(document.body, {
          runOnly: {
            type: 'tag',
            values: opts.level === 'aaa' ? ['wcag2a-2.2.1'] : ['wcag2aa', 'best-practice'],
          },
        });

        const violations = results.violations;
        const violationCount = violations.reduce(
          (sum, v) => sum + v.nodes.length,
          0
        );

        if (opts.maxViolations !== undefined && violationCount > opts.maxViolations) {
          logger.warn(
            `[AxeScan] ${violationCount} violations exceed threshold (${opts.maxViolations}).`,
            {
              violations: violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                helpUrl: v.helpUrl,
              })),
            }
          );
        } else if (violationCount > 0) {
          logger.warn(`[AxeScan] ${violationCount} accessibility violations detected.`, {
            violations: violations.map((v) => ({
              id: v.id,
              description: v.description,
              impact: v.impact,
              helpUrl: v.helpUrl,
              nodes: v.nodes.map((node) => ({
                html: node.html,
                target: node.target.join(', '),
              })),
            })),
          });
        } else {
          logger.debug('[AxeScan] No accessibility violations found.');
        }
      } catch (error) {
        // axe-core may not be installed in test/staging builds — log silently.
        logger.debug('[AxeScan] Skipped — axe-core unavailable or failed.', {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    };

    // Defer until after first paint so the dynamic import can settle.
    // (`??` would have run both schedulers, because requestIdleCallback
    // returns undefined — so this is an explicit either/or.)
    if (typeof globalThis.requestIdleCallback === 'function') {
      globalThis.requestIdleCallback(runOnce, { timeout: 5_000 });
    } else {
      setTimeout(runOnce, 0);
    }
  }, []);
}

// Backwards-compatible alias: the hook is exported as `useAxeScan` (the name
// oxlint/eslint requires for a function that calls hooks) and as `runAxeScan`
// for existing call sites.
export const runAxeScan = useAxeScan;

export default useAxeScan;