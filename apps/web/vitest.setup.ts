import { vi, beforeAll, afterAll, afterEach } from 'vitest';
// jest-dom's matchers are only used by the suites that opt into happy-dom.
// Importing them for every suite made setup the single largest cost of a run
// (~70ms per file), so they are loaded only where a DOM actually exists.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');

  // React Testing Library registers its auto-cleanup once, when its module is
  // first imported. With a shared module registry that happens once per worker,
  // so later files inherited the previous file's DOM and queries matched stale
  // nodes. Registering cleanup here runs for every file, because this setup
  // module is evaluated per file.
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
  });
}

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
    };
  },
  usePathname() {
    return '/';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

// Mock Firebase. `db` lives in its own module so routes that only need auth
// do not bundle the Firestore SDK; each mock stays on the module that owns it.
vi.mock('@/lib/firebase', () => ({
  auth: {},
  app: {},
  ensureFirebaseApp: () => ({ app: {}, auth: {} }),
  getFirebaseAuth: () => ({}),
}));

vi.mock('@/lib/firebaseDb', () => ({
  db: {},
  getFirebaseDb: () => ({}),
}));

// Mock Firebase Admin
vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: {},
  adminDb: {},
}));

// Mock environment config
vi.mock('@/config/env', () => ({
  serverEnv: {
    NODE_ENV: 'test',
    FIREBASE_ADMIN_PROJECT_ID: 'test-project',
    FIREBASE_ADMIN_CLIENT_EMAIL: 'test@test.com',
    FIREBASE_ADMIN_PRIVATE_KEY: 'test-key',
    PAYPAL_CLIENT_ID: 'test-client-id',
    PAYPAL_CLIENT_SECRET: 'test-secret',
    PAYPAL_ENV: 'sandbox',
    SMTP_EMAIL: 'test@test.com',
    SMTP_PASSWORD: 'test-password',
    RESEND_API_KEY: 'test-resend-key',
    R2_ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'test-key-id',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET_NAME: 'test-bucket',
    APP_URL: 'http://localhost:3000',
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
  },
  clientEnv: {
    NODE_ENV: 'test',
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: 'test-client-id',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_FIREBASE_API_KEY: 'test-key',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'test-project',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'test-bucket',
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456',
    NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456:web:abcdef',
  },
  isProduction: false,
  isDevelopment: true,
  isTest: true,
}));

// Mock React context providers
vi.mock('@/components/ThemeProvider', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/PayPalProvider', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/AuthRedirectHandler', () => ({
  default: () => null,
}));

// Mock crypto.randomUUID for tests
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2),
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      },
    },
  });
}

// Mock Resend
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null }),
    },
  })),
}));

// Suppress console.error in tests (optional - remove if you want to see errors)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render is no longer supported') ||
        args[0].includes('act(...)'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});