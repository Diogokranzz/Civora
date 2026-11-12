# Runbook de Incidentes Operacionais — Civora

## 1. Alerta `CivoraApiDown` ou Falha em `/health/ready`
- **Diagnóstico**:
  1. Consulte `GET /health/ready` para identificar se o gargalo está em `postgres` ou `redis`.
  2. Verifique logs estruturados JSON filtrando por `"level":50` e `"correlationId"`.
- **Mitigação**:
  - Se PostgreSQL estiver saturado, verifique conexões ativas (`pg_stat_activity`) e queries lentas.
  - Se Redis estiver indisponível, o sistema mantém leitura/escrita transacional no PostgreSQL, mas filas BullMQ e rate-limit ficam pausados até restabelecimento.

## 2. Acúmulo em `outbox_events` (`status = PENDING` ou `DEAD_LETTER`)
- **Diagnóstico**:
  1. Verifique se o container `civora-worker` está ativo.
  2. Inspecione `last_error` nos registros `DEAD_LETTER`.
- **Recuperação**:
  - Após corrigir a causa (ex.: Redis offline ou endpoint de webhook fora), redefina `status = 'PENDING', attempts = 0, next_attempt_at = NOW()` nos registros elegíveis para reprocessamento idempotente.

## 3. Falha em Webhooks Externos
- Consulte `webhook_deliveries` filtrando por `status = 'FAILED'` e valide código HTTP retornado pelo consumidor. As entregas utilizam backoff exponencial automático até 5 tentativas.

