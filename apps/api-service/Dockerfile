# Build context = repo root — single stage (avoids pnpm symlink issues in production)
FROM node:22-alpine
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-types/tsconfig.json ./packages/shared-types/
COPY packages/shared-types/src/ ./packages/shared-types/src/
COPY apps/api-service/package.json ./apps/api-service/
COPY apps/api-service/tsconfig.json ./apps/api-service/
COPY apps/api-service/src/ ./apps/api-service/src/

RUN pnpm install --frozen-lockfile
RUN pnpm -F @ctm/shared-types build
RUN pnpm -C apps/api-service build

WORKDIR /app/apps/api-service
EXPOSE 3001
CMD ["node", "dist/index.js"]
