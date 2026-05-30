FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

# ─── Dependencies ────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
RUN pnpm install --frozen-lockfile

# ─── Build ───────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN pnpm -F @ctm/shared-types build
RUN pnpm -F @ctm/api-service build

# ─── Production image ─────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app
RUN corepack enable pnpm

COPY --from=builder /app/apps/api-service/dist ./dist
COPY --from=builder /app/apps/api-service/package.json .
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001
CMD ["node", "dist/index.js"]
