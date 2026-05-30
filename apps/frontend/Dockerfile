FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

# ─── Dependencies ────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/frontend/package.json ./apps/frontend/
RUN pnpm install --frozen-lockfile

# ─── Development ─────────────────────────────────────────────
FROM deps AS development
COPY . .
WORKDIR /app/apps/frontend
EXPOSE 3000
CMD ["pnpm", "dev"]

# ─── Production build ─────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN pnpm -F @ctm/shared-types build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm -F @ctm/frontend build

# ─── Production runtime ───────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
