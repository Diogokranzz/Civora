'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Search, ShieldAlert, ShieldCheck, UserPlus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  TableSkeleton,
} from '@civora/ui';
import {
  EnterpriseEmptyState,
  MagneticButton,
  MotionTableBody,
  MotionTableRow,
} from '../spatial';
import {
  ASSIGNABLE_ROLE_CODES,
  createMemberSchema,
  type CreateMemberFormValues,
  type DepartmentRecord,
  extractApiErrorMessage,
  getRoleBadgeProps,
  type OrganizationMember,
  type RoleOption,
  SELECT_CONTROL_CLASS,
  type UnitRecord,
} from './organization-types';

interface RbacTableProps {
  members: OrganizationMember[];
  units: UnitRecord[];
  departments: DepartmentRecord[];
  roles: RoleOption[];
  currentUserId: string;
  isLoading: boolean;
  canManageUsers: boolean;
  onCreateMember: (values: CreateMemberFormValues) => Promise<void>;
  onUpdateMember: (
    userId: string,
    patch: { roleCode?: string; isActive?: boolean },
  ) => Promise<void>;
}

export function RbacTable({
  members,
  units,
  departments,
  roles,
  currentUserId,
  isLoading,
  canManageUsers,
  onCreateMember,
  onUpdateMember,
}: RbacTableProps) {
  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState('');
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [memberError, setMemberError] = React.useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = React.useState<string | null>(null);

  const form = useForm<CreateMemberFormValues>({
    resolver: zodResolver(createMemberSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      roleCode: 'Agent',
      defaultUnitId: '',
      departmentId: '',
    },
  });

  const availableRoleCodes = React.useMemo(() => {
    if (roles.length > 0) {
      return roles.map((r) => r.code).filter((code) => code !== 'PlatformAdmin');
    }
    return ASSIGNABLE_ROLE_CODES;
  }, [roles]);

  const filteredMembers = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((member) => {
      if (roleFilter && member.role.code !== roleFilter) return false;
      if (!q) return true;
      return (
        member.name.toLowerCase().includes(q) ||
        member.email.toLowerCase().includes(q) ||
        member.role.code.toLowerCase().includes(q) ||
        (member.defaultUnit?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [members, roleFilter, search]);

  const handleCreateSubmit = form.handleSubmit(async (values) => {
    setMemberError(null);
    try {
      await onCreateMember({
        ...values,
        defaultUnitId: values.defaultUnitId || undefined,
        departmentId: values.departmentId || undefined,
      });
      form.reset({
        name: '',
        email: '',
        password: '',
        roleCode: 'Agent',
        defaultUnitId: '',
        departmentId: '',
      });
      setShowCreateForm(false);
    } catch (err) {
      setMemberError(extractApiErrorMessage(err, 'Não foi possível cadastrar o membro.'));
    }
  });

  const handleMemberPatch = async (
    userId: string,
    patch: { roleCode?: string; isActive?: boolean },
  ) => {
    setMemberError(null);
    setUpdatingUserId(userId);
    try {
      await onUpdateMember(userId, patch);
    } catch (err) {
      setMemberError(extractApiErrorMessage(err, 'Falha ao atualizar permissões ou status do membro.'));
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#0F172A] lg:h-full lg:min-h-0">
      <CardHeader className="border-b border-slate-200/80 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              Membros da Organização & Perfis RBAC
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Controle de acesso baseado em funções com isolamento por organização e unidade operacional.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManageUsers ? (
              <MagneticButton
                size="sm"
                variant={showCreateForm ? 'outline' : 'primary'}
                onClick={() => setShowCreateForm((prev) => !prev)}
                aria-expanded={showCreateForm}
                aria-controls="member-creation-panel"
              >
                {showCreateForm ? (
                  <>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Fechar Cadastro
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    Adicionar Membro
                  </>
                )}
              </MagneticButton>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, e-mail ou unidade..."
              aria-label="Buscar membros da organização"
              className="pl-8 text-xs"
            />
          </div>

          <div className="w-full sm:w-52">
            <select
              aria-label="Filtrar membros por função RBAC"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className={SELECT_CONTROL_CLASS}
            >
              <option value="">Todas as funções RBAC</option>
              {availableRoleCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 overflow-y-auto pt-4 lg:min-h-0">
        {memberError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900 dark:border-red-900/80 dark:bg-red-950/40 dark:text-red-200"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{memberError}</span>
          </div>
        ) : null}

        {members.length === 1 && canManageUsers && !showCreateForm ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200/80 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100"
          >
            <p>
              Acesso Único Ativo: somente o <strong>Administrador PRO</strong> está cadastrado nesta organização. Adicione agentes, supervisores, aprovadores e auditores manualmente quando desejar.
            </p>
            <MagneticButton size="sm" variant="outline" onClick={() => setShowCreateForm(true)}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Cadastrar membro agora
            </MagneticButton>
          </div>
        ) : null}

        {showCreateForm && canManageUsers ? (
          <form
            id="member-creation-panel"
            onSubmit={handleCreateSubmit}
            className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5 transition-colors duration-200 ease-in-out dark:border-white/[0.08] dark:bg-slate-950"
            noValidate
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Novo Membro da Organização
              </h3>
              <Badge variant="info">Provisionamento RBAC</Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="member-name">Nome completo</Label>
                <Input
                  id="member-name"
                  placeholder="Ex: Ana Paula Costa"
                  aria-invalid={Boolean(form.formState.errors.name)}
                  {...form.register('name')}
                />
                {form.formState.errors.name ? (
                  <p className="text-xs text-red-600 dark:text-red-300">
                    {form.formState.errors.name.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="member-email">E-mail corporativo</Label>
                <Input
                  id="member-email"
                  type="email"
                  placeholder="ana.costa@empresa.com.br"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register('email')}
                />
                {form.formState.errors.email ? (
                  <p className="text-xs text-red-600 dark:text-red-300">
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="member-password">Senha inicial</Label>
                <Input
                  id="member-password"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  aria-invalid={Boolean(form.formState.errors.password)}
                  {...form.register('password')}
                />
                {form.formState.errors.password ? (
                  <p className="text-xs text-red-600 dark:text-red-300">
                    {form.formState.errors.password.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="member-role">Função RBAC</Label>
                <select
                  id="member-role"
                  aria-label="Função RBAC do novo membro"
                  className={SELECT_CONTROL_CLASS}
                  {...form.register('roleCode')}
                >
                  {availableRoleCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="member-unit">Unidade padrão</Label>
                <select
                  id="member-unit"
                  aria-label="Unidade padrão do novo membro"
                  className={SELECT_CONTROL_CLASS}
                  {...form.register('defaultUnitId')}
                >
                  <option value="">Todas as unidades</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} — {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="member-dept">Departamento</Label>
                <select
                  id="member-dept"
                  aria-label="Departamento do novo membro"
                  className={SELECT_CONTROL_CLASS}
                  {...form.register('departmentId')}
                >
                  <option value="">Não vinculado</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowCreateForm(false)}
              >
                Cancelar
              </Button>
              <MagneticButton type="submit" size="sm" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Cadastrando...' : 'Salvar Membro'}
              </MagneticButton>
            </div>
          </form>
        ) : null}

        {isLoading ? (
          <TableSkeleton rows={4} />
        ) : filteredMembers.length === 0 ? (
          <EnterpriseEmptyState
            mode="compact"
            eyebrow="RBAC & Identidade"
            title={
              members.length === 0
                ? 'Nenhum membro vinculado à organização'
                : 'Nenhum membro corresponde aos filtros atuais'
            }
            description={
              members.length === 0
                ? 'Cadastre membros operacionais e atribua seus respectivos perfis RBAC.'
                : 'Altere o termo de busca ou o filtro de função RBAC para visualizar os membros.'
            }
            action={
              members.length > 0 ? (
                <MagneticButton
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setRoleFilter('');
                  }}
                >
                  Limpar filtros
                </MagneticButton>
              ) : undefined
            }
          />
        ) : (
          <div className="min-h-[160px] flex-1 overflow-auto rounded-xl border border-slate-200/85 dark:border-white/[0.08]">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:border-white/[0.08] dark:bg-slate-950/75 dark:text-slate-300">
                  <th scope="col" className="px-4 py-3">
                    Nome
                  </th>
                  <th scope="col" className="px-4 py-3">
                    E-mail
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Função (RBAC)
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Unidade Padrão
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  {canManageUsers ? (
                    <th scope="col" className="px-4 py-3 text-right">
                      Governança
                    </th>
                  ) : null}
                </tr>
              </thead>
              <MotionTableBody>
                {filteredMembers.map((member) => {
                  const roleBadge = getRoleBadgeProps(member.role.code);
                  const isSelf = member.userId === currentUserId;
                  const isRowUpdating = updatingUserId === member.userId;

                  return (
                    <MotionTableRow key={member.membershipId}>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {member.name}
                          </span>
                          {isSelf ? (
                            <Badge variant="info">Sessão Atual</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {member.email}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant={roleBadge.variant}>{roleBadge.label}</Badge>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {member.defaultUnit?.name ?? 'Todas'}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant={member.isActive ? 'success' : 'neutral'}>
                          {member.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      {canManageUsers ? (
                        <td className="px-4 py-3.5 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <select
                              aria-label={`Alterar função RBAC de ${member.name}`}
                              value={member.role.code}
                              disabled={isSelf || isRowUpdating}
                              onChange={(e) =>
                                void handleMemberPatch(member.userId, { roleCode: e.target.value })
                              }
                              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 transition-all duration-200 ease-in-out hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            >
                              {availableRoleCodes.map((code) => (
                                <option key={code} value={code}>
                                  {code}
                                </option>
                              ))}
                            </select>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSelf || isRowUpdating}
                              aria-label={`${member.isActive ? 'Desativar' : 'Ativar'} acesso de ${member.name}`}
                              onClick={() =>
                                void handleMemberPatch(member.userId, {
                                  isActive: !member.isActive,
                                })
                              }
                            >
                              {member.isActive ? 'Desativar' : 'Ativar'}
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </MotionTableRow>
                  );
                })}
              </MotionTableBody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
