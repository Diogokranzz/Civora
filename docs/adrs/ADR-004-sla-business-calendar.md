# ADR-004: Motor de SLA por Calendário Comercial e Fuso Horário

- **Status**: Aceita
- **Data**: 2026-11-10

## Contexto
Subtrair datas corridas para calcular prazos de SLA gera metas irreais fora do expediente, em feriados ou quando o chamado aguarda resposta do solicitante.

## Decisão
Implementar `SlaClockCalculator` em TypeScript puro utilizando `Intl.DateTimeFormat` para resolução exata de fuso horário IANA, suportando múltiplos turnos diários (`business_hours`), feriados (`holidays`), pausas automáticas em `WAITING_CUSTOMER` / `WAITING_THIRD_PARTY` / `WAITING_APPROVAL`, compensação de minutos úteis na retomada e histórico completo em `sla_clock_events`.

## Consequências
- Cálculo determinístico e testável com relógio simulado sem dependências de serviços externos.

