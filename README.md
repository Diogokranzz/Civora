# Civora : Plataforma Corporativa de Chamados, SLA & Operações ITSM

## O que é o projeto?

O **Civora** é uma plataforma corporativa **multi-tenant** de **Enterprise Service Management (ITSM / ESM)** desenvolvida em arquitetura **Modular Monolith** (Next.js 15, NestJS 11, BullMQ Worker, PostgreSQL 16 e Redis 7) para unificar chamados, incidentes, políticas comerciais de SLA, topologia de ativos CMDB, catálogo de serviços, aprovações, automações orientadas a eventos, base de conhecimento e auditoria LGPD em um único núcleo operacional em tempo real.

## Para quem é o projeto?

O Civora foi projetado para **empresas, Centrais de Serviços Compartilhados (CSC), times de Tecnologia, Infraestrutura/SRE e departamentos corporativos** que precisam substituir planilhas, e-mails dispersos ou ferramentas legadas por uma operação rastreável com governança por organização, unidade operacional, departamento e equipe:

- **Setores Corporativos Atendidos:** Tecnologia da Informação (TI), Infraestrutura & Cloud, Segurança da Informação (InfoSec / SOC), Engenharia de Sistemas, Dados & BI, Central de Serviços (CSC), Facilities & Infraestrutura Predial, Manutenção, Recursos Humanos, Financeiro & Controladoria, Compras & Suprimentos, Operações Administrativas, Jurídico & Compliance (LGPD) e Logística & Patrimônio.
- **Perfis e Responsabilidades (RBAC):** Administradores de Organização, Gestores de SLA e Operações, Agentes/Especialistas, Aprovadores de Mudança/Acesso, Auditores de Compliance e Solicitantes finais no portal dedicado.

## Diferenciais

- **Isolamento Multi-Tenant & Governança RBAC Bidirecional:** Segmentação estrita por organização, unidade e departamento diretamente no filtro SQL (`WHERE`), com validação bidirecional (`source` + `target`) ao vincular dependências no CMDB e cache Redis restrito a coordenadas espaciais anônimas (`[x, y, z]`) sem exposição de metadados entre setores.
- **Motor Determinístico de SLA em Calendário Comercial:** Cálculo de primeira resposta, atualização e resolução respeitando o fuso horário de cada unidade operacional, janelas de expediente, feriados cadastrados, pausas automáticas em aguardos e escalonamento assíncrono via BullMQ.
- **Topologia CMDB 3D com Análise de Impacto em Cascata:** Mapeamento espacial interativo em `/itsm` carregado sob demanda (`next/dynamic`) para simular falhas em cascata entre roteadores, switches, servidores, bancos de dados e aplicações críticas, mantendo a tabela operacional de chamados leve e de alta densidade.
- **Resiliência em Produção (Circuit Breaker & Backpressure):** Proteção `opossum` com fallback transparente no PostgreSQL/DataLoader caso o Redis fique indisponível, além de coalescing WebSocket no navegador (`RealtimeEventBatcher` com controle de fila `maxQueueDepth` validado por testes de carga `k6` com `INP` responsivo).
- **Observabilidade Ponta a Ponta, Segurança & LGPD:** Tracing distribuído Browser -> NestJS -> PostgreSQL via OpenTelemetry (`W3C traceparent`), métricas Prometheus/Grafana, logs estruturados Pino, autenticação `scrypt` com JWT curto e refresh rotativo em cookie `HttpOnly`, MFA TOTP, idempotência (`Idempotency-Key`), locks otimistas e trilha imutável de auditoria.

---

## Sumário

1. [Arquitetura e Stack Tecnológica](#arquitetura-e-stack-tecnológica)
2. [Estrutura do Monorepo](#estrutura-do-monorepo)
3. [Módulos de Domínio da API](#módulos-de-domínio-da-api)
4. [Execução Rápida com Docker Compose](#execução-rápida-com-docker-compose)
5. [Portas e Serviços em Execução](#portas-e-serviços-em-execução)
6. [Bootstrap Inicial e Acesso Único](#bootstrap-inicial-e-acesso-único)
7. [Desenvolvimento Local (Sem Docker para App)](#desenvolvimento-local-sem-docker-para-app)
8. [Qualidade, Testes e Validação](#qualidade-testes-e-validação)
9. [Segurança, Multi-Tenancy e Observabilidade](#segurança-multi-tenancy-e-observabilidade)
10. [Documentação Técnica](#documentação-técnica)

---

## Arquitetura e Stack Tecnológica

O repositório segue uma arquitetura de **Monorepo** (Turborepo + pnpm workspaces) com **Modular Monolith** no backend orientado a **Domain-Driven Design (DDD)**, **Clean Architecture** e **SOLID**, isolando regras de domínio de frameworks, banco de dados e mensageria.

| Camada                     | Stack e Tecnologias                                                                                                                                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend (`apps/web`)**  | Next.js 15 (App Router), React 19, TypeScript (`strict`), Tailwind CSS, `@civora/ui`, `@civora/ui-spatial` (motor CMDB 3D carregado via `next/dynamic`), TanStack Query, TanStack Table, React Hook Form + Zod, Zustand, Recharts, Socket.IO Client (`RealtimeEventBatcher`), OpenTelemetry Browser SDK + Web Vitals |
| **Backend (`apps/api`)**   | NestJS 11, TypeScript, Prisma ORM (`@prisma/instrumentation`), DataLoader, Circuit Breaker (`opossum`), PostgreSQL 16, Redis 7, Socket.IO (`/realtime`), Helmet/CSP, ThrottlerGuard, RFC 9457 Problem Details, OpenAPI/Swagger (`/api/docs`), Pino JSON Logs                                                         |
| **Worker (`apps/worker`)** | BullMQ + Redis para relay transacional de Outbox, avaliação periódica de instâncias de SLA, motor de automações com proteção contra loops e DLQ, envio de e-mails e webhooks assinados (`HMAC-SHA256`)                                                                                                               |
| **Storage S3**             | Compatível com Amazon S3 em produção e servidor S3 local via `pgsty/silo` (MinIO-compatible) no `docker-compose.yml` para anexos privados                                                                                                                                                                            |
| **Observabilidade & Dev**  | OpenTelemetry Collector (`OTLP gRPC/HTTP` com propagação W3C `traceparent` Browser -> NestJS -> PostgreSQL), Prometheus (`/metrics`), Grafana (dashboards provisionados incluindo correlação k6/INP/FPS), Mailpit (SMTP local e caixa de entrada web)                                                                |
| **Qualidade & CI/CD**      | ESLint (`jsx-a11y`, `typescript-eslint`), Vitest (unitário e integração com Testcontainers PostgreSQL real), Playwright + `@axe-core/playwright` (E2E e WCAG 2.2 AA), k6 (teste de carga), GitHub Actions + Trivy                                                                                                    |

---

## Estrutura do Monorepo

```text
.
├── .github/workflows/
│   ├── ci.yml                  # Lint, typecheck, unitários, build, integração e scan Trivy
│   └── cd.yml                  # Build de imagens e fluxo de entrega contínua
├── apps/
│   ├── api/                    # API REST v1, domínio ITSM, Prisma schema/migrations/seed e Socket.IO
│   ├── web/                    # Interface operacional, portal do solicitante, relatórios e governança
│   └── worker/                 # Processador assíncrono BullMQ (Outbox, SLA ticker, automações, e-mail, webhooks)
├── packages/
│   ├── config/                 # Schemas Zod de ambiente, matriz RBAC, relógio comercial de SLA e motor de regras
│   ├── eslint-config/          # Presets compartilhados de ESLint (base, Next.js + jsx-a11y, NestJS)
│   ├── sdk/                    # Cliente SDK HTTP tipado para consumo de /api/v1
│   ├── testing/                # Fábricas determinísticas e utilitários compartilhados de teste
│   ├── tsconfig/               # Configurações base strict de TypeScript por plataforma
│   ├── types/                  # Contratos DTO, enums de domínio, eventos WebSocket e RFC 9457
│   ├── ui/                     # Biblioteca de componentes reutilizáveis acessíveis (Card, Badge, Button, EmptyState)
│   └── ui-spatial/             # Design System CMDB 3D e motion isolado em Dumb Components puros e subpath exports (`./cmdb`, `./empty`, `./motion`, `./kpi`, `./button`, `./math`)
├── infra/observability/        # Configurações de OpenTelemetry Collector, Prometheus e Grafana
├── docs/                       # ADRs, diagramas C4, ERD, fluxos operacionais, threat model e guias
├── tests/load/                 # Scripts de carga e backpressure k6 (civora-k6.js, civora-backpressure-k6.js)
├── docker-compose.yml          # Stack completa containerizada (11 serviços / 10 containers ativos contínuos)
├── package.json                # Scripts globais do Turborepo e gerenciamento de banco
└── turbo.json                  # Pipeline de build, lint, typecheck e test
```

---

## Módulos de Domínio da API

Localizados em `apps/api/src/modules/`:

| Domínio                                                            | Responsabilidade                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity`                                                         | Autenticação (`scrypt`), JWT de curta duração, refresh token rotativo em cookie `HttpOnly`, MFA TOTP, OIDC opcional, guarda de tenant (`AuthAndTenantGuard`) e decorators `@RequirePermissions`                                                                 |
| `organizations`, `units`, `departments`, `teams`, `users`, `roles` | Gestão multi-tenant, estrutura física/operacional, filas de atendimento e controle de acesso baseado em funções (RBAC)                                                                                                                                          |
| `tickets`, `service-catalog`, `approvals`                          | Ciclo completo de chamados, matriz Impacto x Urgência, sequência atômica (`CIV-YYYY-NNNNNN`), idempotência, lock otimista (`version`), anexos S3, CSAT, formulários dinâmicos e workflows de aprovação                                                          |
| `sla`                                                              | Políticas de SLA por prioridade/unidade/departamento/serviço, calendários comerciais úteis, feriados, pausa automática e escalonamento                                                                                                                          |
| `itsm`, `assets`                                                   | Inventário CMDB com grafo de dependências 3D (`/itsm`), DataLoader contra queries N+1, cache Redis de layout estático, governança RBAC bidirecional em relacionamentos (`source` + `target`) e gestão de incidentes graves, problemas e mudanças (CAB/rollback) |
| `knowledge-base`                                                   | Artigos e runbooks com versionamento, revisão/publicação, visibilidade (`PUBLIC`/`INTERNAL`) e busca textual PostgreSQL FTS                                                                                                                                     |
| `automations`, `integrations`, `notifications`                     | Motor de regras `trigger -> conditions -> actions`, webhooks `HMAC-SHA256`, gateway Socket.IO `/realtime` e central de notificações                                                                                                                             |
| `reports`, `audit`, `ai`, `health`                                 | KPIs operacionais (MTTA, MTTR, cumprimento SLA, reabertura, CSAT), trilha imutável de auditoria, direitos LGPD, camada assistiva opcional de IA e probes `/health/live`, `/health/ready`, `/metrics`                                                            |

---

## Execução Rápida com Docker Compose

### Pré-requisitos

- **Docker Engine / Docker Desktop** com suporte a Compose v2
- **Node.js >= 22** e **pnpm >= 10** (para comandos locais fora dos containers)

### Passo a passo

1. Crie o arquivo de ambiente na raiz do projeto:

   ```bash
   cp .env.example .env
   ```

2. Construa e inicie todos os containers (`postgres`, `redis`, `minio`, `minio-init`, `mailpit`, `otel-collector`, `prometheus`, `grafana`, `api`, `worker`, `web`):

   ```bash
   docker compose up --build -d
   ```

   O serviço `api` executa `prisma migrate deploy` automaticamente na inicialização.

3. Execute o bootstrap inicial do banco (catálogo RBAC, estrutura organizacional padrão, política SLA base e usuário único **Administrador PRO**):

   ```bash
   docker compose exec -T api node apps/api/dist/prisma/seed.js
   ```

4. Verifique se todos os containers estão ativos e saudáveis:

   ```bash
   docker compose ps
   ```

---

## Portas e Serviços em Execução

| Serviço                              | Container               | URL / Porta Local                                             | Credenciais Locais (`dev`)                                       |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Frontend Web (Next.js)**           | `civora-web`            | `http://localhost:3000`                                       | Ver seção [Bootstrap Inicial](#bootstrap-inicial-e-acesso-único) |
| **API REST & Swagger OpenAPI**       | `civora-api`            | `http://localhost:4000` / `http://localhost:4000/api/docs`    | Bearer JWT / Cookies `HttpOnly`                                  |
| **Healthcheck & Métricas**           | `civora-api`            | `http://localhost:4000/health/ready` / `/metrics`             | Público                                                          |
| **Worker Assíncrono (BullMQ)**       | `civora-worker`         | Interno (Redis + PostgreSQL)                                  | —                                                                |
| **PostgreSQL 16**                    | `civora-postgres`       | `localhost:5432`                                              | `civora` / `civora_dev_password` (DB `civora`)                   |
| **Redis 7**                          | `civora-redis`          | `localhost:6379`                                              | —                                                                |
| **Object Storage S3 (`pgsty/silo`)** | `civora-minio`          | API `http://localhost:9000` / Console `http://localhost:9001` | `civora_minio` / `civora_minio_secret`                           |
| **Mailpit (SMTP / Webmail)**         | `civora-mailpit`        | UI `http://localhost:8025` / SMTP `1025`                      | —                                                                |
| **Prometheus**                       | `civora-prometheus`     | `http://localhost:9090`                                       | —                                                                |
| **Grafana**                          | `civora-grafana`        | `http://localhost:3001`                                       | `admin` / `civora_grafana_dev`                                   |
| **OpenTelemetry Collector**          | `civora-otel-collector` | `4317` (gRPC) / `4318` (HTTP)                                 | —                                                                |

---

## Bootstrap Inicial e Acesso Único

O seed ([apps/api/prisma/seed.ts](apps/api/prisma/seed.ts)) provisiona um estado inicial livre de chamados fictícios e com **apenas 1 usuário proprietário**:

| Usuário           | E-mail Inicial           | Senha Inicial  | Papel RBAC                                    | Organização Raiz                            |
| ----------------- | ------------------------ | -------------- | --------------------------------------------- | ------------------------------------------- |
| Administrador PRO | `admin.pro@civora.local` | `Civora@2026!` | `OrganizationOwner` (`isPlatformAdmin: true`) | `Civora Corporativo` (`civora-corporativo`) |

Para estruturar a operação logo no primeiro acesso sem precisar cadastrar taxonomia do zero, o bootstrap também provisiona em PostgreSQL:

- **10 Unidades operacionais** (`HQ-SP`, `FIL-RJ`, `FIL-MG`, `FIL-PR`, `FIL-PE`, `FIL-AM`, `CD-OPS`, `DC-PRI`, `LAB-TI`, `REMOTO`);
- **14 Departamentos corporativos** (`TI`, `INFRA`, `SEC`, `ENG`, `DADOS`, `CSC`, `FAC`, `MAN`, `RH`, `FIN`, `COM`, `ADM`, `JUR`, `LOG`);
- **20 Equipes de atendimento** vinculadas aos departamentos;
- **1 Calendário Comercial** (Seg–Sex, `08:00`–`18:00` BRT) + **1 Política de SLA Corporativa Padrão** ativa;
- **0 chamados fictícios** (`tickets = 0`), pronto para cadastro manual de membros, equipes e chamados reais via interface (`/organization`, `/tickets` e `/portal`).

As credenciais e organização raiz do bootstrap podem ser customizadas via `.env`:

- `CIVORA_ADMIN_EMAIL`
- `CIVORA_ADMIN_NAME`
- `CIVORA_ADMIN_PASSWORD`
- `CIVORA_ROOT_ORG_NAME`
- `CIVORA_ROOT_ORG_SLUG`

Para resetar o banco em Docker e reaplicar o estado limpo:

```bash
docker compose exec -T api ./apps/api/node_modules/.bin/prisma migrate reset --force --skip-seed --schema=apps/api/prisma/schema.prisma
docker compose exec -T api node apps/api/dist/prisma/seed.js
```

Consulte também [docs/seeds/demo-credentials.md](docs/seeds/demo-credentials.md).

---

## Desenvolvimento Local (Sem Docker para App)

Para rodar `web`, `api` e `worker` em modo watch diretamente no host (com PostgreSQL, Redis, S3/MinIO e Mailpit em containers ou locais):

```bash
pnpm install
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Principais scripts definidos em [package.json](package.json):

| Comando                             | Finalidade                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                          | Inicia todos os apps em paralelo via Turborepo                                                                     |
| `pnpm build`                        | Compila todos os pacotes (`types`, `config`, `ui`, `ui-spatial`, `sdk`, `testing`) e apps (`api`, `worker`, `web`) |
| `pnpm lint`                         | Executa ESLint nos 9 pacotes de código (11 workspaces em escopo no Turborepo)                                      |
| `pnpm typecheck`                    | Valida tipagem TypeScript `--noEmit` em todos os workspaces com código TS                                          |
| `pnpm test`                         | Executa testes unitários nos pacotes e apps via Vitest                                                             |
| `pnpm test:integration`             | Executa testes de integração com PostgreSQL real via Testcontainers (`@civora/api`)                                |
| `pnpm test:e2e`                     | Executa suíte Playwright + auditoria WCAG 2.2 AA (`@civora/web`)                                                   |
| `pnpm format` / `pnpm format:check` | Formatação e verificação com Prettier                                                                              |

---

## Qualidade, Testes e Validação

- **Isolamento Multi-Tenant e Governança Bidirecional no CMDB**: toda consulta e mutação aplica escopo explícito por `tenantId` validado a partir do JWT e cabeçalho `x-organization-id` (HTTP `403` em acesso cruzado). Em `POST /api/v1/assets/:id/relationships` e `DELETE /api/v1/assets/:id/relationships/:relId`, o [`AssetsGovernanceService`](apps/api/src/modules/assets/assets-governance.service.ts) valida escrita em tempo de execução simultaneamente no ativo de origem (`source`) e no de destino (`target`), impedindo vínculos entre domínios/departamentos não autorizados e registrando auditoria `ASSET_RELATIONSHIP_DENIED`.
- **Otimização de Topologia (Esqueleto Redis sem Leak RBAC + DataLoader + Circuit Breaker `opossum`)**: o Redis armazena apenas o esqueleto físico anônimo de coordenadas espaciais (`civora:cmdb:skeleton:<tenantId>:coords` via `HMGET`/`HSET`), enquanto o [`AssetsGovernanceService`](apps/api/src/modules/assets/assets-governance.service.ts) aplica o filtro de unidade/departamento diretamente na query PostgreSQL e o [`AssetsTopologyService`](apps/api/src/modules/assets/assets-topology.service.ts) hidrata apenas nós e arestas autorizados via `DataLoader` (sem queries N+1 e sem vazamento cross-departamento). Falhas ou timeouts no Redis acionam o Circuit Breaker (`opossum`), degradando silenciosamente para cálculo/hidratação direta no PostgreSQL com alerta `civora_redis_circuit_open_total` (`CivoraRedisCircuitOpen`).
- **Concorrência e Idempotência**: criação de chamados suporta `Idempotency-Key` persistida em PostgreSQL e atualizações de estado utilizam versionamento otimista (`version`).
- **Acessibilidade**: regras `eslint-plugin-jsx-a11y` ativas no build de lint e validações automáticas com `@axe-core/playwright` em `apps/web/tests/e2e/civora.spec.ts`.
- **Testes de Carga e Backpressure (k6)**: scripts [tests/load/civora-k6.js](tests/load/civora-k6.js) e [tests/load/civora-backpressure-k6.js](tests/load/civora-backpressure-k6.js) simulando rajadas de violação de SLA e quedas em cascata no CMDB via WebSocket (`/realtime`) para correlação no Grafana ([infra/observability/grafana/dashboards/civora-backpressure-topology.json](infra/observability/grafana/dashboards/civora-backpressure-topology.json)) entre `civora_realtime_events_emitted_total`, lag p99 de Event Loop do Node.js e `INP` p95 (`< 200ms`).

---

## Segurança, Multi-Tenancy e Observabilidade

- Autenticação com senha `scrypt` + salt por usuário, access tokens JWT curtos (15 min padrão), refresh tokens rotativos armazenados em hash no banco via cookies `HttpOnly` / `SameSite`, bloqueio progressivo por tentativas inválidas em Redis e MFA TOTP opcional.
- Redação automática de dados sensíveis em logs Pino (`authorization`, `cookie`, `password`, `mfaCode`, `set-cookie`) e rastreamento ponta a ponta por `x-correlation-id`.
- Observabilidade Frontend e Tracing Distribuído: instrumentação `OpenTelemetry Browser SDK` exportando via OTLP/HTTP (`:4318`) Web Vitals (`LCP`, `FID`, `CLS`, `INP`, `FCP`, `TTFB`), quedas de FPS no grafo CMDB 3D (`/itsm`) e custo de renderização React `<Profiler>` em superfícies `backdrop-blur`, com correlação no Prometheus/Grafana (`/api/v1/telemetry/client`) e propagação W3C `traceparent` até queries Prisma/PostgreSQL na API.
- Resiliência do Motor de SLA em Tempo Real: relógio SLA desacoplado via `useSyncExternalStore` (`LiveSlaClockBadge`) evitando re-renderizações da grade operacional e dos canvases, somado a coalescimento/backpressure WebSocket (`RealtimeEventBatcher` com janela de `250ms` e fila limitada `maxQueueDepth: 500`).
- Conformidade LGPD com exportação de dados do titular (`/api/v1/lgpd/export/:userId`), política de retenção configurável por organização e anonimização auditada.

---

## Documentação Técnica

- **Produto**: [Visão do Produto](docs/product-vision.md) | [Credenciais Iniciais](docs/seeds/demo-credentials.md)
- **Decisões Arquiteturais (ADRs)**:
  - [ADR-001 — Modular Monolith](docs/adrs/ADR-001-modular-monolith.md)
  - [ADR-002 — Multi-Tenancy Isolation](docs/adrs/ADR-002-multi-tenancy-isolation.md)
  - [ADR-003 — Transactional Outbox & BullMQ](docs/adrs/ADR-003-outbox-and-bullmq.md)
  - [ADR-004 — SLA Business Calendar](docs/adrs/ADR-004-sla-business-calendar.md)
  - [ADR-005 — Auth Tokens & OIDC](docs/adrs/ADR-005-auth-tokens-and-oidc.md)
  - [ADR-006 — Optional AI Layer](docs/adrs/ADR-006-optional-ai-layer.md)
- **Arquitetura & Fluxos**: [Diagramas C4](docs/architecture/c4-diagrams.md) | [Modelo Entidade-Relacionamento (ERD)](docs/architecture/erd.md) | [Fluxos Operacionais](docs/flows/operational-flows.md) | [Catálogo de Eventos](docs/events/event-catalog.md)
- **API & Integrações**: [Guia da API REST v1](docs/api/api-guide.md) | [Postman Collection](docs/api/civora.postman_collection.json)
- **Operação & Segurança**: [Guia de Desenvolvimento](docs/guides/development.md) | [Guia de Deploy e Rollback](docs/guides/deployment.md) | [Threat Model (OWASP)](docs/security/threat-model.md) | [Responsabilidades LGPD](docs/security/lgpd-responsibilities.md) | [Estratégia de Testes](docs/testing/test-strategy.md) | [Runbook de Incidentes](docs/runbooks/incident-runbook.md)
