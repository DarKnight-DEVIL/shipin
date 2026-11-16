/**
 * The enforcement point for route classification.
 *
 * The proxy rejects an unclassified `/api/*` request with a 500 in production,
 * and the startup validator throws for it — but a deployed bundle ships without
 * `src/`, so the boot check can only run locally. This test walks the real
 * `src/app/api` tree in every CI unit run, which is what actually makes the
 * invariant impossible to regress. It also pins the four families that were
 * misclassified (anonymous sign-in, CSP reports, and the admin-only operator
 * routes) rather than trusting the prefix table by eye.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { classifyRoute } from './routeAuth';
import {
  assertAllRoutesClassified,
  collectApiRoutePaths,
  findUnclassifiedRoutes,
  UnclassifiedRouteError,
} from './routeClassification';

const REAL_API_DIR = fileURLToPath(new URL('../app/api', import.meta.url));

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true });
});

/**
 * Build a fake app tree and return its `api` directory, the same shape the
 * startup validator is given (`<app>/src/app/api`).
 */
function makeTree(files: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'route-classification-'));
  created.push(root);
  for (const file of files) {
    const full = path.join(root, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, 'export const GET = () => new Response(null);\n');
  }
  return path.join(root, 'api');
}

describe('the real route tree', () => {
  it('has every route under src/app/api classified', () => {
    const routes = collectApiRoutePaths(REAL_API_DIR);

    // A walk that silently found nothing would make this suite pass forever.
    expect(routes.length).toBeGreaterThan(50);
    expect(findUnclassifiedRoutes(routes)).toEqual([]);
    expect(assertAllRoutesClassified(REAL_API_DIR).checked).toBe(routes.length);
  });

  it('classifies the anonymous and admin-only families that used to be wrong', () => {
    // Anonymous sign-in was 401 at the proxy before it reached the handler.
    expect(classifyRoute('/api/auth/login-intent')).toBe('public');
    expect(classifyRoute('/api/auth/password-leak-check')).toBe('public');
    // Browsers send no Authorization header on report-uri posts.
    expect(classifyRoute('/api/csp-report')).toBe('public');
    // Each of these handlers already calls requireAdmin; the proxy used to
    // treat them as unclassified and answer 500.
    expect(classifyRoute('/api/send-email')).toBe('admin');
    expect(classifyRoute('/api/whatsapp/test')).toBe('admin');
    expect(classifyRoute('/api/compliance/breach')).toBe('admin');
    expect(classifyRoute('/api/compliance/dashboard')).toBe('admin');
  });

  it('keeps the rest of the surface where it was', () => {
    expect(classifyRoute('/api/health')).toBe('public');
    expect(classifyRoute('/api/webhook')).toBe('public');
    expect(classifyRoute('/api/tracking/SHIP123')).toBe('public');
    expect(classifyRoute('/api/r2/view')).toBe('customer');
    expect(classifyRoute('/api/auth/mfa/totp/verify')).toBe('customer');
    expect(classifyRoute('/api/user/erase')).toBe('customer');
    expect(classifyRoute('/api/admin/requests/x/refund')).toBe('admin');
  });
});

describe('collectApiRoutePaths', () => {
  it('derives URL paths, keeps dynamic segments and drops route groups', () => {
    const apiDir = makeTree([
      'api/health/route.ts',
      'api/requests/[requestId]/quote/route.ts',
      'api/(internal)/support/route.ts',
      'api/health/helper.ts',
      'lib/not-an-api/route.ts',
    ]);

    expect(collectApiRoutePaths(apiDir)).toEqual([
      '/api/health',
      '/api/requests/[requestId]/quote',
      '/api/support',
    ]);
  });
});

describe('assertAllRoutesClassified', () => {
  it('throws, naming the offending routes, when one is unclassified', () => {
    const apiDir = makeTree(['api/health/route.ts', 'api/brand-new/route.ts']);

    expect(() => assertAllRoutesClassified(apiDir)).toThrow(UnclassifiedRouteError);
    expect(() => assertAllRoutesClassified(apiDir)).toThrow('/api/brand-new');
    // The classified one must not be reported alongside it.
    expect(() => assertAllRoutesClassified(apiDir)).not.toThrow('/api/health');
  });

  it('skips instead of throwing when there is no source tree', () => {
    // A deployed build has no src/; taking production down for that would be
    // worse than the gap CI already covers.
    const missing = path.join(tmpdir(), 'definitely-not-a-route-tree-9f2a');
    expect(assertAllRoutesClassified(missing)).toEqual({
      checked: 0,
      skipped: `no route source at ${missing}`,
    });
  });
});
