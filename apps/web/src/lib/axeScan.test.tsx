// @vitest-environment happy-dom
/**
 * Tests for the axe-core accessibility scan hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('axe-core', () => ({ default: { run: mocks.run } }));

vi.mock('./logger', () => ({
  logger: { warn: mocks.warn, debug: mocks.debug, info: vi.fn(), error: vi.fn() },
  childLogger: () => ({ warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

// Imported per file instead of statically: with a shared module registry the
// first importer fixes which mocks this module binds to, so a static import
// can inherit another file's stub.
let useAxeScan: typeof import('./axeScan').useAxeScan;

type Options = Parameters<typeof useAxeScan>[0];

function Harness({ options }: { options?: Options }) {
  useAxeScan(options);
  return null;
}

function violation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'color-contrast',
    description: 'Elements must meet minimum contrast',
    impact: 'serious',
    helpUrl: 'https://dequeuniversity.com/rules/color-contrast',
    nodes: [{ html: '<p>text</p>', target: ['p.text'] }],
    ...overrides,
  };
}

async function renderAndWait(options?: Options) {
  render(<Harness options={options} />);
  await vi.waitFor(() => expect(mocks.run).toHaveBeenCalled());
}

beforeEach(async () => {
  vi.resetModules();
  ({ useAxeScan } = await import('./axeScan'));
  delete (globalThis as Record<string, unknown>)['__AXE_SCAN_RUN'];
  mocks.run.mockReset();
  mocks.warn.mockReset();
  mocks.debug.mockReset();
  mocks.run.mockResolvedValue({ violations: [] });
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
    callback();
    return 1;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>)['__AXE_SCAN_RUN'];
});

describe('useAxeScan', () => {
  it('scans document.body with the default WCAG tag set', async () => {
    await renderAndWait();

    expect(mocks.run).toHaveBeenCalledWith(document.body, {
      runOnly: { type: 'tag', values: ['wcag2aa', 'best-practice'] },
    });
  });

  it('switches to the AAA ruleset when requested', async () => {
    await renderAndWait({ level: 'aaa' });

    expect(mocks.run).toHaveBeenCalledWith(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a-2.2.1'] },
    });
  });

  it('logs a debug message when the page is clean', async () => {
    await renderAndWait();

    await vi.waitFor(() =>
      expect(mocks.debug).toHaveBeenCalledWith('[AxeScan] No accessibility violations found.')
    );
  });

  it('warns with violation details when none exceed the threshold', async () => {
    mocks.run.mockResolvedValue({ violations: [violation()] });

    await renderAndWait({ maxViolations: 5 });

    await vi.waitFor(() =>
      expect(mocks.warn).toHaveBeenCalledWith(
        '[AxeScan] 1 accessibility violations detected.',
        {
          violations: [
            expect.objectContaining({
              id: 'color-contrast',
              nodes: [{ html: '<p>text</p>', target: 'p.text' }],
            }),
          ],
        }
      )
    );
  });

  it('reports threshold breaches separately', async () => {
    mocks.run.mockResolvedValue({
      violations: [violation({ nodes: [{ html: '<a>', target: ['a'] }, { html: '<b>', target: ['b'] }] })],
    });

    await renderAndWait({ maxViolations: 1 });

    await vi.waitFor(() =>
      expect(mocks.warn).toHaveBeenCalledWith(
        '[AxeScan] 2 violations exceed threshold (1).',
        {
          violations: [
            { id: 'color-contrast', impact: 'serious', helpUrl: violation().helpUrl },
          ],
        }
      )
    );
  });

  it('only scans once per page load', async () => {
    await renderAndWait();

    expect((globalThis as Record<string, unknown>)['__AXE_SCAN_RUN']).toBe(true);

    render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mocks.run).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows axe failures', async () => {
    mocks.run.mockRejectedValue(new Error('axe crashed'));

    await renderAndWait();

    await vi.waitFor(() =>
      expect(mocks.debug).toHaveBeenCalledWith(
        '[AxeScan] Skipped — axe-core unavailable or failed.',
        { reason: 'axe crashed' }
      )
    );
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});
