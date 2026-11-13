# ShipIN — Contribution Guide

## Getting Started

### Prerequisites
- Node.js >= 20.0.0 (see `.nvmrc`)
- npm >= 10

### Local Setup

```bash
# Clone and install
git clone <repo-url>
cd shipin
npm install

# Copy environment template and fill in secrets
cp .env.example .env.local

# Start dev server
npm run dev
```

Visit `http://localhost:3000` to see the app.

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Run production build |
| `npm run lint` | ESLint checks |
| `npm test` | Run Vitest unit tests |
| `npm run test:watch` | Watch mode for tests |
| `npm run test:coverage` | Tests with coverage report |
| `npm run analyze` | Build with bundle size analysis |
| `npx playwright test` | Run Playwright E2E smoke tests |
| `npx playwright test --ui` | Interactive E2E test runner |

## Testing

All new code must include tests. Unit tests live next to the modules they cover (`*.test.ts`).

```bash
# Run all tests
npm test

# Run a single test file
npm test -- src/lib/validation.test.ts

# With coverage thresholds
npm run test:coverage
```

### E2E Tests

Playwright tests require a running dev server (started automatically by the config):

```bash
npx playwright test
npx playwright test --headed   # Visible browser for debugging
npx playwright test --ui       # Interactive UI mode
```

### Accessibility Tests

The project uses `eslint-plugin-jsx-a11y` for compile-time ARIA/semantic HTML checks. Running `npm run lint` will surface accessibility issues. For runtime axe-core scans, see the `axe-core` setup in test fixtures.

## Code Standards

- **TypeScript strict mode** is enforced — no `any` without justification
- All API routes must validate input via Zod schemas in `src/lib/validation.ts`
- All API routes must use `withErrorHandler` from `@/utils/errors`
- Auth check guards are in `src/lib/auth.ts` — use them, don't write your own
- Component names: PascalCase; Feature folders follow `src/features/<name>/` pattern

## Pull Requests

1. Create a feature branch from `main`
2. Make sure `npm test` passes before submitting
3. Update `CHANGELOG.md` under `## Unreleased` with a summary of changes
4. PR title should follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `fix:` bug fixes
   - `feat:` new features
   - `chore:` maintenance tasks
   - `security:` security improvements
   - `docs:` documentation only

## Security Reminders

- Never commit secrets or credentials — verify `.env*` is in `.gitignore`
- New API endpoints must have auth guards unless explicitly public (document why)
- New third-party dependencies should be reviewed for license and vulnerability status
