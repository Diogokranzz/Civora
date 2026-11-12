# Responsabilidades Técnicas e Organizacionais — LGPD

> [!IMPORTANT]
> Funcionalidades de software **não garantem conformidade jurídica automática** com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). A conformidade exige governança organizacional, base legal documentada, encarregado (DPO) e procedimentos operacionais.

## Recursos Técnicos Implementados no Civora
1. **Exportação de Dados do Titular** (`GET /api/v1/lgpd/export/:userId`): consolida dados cadastrais, vínculos, chamados abertos e comentários públicos do titular em JSON estruturado, registrando a solicitação em `lgpd_requests`.
2. **Anonimização de Titular** (`POST /api/v1/lgpd/anonymize/:userId`): desativa vínculos, revoga sessões ativas e substitui PII (`name`, `email`, `avatarUrl`, `mfaSecretEncrypted`) mantendo os registros históricos e estatísticos sem quebra referencial.
3. **Separação entre Exclusão Operacional e Retenção de Auditoria**: `audit_logs` permanece íntegro para obrigações legais e segurança, com redação automática de campos sensíveis (senhas, segredos, tokens).
4. **Registro de Consentimento** (`POST /api/v1/lgpd/consents`): grava finalidade, versão de política, concessão ou revogação.
5. **Retenção Configurável por Organização**: campo `organizations.data_retention_days` configurável por organização.

## Responsabilidades Organizacionais Obrigatórias
- Definir e revisar periodicamente as bases legais (execução de contrato, legítimo interesse, obrigação legal) para cada categoria de chamado.
- Configurar prazos de retenção compatíveis com legislação trabalhista, fiscal e regulatória de cada setor.
- Treinar agentes para não inserir dados pessoais sensíveis desnecessários em campos abertos e utilizar notas internas restritas quando aplicável.
- Manter fluxo de atendimento ao titular pelo DPO dentro do prazo legal (15 dias para confirmação/acesso).

