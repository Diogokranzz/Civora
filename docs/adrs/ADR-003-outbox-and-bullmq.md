# ADR-003: Transactional Outbox Pattern e Filas BullMQ

- **Status**: Aceita
- **Data**: 2026-11-10

## Contexto
Disparar notificações, webhooks ou automações diretamente após `await prisma.$transaction(...)` pode perder eventos se o processo cair ou o Redis estiver indisponível no instante pós-commit.

## Decisão
1. Eventos de domínio versionados são persistidos na tabela `outbox_events` dentro da **mesma transação SQL** da operação principal.
2. O serviço `apps/worker` realiza polling contínuo em `outbox_events` e publica jobs idempotentes (`jobId`) nas filas BullMQ (`civora-automations`, `civora-webhooks`, `civora-email`, `civora-sla-evaluation`).
3. Jobs com falha recorrente aplicam backoff exponencial e são encaminhados para `civora-dead-letter`.

## Consequências
- Garantia de entrega *at-least-once* sem perda silenciosa de eventos.
- Exige idempotência nos consumidores (garantida por `automation_executions.idempotency_key` e `jobId`).

