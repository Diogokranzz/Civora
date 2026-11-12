# Fluxos Operacionais Principais

## 1. Fluxo de Autenticação, Rotação de Refresh Token e Multi-Tenancy

```mermaid
sequenceDiagram
  participant U as Usuário / Browser
  participant API as Civora API
  participant Redis as Redis
  participant DB as PostgreSQL

  U->>API: POST /api/v1/auth/login (email, password, mfaCode?)
  API->>Redis: Verifica bloqueio por força bruta (auth:fail:email)
  API->>DB: Valida senha scrypt + TOTP MFA + memberships ativos
  API->>DB: Grava RefreshToken hash + familyId e AuditLog
  API-->>U: Set-Cookie HttpOnly (access + refresh) + accessToken + memberships
  U->>API: GET /api/v1/tickets (x-organization-id: orgB)
  API->>DB: Valida membership(orgB, userId) e @RequirePermissions
  API-->>U: 200 OK (dados de orgB) ou 403 Forbidden (se sem vínculo)
```

## 2. Fluxo de Criação de Chamado (Vertical Slice Completo)

```mermaid
sequenceDiagram
  participant C as Web / Portal
  participant API as TicketsController / Service
  participant Dom as TicketAggregate & SlaService
  participant DB as PostgreSQL (Tx)
  participant WS as Socket.IO

  C->>API: POST /api/v1/tickets (Idempotency-Key)
  API->>DB: Verifica chave em idempotency_keys
  API->>Dom: TicketAggregate.create() + deriva Prioridade (Impacto x Urgência)
  API->>Dom: SlaService.startSlaForTicket() via SlaClockCalculator
  API->>DB: BEGIN TX -> ticket_sequences + tickets + sla_instances + ticket_events + outbox_events + audit_logs -> COMMIT
  API->>WS: Emite ticket.created e dashboard.refresh para room tenant:{id}
  API-->>C: 201 Created (TicketDetailDto)
```

## 3. Fluxo do Relógio de SLA

1. Ao criar o chamado, a política mais específica (`service > category > department > unit > padrão`) calcula `firstResponseDueAt` e `resolutionDueAt` somando minutos úteis apenas nos turnos do calendário comercial e ignorando feriados.
2. Quando o chamado transiciona para `WAITING_CUSTOMER`, `WAITING_THIRD_PARTY` ou `WAITING_APPROVAL`, o relógio entra em `PAUSED` e registra `SlaPaused`.
3. Ao retomar para atendimento ativo, os minutos úteis transcorridos durante a pausa são adicionados às datas de vencimento e registra-se `SlaResumed`.
4. O `apps/worker` executa `processSlaEvaluationTick` periodicamente: ao atingir `warningThresholdPct`, altera para `WARNING` e emite `SlaWarningReached`; ao ultrapassar `resolutionDueAt`, altera para `BREACHED` e emite `SlaBreached`.

## 4. Fluxo das Automações & Proteção contra Loops

1. Eventos em `outbox_events` são publicados pelo worker na fila `civora-automations`.
2. O consumidor verifica `checkAutomationLoopProtection` (`depth < 5` e regra ainda não executada na cadeia `correlationId`) e checa `automation_executions.idempotency_key`.
3. Avalia todas as condições (`eq`, `neq`, `contains`, `in`, `gt`, `lt`, `is_empty`, `not_empty`) e aplica as ações configuradas.
4. Falhas repetidas executam backoff exponencial e são encaminhadas para `civora-dead-letter`.

