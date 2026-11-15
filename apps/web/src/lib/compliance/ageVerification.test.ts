/**
 * Age calculation and child detection — pure date maths.
 */
import { describe, it, expect } from 'vitest';

import { calculateAge, isChild } from './ageVerification';


describe('compliance age verification (pure)', () => {
  it('calculateAge returns the right age for a known birthday', () => {
    // Anchor a birthday exactly one year ago plus one day to avoid
    // boundary ambiguity on the run date.
    const today = new Date();
    const dob = new Date(today.getFullYear() - 25, today.getMonth(), today.getDate() - 1);
    expect(calculateAge(dob.toISOString())).toBe(25);
  });

  it('isChild returns true for an under-18 birthday', () => {
    const today = new Date();
    const dob = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate() + 1);
    expect(isChild(dob.toISOString())).toBe(true);
  });

  it('isChild returns false for an over-18 birthday', () => {
    const today = new Date();
    const dob = new Date(today.getFullYear() - 19, today.getMonth(), today.getDate() - 1);
    expect(isChild(dob.toISOString())).toBe(false);
  });

  it('isChild returns false when DOB is omitted', () => {
    expect(isChild()).toBe(false);
  });
});
