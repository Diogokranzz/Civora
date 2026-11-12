# ADR-005: Autenticação JWT Curto, Refresh Rotativo HttpOnly e Adaptador OIDC

- **Status**: Aceita
- **Data**: 2026-11-10

## Contexto
Tokens de longa duração em `localStorage` ampliam o impacto de XSS, e sessões sem detecção de reuso permitem sequestro silencioso de refresh tokens.

## Decisão
1. Access tokens JWT HS256 têm TTL padrão de 15 minutos (`900s`) e são armazenados em cookie `HttpOnly` + `SameSite` + `Secure` (em produção), com suporte opcional a header `Bearer` para SDK/CLI.
2. Refresh tokens são opacos, armazenados com hash SHA-256 em `refresh_tokens` com `familyId`. Ao renovar, o token anterior é revogado e substituído; qualquer tentativa de reuso de token já revogado revoga **toda a família** e registra alerta em `audit_logs`.
3. O provedor é compatível com Keycloak/OIDC via configuração `OIDC_ENABLED=true`.

