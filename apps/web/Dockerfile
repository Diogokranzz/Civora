FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
WORKDIR /app

FROM base AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_WS_URL=http://localhost:4000
ARG NEXT_PUBLIC_OTEL_URL=http://localhost:4318
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_OTEL_URL=$NEXT_PUBLIC_OTEL_URL
ENV NEXT_OUTPUT_STANDALONE=true

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
COPY apps/web ./apps/web
RUN pnpm --filter @civora/types build && \
    pnpm --filter @civora/config build && \
    pnpm --filter @civora/ui build && \
    pnpm --filter @civora/ui-spatial build && \
    pnpm --filter @civora/sdk build && \
    pnpm --filter @civora/web build

FROM node:22-alpine AS runner
RUN addgroup -S civora && adduser -S civora -G civora
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

USER civora
EXPOSE 3000
CMD ["sh", "-c", "if [ -f apps/web/server.js ]; then exec node apps/web/server.js; else exec node server.js; fi"]
