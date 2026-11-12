# Catálogo de Eventos de Domínio & Tempo Real

Todos os eventos persistidos em `outbox_events` e `ticket_events` seguem contrato versionado (`eventVersion: 1`) e carregam `tenantId`, `correlationId`, `causationId` e `occurredAt`.

| Evento | Versão | Origem | Consumidores |
| --- | --- | --- | --- |
| `TicketCreated` | v1 | `TicketAggregate` | Worker (Automações, Webhooks), Audit |
| `TicketAssigned` | v1 | `TicketAggregate` | Worker (Automações, Webhooks), Notificações |
| `TicketPriorityChanged` | v1 | `TicketAggregate` | Worker (Automações, Webhooks), SLA Retarget |
| `TicketStatusChanged` | v1 | `TicketAggregate` | Worker (Automações, Webhooks), SLA Pause/Resume |
| `TicketResolved` | v1 | `TicketAggregate` | Worker (Pesquisa CSAT, Webhooks) |
| `TicketClosed` | v1 | `TicketAggregate` | Worker (Webhooks, Audit) |
| `TicketReopened` | v1 | `TicketAggregate` | Worker (SLA Reopen, Webhooks) |
| `CommentAdded` | v1 | `TicketsService` | Worker (E-mail, Automações), Socket.IO |
| `SlaStarted` | v1 | `SlaInstanceAggregate` | Audit, Webhooks |
| `SlaPaused` | v1 | `SlaInstanceAggregate` | Socket.IO, Audit |
| `SlaResumed` | v1 | `SlaInstanceAggregate` | Socket.IO, Audit |
| `SlaWarningReached` | v1 | `SlaInstanceAggregate` / Worker | Worker (Escalonamento automático), Notificações |
| `SlaBreached` | v1 | `SlaInstanceAggregate` / Worker | Worker (Escalonamento crítico), Prometheus |
| `ApprovalResponded` | v1 | `ApprovalsController` | Worker (Automações, Webhooks) |

## Eventos WebSocket (Socket.IO Namespace `/realtime`)

- `ticket.created`: notifica criação de novo chamado no room `tenant:{organizationId}`.
- `ticket.updated`: atualiza tabela e detalhe do chamado em tempo real.
- `ticket.comment.added`: atualiza thread de comentários do chamado em `ticket:{ticketId}`.
- `dashboard.refresh`: invalida métricas de KPIs dos painéis ativos no tenant.
- `notification.created`: entrega notificação na Central do usuário em `user:{userId}`.
- `presence.viewing`: indica agentes visualizando o mesmo chamado.

