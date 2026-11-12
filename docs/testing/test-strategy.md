# Estratégia de Testes & Qualidade — Civora

## Pirâmide de Verificação

1. **Testes Unitários & Domínio (`pnpm test`)**
   - `apps/api/test/unit/ticket.domain.spec.ts`: matriz Impacto × Urgência, máquina de estados completa, bloqueio de transição inválida, permissão para reabrir cancelado, isolamento de atribuição cross-tenant, override auditável.
   - `apps/api/test/unit/sla-clock.domain.spec.ts`: turnos comerciais, horário de almoço, finais de semana, feriados no fuso IANA `America/Sao_Paulo`, pausa e compensação na retomada, alerta e violação.
   - `apps/api/test/unit/automation-engine.domain.spec.ts`: todos os 8 operadores e proteção contra loop (`MAX_AUTOMATION_DEPTH` e reuso na cadeia).
   - `apps/api/test/unit/security-ai.spec.ts`: hashing `scrypt`, AES-256-GCM, sanitização XSS HTML, neutralização CSV, mascaramento PII e filtro prompt injection.
   - `apps/api/test/unit/api-rbac-tenant.spec.ts`: validação HTTP real via `AppModule` verificando 401 RFC 9457, 403 RBAC, 403 cross-tenant, escopo automático de `Requester` e idempotência.
   - `apps/worker/test/unit/worker.spec.ts`: relay transacional de Outbox e assinatura HMAC-SHA256.
   - `apps/web/tests/unit/sdk-client.spec.ts`: matriz no cliente e headers do SDK.

2. **Testes de Integração com PostgreSQL Real (`pnpm test:integration`)**
   - `apps/api/test/integration/postgres-repository.spec.ts` com `@testcontainers/postgresql` (`postgres:16-alpine`), aplicando `prisma migrate deploy` e validando isolamento entre tenants, gravação ACID no Outbox e Optimistic Locking (`version`).

3. **Testes End-to-End e Acessibilidade (`pnpm test:e2e`)**
   - `apps/web/tests/e2e/civora.spec.ts` usando Playwright + `@axe-core/playwright` (WCAG 2.2 AA).

4. **Testes de Carga (`tests/load/civora-k6.js`)**
   - Script k6 com meta `p(95) < 500ms` e taxa de falha `< 1%`.

