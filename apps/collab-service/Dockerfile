# Build context = repo root — single stage
FROM node:22-alpine
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-types/tsconfig.json ./packages/shared-types/
COPY packages/shared-types/src/ ./packages/shared-types/src/
COPY apps/collab-service/package.json ./apps/collab-service/
COPY apps/collab-service/tsconfig.json ./apps/collab-service/
COPY apps/collab-service/src/ ./apps/collab-service/src/

RUN pnpm install --frozen-lockfile
RUN pnpm -F @ctm/shared-types build
RUN pnpm -F @ctm/collab-service build

WORKDIR /app/apps/collab-service
EXPOSE 1234
CMD ["node", "dist/index.js"]
