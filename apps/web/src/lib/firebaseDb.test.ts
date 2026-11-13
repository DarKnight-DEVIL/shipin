import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getApps: vi.fn(),
  getApp: vi.fn(),
  initializeApp: vi.fn(),
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  getApps: mocks.getApps,
  getApp: mocks.getApp,
  initializeApp: mocks.initializeApp,
}));

vi.mock('firebase/auth', () => ({
  getAuth: mocks.getAuth,
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: mocks.getFirestore,
}));

// The shared setup mocks the app's firebase modules; this file tests the real
// client wiring, so it opts out of both module mocks it would otherwise hit.
vi.unmock('@/lib/firebase');
vi.unmock('@/lib/firebaseDb');

beforeEach(() => {
  vi.resetModules();
  mocks.getApps.mockReset().mockReturnValue([]);
  mocks.getApp.mockReset();
  mocks.initializeApp.mockReset().mockReturnValue({ name: 'app' });
  mocks.getAuth.mockReset().mockReturnValue({ name: 'auth' });
  mocks.getFirestore.mockReset().mockReturnValue({ name: 'firestore' });
});

describe('firebaseDb', () => {
  it('creates the app and firestore client once, then reuses them', async () => {
    const { getFirebaseDb } = await import('./firebaseDb');

    const first = getFirebaseDb();
    const second = getFirebaseDb();

    expect(first).toBe(second);
    expect(first).toEqual({ name: 'firestore' });
    expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
    expect(mocks.getFirestore).toHaveBeenCalledTimes(1);
    expect(mocks.getFirestore).toHaveBeenCalledWith({ name: 'app' });
  });

  it('reuses a client app another module already initialized', async () => {
    mocks.getApps.mockReturnValue([{ name: 'existing' }]);
    mocks.getApp.mockReturnValue({ name: 'existing' });

    const { getFirebaseDb } = await import('./firebaseDb');

    getFirebaseDb();

    expect(mocks.initializeApp).not.toHaveBeenCalled();
    expect(mocks.getFirestore).toHaveBeenCalledWith({ name: 'existing' });
  });

  it('exports a db handle bound to the same client', async () => {
    const mod = await import('./firebaseDb');

    expect(mod.db).toEqual({ name: 'firestore' });
    expect(mocks.getFirestore).toHaveBeenCalledTimes(1);
  });
});
