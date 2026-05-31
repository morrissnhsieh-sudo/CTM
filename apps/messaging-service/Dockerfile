# Build context = repo root — single stage
FROM node:22-alpine
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-types/tsconfig.json ./packages/shared-types/
COPY packages/shared-types/src/ ./packages/shared-types/src/
COPY apps/messaging-service/package.json ./apps/messaging-service/
COPY apps/messaging-service/tsconfig.json ./apps/messaging-service/
COPY apps/messaging-service/src/ ./apps/messaging-service/src/

RUN pnpm install --frozen-lockfile
RUN pnpm -F @ctm/shared-types build
RUN pnpm -F @ctm/messaging-service build

WORKDIR /app/apps/messaging-service
EXPOSE 3002
CMD ["node", "dist/index.js"]
