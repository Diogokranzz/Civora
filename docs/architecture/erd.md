# Modelo Entidade-Relacionamento (ERD) — Civora

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ UNITS : has
  ORGANIZATIONS ||--o{ DEPARTMENTS : has
  ORGANIZATIONS ||--o{ TEAMS : has
  ORGANIZATIONS ||--o{ MEMBERSHIPS : scopes
  ORGANIZATIONS ||--o{ TICKETS : isolates
  ORGANIZATIONS ||--o{ SLA_POLICIES : defines
  ORGANIZATIONS ||--o{ BUSINESS_CALENDARS : defines
  USERS ||--o{ MEMBERSHIPS : joins
  ROLES ||--o{ MEMBERSHIPS : assigns
  ROLES ||--o{ ROLE_PERMISSIONS : grants
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : maps
  TICKETS ||--o{ TICKET_COMMENTS : contains
  TICKETS ||--o{ TICKET_ATTACHMENTS : stores
  TICKETS ||--o{ TICKET_EVENTS : records
  TICKETS ||--o{ TICKET_STATUS_HISTORY : tracks
  TICKETS ||--o{ TICKET_ASSIGNMENTS : audits
  TICKETS ||--o{ SLA_INSTANCES : tracks
  SLA_INSTANCES ||--o{ SLA_CLOCK_EVENTS : logs
  TICKETS ||--o{ APPROVALS : requires
  APPROVALS ||--o{ APPROVAL_STEPS : sequences
  AUTOMATION_RULES ||--o{ AUTOMATION_EXECUTIONS : logs
  WEBHOOK_ENDPOINTS ||--o{ WEBHOOK_DELIVERIES : tracks
  KNOWLEDGE_ARTICLES ||--o{ KNOWLEDGE_ARTICLE_VERSIONS : versions
  ASSETS ||--o{ ASSET_RELATIONSHIPS : relates
```

## Principais Índices Projetados

- `tickets(tenant_id, status, created_at DESC)`: listagem principal paginada e filtros por aba.
- `tickets(tenant_id, priority, status)`: cards críticos e triagem prioritária.
- `tickets(tenant_id, assigned_team_id, status)` e `tickets(tenant_id, assignee_id, status)`: filas de equipe e agente.
- `tickets(tenant_id, unit_id, status)` e `tickets(tenant_id, due_at)`: seletor de unidade e vencimentos de SLA.
- `knowledge_articles_fts_idx` (`GIN to_tsvector('portuguese', ...)`): busca full-text na base de conhecimento.
- `outbox_events(status, next_attempt_at)`: polling eficiente do relay transacional sem varredura completa.

