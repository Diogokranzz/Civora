# ADR-001: Arquitetura Modular Monolith com DDD

- **Status**: Aceita
- **Data**: 2026-11-10

## Contexto
O Civora abrange múltiplos subdomínios fortemente acoplados em transações de negócio (abertura de chamado + cálculo inicial de SLA + registro de auditoria + gravação no Outbox). Adotar microsserviços distribuídos no estágio inicial adicionaria complexidade operacional de rede, transações distribuídas (2PC/Saga) e latência sem ganho proporcional.

## Decisão
Adotar **Modular Monolith** em NestJS organizado por domínios de negócio (`tickets`, `sla`, `identity`, `organizations`, `service-catalog`, `knowledge-base`, `approvals`, `automations`, `assets`, `itsm`, `audit`, `integrations`, `ai`, `reports`), separando claramente:
- **Domínio puro**: entidades, aggregate roots (`TicketAggregate`, `SlaInstanceAggregate`), erros de domínio e calculadoras determinísticas (`SlaClockCalculator`) sem dependência de Prisma, HTTP ou NestJS.
- **Aplicação/Infraestrutura**: casos de uso transacionais, adapters (`StoragePort`, `KnowledgeSearchPort`, `AiProviderPort`) e publicação via Outbox.

## Consequências
- Transações ACID garantidas entre chamado, histórico, SLA, auditoria e Outbox.
- Fronteiras modulares permitem extrair módulos pesados (ex.: `ai` ou `reports`) para serviços dedicados no futuro via filas BullMQ/Outbox já existentes.

