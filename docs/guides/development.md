# Guia de Desenvolvimento — Civora

## Pré-requisitos
- Node.js `>= 22.0.0`
- pnpm `12.9.1` (via Corepack: `corepack enable`)
- Docker + Docker Compose (para PostgreSQL 16, Redis 7, MinIO, Mailpit e stack de observabilidade)

## Fluxo Inicial
1. Instale dependências: `pnpm install`
2. Copie `.env.example` para `.env` na raiz e em `apps/api/.env` se rodar fora do Compose.
3. Suba a infraestrutura base:
   ```bash
   docker compose up -d postgres redis minio minio-init mailpit
   ```
4. Gere o Prisma Client, aplique migrações e execute o seed:
   ```bash
   pnpm db:generate
   pnpm --filter @civora/api db:migrate:deploy
   pnpm db:seed
   ```
5. Inicie em modo desenvolvimento:
   ```bash
   pnpm dev
   ```

## Convenções de Qualidade
- TypeScript em modo `strict` (`noImplicitAny`, `noUncheckedIndexedAccess`).
- Proibido uso de `any`, `@ts-ignore` e supressões de lint.
- Toda nova rota na API exige `@RequirePermissions(...)` (ou `@Public()` devidamente justificado) e validação com Zod.
- Toda alteração crítica deve emitir evento de domínio no Outbox e registro em `audit_logs`.

