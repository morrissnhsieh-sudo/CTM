FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/collab-service/package.json ./apps/collab-service/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm -F @ctm/shared-types build
RUN pnpm -F @ctm/collab-service build

FROM node:22-alpine AS production
WORKDIR /app
RUN corepack enable pnpm
COPY --from=builder /app/apps/collab-service/dist ./dist
COPY --from=builder /app/apps/collab-service/package.json .
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 1234
CMD ["node", "dist/index.js"]
