# Guia de Deploy, Ambientes e Estratégia de Migrações

## Ambientes Suportados
- `development`: Docker Compose local com hot-reload ou imagens locais, MinIO e Mailpit.
- `test`: Banco PostgreSQL isolado via Testcontainers para suíte de integração e Playwright E2E.
- `staging`: Espelho de produção com cookies `Secure=true`, HSTS habilitado, S3 gerenciado e OIDC Keycloak.
- `production`: Imagens multi-stage não-root (`USER civora`), secrets injetados por cofre externo (Vault / KMS), PostgreSQL gerenciado com backups PITR e Redis persistente.

## Estratégia Segura de Migrações & Rollback
1. **Expand-and-Contract**:
   - Nunca remova ou renomeie colunas em uso no mesmo deploy da aplicação.
   - Primeiro adicione colunas opcionais (`NULL`) ou novas tabelas; faça deploy da API compatível; realize backfill; só em release posterior remova o legado.
2. **Execução antes do tráfego**:
   - Execute `pnpm --filter @civora/api db:migrate:deploy` como job pré-deploy antes de rotacionar réplicas da API/Worker.
3. **Rollback**:
   - Em falhas de aplicação compatíveis com o schema expandido, reverta imediatamente a tag da imagem Docker (`api`, `worker`, `web`).
   - Caso uma migração falhe parcialmente, consulte `_prisma_migrations`, restaure o snapshot pré-deploy do PostgreSQL ou execute script de compensação validado em staging e marque `prisma migrate resolve --rolled-back <migration_name>`.

