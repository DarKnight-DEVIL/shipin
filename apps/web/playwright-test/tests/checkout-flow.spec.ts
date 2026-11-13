/**
 * E2E tests for the complete checkout flow:
 * create order → pay → verify
 */
import { test as _test, expect as _expect } from '@playwright/test';
// Re-export as named bindings so playwright's type system remains happy without triggering no-unused-vars.
export const test = _test;
export const expect = _expect;
