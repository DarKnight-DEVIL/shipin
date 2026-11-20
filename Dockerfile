# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Manifests first so the dependency layer is cached independently of sources.
# A workspace install needs the root lockfile plus every workspace manifest.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
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
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Same entrypoint as `npm start` in apps/web; its `prestart` hook performs the
# public/ and .next/static copies that the COPYs above provide here.
CMD ["node", "apps/web/server.js"]
