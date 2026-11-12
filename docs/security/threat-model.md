# Threat Model & Controles de Segurança (OWASP ASVS / Top 10)

| Ameaça (STRIDE / OWASP) | Vetor Potencial | Mitigação Implementada no Civora |
| --- | --- | --- |
| Broken Access Control (A01) | Usuário altera `x-organization-id` ou acessa chamado de outro tenant | `AuthAndTenantGuard` valida vínculo ativo em `memberships (organization_id, user_id)` no banco em toda requisição e escopa todas as queries por `tenantId`. |
| Escalonamento Horizontal em Portal | Solicitante consulta chamados de colegas via ID direto | `TicketsService` restringe listagem e detalhe a `requesterId == auth.userId` (ou participante/aprovador) quando o perfil não possui `tickets:read_all`. |
| Broken Authentication (A07) | Força bruta, XSS roubando token, reuso de refresh token | Bloqueio temporário em Redis após 10 falhas; access token curto (15m) + refresh rotativo em cookie `HttpOnly`/`SameSite`; detecção de reuso revoga toda a família; MFA TOTP opcional. |
| XSS & Injeção HTML (A03) | Payload malicioso na descrição ou comentário | `sanitizeRichText` (`sanitize-html`) remove scripts, handlers inline e esquemas `javascript:` antes de persistir. |
| CSV Formula Injection | Célula iniciando com `=`, `+`, `-`, `@` executada no Excel | `escapeCsvCell` prefixa apóstrofo seguro em exportações CSV. |
| Upload Malicioso & Path Traversal | Envio de executável `.exe`/`.html` ou chave `../` | Validação estrita de extensão + MIME + limite de 10 MB; chaves UUID isoladas por `tenantId/ticketId`; URLs assinadas temporárias no S3/MinIO. |
| Prompt Injection & Vazamento para IA | Texto de chamado instruindo LLM a exfiltrar segredos ou enviando CPF/tokens | `maskSensitiveInfo` redacta CPF/cartões/tokens; `sanitizeForPrompt` filtra comandos de injeção e delimita dados com `<ticket_data>`. |
| Webhook Spoofing / Replay | Terceiro forjando eventos ou reenviando payload antigo | Assinatura `x-civora-signature: t=<unix>,v1=<hmac_sha256>` com segredo cifrado via AES-256-GCM em repouso. |

