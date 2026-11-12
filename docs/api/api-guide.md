# Documentação da API REST v1 — Civora

- **Base URL**: `/api/v1`
- **Swagger / OpenAPI Interativo**: `GET /api/docs`
- **Formato de Erros**: RFC 9457 Problem Details (`application/problem+json`) com `correlationId`.
- **Escopo Multi-Tenant**: Cabeçalho `x-organization-id` (ou claim `orgId` do JWT).
- **Idempotência**: Cabeçalho `Idempotency-Key` suportado em criação de chamados (`POST /api/v1/tickets`).
- **Paginação**:
  - Grids administrativos (`GET /api/v1/tickets`, `GET /api/v1/audit/logs`): paginação por página (`page`, `pageSize`).
  - Timelines (`GET /api/v1/tickets/:id/timeline`): paginação por cursor (`cursor`, `limit`).

## Política de Versionamento e Depreciação

- Endpoints versionados via prefixo `/api/v1/...`.
- Mudanças retrocompatíveis (adição de campos opcionais) mantêm `v1`.
- Quebras de contrato exigem nova rota `/api/v2/...`, cabeçalho `Deprecation` e janela mínima de 90 dias antes de descontinuação.

## Exemplos Executáveis (`curl`)

```bash
# 1. Autenticar e obter token
LOGIN_JSON=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin.pro@civora.local","password":"Civora@2026!"}')

TOKEN=$(echo "$LOGIN_JSON" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.accessToken)")
ORG_ID=$(echo "$LOGIN_JSON" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.user.activeOrganizationId)")

# 2. Listar chamados com filtros e paginação
curl -s "http://localhost:4000/api/v1/tickets?page=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-organization-id: $ORG_ID"

# 3. Criar chamado idempotente
curl -s -X POST http://localhost:4000/api/v1/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-organization-id: $ORG_ID" \
  -H "Idempotency-Key: demo-create-001" \
  -H "Content-Type: application/json" \
  -d '{"title":"Lentidão no ERP Filial Campinas","description":"<p>Tempo de resposta acima de 12s.</p>","impact":"HIGH","urgency":"MEDIUM"}'
```

Collection exportável em [civora.postman_collection.json](civora.postman_collection.json).

