'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { calculatePriorityFromMatrix } from '@civora/config';
import type { ImpactLevel, TicketSummaryDto, UrgencyLevel } from '@civora/types';
import {
  Bookmark,
  Columns3,
  Download,
  Filter,
  Plus,
  Rows3,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  Button,
  Card,
  ErrorState,
  ForbiddenState,
  Input,
  Label,
  PriorityBadge,
  SlaBadge,
  TableSkeleton,
  Textarea,
  TicketStatusBadge,
  cn,
} from '@civora/ui';
import { AppShell } from '../../components/app-shell';
import {
  EnterpriseEmptyState,
  GlassKpiCard,
  KpiEmblem,
  LiveSlaClockBadge,
  MagneticButton,
  ModalTransitionOverlay,
  MotionTableBody,
  MotionTableRow,
  SectorEmblem,
  StaggerSection,
  TicketTypeEmblem,
} from '../../components/spatial';
import { ApiClientError, civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

const columnHelper = createColumnHelper<TicketSummaryDto>();

const STATUS_TABS = [
  { key: 'ALL', label: 'Todos' },
  { key: 'OPEN_GROUP', label: 'Abertos' },
  { key: 'IN_PROGRESS', label: 'Em Andamento' },
  { key: 'WAITING_GROUP', label: 'Aguardando' },
  { key: 'RESOLVED_GROUP', label: 'Resolvidos' },
  { key: 'SLA_RISK', label: 'SLA em Risco' },
] as const;

const FILTER_SELECT_CLASS =
  'h-8 rounded-lg border border-slate-300 bg-white/90 px-2 text-xs text-slate-900 transition-all duration-200 ease-in-out hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700/90 dark:bg-slate-950/85 dark:text-slate-100 dark:hover:border-slate-600 dark:focus-visible:ring-blue-400';

export default function TicketsConsolePage() {
  const queryClient = useQueryClient();
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);
  const activeUnitId = useCivoraStore((s) => s.activeUnitId);
  const user = useCivoraStore((s) => s.user);
  const triggerRealtimePulse = useCivoraStore((s) => s.triggerRealtimePulse);
  const activeMembership = user?.memberships.find((m) => m.organizationId === activeOrganizationId);
  const permissions = activeMembership?.permissions ?? [];
  const canUpdateTickets = permissions.includes('tickets:update');
  const canBulkUpdateTickets = permissions.includes('tickets:bulk_update');

  const [deletingTicketId, setDeletingTicketId] = React.useState<string | null>(null);
  const [ticketActionError, setTicketActionError] = React.useState<string | null>(null);

  const [tab, setTab] = React.useState<string>('ALL');
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(15);
  const [search, setSearch] = React.useState('');
  const [priorityFilter, setPriorityFilter] = React.useState('');
  const [departmentFilter, setDepartmentFilter] = React.useState('');
  const [assigneeFilter, setAssigneeFilter] = React.useState('');
  const [periodDays, setPeriodDays] = React.useState('');
  const [sortBy, setSortBy] = React.useState('createdAt');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [density, setDensity] = React.useState<'comfortable' | 'compact'>('comfortable');
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});
  const [columnsMenuOpen, setColumnsMenuOpen] = React.useState(false);
  const [savingViewOpen, setSavingViewOpen] = React.useState(false);
  const [savedViewName, setSavedViewName] = React.useState('');
  const [visibleCols, setVisibleCols] = React.useState<VisibilityState>({
    requester: true,
    department: true,
    status: true,
    assignee: true,
    priority: true,
    sla: true,
    dueAt: true,
  });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');
  const [newDesc, setNewDesc] = React.useState('');
  const [newType, setNewType] = React.useState('INCIDENT');
  const [newImpact, setNewImpact] = React.useState<ImpactLevel>('MEDIUM');
  const [newUrgency, setNewUrgency] = React.useState<UrgencyLevel>('MEDIUM');
  const [newUnitId, setNewUnitId] = React.useState('');
  const [newDepartmentId, setNewDepartmentId] = React.useState('');
  const [newTeamId, setNewTeamId] = React.useState('');

  const queryParams = React.useMemo(() => {
    const params: Record<string, string | number | undefined> = {
      page,
      pageSize,
      unitId: activeUnitId ?? undefined,
      search: search.trim() || undefined,
      priority: priorityFilter || undefined,
      departmentId: departmentFilter || undefined,
      assigneeId: assigneeFilter || undefined,
      sortBy,
      sortOrder,
    };
    if (periodDays) {
      const from = new Date(Date.now() - Number(periodDays) * 86_400_000).toISOString();
      params.fromDate = from;
    }
    if (tab === 'OPEN_GROUP') params.statuses = 'NEW,TRIAGE,OPEN,REOPENED';
    else if (tab === 'IN_PROGRESS') params.status = 'IN_PROGRESS';
    else if (tab === 'WAITING_GROUP')
      params.statuses = 'WAITING_CUSTOMER,WAITING_THIRD_PARTY,WAITING_APPROVAL';
    else if (tab === 'RESOLVED_GROUP') params.statuses = 'RESOLVED,CLOSED';
    else if (tab === 'SLA_RISK') params.slaState = 'WARNING';
    return params;
  }, [
    page,
    pageSize,
    activeUnitId,
    search,
    priorityFilter,
    departmentFilter,
    assigneeFilter,
    periodDays,
    sortBy,
    sortOrder,
    tab,
  ]);

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', activeOrganizationId, activeUnitId, departmentFilter],
    queryFn: () =>
      civoraApi.getDashboard({
        unitId: activeUnitId ?? undefined,
        departmentId: departmentFilter || undefined,
      }),
    enabled: Boolean(user && activeOrganizationId),
  });

  const ticketsQuery = useQuery({
    queryKey: ['tickets', activeOrganizationId, queryParams],
    queryFn: () => civoraApi.listTickets(queryParams),
    enabled: Boolean(user && activeOrganizationId),
  });

  const unitsQuery = useQuery({
    queryKey: ['units', activeOrganizationId],
    queryFn: () => civoraApi.listUnits(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const departmentsQuery = useQuery({
    queryKey: ['departments', activeOrganizationId],
    queryFn: () => civoraApi.listDepartments(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const teamsQuery = useQuery({
    queryKey: ['teams', activeOrganizationId],
    queryFn: () => civoraApi.listTeams(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const usersQuery = useQuery({
    queryKey: ['users', activeOrganizationId],
    queryFn: () => civoraApi.listUsers(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const savedViewsQuery = useQuery({
    queryKey: ['saved-views', activeOrganizationId],
    queryFn: () => civoraApi.listSavedViews(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      civoraApi.createTicket(
        {
          title: newTitle,
          description: `<p>${newDesc.replace(/</g, '&lt;')}</p>`,
          type: newType,
          impact: newImpact,
          urgency: newUrgency,
          unitId: newUnitId || activeUnitId || null,
          departmentId: newDepartmentId || null,
          assignedTeamId: newTeamId || null,
        },
        crypto.randomUUID(),
      ),
    onSuccess: () => {
      setCreateOpen(false);
      setNewTitle('');
      setNewDesc('');
      setNewUnitId('');
      setNewDepartmentId('');
      setNewTeamId('');
      triggerRealtimePulse('TICKET_CREATED');
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: (payload: { assigneeId?: string | null; status?: string }) => {
      const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
      return civoraApi.bulkUpdateTickets({ ticketIds: selectedIds, ...payload });
    },
    onSuccess: () => {
      setRowSelection({});
      triggerRealtimePulse('TICKETS_BULK_UPDATED');
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const deleteTicketMutation = useMutation({
    mutationFn: (ticketId: string) => civoraApi.deleteTicket(ticketId),
    onMutate: (ticketId) => {
      setTicketActionError(null);
      setDeletingTicketId(ticketId);
    },
    onSuccess: (_data, ticketId) => {
      setRowSelection((prev) => {
        if (!prev[ticketId]) return prev;
        const next = { ...prev };
        delete next[ticketId];
        return next;
      });
      triggerRealtimePulse('TICKET_DELETED');
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => {
      setTicketActionError(
        err instanceof Error ? err.message : 'Não foi possível apagar o chamado.',
      );
    },
    onSettled: () => {
      setDeletingTicketId(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () => {
      const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
      return civoraApi.bulkDeleteTickets({ ticketIds: selectedIds });
    },
    onMutate: () => {
      setTicketActionError(null);
    },
    onSuccess: () => {
      setRowSelection({});
      triggerRealtimePulse('TICKETS_BULK_DELETED');
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => {
      setTicketActionError(
        err instanceof Error ? err.message : 'Não foi possível apagar os chamados selecionados.',
      );
    },
  });

  const { mutate: mutateDeleteTicket } = deleteTicketMutation;
  const isBulkDeleting = bulkDeleteMutation.isPending;

  const columns = React.useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Selecionar todos os chamados desta página"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Selecionar chamado ${row.original.publicNumber}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
          />
        ),
      }),
      columnHelper.accessor('publicNumber', {
        id: 'publicNumber',
        header: 'Ticket',
        cell: (info) => (
          <Link
            href={`/tickets/${info.row.original.id}`}
            className="whitespace-nowrap font-mono text-xs font-semibold text-blue-700 hover:underline dark:text-sky-300"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor('title', {
        id: 'title',
        header: 'Assunto',
        cell: (info) => (
          <div className="flex items-center gap-2">
            <TicketTypeEmblem type={info.row.original.type} size={22} />
            <Link
              href={`/tickets/${info.row.original.id}`}
              className="block max-w-[175px] truncate font-medium text-slate-900 transition-colors hover:text-blue-700 xl:max-w-[240px] dark:text-slate-100 dark:hover:text-sky-300"
            >
              {info.getValue()}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor((r) => r.requester.name, {
        id: 'requester',
        header: 'Solicitante',
        cell: (info) => (
          <span className="block max-w-[115px] truncate text-slate-700 dark:text-slate-300">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor((r) => r.department?.name ?? '—', {
        id: 'department',
        header: 'Departamento',
        cell: (info) => {
          const dept = info.row.original.department;
          if (!dept) {
            return <span className="text-slate-500 dark:text-slate-400">—</span>;
          }
          return (
            <div className="flex items-center gap-1.5">
              <SectorEmblem name={dept.name} size={20} />
              <span className="block max-w-[130px] truncate text-slate-700 dark:text-slate-200">
                {dept.name}
              </span>
            </div>
          );
        },
      }),
      columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: (info) => <TicketStatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor((r) => r.assignee?.name ?? 'Não atribuído', {
        id: 'assignee',
        header: 'Responsável',
        cell: (info) => (
          <span
            className={cn(
              'block max-w-[110px] truncate whitespace-nowrap',
              info.getValue() === 'Não atribuído'
                ? 'italic text-slate-500 dark:text-slate-400'
                : 'text-slate-800 dark:text-slate-200',
            )}
          >
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('priority', {
        id: 'priority',
        header: 'Prioridade',
        cell: (info) => <PriorityBadge priority={info.getValue()} />,
      }),
      columnHelper.accessor((r) => r.sla, {
        id: 'sla',
        header: 'SLA',
        cell: (info) => {
          const sla = info.getValue();
          return sla ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <SlaBadge state={sla.state} consumedPercent={sla.consumedPercent} />
              <LiveSlaClockBadge
                dueAt={sla.resolutionDueAt ?? info.row.original.dueAt}
                pausedAt={sla.pausedAt}
                isBreached={sla.breached}
              />
            </div>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">Sem política</span>
          );
        },
      }),
      columnHelper.accessor('dueAt', {
        id: 'dueAt',
        header: 'Prazo',
        cell: (info) => {
          const val = info.getValue();
          if (!val) return <span className="text-xs text-slate-500 dark:text-slate-400">—</span>;
          return (
            <span className="whitespace-nowrap font-mono text-xs text-slate-600 dark:text-slate-300">
              {new Date(val).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          );
        },
      }),
      ...(canUpdateTickets
        ? [
            columnHelper.display({
              id: 'actions',
              header: () => <span className="block text-right">Ações</span>,
              cell: ({ row }) => {
                const isDeleting = deletingTicketId === row.original.id;
                return (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isDeleting || isBulkDeleting}
                      onClick={() => mutateDeleteTicket(row.original.id)}
                      aria-label={`Apagar chamado ${row.original.publicNumber}`}
                      className="h-7 gap-1 border-red-200 px-2 text-xs text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/60 dark:hover:text-red-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{isDeleting ? 'Apagando...' : 'Apagar'}</span>
                    </Button>
                  </div>
                );
              },
            }),
          ]
        : []),
    ],
    [canUpdateTickets, deletingTicketId, isBulkDeleting, mutateDeleteTicket],
  );

  const rows = ticketsQuery.data?.data ?? [];
  const table = useReactTable({
    data: rows,
    columns,
    state: { rowSelection, columnVisibility: visibleCols },
    enableRowSelection: true,
    getRowId: (row) => row.id,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setVisibleCols,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const derivedPriority = calculatePriorityFromMatrix(newImpact, newUrgency);
  const metrics = dashboardQuery.data;
  const allUnits = unitsQuery.data ?? [];
  const allDepartments = departmentsQuery.data ?? [];
  const allTeams = React.useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const matchingTeams = React.useMemo(
    () =>
      newDepartmentId
        ? allTeams.filter(
            (t) => t.departmentId === newDepartmentId || t.department?.id === newDepartmentId,
          )
        : allTeams,
    [allTeams, newDepartmentId],
  );
  const otherTeams = React.useMemo(
    () =>
      newDepartmentId
        ? allTeams.filter(
            (t) => t.departmentId !== newDepartmentId && t.department?.id !== newDepartmentId,
          )
        : [],
    [allTeams, newDepartmentId],
  );
  const hasActiveFilters = Boolean(
    search.trim() || priorityFilter || departmentFilter || assigneeFilter || periodDays || tab !== 'ALL',
  );

  const resetAllFilters = () => {
    setTab('ALL');
    setSearch('');
    setPriorityFilter('');
    setDepartmentFilter('');
    setAssigneeFilter('');
    setPeriodDays('');
    setPage(1);
  };

  const handleSaveView = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = savedViewName.trim();
    if (!trimmed) return;
    await civoraApi.createSavedView({
      name: trimmed,
      filters: { tab, priorityFilter, departmentFilter, assigneeFilter },
    });
    setSavedViewName('');
    setSavingViewOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['saved-views'] });
  };

  const handleExportCsv = async () => {
    const csv = await civoraApi.exportTicketsCsv({
      priority: priorityFilter || undefined,
      departmentId: departmentFilter || undefined,
      unitId: activeUnitId ?? undefined,
      search: search || undefined,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `civora-chamados-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell breadcrumb="Chamados">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:h-full lg:min-h-0">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-50">
              Central de Chamados & Incidentes
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Orquestração em tempo real via WebSockets, SLA por calendário comercial e isolamento multi-tenant.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleExportCsv()}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Exportar CSV
            </Button>
            <MagneticButton size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Novo Chamado
            </MagneticButton>
          </div>
        </header>

        <StaggerSection
          aria-label="Indicadores operacionais"
          className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          <GlassKpiCard
            label="Total de Chamados"
            value={metrics?.totalTickets ?? '—'}
            subtitle="Volume consolidado"
            tone="blue"
            active={tab === 'ALL'}
            onClick={() => {
              setTab('ALL');
              setPage(1);
            }}
            icon={<KpiEmblem kind="total" />}
          />

          <GlassKpiCard
            label="Críticos"
            value={metrics?.criticalTickets ?? '—'}
            subtitle="Prioridade máxima"
            tone="crimson"
            active={priorityFilter === 'CRITICAL'}
            onClick={() => {
              setPriorityFilter((prev) => (prev === 'CRITICAL' ? '' : 'CRITICAL'));
              setPage(1);
            }}
            icon={<KpiEmblem kind="critical" />}
          />

          <GlassKpiCard
            label="Em Andamento"
            value={metrics?.inProgressTickets ?? '—'}
            subtitle="Em execução ativa"
            tone="blue"
            active={tab === 'IN_PROGRESS'}
            onClick={() => {
              setTab((prev) => (prev === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS'));
              setPage(1);
            }}
            icon={<KpiEmblem kind="in_progress" />}
          />

          <GlassKpiCard
            label="Resolvidos Hoje"
            value={metrics?.resolvedToday ?? '—'}
            subtitle="Entregas do turno"
            tone="emerald"
            active={tab === 'RESOLVED_GROUP'}
            onClick={() => {
              setTab((prev) => (prev === 'RESOLVED_GROUP' ? 'ALL' : 'RESOLVED_GROUP'));
              setPage(1);
            }}
            icon={<KpiEmblem kind="resolved" />}
          />

          <GlassKpiCard
            label="MTTR Médio"
            value={metrics ? `${metrics.mttrMinutes} min` : '—'}
            subtitle="Tempo de resolução"
            tone="violet"
            icon={<KpiEmblem kind="mttr" />}
          />
        </StaggerSection>

        <Card className="flex flex-1 flex-col overflow-hidden border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#0F172A] lg:min-h-0">
          <div className="shrink-0 border-b border-slate-200/80 px-4 pt-1.5 dark:border-white/[0.08]">
            <div role="tablist" aria-label="Filtrar por grupo de status" className="flex flex-wrap gap-1.5">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.key}
                  onClick={() => {
                    React.startTransition(() => {
                      setTab(t.key);
                      setPage(1);
                    });
                  }}
                  className={cn(
                    'border-b-2 px-3 py-2 text-xs font-semibold tracking-wide transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    tab === t.key
                      ? 'border-blue-600 text-blue-700 dark:border-sky-400 dark:text-sky-300'
                      : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-white/[0.08] dark:bg-slate-950/50">
            <div className="relative min-w-[140px] flex-1">
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Filtrar por ticket, assunto..."
                aria-label="Pesquisar chamados"
                className="h-8 text-xs"
              />
            </div>

            <select
              aria-label="Filtrar por responsável"
              value={assigneeFilter}
              onChange={(e) => {
                setAssigneeFilter(e.target.value);
                setPage(1);
              }}
              className={FILTER_SELECT_CLASS}
            >
              <option value="">Todos responsáveis</option>
              {(usersQuery.data ?? []).map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por prioridade"
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className={FILTER_SELECT_CLASS}
            >
              <option value="">Todas prioridades</option>
              <option value="CRITICAL">Crítica</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Média</option>
              <option value="LOW">Baixa</option>
            </select>

            <select
              aria-label="Filtrar por departamento"
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setPage(1);
              }}
              className={FILTER_SELECT_CLASS}
            >
              <option value="">Todos departamentos</option>
              {(departmentsQuery.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por período"
              value={periodDays}
              onChange={(e) => {
                setPeriodDays(e.target.value);
                setPage(1);
              }}
              className={FILTER_SELECT_CLASS}
            >
              <option value="">Todo período</option>
              <option value="1">Últimas 24h</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
            </select>

            <select
              aria-label="Ordenar por"
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [f, o] = e.target.value.split(':');
                setSortBy(f || 'createdAt');
                setSortOrder((o as 'asc' | 'desc') || 'desc');
              }}
              className={FILTER_SELECT_CLASS}
            >
              <option value="createdAt:desc">Mais recentes</option>
              <option value="dueAt:asc">Menor prazo SLA</option>
              <option value="priority:desc">Maior prioridade</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
              title="Alternar densidade da tabela"
            >
              <Rows3 className="h-4 w-4" aria-hidden="true" />
              {density === 'compact' ? 'Compacta' : 'Confortável'}
            </Button>

            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setColumnsMenuOpen(!columnsMenuOpen)}
                aria-expanded={columnsMenuOpen}
              >
                <Columns3 className="h-4 w-4" aria-hidden="true" />
                Colunas
              </Button>
              {columnsMenuOpen ? (
                <div className="absolute right-0 z-20 mt-1.5 w-48 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl dark:border-slate-700/80 dark:bg-slate-900">
                  {Object.entries(visibleCols).map(([colKey, checked]) => (
                    <label
                      key={colKey}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs capitalize transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setVisibleCols((prev) => ({ ...prev, [colKey]: e.target.checked }))
                        }
                      />
                      <span>{colKey}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSavingViewOpen((prev) => !prev)}
              aria-expanded={savingViewOpen}
            >
              <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
              Salvar visão
            </Button>
          </div>

          {savingViewOpen ? (
            <form
              onSubmit={(e) => void handleSaveView(e)}
              className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-blue-50/50 px-4 py-2.5 text-xs dark:border-white/[0.08] dark:bg-sky-950/30"
            >
              <Label htmlFor="saved-view-name" className="text-xs">
                Nome da visualização:
              </Label>
              <Input
                id="saved-view-name"
                required
                minLength={2}
                maxLength={80}
                value={savedViewName}
                onChange={(e) => setSavedViewName(e.target.value)}
                placeholder="Ex: Incidentes Críticos TI"
                className="h-8 max-w-xs text-xs"
              />
              <Button type="submit" size="sm">
                Confirmar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSavingViewOpen(false)}
              >
                Cancelar
              </Button>
            </form>
          ) : null}

          {(savedViewsQuery.data ?? []).length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 px-4 py-2.5 text-xs dark:border-white/[0.08]">
              <Filter className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <span className="text-slate-600 dark:text-slate-300">Visões salvas:</span>
              {(savedViewsQuery.data ?? []).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    const f = v.filtersJson as Record<string, string>;
                    if (f.tab) setTab(f.tab);
                    setPriorityFilter(f.priorityFilter || '');
                    setDepartmentFilter(f.departmentFilter || '');
                    setAssigneeFilter(f.assigneeFilter || '');
                  }}
                  className="rounded-full border border-slate-300 px-3 py-0.5 transition-colors hover:border-sky-400 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {v.name}
                </button>
              ))}
            </div>
          ) : null}

          {ticketActionError ? (
            <div
              role="alert"
              className="border-b border-red-200 bg-red-50/90 px-4 py-2 text-xs font-medium text-red-800 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200"
            >
              {ticketActionError}
            </div>
          ) : null}

          {selectedCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-blue-50/90 px-4 py-2.5 text-xs dark:border-sky-500/30 dark:bg-sky-950/45">
              <span className="font-semibold text-blue-900 dark:text-sky-200">
                {selectedCount} chamado(s) selecionado(s)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkMutation.mutate({ status: 'IN_PROGRESS' })}
                >
                  Mover para Em Andamento
                </Button>
                <select
                  aria-label="Atribuir selecionados para"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) bulkMutation.mutate({ assigneeId: e.target.value });
                  }}
                  className={FILTER_SELECT_CLASS}
                >
                  <option value="">Atribuir em massa...</option>
                  {(usersQuery.data ?? []).map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.name}
                    </option>
                  ))}
                </select>
                {canBulkUpdateTickets ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBulkDeleting}
                    onClick={() => bulkDeleteMutation.mutate()}
                    aria-label={`Apagar ${selectedCount} chamado(s) selecionado(s)`}
                    className="gap-1.5 border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/60 dark:hover:text-red-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isBulkDeleting ? 'Apagando...' : 'Apagar selecionados'}</span>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {ticketsQuery.isLoading ? (
            <TableSkeleton rows={6} />
          ) : ticketsQuery.isError ? (
            ticketsQuery.error instanceof ApiClientError && ticketsQuery.error.status === 403 ? (
              <div className="p-4">
                <ForbiddenState />
              </div>
            ) : (
              <div className="p-4">
                <ErrorState
                  description={
                    ticketsQuery.error instanceof Error
                      ? ticketsQuery.error.message
                      : 'Erro desconhecido'
                  }
                  onRetry={() => void ticketsQuery.refetch()}
                />
              </div>
            )
          ) : rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 lg:min-h-0">
              <EnterpriseEmptyState
                mode="hero"
                emblem="tickets"
                eyebrow={
                  hasActiveFilters
                    ? 'Nenhum Registro Correspondente'
                    : 'Operação Pronta — Central de Chamados'
                }
                title={
                  hasActiveFilters
                    ? 'Nenhum chamado encontrado para os filtros ativos'
                    : 'Inicie a operação da Central de Chamados'
                }
                description={
                  hasActiveFilters
                    ? 'Ajuste os filtros de busca ou redefina a visualização para inspecionar todos os chamados.'
                    : 'Seu ambiente operacional está limpo e pronto para receber chamados reais com rastreamento de SLA, trilha auditável e atualizações em tempo real.'
                }
                hint="Dica: você pode vincular departamentos e equipes em Departamentos & Equipes antes ou durante a abertura do primeiro chamado."
                action={
                  <div className="flex flex-wrap items-center gap-3">
                    <MagneticButton size="md" onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Abrir Primeiro Chamado
                    </MagneticButton>
                    {hasActiveFilters ? (
                      <Button variant="outline" size="sm" onClick={resetAllFilters}>
                        Limpar filtros
                      </Button>
                    ) : null}
                  </div>
                }
              />
            </div>
          ) : (
            <>
              <div className="hidden md:block flex-1 overflow-auto lg:min-h-0">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:border-white/[0.08] dark:bg-slate-950 dark:text-slate-300">
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id}>
                        {hg.headers.map((header) => (
                          <th
                            key={header.id}
                            scope="col"
                            className={cn(
                              'whitespace-nowrap px-2.5 py-2.5',
                              header.column.id === 'actions' &&
                                'sticky right-0 z-20 border-l border-slate-200/80 bg-slate-50 dark:border-white/[0.08] dark:bg-slate-950',
                            )}
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <MotionTableBody>
                    {table.getRowModel().rows.map((row) => (
                      <MotionTableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className={cn(
                              'px-2.5',
                              density === 'compact' ? 'py-2 text-xs' : 'py-3 text-sm',
                              cell.column.id === 'actions' &&
                                'sticky right-0 z-10 border-l border-slate-200/70 bg-white dark:border-white/[0.06] dark:bg-[#0F172A]',
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </MotionTableRow>
                    ))}
                  </MotionTableBody>
                </table>
              </div>
              {/* Mobile Adaptive Ticket Cards (Smartphones / iPhone) */}
              <div className="md:hidden flex-1 overflow-y-auto p-2.5 space-y-2.5">
                {rows.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs transition-all dark:border-white/[0.08] dark:bg-slate-900/90"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Link
                        href={`/tickets/${ticket.id}`}
                        className="font-mono text-xs font-bold text-blue-600 dark:text-sky-400"
                      >
                        {ticket.publicNumber}
                      </Link>
                      <div className="flex items-center gap-1.5">
                        <TicketStatusBadge status={ticket.status} />
                        <PriorityBadge priority={ticket.priority} />
                      </div>
                    </div>

                    <Link href={`/tickets/${ticket.id}`} className="block">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                        {ticket.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                        <span>{ticket.requester?.name ?? 'Solicitante'}</span>
                        <span>•</span>
                        <span>{ticket.department?.name ?? 'Operações'}</span>
                      </p>
                    </Link>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                      {ticket.sla ? (
                        <SlaBadge state={ticket.sla.state} consumedPercent={ticket.sla.consumedPercent} />
                      ) : (
                        <span className="text-slate-400 text-[11px]">SLA Padrão</span>
                      )}
                      <div className="flex items-center gap-2">
                        <Link href={`/tickets/${ticket.id}`}>
                          <Button size="sm" variant="outline" className="h-7 text-xs px-2.5">
                            Ver Detalhes
                          </Button>
                        </Link>
                        {canUpdateTickets && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => mutateDeleteTicket(ticket.id)}
                            disabled={deletingTicketId === ticket.id}
                            className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                            aria-label={`Apagar chamado ${ticket.publicNumber}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 px-4 py-2.5 text-xs text-slate-600 dark:border-white/[0.08] dark:text-slate-300">
                <span>
                  Página {ticketsQuery.data?.meta.page} de {ticketsQuery.data?.meta.totalPages} —{' '}
                  {ticketsQuery.data?.meta.totalItems} chamado(s)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!ticketsQuery.data?.meta.hasPreviousPage}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!ticketsQuery.data?.meta.hasNextPage}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        <ModalTransitionOverlay
          open={createOpen}
          onBackdropClick={() => setCreateOpen(false)}
          ariaLabel="Abrir novo chamado"
          maxWidthClassName="max-w-lg p-6"
        >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50">
                      Novo Chamado Corporativo
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Registro idempotente com cálculo automático de prioridade.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    aria-label="Fechar modal"
                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createMutation.mutate();
                  }}
                  className="space-y-3.5"
                >
                  <div className="space-y-1">
                    <Label htmlFor="ticket-title">Assunto</Label>
                    <Input
                      id="ticket-title"
                      required
                      minLength={3}
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Resumo objetivo da solicitação ou incidente"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ticket-desc">Descrição detalhada</Label>
                    <Textarea
                      id="ticket-desc"
                      required
                      minLength={3}
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="Informe unidade afetada, sintomas, código de erro ou prazo esperado"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="ticket-type">Tipo</Label>
                      <div className="flex items-center gap-2">
                        <TicketTypeEmblem type={newType} size={32} />
                        <select
                          id="ticket-type"
                          value={newType}
                          onChange={(e) => setNewType(e.target.value)}
                          className={FILTER_SELECT_CLASS + ' w-full'}
                        >
                          <option value="INCIDENT">Incidente</option>
                          <option value="SERVICE_REQUEST">Requisição de Serviço</option>
                          <option value="ACCESS_REQUEST">Solicitação de Acesso</option>
                          <option value="CHANGE_REQUEST">Mudança (GMUD)</option>
                          <option value="QUESTION">Dúvida / Orientação</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ticket-impact">Impacto</Label>
                      <select
                        id="ticket-impact"
                        value={newImpact}
                        onChange={(e) => setNewImpact(e.target.value as ImpactLevel)}
                        className={FILTER_SELECT_CLASS + ' w-full'}
                      >
                        <option value="LOW">Baixo</option>
                        <option value="MEDIUM">Médio</option>
                        <option value="HIGH">Alto</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ticket-urgency">Urgência</Label>
                      <select
                        id="ticket-urgency"
                        value={newUrgency}
                        onChange={(e) => setNewUrgency(e.target.value as UrgencyLevel)}
                        className={FILTER_SELECT_CLASS + ' w-full'}
                      >
                        <option value="LOW">Baixa</option>
                        <option value="MEDIUM">Média</option>
                        <option value="HIGH">Alta</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-100/80 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/75">
                    <span className="text-slate-700 dark:text-slate-300">
                      Prioridade calculada pela matriz (Impacto × Urgência):
                    </span>
                    <PriorityBadge priority={derivedPriority} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ticket-unit">Unidade</Label>
                    <select
                      id="ticket-unit"
                      value={newUnitId || activeUnitId || ''}
                      onChange={(e) => setNewUnitId(e.target.value)}
                      className={FILTER_SELECT_CLASS + ' w-full'}
                    >
                      <option value="">Selecionar unidade (opcional)...</option>
                      {allUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code} — {u.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="ticket-dept">Departamento</Label>
                      <div className="flex items-center gap-2">
                        <SectorEmblem
                          code={allDepartments.find((d) => d.id === newDepartmentId)?.code}
                          name={allDepartments.find((d) => d.id === newDepartmentId)?.name}
                          size={32}
                        />
                        <select
                          id="ticket-dept"
                          value={newDepartmentId}
                          onChange={(e) => {
                            const nextDeptId = e.target.value;
                            setNewDepartmentId(nextDeptId);
                            if (nextDeptId && newTeamId) {
                              const selectedTeam = allTeams.find((t) => t.id === newTeamId);
                              const matchesDept =
                                selectedTeam &&
                                (selectedTeam.departmentId === nextDeptId ||
                                  selectedTeam.department?.id === nextDeptId);
                              if (!matchesDept) {
                                setNewTeamId('');
                              }
                            }
                          }}
                          className={FILTER_SELECT_CLASS + ' w-full'}
                        >
                          <option value="">Selecionar departamento...</option>
                          {allDepartments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.code} — {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ticket-team">Equipe</Label>
                      <select
                        id="ticket-team"
                        value={newTeamId}
                        onChange={(e) => {
                          const teamId = e.target.value;
                          setNewTeamId(teamId);
                          if (teamId && !newDepartmentId) {
                            const team = allTeams.find((t) => t.id === teamId);
                            const deptId = team?.departmentId ?? team?.department?.id;
                            if (deptId) setNewDepartmentId(deptId);
                          }
                        }}
                        className={FILTER_SELECT_CLASS + ' w-full'}
                      >
                        <option value="">Selecionar equipe...</option>
                        {newDepartmentId ? (
                          <>
                            {matchingTeams.length > 0 ? (
                              <optgroup label="Equipes do departamento selecionado">
                                {matchingTeams.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                            {otherTeams.length > 0 ? (
                              <optgroup label="Demais equipes da organização">
                                {otherTeams.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                    {t.department ? ` (${t.department.name})` : ''}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                          </>
                        ) : (
                          allTeams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                              {t.department ? ` — ${t.department.name}` : ''}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>
                  {createMutation.isError ? (
                    <p role="alert" className="text-xs text-red-600 dark:text-red-300">
                      {createMutation.error instanceof Error
                        ? createMutation.error.message
                        : 'Erro ao criar chamado'}
                    </p>
                  ) : null}
                  <div className="flex justify-end gap-2.5 pt-2">
                    <Button variant="outline" onClick={() => setCreateOpen(false)}>
                      Cancelar
                    </Button>
                    <MagneticButton type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? 'Registrando...' : 'Criar Chamado'}
                    </MagneticButton>
                  </div>
                </form>
        </ModalTransitionOverlay>
      </div>
    </AppShell>
  );
}
