/**
 * DPDP Act metadata: consent purposes, lawful bases and statutory deadlines.
 */
import { describe, it, expect } from 'vitest';

import { PERSONAL_DATA_CATEGORIES, LAWFUL_BASES, PROCESSING_REGISTER, DATA_SUBJECT_RIGHTS } from './dpdp';
import { RIGHTS_DEADLINES } from './rights';


describe('compliance dpdp types', () => {
  it('exports the expected personal data categories', () => {
    expect(Object.keys(PERSONAL_DATA_CATEGORIES)).toEqual([
      'ACCOUNT',
      'SHIPPING',
      'ORDER',
      'PAYMENT',
      'SUPPORT',
      'AUTH',
      'ANALYTICS',
      'MARKETING',
      'COOKIE',
    ]);
  });

  it('exports lawful bases', () => {
    expect(Object.keys(LAWFUL_BASES)).toEqual([
      'CONSENT',
      'CONTRACT',
      'LEGAL_OBLIGATION',
      'VITAL_INTERESTS',
      'PUBLIC_TASK',
      'LEGITIMATE_INTERESTS',
    ]);
  });

  it('PROCESSING_REGISTER covers every category', () => {
    for (const category of Object.values(PERSONAL_DATA_CATEGORIES)) {
      const entry = PROCESSING_REGISTER[category];
      expect(entry).toBeDefined();
      expect(entry.purposes).toBeInstanceOf(Array);
      expect(entry.thirdParties).toBeInstanceOf(Array);
      expect(entry.safeguards).toBeDefined();
    }
  });

  it('RIGHTS_DEADLINES covers every data subject right', () => {
    for (const right of Object.values(DATA_SUBJECT_RIGHTS)) {
      const deadline = RIGHTS_DEADLINES[right];
      expect(deadline).toBeGreaterThan(0);
      expect(typeof deadline).toBe('number');
    }
  });
});
