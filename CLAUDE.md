# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

- **Framework**: Next.js 16.3.8 (App Router) with React 19.2.4
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS v4
- **Database**: Firebase (Firestore for data, Auth for authentication, Storage for files)
- **Storage**: Cloudflare R2 (uploaded via AWS SDK)
- **Payments**: PayPal (client-side via PayPal SDK, backend verification)
- **Email**: Firebase Admin SDK (server-side) + Resend (for customer emails)
- **PDF Generation**: react-pdf/renderer and jspdf (client-side), firebase-admin-pdfkit (server-side)
- **3D/Animations**: Spline (hero section), Framer Motion (page transitions), Motion
- **UI Components**: Lucide React (icons), Sonner (toasts), yet-another-react-lightbox (gallery)
- **Analytics**: Vercel Analytics + Speed Insights

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Start local dev server (http://localhost:3000)
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint (config in package.json)
```

**Note**: No unit tests exist in this codebase. Manual verification needed for changes.

## gstack Skills

For web browsing and automation, use the `/browse` skill from gstack instead of `mcp__claude-in-chrome__*` tools. The gstack skill suite provides specialized agents for various tasks:

### Available gstack Skills:
- `/office-hours` - YC Office Hours — two modes
- `/plan-ceo-review` - CEO/founder-mode plan review
- `/plan-eng-review` - Eng manager-mode plan review
- `/plan-design-review` - Designer's eye plan review — interactive, like CEO and Eng review
- `/plan-devex-review` - Interactive developer experience plan review
- `/design-consultation` - Design consultation: understands your product, researches the landscape, proposes a complete design system
- `/design-shotgun` - Design shotgun: generate multiple AI design variants, open a comparison board, collect structured feedback, and iterate
- `/design-html` - Design finalization: generates production-quality Pretext-native HTML/CSS
- `/design-review` - Designer's eye QA: finds visual inconsistency, spacing issues, hierarchy problems, AI slop patterns, and slow interactions — then fixes them
- `/review` - Pre-landing PR review
- `/deslop-shared-libs` - Find worthwhile shared-code extractions in recent work
- `/test-audit` - Find low-value or duplicate tests and the test-only code they keep alive
- `/ship` - Ship workflow: detect + merge base branch, run tests, review diff, bump VERSION, update CHANGELOG, commit, push, create PR
- `/eval-plan` - Preregister a paid eval, dry-run it at zero cost, then run a three-item priced pilot whose spend table gates approval
- `/land-and-deploy` - Land and deploy workflow
- `/canary` - Post-deploy canary monitoring
- `/benchmark` - Web performance regression detection
- `/browse` - Drive a real browser through Aside: open a page, read it, click through a flow, take screenshots, check console errors
- `/connect-chrome` - Launch GStack Browser — AI-controlled Chromium with the sidebar extension baked in
- `/qa` - Fix browser/API/CLI/job/worker/webhook bugs
- `/qa-only` - Report browser/API/CLI/job/worker/webhook bugs
- `/scrape` - Pull data from a web page through the Aside browser — your real, already signed-in sessions
- `/setup-browser-cookies` - Import cookies from your real Chromium browser into the headless browse session
- `/setup-deploy` - Configure deployment settings for /land-and-deploy
- `/setup-gbrain` - Set up gbrain for this coding agent: install the CLI, initialize a local PGLite or Supabase brain, register MCP, capture per-remote trust policy
- `/retro` - Weekly engineering retrospective
- `/investigate` - Systematic debugging with root cause investigation
- `/document-release` - Release documentation audit
- `/document-generate` - Generate missing documentation from scratch for a feature, module, or entire project
- `/codex` - OpenAI Codex CLI wrapper — three modes
- `/cso` - Security audit: supported static findings; qualified profiles add reproduction and repair candidates
- `/autoplan` - Auto-review pipeline — reads the full CEO, design, eng, and DX review skills from disk and runs them sequentially with auto-decisions using 6 decision principles
- `/plan-devex-review` - Live developer experience audit
- `/careful` - Safety guardrails for destructive commands
- `/freeze` - Restrict file edits to a specific directory for the session
- `/guard` - Full safety mode: destructive command warnings + directory-scoped edits
- `/unfreeze` - Clear the freeze boundary set by /freeze, allowing edits to all directories again
- `/gstack-upgrade` - Upgrade gstack to the latest version
- `/learn` - Manage project learnings

## Directory Structure

```
src/
├── app/
│   ├── api/                          # Server-side API routes
│   │   ├── admin/                    # Admin-only endpoints
│   │   ├── paypal/                   # PayPal integration
│   │   ├── r2/                       # R2 file uploads
│   │   ├── requests/[id]/            # Request-specific operations
│   │   └── send-*.ts                 # Email sending endpoints
│   ├── admin/                        # Admin dashboard (protected by AdminGuard)
│   │   ├── AdminGuard.tsx            # HOC protecting admin routes (auth + role check)
│   │   ├── layout.tsx                # Admin sidebar navigation
│   │   ├── dashboard/                # Admin dashboard pages
│   │   ├── requests/                 # Request management
│   │   ├── purchasing/               # Purchasing workflow
│   │   └── warehouse/                # Warehouse operations
│   ├── (platform)/                   # Public layout wrapper
│   ├── login/                        # Authentication pages
│   ├── track/                        # Tracking page
│   ├── layout.tsx                    # Root layout (PayPalProvider, ThemeProvider, Toaster)
│   └── page.tsx                      # Landing page
├── components/
│   ├── admin/                        # Admin-specific components
│   ├── checkout/                     # Checkout flow components
│   ├── landing/                      # Landing page sections
│   ├── payment/                      # Payment components
│   ├── request/                      # Request management UI
│   ├── support/                      # Support system
│   └── ui/                           # General UI components
├── lib/
│   ├── pdf/                          # PDF generation utilities
│   └── *.ts                          # Shared utilities (firebase, firestore, email, etc.)
└── types/                            # TypeScript type definitions
```

## Key Architectural Patterns

### Firebase Integration
- **Client-side**: Uses Firebase Web SDK (from `@/lib/firebase`)
- **Server-side**: Uses Firebase Admin SDK (from `@/lib/firebaseAdmin`)
- **Authentication**: Guard logic lives in `AdminGuard.tsx` and purposeful auth providers
- **User Profiles**: Stored in `users` collection; role field determines access
- **Query Strategy**: Firestore queries must execute client-side (use `useEffect`), move `getDocs` to component level, not at top-level query

### Route Protection
- **Admin Guard Pattern**: `src/app/admin/AdminGuard.tsx` ensures users have Firebase Auth AND role="admin"
- **Layout HOC Pattern**: `(platform)/layout.tsx`, `AdminGuard`, `PayPalProvider`, `ThemeProvider` wrap children components

### API Route Structure
- All API routes use standard Next.js App Router pattern: `GET | POST | PATCH` methods exporting route handlers
- Data fetching in API routes should use Firebase Admin SDK (no auth check needed on server)
- Request validation/checks happen at API level, not component level where possible

### PayPal Integration
- Client SDK wrapped in `PayPalProvider` component
- Payment flow: Create order → Capture/verify → Update request → Send confirmation email
- Order capture verified in `src/app/api/paypal/capture-order/route.ts`

### Data Flow
1. **Requests**: Native Firestore documents in `requests` collection
2. **Status Tracking**: `statusHistory` timestamps on Request type
3. **Email**: Triggers via API endpoints (`/api/send-*.ts`) called from components
4. **PDF Documents**: Generated via `react-pdf/renderer` (client) or `firebase-admin` (server)

### Path Aliases
- `@/*` → `./src/*` (configured in tsconfig.json)

## Environment Variables

Critical env vars required:
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (client-side PayPal)
- `PAYPAL_CLIENT_ID` (server-side PayPal)
- `PAYPAL_SECRET` (server-side PayPal)
- Firebase config in `@/lib/firebase.ts` (development only, not committed)
- Firebase Admin config in `@/lib/firebaseAdmin.ts` (production only, not committed)
- `RESEND_API_KEY` (for customer emails)
- R2/CLOUDFLARE_ACCOUNT_ID and R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY (for uploads)

## Important Configuration

### next.config.ts
- React Strict Mode **disabled** to prevent WebGPU texture destruction on mount

### tailwind.config.ts
- Uses Tailwind v4 (new PostCSS-based engine)

## Code Organization Principles

- **Extract shared DOM**: Share actual DOM across views (panel composition in `/admin/request/panels/`)
- **Standard naming**: Components named `PascalCase`, files mixed but follow patterns
- **Admin Pages**: Heavily refactored with tabbed/split-panes for specialized workflows
- **Dashboard**: Component-based stats with recharts visualization

### DO
- Add missing env var where clear
- Follow HOC pattern for route protection (AdminGuard)
- Use Firebase Admin SDK in API routes
- Leverage existing utility functions in `src/lib/*`
- Use centralized types in `src/types/*`

### DON'T
- Add test files unless specifically requested (none exist)
- Duplicate layout HOCs (use AdminGuard pattern)
- Apply the "skip features, options" philosophy to admin functionality—admin workflows are specific and purposeful
- Commit Firebase or PayPal secrets to repo

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
