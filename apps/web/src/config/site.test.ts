import { describe, expect, it } from 'vitest';

import { SITE_URL_FALLBACK, resolveSiteUrl } from '@shipin/config';

describe('resolveSiteUrl', () => {
  it('uses the configured origin', () => {
    expect(resolveSiteUrl('https://staging.shipin.app')).toBe('https://staging.shipin.app');
  });

  it('normalises a trailing slash and ignores a path', () => {
    expect(resolveSiteUrl('https://staging.shipin.app/some/page/')).toBe(
      'https://staging.shipin.app'
    );
  });

  it('keeps a loopback port for local previews', () => {
    expect(resolveSiteUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('falls back when the variable is unset, blank or unparseable', () => {
    for (const value of [undefined, '', '   ', 'not a url']) {
      expect(resolveSiteUrl(value)).toBe(SITE_URL_FALLBACK);
    }
  });

  it('falls back to a host that actually serves the app', () => {
    // https://shipin.co answers 410 Gone; a fallback there would put the
    // sitemap, canonicals and OG URLs on a dead domain again.
    expect(SITE_URL_FALLBACK).toBe('https://shipin-psi.vercel.app');
  });
});
