import type { RoleCode } from '@civora/types';
import { z } from 'zod';
import { ApiClientError } from '../../lib/api';

export interface UnitRecord {
  id: string;
  name: string;
  code: string;
  timezone: string;
  address: string | null;
  isActive: boolean;
}

export interface DepartmentRecord {
  id: string;
  name: string;
  code: string;
  unitId: string | null;
  unit?: { id: string; name: string; code: string } | null;
}

export interface TeamRecord {
  id: string;
  name: string;
  departmentId: string | null;
  supervisorId: string | null;
  department?: { id: string; name: string } | null;
  supervisor?: { id: string; name: string; email?: string } | null;
  members: Array<{ user: { id: string; name: string; email: string } }>;
}

export interface OrganizationMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  mfaEnabled: boolean;
  role: { id: string; code: string; name: string };
  defaultUnit?: { id: string; name: string; code?: string } | null;
  department?: { id: string; name: string } | null;
  isActive: boolean;
}

export interface RoleOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export const ROLE_BADGE_META: Record<
  RoleCode,
  { label: string; variant: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple' }
> = {
  PlatformAdmin: { label: 'PlatformAdmin', variant: 'danger' },
  OrganizationOwner: { label: 'OrganizationOwner', variant: 'purple' },
  Administrator: { label: 'Administrator', variant: 'info' },
  ServiceManager: { label: 'ServiceManager', variant: 'info' },
  Supervisor: { label: 'Supervisor', variant: 'warning' },
  Agent: { label: 'Agent', variant: 'purple' },
  Approver: { label: 'Approver', variant: 'success' },
  Requester: { label: 'Requester', variant: 'neutral' },
  Auditor: { label: 'Auditor', variant: 'warning' },
};

export const ASSIGNABLE_ROLE_CODES: RoleCode[] = [
  'Administrator',
  'ServiceManager',
  'Supervisor',
  'Agent',
  'Approver',
  'Requester',
  'Auditor',
  'OrganizationOwner',
];

export const TIMEZONE_OPTIONS = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Fortaleza',
  'UTC',
] as const;

export const createUnitSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe ao menos 2 caracteres para o nome da unidade')
    .max(140, 'O nome da unidade deve ter no máximo 140 caracteres'),
  code: z
    .string()
    .trim()
    .min(2, 'A sigla deve conter ao menos 2 caracteres')
    .max(32, 'A sigla deve ter no máximo 32 caracteres')
    .regex(/^[A-Za-z0-9-]+$/, 'Use apenas letras, números e hífen na sigla'),
  timezone: z.string().min(3, 'Selecione um fuso horário válido').max(64),
  address: z
    .string()
    .trim()
    .max(255, 'O endereço deve ter no máximo 255 caracteres')
    .optional(),
});

export type CreateUnitFormValues = z.infer<typeof createUnitSchema>;

export const createDepartmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe ao menos 2 caracteres para o departamento')
    .max(140, 'O nome deve ter no máximo 140 caracteres'),
  code: z
    .string()
    .trim()
    .min(2, 'A sigla deve ter ao menos 2 caracteres')
    .max(32, 'A sigla deve ter no máximo 32 caracteres')
    .regex(/^[A-Za-z0-9-]+$/, 'Use apenas letras, números e hífen na sigla'),
  unitId: z.string().optional(),
});

export type CreateDepartmentFormValues = z.infer<typeof createDepartmentSchema>;

export const createTeamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe ao menos 2 caracteres para a equipe')
    .max(140, 'O nome da equipe deve ter no máximo 140 caracteres'),
  departmentId: z.string().optional(),
  supervisorId: z.string().optional(),
});

export type CreateTeamFormValues = z.infer<typeof createTeamSchema>;

export const createMemberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome completo (mínimo 2 caracteres)')
    .max(160, 'O nome deve ter no máximo 160 caracteres'),
  email: z.string().trim().email('Informe um e-mail corporativo válido'),
  password: z
    .string()
    .min(8, 'A senha inicial deve conter ao menos 8 caracteres')
    .max(128, 'A senha deve ter no máximo 128 caracteres'),
  roleCode: z.string().min(2, 'Selecione uma função RBAC'),
  defaultUnitId: z.string().optional(),
  departmentId: z.string().optional(),
});

export type CreateMemberFormValues = z.infer<typeof createMemberSchema>;

export const SELECT_CONTROL_CLASS =
  'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 transition-all duration-200 ease-in-out hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/90 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:border-slate-600 dark:focus-visible:ring-blue-400';

export function getRoleBadgeProps(code: string): {
  label: string;
  variant: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple';
} {
  return (
    ROLE_BADGE_META[code as RoleCode] ?? {
      label: code,
      variant: 'neutral',
    }
  );
}

export function extractApiErrorMessage(err: unknown, fallback = 'Falha ao processar operação.'): string {
  if (err instanceof ApiClientError) {
    return err.problem.detail || err.message || fallback;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

