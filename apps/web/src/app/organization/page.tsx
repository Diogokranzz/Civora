'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Users } from 'lucide-react';
import { ErrorState, ForbiddenState } from '@civora/ui';
import { AppShell } from '../../components/app-shell';
import { UnitsDepartmentsSection } from '../../components/organization/department-card';
import { OrganizationSummary } from '../../components/organization/organization-summary';
import { RbacTable } from '../../components/organization/rbac-table';
import { TeamList } from '../../components/organization/team-list';
import { extractApiErrorMessage } from '../../components/organization/organization-types';
import { ApiClientError, civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

export default function OrganizationPage() {
  const queryClient = useQueryClient();
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);
  const triggerRealtimePulse = useCivoraStore((s) => s.triggerRealtimePulse);

  const activeMembership = React.useMemo(
    () => user?.memberships.find((m) => m.organizationId === activeOrganizationId),
    [user, activeOrganizationId],
  );

  const canReadOrg = activeMembership?.permissions.includes('org:read') ?? false;
  const canManageOrg = activeMembership?.permissions.includes('org:manage') ?? false;
  const canReadUsers = activeMembership?.permissions.includes('users:read') ?? false;
  const canManageUsers = activeMembership?.permissions.includes('users:manage') ?? false;
  const queryReady = Boolean(user && activeOrganizationId);

  const unitsQuery = useQuery({
    queryKey: ['units', activeOrganizationId],
    queryFn: () => civoraApi.listUnits(),
    enabled: queryReady && canReadOrg,
  });

  const deptsQuery = useQuery({
    queryKey: ['departments', activeOrganizationId],
    queryFn: () => civoraApi.listDepartments(),
    enabled: queryReady && canReadOrg,
  });

  const teamsQuery = useQuery({
    queryKey: ['teams', activeOrganizationId],
    queryFn: () => civoraApi.listTeams(),
    enabled: queryReady && canReadOrg,
  });

  const usersQuery = useQuery({
    queryKey: ['users', activeOrganizationId],
    queryFn: () => civoraApi.listUsers(),
    enabled: queryReady && canReadUsers,
  });

  const rolesQuery = useQuery({
    queryKey: ['roles', activeOrganizationId],
    queryFn: () => civoraApi.listRoles(),
    enabled: queryReady && canReadOrg,
  });

  const firstError =
    unitsQuery.error || deptsQuery.error || teamsQuery.error || usersQuery.error || null;
  const isForbidden =
    !canReadOrg ||
    (firstError instanceof ApiClientError && firstError.status === 403);

  const units = unitsQuery.data ?? [];
  const departments = deptsQuery.data ?? [];
  const teams = teamsQuery.data ?? [];
  const members = usersQuery.data ?? [];
  const roles = rolesQuery.data ?? [];
  const [activeView, setActiveView] = React.useState<'structure' | 'members'>('structure');
  const activeMembersCount = members.filter((m) => m.isActive).length;

  const invalidateOrganizationStructure = async (eventLabel?: string) => {
    if (eventLabel) {
      triggerRealtimePulse(eventLabel);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['units', activeOrganizationId] }),
      queryClient.invalidateQueries({ queryKey: ['departments', activeOrganizationId] }),
      queryClient.invalidateQueries({ queryKey: ['teams', activeOrganizationId] }),
      queryClient.invalidateQueries({ queryKey: ['users', activeOrganizationId] }),
    ]);
  };

  return (
    <AppShell breadcrumb="Departamentos & Equipes">
      <div className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col gap-2 overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-sky-400">
                Governança Multi-Tenant
              </p>
              {activeMembership ? (
                <span className="rounded-full border border-slate-200/85 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/[0.08] dark:bg-[#0F172A] dark:text-slate-300">
                  {activeMembership.organizationName}
                </span>
              ) : null}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-50">
              Estrutura Organizacional & RBAC
            </h1>
          </div>
          {canReadUsers ? (
            <div
              role="tablist"
              aria-label="Seções organizacionais"
              className="inline-flex rounded-xl border border-slate-200/85 bg-white p-1 shadow-xs dark:border-white/[0.08] dark:bg-[#0F172A]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'structure'}
                onClick={() => setActiveView('structure')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeView === 'structure'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                }`}
              >
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                Estrutura & Equipes
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'members'}
                onClick={() => setActiveView('members')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeView === 'members'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                }`}
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Membros & RBAC ({members.length})
              </button>
            </div>
          ) : null}
        </header>

        {isForbidden ? (
          <ForbiddenState />
        ) : firstError ? (
          <ErrorState
            description={extractApiErrorMessage(
              firstError,
              'Não foi possível carregar os dados organizacionais.',
            )}
            onRetry={() => void invalidateOrganizationStructure()}
          />
        ) : (
          <>
            <div className="shrink-0">
              <OrganizationSummary
                unitsCount={units.length}
                departmentsCount={departments.length}
                teamsCount={teams.length}
                activeMembersCount={activeMembersCount}
                totalMembersCount={members.length}
                canManage={canManageOrg}
              />
            </div>

            {activeView === 'structure' || !canReadUsers ? (
              <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 gap-3 lg:grid-cols-2">
              <UnitsDepartmentsSection
                units={units}
                departments={departments}
                isLoading={unitsQuery.isLoading || deptsQuery.isLoading}
                canManage={canManageOrg}
                onCreateUnit={async (values) => {
                  await civoraApi.createUnit({
                    name: values.name,
                    code: values.code,
                    timezone: values.timezone,
                    address: values.address || undefined,
                  });
                  await invalidateOrganizationStructure('UNIT_CREATED');
                }}
                onToggleUnitStatus={async (unit) => {
                  await civoraApi.updateUnit(unit.id, { isActive: !unit.isActive });
                  await invalidateOrganizationStructure('UNIT_UPDATED');
                }}
                onDeleteUnit={async (unit) => {
                  await civoraApi.deleteUnit(unit.id);
                  await invalidateOrganizationStructure('UNIT_DELETED');
                }}
                onCreateDepartment={async (values) => {
                  await civoraApi.createDepartment({
                    name: values.name,
                    code: values.code,
                    unitId: values.unitId || null,
                  });
                  await invalidateOrganizationStructure('DEPARTMENT_CREATED');
                }}
                onDeleteDepartment={async (department) => {
                  await civoraApi.deleteDepartment(department.id);
                  await invalidateOrganizationStructure('DEPARTMENT_DELETED');
                }}
              />

              <TeamList
                teams={teams}
                departments={departments}
                members={members}
                isLoading={teamsQuery.isLoading}
                canManage={canManageOrg}
                onCreateTeam={async (values) => {
                  await civoraApi.createTeam({
                    name: values.name,
                    departmentId: values.departmentId || null,
                    supervisorId: values.supervisorId || null,
                  });
                  await invalidateOrganizationStructure('TEAM_CREATED');
                }}
                onAddTeamMember={async (teamId, userId) => {
                  await civoraApi.addTeamMember(teamId, userId);
                  await invalidateOrganizationStructure('TEAM_MEMBER_ADDED');
                }}
                onRemoveTeamMember={async (teamId, userId) => {
                  await civoraApi.removeTeamMember(teamId, userId);
                  await invalidateOrganizationStructure('TEAM_MEMBER_REMOVED');
                }}
              />
            </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <RbacTable
                members={members}
                units={units}
                departments={departments}
                roles={roles}
                currentUserId={user?.id ?? ''}
                isLoading={usersQuery.isLoading}
                canManageUsers={canManageUsers}
                onCreateMember={async (values) => {
                  await civoraApi.createUser({
                    name: values.name,
                    email: values.email,
                    password: values.password,
                    roleCode: values.roleCode,
                    defaultUnitId: values.defaultUnitId || null,
                    departmentId: values.departmentId || null,
                  });
                  await invalidateOrganizationStructure('USER_CREATED');
                }}
                onUpdateMember={async (userId, patch) => {
                  await civoraApi.updateUserMembership(userId, patch);
                  await invalidateOrganizationStructure('USER_UPDATED');
                }}
              />
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
