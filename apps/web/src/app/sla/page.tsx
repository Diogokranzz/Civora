'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PriorityBadge,
  SlaBadge,
  TableSkeleton,
  cn,
} from '@civora/ui';
import { AppShell } from '../../components/app-shell';
import { civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function SlaPanelPage() {
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);
  const [mobileSlaTab, setMobileSlaTab] = React.useState<'atRisk' | 'policies' | 'calendars'>('atRisk');

  const calendarsQuery = useQuery({
    queryKey: ['sla-calendars', activeOrganizationId],
    queryFn: () => civoraApi.listCalendars(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const policiesQuery = useQuery({
    queryKey: ['sla-policies', activeOrganizationId],
    queryFn: () => civoraApi.listSlaPolicies(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', activeOrganizationId],
    queryFn: () => civoraApi.getDashboard(),
    enabled: Boolean(user && activeOrganizationId),
  });

  return (
    <AppShell breadcrumb="Painel de SLA">
      <div className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col gap-2 overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold tracking-tight truncate">Painel de SLA</h1>
            <p className="hidden sm:block text-xs text-slate-600 dark:text-slate-400">
              Metas de primeira resposta, atualização, resolução, feriados e escalonamento progressivo.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-center dark:border-slate-800 dark:bg-slate-900">
              <span className="block text-[10px] text-slate-500">Cumprimento</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {dashboardQuery.data ? `${dashboardQuery.data.slaComplianceRate}%` : '—'}
              </span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-center dark:border-slate-800 dark:bg-slate-900">
              <span className="block text-[10px] text-slate-500">Risco</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">
                {dashboardQuery.data?.slaAtRiskTickets.length ?? '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div role="tablist" aria-label="Visualizações SLA Mobile" className="flex lg:hidden shrink-0 rounded-xl border border-slate-200/90 bg-white p-1 shadow-xs dark:border-white/[0.08] dark:bg-[#0F172A]">
          <button
            type="button"
            role="tab"
            aria-selected={mobileSlaTab === 'atRisk'}
            onClick={() => setMobileSlaTab('atRisk')}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-semibold transition-colors',
              mobileSlaTab === 'atRisk'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <span>Em Risco ({dashboardQuery.data?.slaAtRiskTickets.length ?? 0})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileSlaTab === 'policies'}
            onClick={() => setMobileSlaTab('policies')}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-semibold transition-colors',
              mobileSlaTab === 'policies'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <span>Políticas</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileSlaTab === 'calendars'}
            onClick={() => setMobileSlaTab('calendars')}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-semibold transition-colors',
              mobileSlaTab === 'calendars'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <span>Calendários</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-3 gap-3 overflow-hidden">
          <Card className={cn("flex flex-1 min-h-0 flex-col overflow-hidden", mobileSlaTab !== 'atRisk' && 'hidden lg:flex')}>
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />
                Chamados em Risco ou Violados
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto lg:min-h-0">
            {dashboardQuery.isLoading ? (
              <TableSkeleton rows={3} />
            ) : (dashboardQuery.data?.slaAtRiskTickets ?? []).length === 0 ? (
              <EmptyState
                compact
                title="Nenhum chamado em risco imediato de SLA"
                description="Quando houver chamados próximos do limite ou violados, eles serão destacados aqui."
              />
            ) : (
              <div className="space-y-2">
                {dashboardQuery.data?.slaAtRiskTickets.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-3 text-xs dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/tickets/${t.id}`}
                        className="font-mono font-bold text-blue-700 hover:underline dark:text-blue-400"
                      >
                        {t.publicNumber}
                      </Link>
                      <PriorityBadge priority={t.priority} />
                      <span className="font-medium">{t.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.sla ? (
                        <SlaBadge state={t.sla.state} consumedPercent={t.sla.consumedPercent} />
                      ) : null}
                      <span className="font-mono text-slate-500">
                        {t.dueAt ? new Date(t.dueAt).toLocaleString('pt-BR') : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

          <Card className={cn("flex flex-1 min-h-0 flex-col overflow-hidden", mobileSlaTab !== 'policies' && 'hidden lg:flex')}>
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-blue-600" aria-hidden="true" />
                Políticas de SLA Ativas
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-3 overflow-y-auto lg:min-h-0">
              {(policiesQuery.data ?? []).length === 0 ? (
                <EmptyState
                  compact
                  title="Nenhuma política de SLA configurada"
                  description="Defina políticas de SLA vinculadas a calendários comerciais para acompanhar metas por prioridade."
                />
              ) : (
                (policiesQuery.data ?? []).map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{p.name}</span>
                      <Badge variant={p.isActive ? 'success' : 'neutral'}>
                        {p.isActive ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-slate-500 dark:text-slate-300">
                      Calendário: {p.calendar.name} ({p.calendar.timezone})
                    </p>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-300">
                            <th className="py-1">Prioridade</th>
                            <th className="py-1">1ª Resp.</th>
                            <th className="py-1">Atualiz.</th>
                            <th className="py-1">Resolução</th>
                            <th className="py-1">Alerta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.targets.map((tg) => (
                            <tr key={tg.priority} className="border-b border-slate-100 dark:border-slate-800/50">
                              <td className="py-1 font-semibold">{tg.priority}</td>
                              <td className="py-1 tabular-nums">{tg.firstResponseMinutes}m</td>
                              <td className="py-1 tabular-nums">{tg.updateMinutes}m</td>
                              <td className="py-1 tabular-nums">{tg.resolutionMinutes}m</td>
                              <td className="py-1 tabular-nums">{tg.warningThresholdPct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className={cn("flex flex-1 min-h-0 flex-col overflow-hidden", mobileSlaTab !== 'calendars' && 'hidden lg:flex')}>
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-blue-600" aria-hidden="true" />
                Calendários de Atendimento & Feriados
              </CardTitle>
              <CardDescription className="text-xs">
                Turnos úteis e exceções considerados no cálculo do relógio de SLA.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-3 overflow-y-auto lg:min-h-0">
              {(calendarsQuery.data ?? []).length === 0 ? (
                <EmptyState
                  compact
                  title="Nenhum calendário comercial cadastrado"
                  description="Configure turnos de atendimento e feriados corporativos para habilitar a contagem útil do SLA."
                />
              ) : (
                (calendarsQuery.data ?? []).map((cal) => (
                  <div
                    key={cal.id}
                    className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{cal.name}</span>
                      <Badge variant="info">{cal.timezone}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {cal.businessHours.map((bh, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] dark:bg-slate-800"
                        >
                          {WEEKDAYS[bh.dayOfWeek]} {bh.startTime}–{bh.endTime}
                        </span>
                      ))}
                    </div>
                    {cal.holidays.length > 0 ? (
                      <div className="mt-3">
                        <p className="font-semibold text-slate-500 dark:text-slate-300">Feriados configurados:</p>
                        <ul className="mt-1 space-y-0.5">
                          {cal.holidays.map((h) => (
                            <li key={h.id} className="font-mono text-[11px]">
                              {h.date.slice(0, 10)} — {h.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

