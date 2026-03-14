# ============================================
# SEONE FRONTEND — Multi-stage Dockerfile
# Next.js 16 standalone output
# Aggressive BuildKit caching
# ============================================
# syntax=docker/dockerfile:1

# ── Stage 1: Dependencies ──
FROM node:20-alpine AS deps
WORKDIR /app

# Only copy lockfiles first — this layer is cached unless deps change
COPY package.json package-lock.json ./

# Mount npm cache across builds so repeated installs are near-instant
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

# ── Stage 2: Build ──
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Copy config files first (rarely change → cached layer)
COPY next.config.mjs tsconfig.json package.json ./

# Copy public assets (change less often than src)
COPY public ./public

# Copy source last (changes most often)
COPY src ./src

# NEXT_PUBLIC_* vars must be present at build time (baked into client JS).
# Pass via --build-arg or docker-compose args.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_DATA_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_DATABASE_URL
ARG NEXT_PUBLIC_PLUG_EDIT_URL
ARG NEXT_PUBLIC_TEMPLATE_BUILDER_URL
ARG NEXT_PUBLIC_ALLOWED_DOMAINS

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_DATA_URL=$NEXT_PUBLIC_DATA_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_DATABASE_URL=$NEXT_PUBLIC_FIREBASE_DATABASE_URL \
    NEXT_PUBLIC_PLUG_EDIT_URL=$NEXT_PUBLIC_PLUG_EDIT_URL \
    NEXT_PUBLIC_TEMPLATE_BUILDER_URL=$NEXT_PUBLIC_TEMPLATE_BUILDER_URL \
    NEXT_PUBLIC_ALLOWED_DOMAINS=$NEXT_PUBLIC_ALLOWED_DOMAINS \
    NEXT_TELEMETRY_DISABLED=1

# Mount Next.js build cache across builds — dramatically speeds up rebuilds
# when only a few source files change (Turbopack/webpack can reuse prior work)
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ── Stage 3: Runner ──
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
