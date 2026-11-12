# ADR-002: Isolamento Multi-Tenant e Autorização RBAC no Servidor

- **Status**: Aceita
- **Data**: 2026-11-10

## Contexto
Diferentes empresas e unidades compartilham a mesma instância da plataforma. Um usuário pode participar de múltiplas organizações com papéis diferentes (ex.: `OrganizationOwner` na Empresa A e `Auditor` na Empresa B).

## Decisão
1. Todo recurso de negócio carrega `tenant_id` indexado como prefixo em chaves compostas de consulta.
2. O `AuthAndTenantGuard` valida o JWT de curta duração, lê o cabeçalho `x-organization-id` (ou `orgId` do token) e consulta o registro ativo em `memberships (organization_id, user_id)` no banco em toda requisição autenticada.
3. Permissões são validadas no backend via `@RequirePermissions(...)`; o frontend apenas adapta a navegação visual.
4. Atribuições de chamados verificam na camada de domínio (`TicketAggregate.assign`) que agente e equipe pertencem ao mesmo `tenantId`.

## Consequências
- Impede escalonamento lateral entre organizações mesmo que o cliente manipule headers ou IDs de rota.
- Custos de verificação de membership são mínimos graças ao índice único `(organization_id, user_id)`.

