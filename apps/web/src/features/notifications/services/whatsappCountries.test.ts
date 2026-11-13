import { describe, it, expect } from 'vitest';

import { WHATSAPP_COUNTRIES } from './whatsappCountries';

describe('WHATSAPP_COUNTRIES', () => {
  it('contains flag, name and dialling code for every entry', () => {
    for (const [flag, name, code] of WHATSAPP_COUNTRIES) {
      expect(flag.length).toBeGreaterThan(0);
      expect(name.length).toBeGreaterThan(0);
      expect(code).toMatch(/^\+\d+$/);
    }
  });

  it('includes the destinations ShipIN ships to most', () => {
    const names = WHATSAPP_COUNTRIES.map(([, name]) => name);

    expect(names).toEqual(
      expect.arrayContaining(['India', 'United States', 'United Kingdom', 'United Arab Emirates'])
    );
  });

  it('has no duplicate country names', () => {
    const names = WHATSAPP_COUNTRIES.map(([, name]) => name);

    expect(new Set(names).size).toBe(names.length);
  });
});
