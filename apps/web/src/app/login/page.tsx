'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Layers3,
  Lock,
  Mail,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sun,
  User,
  UserPlus,
  Workflow,
} from 'lucide-react';
import type { AuthenticatedUser } from '@civora/types';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge, Button, Input, Label } from '@civora/ui';
import {
  AmbientBackdrop,
  CivoraLogo,
  MagneticButton,
  StaggerDiv,
  StaggerSection,
  StaggerUl,
} from '../../components/spatial';
import { ApiClientError, civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

const NON_ADMIN_ROLE_OPTIONS = [
  {
    code: 'Requester',
    label: 'Solicitante',
    hint: 'Acesso ao Portal do Solicitante para abrir e acompanhar chamados.',
  },
  {
    code: 'Agent',
    label: 'Agente de Atendimento',
    hint: 'Tratativa de fila operacional, chamados, SLA e base de conhecimento.',
  },
  {
    code: 'Supervisor',
    label: 'Supervisor',
    hint: 'Escalonamento, aprovações operacionais e supervisão de equipe.',
  },
  {
    code: 'Approver',
    label: 'Aprovador',
    hint: 'Decisão formal de mudanças e solicitações pendentes.',
  },
  {
    code: 'ServiceManager',
    label: 'Gestor de Serviços',
    hint: 'Catálogo de serviços, políticas de SLA e regras ITSM.',
  },
  {
    code: 'Auditor',
    label: 'Auditor',
    hint: 'Leitura de relatórios executivos e trilha imutável de auditoria LGPD.',
  },
] as const;

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido'),
  password: z.string().min(6, 'A senha deve conter no mínimo 6 caracteres'),
  mfaCode: z.string().optional(),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome completo').max(160),
  email: z.string().trim().email('Informe um e-mail válido'),
  password: z.string().min(8, 'A senha deve conter no mínimo 8 caracteres').max(128),
  roleCode: z.enum(['Requester', 'Agent', 'Supervisor', 'Approver', 'ServiceManager', 'Auditor']),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

const ARCHITECTURE_LAYERS = [
  {
    icon: Layers3,
    title: 'Central de Chamados & Incidentes',
    description: 'Matriz Impacto x Urgência, idempotência e timeline em tempo real.',
    tag: 'REST / Socket.IO',
  },
  {
    icon: Activity,
    title: 'Motor de SLA & Escalonamento',
    description: 'Calendários comerciais, pausa automática e alertas preventivos.',
    tag: 'BullMQ Worker',
  },
  {
    icon: ShieldCheck,
    title: 'Governança Multi-Tenant, RBAC & LGPD',
    description: 'Isolamento por organização, MFA TOTP e trilha de auditoria imutável.',
    tag: 'PostgreSQL / Audit',
  },
] as const;

const SECURITY_GUARANTEES = [
  'Cookies HttpOnly + Refresh Rotation',
  'RFC 9457 Problem Details',
  'OpenTelemetry + Prometheus',
] as const;

export default function LoginPage() {
  const router = useRouter();
  const setSession = useCivoraStore((s) => s.setSession);
  const theme = useCivoraStore((s) => s.theme);
  const toggleTheme = useCivoraStore((s) => s.toggleTheme);

  const [authMode, setAuthMode] = React.useState<'login' | 'register'>('login');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [needsMfa, setNeedsMfa] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = React.useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', mfaCode: '' },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', roleCode: 'Requester' },
  });

  const selectedRoleCode = registerForm.watch('roleCode');
  const selectedRoleOption =
    NON_ADMIN_ROLE_OPTIONS.find((item) => item.code === selectedRoleCode) ??
    NON_ADMIN_ROLE_OPTIONS[0];

  const completeAuthentication = (res: { user: AuthenticatedUser; accessToken: string }) => {
    setSession(res.user, res.accessToken);
    const membership = res.user.memberships.find(
      (m) => m.organizationId === res.user.activeOrganizationId,
    );
    router.push(membership?.roleCode === 'Requester' ? '/portal' : '/tickets');
  };

  const onSubmit = async (values: LoginFormValues) => {
    setErrorMsg(null);
    try {
      const res = await civoraApi.login({
        email: values.email,
        password: values.password,
        mfaCode: values.mfaCode || undefined,
      });
      completeAuthentication(res);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.message.toLowerCase().includes('mfa')) {
          setNeedsMfa(true);
        }
        setErrorMsg(err.problem.detail);
      } else {
        setErrorMsg('Não foi possível conectar à API do Civora.');
      }
    }
  };

  const onRegisterSubmit = async (values: RegisterFormValues) => {
    setErrorMsg(null);
    try {
      const res = await civoraApi.register({
        name: values.name,
        email: values.email,
        password: values.password,
        roleCode: values.roleCode,
      });
      completeAuthentication(res);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(err.problem.detail);
      } else {
        setErrorMsg('Não foi possível criar a conta no Civora.');
      }
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col justify-between overflow-x-hidden bg-slate-100 text-slate-900 dark:bg-[#020617] dark:text-slate-100 lg:h-dvh lg:overflow-hidden">
      <AmbientBackdrop />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-5 pt-3 sm:px-8 sm:pt-4">
        <div className="flex items-center gap-2.5">
          <CivoraLogo size={34} />
          <div className="leading-tight">
            <span className="block text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Civora
            </span>
            <span className="block text-[10px] font-medium tracking-wide text-slate-600 dark:text-slate-300">
              Enterprise ITSM
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Badge variant="info" className="hidden sm:inline-flex">
            <Workflow className="h-3 w-3" aria-hidden="true" />
            API v1 • Tempo Real
          </Badge>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            className="h-8 w-8 border-slate-300/80 bg-white dark:border-white/[0.1] dark:bg-[#0F172A]"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-5 px-5 py-2 sm:px-8 lg:grid-cols-12 lg:gap-10">
        <StaggerSection
          aria-label="Apresentação da plataforma Civora"
          className="space-y-3.5 lg:col-span-7"
        >
          <StaggerDiv asItem className="space-y-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/80 bg-blue-50/90 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
              Plataforma Corporativa de Operações ITSM
            </span>

            <h1 className="text-2xl font-bold leading-[1.12] tracking-tight text-slate-900 sm:text-3xl lg:text-[2.1rem] dark:text-slate-50">
              Orquestre chamados, SLAs e governança{' '}
              <span className="bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 bg-clip-text text-transparent dark:from-blue-400 dark:via-sky-300 dark:to-cyan-300">
                em tempo real.
              </span>
            </h1>

            <p className="max-w-xl text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-slate-300">
              Centralize atendimento de TI, Infraestrutura, Segurança, Facilities, RH e Operações com isolamento multi-tenant, cálculo comercial de SLA e auditoria completa.
            </p>
          </StaggerDiv>

          <StaggerDiv
            asItem
            className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-md dark:border-white/[0.08] dark:bg-[#0B1326] dark:shadow-none"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/60 to-transparent"
            />

            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2 dark:border-white/[0.08]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Arquitetura Operacional Integrada
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                Serviços Prontos
              </span>
            </div>

            <div className="space-y-1.5">
              {ARCHITECTURE_LAYERS.map((layer) => {
                const Icon = layer.icon;
                return (
                  <div
                    key={layer.title}
                    className="flex flex-col gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 transition-colors duration-200 hover:border-blue-300 dark:border-white/[0.06] dark:bg-slate-950/60 dark:hover:border-sky-500/35 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-blue-200/80 bg-blue-50 text-blue-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                          {layer.title}
                        </p>
                        <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                          {layer.description}
                        </p>
                      </div>
                    </div>
                    <span className="w-fit shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-slate-700 dark:border-slate-700/80 dark:bg-slate-900 dark:text-sky-300">
                      {layer.tag}
                    </span>
                  </div>
                );
              })}
            </div>
          </StaggerDiv>

          <StaggerUl
            asItem
            aria-label="Garantias técnicas"
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300"
          >
            {SECURITY_GUARANTEES.map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </StaggerUl>
        </StaggerSection>

        <StaggerSection
          aria-label="Autenticação corporativa"
          className="lg:col-span-5"
        >
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/95 bg-white shadow-[0_2px_6px_-1px_rgba(15,23,42,0.06),0_20px_48px_-14px_rgba(15,23,42,0.16)] ring-1 ring-slate-900/[0.04] dark:border-white/[0.1] dark:bg-[#0B1326] dark:shadow-[0_24px_60px_-20px_rgba(2,6,23,0.95)] dark:ring-white/[0.04]">
            <div
              aria-hidden="true"
              className="h-[3px] w-full bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600"
            />

            <div className="px-5 pt-3.5 sm:px-7 sm:pt-4">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200/80 pb-2.5 dark:border-white/[0.08]">
                <div className="flex items-center gap-2.5">
                  <CivoraLogo size={30} />
                  <div className="leading-tight">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-900 dark:text-slate-100">
                      Civora ID
                    </span>
                    <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                      Portal Corporativo
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  TLS / HttpOnly
                </span>
              </div>

              <div
                role="tablist"
                aria-label="Modo de autenticação"
                className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-slate-200/90 bg-slate-100/90 p-1 dark:border-white/[0.08] dark:bg-slate-950/90"
              >
                <button
                  id="auth-tab-login"
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'login'}
                  onClick={() => {
                    setAuthMode('login');
                    setErrorMsg(null);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    authMode === 'login'
                      ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-800 dark:text-slate-50'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Entrar</span>
                </button>
                <button
                  id="auth-tab-register"
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'register'}
                  onClick={() => {
                    setAuthMode('register');
                    setErrorMsg(null);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    authMode === 'register'
                      ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-800 dark:text-slate-50'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Criar conta</span>
                </button>
              </div>

              <div className="mb-3 space-y-0.5">
                <h2 className="text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                  {authMode === 'login' ? 'Acessar Plataforma' : 'Criar Conta Operacional'}
                </h2>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {authMode === 'login'
                    ? 'Autenticação corporativa com isolamento multi-tenant por organização.'
                    : 'Cadastro para perfis não-administrativos com acesso imediato à função selecionada.'}
                </p>
              </div>

              {authMode === 'login' ? (
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2.5">
                  {errorMsg ? (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-2.5 text-xs leading-relaxed text-red-900 dark:border-red-900/80 dark:bg-red-950/40 dark:text-red-200"
                    >
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{errorMsg}</span>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <Label
                      htmlFor="login-email"
                      className="text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-200"
                    >
                      E-mail corporativo
                    </Label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                        aria-hidden="true"
                      />
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="username"
                        placeholder="nome@empresa.com.br"
                        className="h-9 rounded-xl border-slate-300/95 bg-white pl-10 text-sm text-slate-950 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20 dark:border-slate-700/90 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:border-slate-600"
                        {...form.register('email')}
                      />
                    </div>
                    {form.formState.errors.email ? (
                      <p className="text-xs text-red-600 dark:text-red-300">
                        {form.formState.errors.email.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label
                        htmlFor="login-password"
                        className="text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-200"
                      >
                        Senha
                      </Label>
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                        RBAC & MFA pronto
                      </span>
                    </div>
                    <div className="relative">
                      <Lock
                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                        aria-hidden="true"
                      />
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="h-9 rounded-xl border-slate-300/95 bg-white pl-10 pr-10 text-sm text-slate-950 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20 dark:border-slate-700/90 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:border-slate-600"
                        {...form.register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        className="absolute right-2 top-1.5 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {form.formState.errors.password ? (
                      <p className="text-xs text-red-600 dark:text-red-300">
                        {form.formState.errors.password.message}
                      </p>
                    ) : null}
                  </div>

                  {needsMfa ? (
                    <div className="space-y-1">
                      <Label
                        htmlFor="login-mfa"
                        className="text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-200"
                      >
                        Código MFA (TOTP 6 dígitos)
                      </Label>
                      <Input
                        id="login-mfa"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        className="h-9 rounded-xl border-slate-300/95 bg-white font-mono tracking-widest dark:border-slate-700/90 dark:bg-slate-950/90"
                        {...form.register('mfaCode')}
                      />
                    </div>
                  ) : null}

                  <div className="pt-1 pb-3.5">
                    <MagneticButton
                      type="submit"
                      size="md"
                      className="h-10 w-full rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_24px_-8px_rgba(37,99,235,0.5)]"
                      disabled={form.formState.isSubmitting}
                    >
                      <span>{form.formState.isSubmitting ? 'Autenticando...' : 'Entrar no Civora'}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </MagneticButton>
                  </div>
                </form>
              ) : (
                <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-2.5">
                  {errorMsg ? (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-2.5 text-xs leading-relaxed text-red-900 dark:border-red-900/80 dark:bg-red-950/40 dark:text-red-200"
                    >
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{errorMsg}</span>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label
                        htmlFor="register-name"
                        className="text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-200"
                      >
                        Nome completo
                      </Label>
                      <div className="relative">
                        <User
                          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                          aria-hidden="true"
                        />
                        <Input
                          id="register-name"
                          type="text"
                          autoComplete="name"
                          placeholder="Seu nome"
                          className="h-9 rounded-xl border-slate-300/95 bg-white pl-9 text-sm text-slate-950 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20 dark:border-slate-700/90 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:border-slate-600"
                          {...registerForm.register('name')}
                        />
                      </div>
                      {registerForm.formState.errors.name ? (
                        <p className="text-[11px] text-red-600 dark:text-red-300">
                          {registerForm.formState.errors.name.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <Label
                        htmlFor="register-role"
                        className="text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-200"
                      >
                        Função operacional
                      </Label>
                      <select
                        id="register-role"
                        aria-label="Função operacional (não-administrativa)"
                        className="h-9 w-full rounded-xl border border-slate-300/95 bg-white px-2.5 text-xs font-medium text-slate-950 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-400 focus-visible:border-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/20 dark:border-slate-700/90 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:border-slate-600"
                        {...registerForm.register('roleCode')}
                      >
                        {NON_ADMIN_ROLE_OPTIONS.map((role) => (
                          <option key={role.code} value={role.code}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <p className="rounded-lg border border-blue-200/80 bg-blue-50/75 px-2.5 py-1.5 text-[11px] leading-snug text-slate-700 dark:border-sky-500/25 dark:bg-sky-950/40 dark:text-slate-200">
                    <span className="font-semibold text-blue-800 dark:text-sky-300">
                      {selectedRoleOption.label}:
                    </span>{' '}
                    {selectedRoleOption.hint}
                  </p>

                  <div className="space-y-1">
                    <Label
                      htmlFor="register-email"
                      className="text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-200"
                    >
                      E-mail corporativo
                    </Label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                        aria-hidden="true"
                      />
                      <Input
                        id="register-email"
                        type="email"
                        autoComplete="email"
                        placeholder="colaborador@empresa.com.br"
                        className="h-9 rounded-xl border-slate-300/95 bg-white pl-10 text-sm text-slate-950 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20 dark:border-slate-700/90 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:border-slate-600"
                        {...registerForm.register('email')}
                      />
                    </div>
                    {registerForm.formState.errors.email ? (
                      <p className="text-[11px] text-red-600 dark:text-red-300">
                        {registerForm.formState.errors.email.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label
                        htmlFor="register-password"
                        className="text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-200"
                      >
                        Senha
                      </Label>
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                        Mín. 8 caracteres
                      </span>
                    </div>
                    <div className="relative">
                      <Lock
                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                        aria-hidden="true"
                      />
                      <Input
                        id="register-password"
                        type={showRegisterPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Mínimo 8 caracteres"
                        className="h-9 rounded-xl border-slate-300/95 bg-white pl-10 pr-10 text-sm text-slate-950 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20 dark:border-slate-700/90 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:border-slate-600"
                        {...registerForm.register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword((prev) => !prev)}
                        aria-label={showRegisterPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        className="absolute right-2 top-1.5 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      >
                        {showRegisterPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {registerForm.formState.errors.password ? (
                      <p className="text-[11px] text-red-600 dark:text-red-300">
                        {registerForm.formState.errors.password.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="pt-0.5 pb-3">
                    <MagneticButton
                      type="submit"
                      size="md"
                      className="h-10 w-full rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_24px_-8px_rgba(37,99,235,0.5)]"
                      disabled={registerForm.formState.isSubmitting}
                    >
                      <span>
                        {registerForm.formState.isSubmitting
                          ? 'Criando conta...'
                          : 'Criar conta e entrar'}
                      </span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </MagneticButton>
                  </div>
                </form>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/85 bg-slate-50/90 px-5 py-2.5 text-xs sm:px-7 dark:border-white/[0.08] dark:bg-slate-950/60">
              {authMode === 'login' ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" aria-hidden="true" />
                    Sessão HttpOnly • Token Rotativo
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      form.setValue('email', 'admin.pro@civora.local', { shouldValidate: true });
                      form.setValue('password', 'Civora@2026!', { shouldValidate: true });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-xs transition-colors hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:text-sky-300"
                  >
                    <KeyRound className="h-3 w-3" aria-hidden="true" />
                    Preencher acesso local
                  </button>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    Sem acesso administrativo • RBAC
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setErrorMsg(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-xs transition-colors hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:text-sky-300"
                  >
                    <KeyRound className="h-3 w-3" aria-hidden="true" />
                    Já tenho conta
                  </button>
                </>
              )}
            </div>
          </div>
        </StaggerSection>
      </div>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl shrink-0 flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-1 text-[11px] text-slate-500 sm:px-8 dark:text-slate-400">
        <span>Civora Enterprise ITSM • Modular Monolith Architecture</span>
        <span>Multi-Tenant • LGPD Audit • SLA Calendar Engine</span>
      </footer>
    </main>
  );
}
