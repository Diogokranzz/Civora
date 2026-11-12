FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
WORKDIR /app

FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/config/package.json ./packages/config/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/ui-spatial/package.json ./packages/ui-spatial/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/api/prisma ./apps/api/prisma
COPY apps/worker ./apps/worker
RUN pnpm --filter @civora/types build && \
    pnpm --filter @civora/config build && \
    pnpm --filter @civora/api db:generate && \
    pnpm --filter @civora/worker build

FROM node:22-alpine AS runner
RUN addgroup -S civora && adduser -S civora -G civora
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/config/package.json ./packages/config/package.json
COPY --from=builder /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules

USER civora
CMD ["node", "apps/worker/dist/main.js"]
