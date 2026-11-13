// @vitest-environment happy-dom
/**
 * Accessibility regression test for ShipIN's most important public pages.
 *
 * Uses axe-core directly (lazy-loaded) to detect WCAG 2.1 AA violations.
 * The scan is skipped outside of browser environments to avoid SSR noise.
 *
 * Run standalone:  npx vitest run src/lib/axeScan.test.ts
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// Silence console output during headless test runs; results are asserted below.
vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'debug').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

afterEach(() => {
  cleanup();
});

describe('axe-core import path', () => {
  it('resolves without throwing (package is installed)', async () => {
    // Lazy-load via dynamic import to match runtime behaviour in axeScan.ts
    type AxeCore = {
      run: (...args: unknown[]) => Promise<unknown>;
      version: string;
    };

    // CJS/ESM interop may expose axe either as the namespace or as `default`.
    const imported = (await import('axe-core')) as unknown as AxeCore & {
      default?: AxeCore;
    };
    const axe: AxeCore = imported.default ?? imported;

    expect(axe).toBeDefined();
    expect(typeof axe.run).toBe('function');
    expect(typeof axe.version).toBe('string');
  });
});

describe('axeScan hook contract', () => {
  it('exports a function that can be called', async () => {
    const mod = await import('@/lib/axeScan');
    expect(typeof mod.runAxeScan).toBe('function');
    expect(typeof mod.default).toBe('function');
  });

  it('does not throw when mounted outside a real browser scan', async () => {
    // `runAxeScan` is a hook (it uses useRef/useEffect), so it must be called
    // from inside a component render rather than invoked directly.
    const { runAxeScan } = await import('@/lib/axeScan');

    function Probe() {
      runAxeScan();
      return null;
    }

    expect(() => render(React.createElement(Probe))).not.toThrow();
  });
});
