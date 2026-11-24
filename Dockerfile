# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# `next build` inlines every NEXT_PUBLIC_* value into the browser bundle, so the
# values compose passes as build args have to be declared before the build step
# and exported for the build process. They are not secrets and are not copied
# into the runtime stage: the running container gets its own environment.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_PAYPAL_CLIENT_ID
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY
ARG NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG
ARG NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST
ARG NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST
ARG NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_PAYPAL_CLIENT_ID=$NEXT_PUBLIC_PAYPAL_CLIENT_ID \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=$NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY \
    NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG=$NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG \
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=$NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST \
    NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST=$NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST \
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=$NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# Manifests first so the dependency layer is cached independently of sources.
# A workspace install needs the root lockfile plus every workspace manifest.
# (packages/config is the only workspace package; ui/shared/utils were removed
# in the §2.6 orphan cleanup.)
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
RUN npm ci

# Copy source code
COPY . .

# Build the app workspace (Turbo runs the app build).
RUN npm run build

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Copy the traced standalone server. In a workspace build it lands under
# apps/web/, with the hoisted node_modules at the standalone root.
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
#
# Node makes the request itself: the runtime image carries busybox, but its
# `wget` build does not consistently support `--spider`, so that check could
# fail on an otherwise healthy container. PORT is what the server listens on.
# Use an async IIFE so top-level await works in CommonJS (default for `node -e`).
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "(async()=>{try{const r=await fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health');const s=await r.json();process.exit(r.ok&&(s.status==='healthy'||s.status==='degraded')?0:1)}catch(e){process.exit(1)}})()"

# Same entrypoint as `npm start` in apps/web; its `prestart` hook performs the
# public/ and .next/static copies that the COPYs above provide here.
CMD ["node", "apps/web/server.js"]
