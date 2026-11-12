'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, ShieldAlert, UserPlus, Users, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import {
  Badge,
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
  StaggerArticle,
  StaggerDiv,
} from '../spatial';
import {
  createTeamSchema,
  type CreateTeamFormValues,
  type DepartmentRecord,
  extractApiErrorMessage,
  type OrganizationMember,
  SELECT_CONTROL_CLASS,
  type TeamRecord,
} from './organization-types';

interface TeamListProps {
  teams: TeamRecord[];
  departments: DepartmentRecord[];
  members: OrganizationMember[];
  isLoading: boolean;
  canManage: boolean;
  onCreateTeam: (values: CreateTeamFormValues) => Promise<void>;
  onAddTeamMember: (teamId: string, userId: string) => Promise<void>;
  onRemoveTeamMember: (teamId: string, userId: string) => Promise<void>;
}

export function TeamList({
  teams,
  departments,
  members,
  isLoading,
  canManage,
  onCreateTeam,
  onAddTeamMember,
  onRemoveTeamMember,
}: TeamListProps) {
  const [teamError, setTeamError] = React.useState<string | null>(null);
  const [pendingTeamId, setPendingTeamId] = React.useState<string | null>(null);
  const teamNameInputRef = React.useRef<HTMLInputElement | null>(null);

  const form = useForm<CreateTeamFormValues>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: {
      name: '',
      departmentId: '',
      supervisorId: '',
    },
  });

  const activeMembers = React.useMemo(() => members.filter((m) => m.isActive), [members]);

  const handleSubmit = form.handleSubmit(async (values) => {
    setTeamError(null);
    try {
      await onCreateTeam({
        name: values.name,
        departmentId: values.departmentId || undefined,
        supervisorId: values.supervisorId || undefined,
      });
      form.reset({ name: '', departmentId: '', supervisorId: '' });
    } catch (err) {
      setTeamError(extractApiErrorMessage(err, 'Não foi possível criar a equipe de atendimento.'));
    }
  });

  const handleAssignMember = async (teamId: string, userId: string) => {
    if (!userId) return;
    setTeamError(null);
    setPendingTeamId(teamId);
    try {
      await onAddTeamMember(teamId, userId);
    } catch (err) {
      setTeamError(extractApiErrorMessage(err, 'Falha ao vincular membro à equipe.'));
    } finally {
      setPendingTeamId(null);
    }
  };

  const handleRemoveMember = async (teamId: string, userId: string) => {
    setTeamError(null);
    setPendingTeamId(teamId);
    try {
      await onRemoveTeamMember(teamId, userId);
    } catch (err) {
      setTeamError(extractApiErrorMessage(err, 'Falha ao remover membro da equipe.'));
    } finally {
      setPendingTeamId(null);
    }
  };

  const teamNameRegister = form.register('name');

  return (
    <Card className="flex h-full flex-col overflow-hidden border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#0F172A] lg:min-h-0">
      <CardHeader className="border-b border-slate-200/80 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200/80 bg-violet-50 text-violet-700 dark:border-violet-500/35 dark:bg-violet-500/15 dark:text-violet-300">
                <Users className="h-4 w-4" aria-hidden="true" />
              </span>
              Equipes de Atendimento
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Agrupe especialistas em filas operacionais com supervisão e roteamento por departamento.
            </CardDescription>
          </div>
          <Badge variant="purple">{teams.length} equipe(s)</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 overflow-y-auto pt-4 lg:min-h-0">
        {teamError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-900 dark:border-red-900/80 dark:bg-red-950/40 dark:text-red-200"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{teamError}</span>
          </div>
        ) : null}

        {isLoading ? (
          <TableSkeleton rows={4} />
        ) : teams.length === 0 ? (
          <EnterpriseEmptyState
            mode="compact"
            eyebrow="Equipes"
            title="Nenhuma equipe de atendimento cadastrada"
            description="Crie sua primeira equipe para organizar agentes, distribuir filas e definir supervisores."
            hint="Administrador PRO: você pode criar a equipe agora e vincular membros conforme cadastrá-los."
            action={
              canManage ? (
                <MagneticButton
                  size="sm"
                  variant="outline"
                  onClick={() => teamNameInputRef.current?.focus()}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Definir primeira equipe
                </MagneticButton>
              ) : undefined
            }
          />
        ) : (
          <StaggerDiv
            className="space-y-3"
            role="list"
            aria-label="Lista de equipes de atendimento"
          >
            {teams.map((team) => {
              const memberIds = new Set(team.members.map((m) => m.user.id));
              const availableToAdd = activeMembers.filter((m) => !memberIds.has(m.userId));

              return (
                <StaggerArticle
                  key={team.id}
                  hoverLift
                  role="listitem"
                  className="group relative overflow-hidden rounded-xl border border-slate-200/85 bg-white p-4 transition-colors duration-200 hover:border-violet-400/70 hover:bg-slate-50 hover:shadow-[0_12px_28px_-12px_rgba(139,92,246,0.28)] dark:border-white/[0.08] dark:bg-slate-950 dark:hover:border-violet-500/60 dark:hover:bg-slate-900"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/0 to-transparent transition-opacity duration-200 group-hover:via-violet-400/70"
                  />
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <h4 className="truncate text-sm font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100">
                        {team.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span>
                          Supervisor:{' '}
                          <strong className="font-medium text-slate-800 dark:text-slate-100">
                            {team.supervisor?.name ?? 'Não definido'}
                          </strong>
                        </span>
                        {team.department ? (
                          <Badge variant="info">{team.department.name}</Badge>
                        ) : null}
                      </div>
                    </div>
                    <Badge variant="neutral">{team.members.length} membro(s)</Badge>
                  </div>

                  {team.members.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`Membros da equipe ${team.name}`}>
                      {team.members.map((m) => (
                        <span
                          key={m.user.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/90 px-2.5 py-1 text-xs text-slate-800 transition-colors dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-200"
                        >
                          <span>{m.user.name}</span>
                          {canManage ? (
                            <button
                              type="button"
                              disabled={pendingTeamId === team.id}
                              onClick={() => void handleRemoveMember(team.id, m.user.id)}
                              aria-label={`Remover ${m.user.name} da equipe ${team.name}`}
                              className="rounded p-0.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-red-950/60 dark:hover:text-red-300"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {canManage && availableToAdd.length > 0 ? (
                    <div className="mt-3 flex items-center gap-2 border-t border-slate-200/70 pt-3 dark:border-white/[0.08]">
                      <UserPlus className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      <select
                        aria-label={`Adicionar membro na equipe ${team.name}`}
                        defaultValue=""
                        disabled={pendingTeamId === team.id}
                        onChange={(e) => {
                          const userId = e.target.value;
                          e.target.value = '';
                          void handleAssignMember(team.id, userId);
                        }}
                        className={SELECT_CONTROL_CLASS}
                      >
                        <option value="">Vincular membro ativo à equipe...</option>
                        {availableToAdd.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.name} ({m.role.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </StaggerArticle>
              );
            })}
          </StaggerDiv>
        )}

        {canManage ? (
          <form
            onSubmit={handleSubmit}
            className="mt-auto space-y-3 rounded-xl border border-slate-200/85 bg-slate-50 p-4 dark:border-white/[0.08] dark:bg-slate-950"
            noValidate
          >
            <p className="text-xs font-semibold tracking-wide text-slate-800 dark:text-slate-200">
              Nova Equipe de Atendimento
            </p>

            <div className="space-y-1">
              <Label htmlFor="team-name">Nome da equipe</Label>
              <Input
                id="team-name"
                placeholder="Ex: Infraestrutura & Cloud N2"
                aria-invalid={Boolean(form.formState.errors.name)}
                {...teamNameRegister}
                ref={(el) => {
                  teamNameRegister.ref(el);
                  teamNameInputRef.current = el;
                }}
              />
              {form.formState.errors.name ? (
                <p className="text-xs text-red-600 dark:text-red-300">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="team-department">Departamento</Label>
                <select
                  id="team-department"
                  aria-label="Selecionar departamento da equipe"
                  className={SELECT_CONTROL_CLASS}
                  {...form.register('departmentId')}
                >
                  <option value="">Sem vínculo direto</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="team-supervisor">Supervisor responsável</Label>
                <select
                  id="team-supervisor"
                  aria-label="Selecionar supervisor da equipe"
                  className={SELECT_CONTROL_CLASS}
                  {...form.register('supervisorId')}
                >
                  <option value="">Definir posteriormente</option>
                  {activeMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.role.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <MagneticButton type="submit" size="sm" disabled={form.formState.isSubmitting}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {form.formState.isSubmitting ? 'Criando...' : 'Criar Equipe'}
              </MagneticButton>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
