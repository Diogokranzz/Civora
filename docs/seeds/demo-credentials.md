# Credencial Inicial — Civora Enterprise ITSM

O estado inicial do banco de dados é provisionado de forma limpa, sem dados fictícios de empresas, chamados, departamentos ou equipes pré-populados.

Apenas **1 (um) usuário único** é criado no bootstrap para permitir a configuração completa pela interface:

| Nome | E-mail | Senha Inicial (`CIVORA_ADMIN_PASSWORD`) | Perfil RBAC | Organização Raiz |
|---|---|---|---|---|
| Administrador PRO | `admin.pro@civora.local` | `Civora@2026!` | `OrganizationOwner` (`PlatformAdmin`) | `Civora Corporativo` (`civora-corporativo`) |

## Próximos passos após o login

1. Acesse **Departamentos** (`/organization`) para cadastrar suas **Unidades**, **Departamentos**, **Equipes de Atendimento** e **Membros & Perfis RBAC**.
2. Acesse **Configurações** (`/settings`) ou **Painel de SLA** (`/sla`) conforme a necessidade operacional da sua organização.
3. Acesse **Chamados** (`/tickets`) ou **Portal do Solicitante** (`/portal`) para registrar e operar seus chamados reais.
