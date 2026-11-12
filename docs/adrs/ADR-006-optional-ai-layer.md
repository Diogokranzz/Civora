# ADR-006: Camada Assistiva de IA Desacoplada e Auditável

- **Status**: Aceita
- **Data**: 2026-11-10

## Contexto
Recursos de IA agregam agilidade na triagem e resumo, mas não podem comprometer a operação quando não há provedor configurado, nem expor dados pessoais (CPF, tokens) ou tomar decisões autônomas irreversíveis.

## Decisão
1. O módulo `AI` opera sob uma porta desacoplada (`AI_PROVIDER=disabled|heuristic|openai_compatible`) e pode ser desativado por organização (`organizations.ai_enabled`).
2. Todo texto passa por `maskSensitiveInfo` e `sanitizeForPrompt` antes do envio.
3. Toda saída é tratada exclusivamente como sugestão e registrada em `ai_suggestions` com provedor, modelo, versão de prompt, latência, consumo e decisão humana (`ACCEPTED` / `REJECTED`).

