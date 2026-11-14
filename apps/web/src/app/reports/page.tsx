'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, TableSkeleton, cn } from '@civora/ui';
import { AppShell } from '../../components/app-shell';
import { civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

export default function ReportsPage() {
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);
  const activeUnitId = useCivoraStore((s) => s.activeUnitId);
  const [days, setDays] = React.useState(14);
  const [mobileReportTab, setMobileReportTab] = React.useState<'volume' | 'dept' | 'priority'>('volume');

  const metricsQuery = useQuery({
    queryKey: ['reports-dashboard', activeOrganizationId, activeUnitId, days],
    queryFn: () => civoraApi.getDashboard({ unitId: activeUnitId ?? undefined, days }),
    enabled: Boolean(user && activeOrganizationId),
  });

  const m = metricsQuery.data;

  return (
    <AppShell breadcrumb="Relatórios">
      <div className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col gap-2 overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold tracking-tight truncate">Relatórios & Indicadores</h1>
            <p className="hidden sm:block text-xs text-slate-600 dark:text-slate-400">
              Métricas operacionais reais de SLA, MTTR, MTTA, backlog e satisfação.
            </p>
          </div>
          <select
            aria-label="Período de análise"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={14}>Últimos 14 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </select>
        </div>

        {metricsQuery.isLoading ? (
          <TableSkeleton rows={6} />
        ) : metricsQuery.isError ? (
          <ErrorState
            description={
              metricsQuery.error instanceof Error
                ? metricsQuery.error.message
                : 'Erro ao carregar relatórios.'
            }
            onRetry={() => void metricsQuery.refetch()}
          />
        ) : m ? (
          <>
            {/* Mobile Compact KPI Ribbon */}
            <div className="flex sm:hidden overflow-x-auto no-scrollbar gap-1.5 shrink-0 py-0.5">
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <span>SLA:</span>
                <span className="font-bold text-emerald-600">{m.slaComplianceRate}%</span>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <span>MTTR:</span>
                <span className="font-bold">{m.mttrMinutes}m</span>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <span>MTTA:</span>
                <span className="font-bold">{m.mttaMinutes}m</span>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <span>Reabertura:</span>
                <span className="font-bold">{m.reopenRate}%</span>
              </div>
            </div>

            {/* Mobile Chart Tab Switcher */}
            <div role="tablist" aria-label="Visualizações de Gráficos Mobile" className="flex lg:hidden shrink-0 rounded-xl border border-slate-200/90 bg-white p-1 shadow-xs dark:border-white/[0.08] dark:bg-[#0F172A]">
              <button
                type="button"
                role="tab"
                aria-selected={mobileReportTab === 'volume'}
                onClick={() => setMobileReportTab('volume')}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-semibold transition-colors',
                  mobileReportTab === 'volume'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                <span>Volume</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileReportTab === 'dept'}
                onClick={() => setMobileReportTab('dept')}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-semibold transition-colors',
                  mobileReportTab === 'dept'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                <span>Departamentos</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileReportTab === 'priority'}
                onClick={() => setMobileReportTab('priority')}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-semibold transition-colors',
                  mobileReportTab === 'priority'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                <span>Prioridades</span>
              </button>
            </div>

            <div className="hidden sm:grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardContent className="p-3">
                  <p className="text-[11px] text-slate-500">MTTA Médio</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums">{m.mttaMinutes} min</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-[11px] text-slate-500">MTTR Médio</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums">{m.mttrMinutes} min</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-[11px] text-slate-500">Cumprimento SLA</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {m.slaComplianceRate}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-[11px] text-slate-500">Taxa de Reabertura</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums">{m.reopenRate}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-[11px] text-slate-500">Backlog / CSAT</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums">
                    {m.backlogTickets} / {m.avgCsat ?? 'N/A'}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-3 gap-3 overflow-hidden">
              <Card className={cn("flex flex-1 min-h-0 flex-col overflow-hidden", mobileReportTab !== 'volume' && 'hidden lg:flex')}>
                <CardHeader className="shrink-0 pb-2">
                  <CardTitle className="text-sm">Volume por Período (Abertos vs Resolvidos)</CardTitle>
                </CardHeader>
                <CardContent className="min-h-[220px] flex-1 lg:min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={m.volumeOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.25} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="created"
                        name="Abertos"
                        stroke="#2563eb"
                        fill="#2563eb"
                        fillOpacity={0.2}
                      />
                      <Area
                        type="monotone"
                        dataKey="resolved"
                        name="Resolvidos"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="flex flex-col lg:min-h-0">
                <CardHeader className="shrink-0 pb-2">
                  <CardTitle className="text-sm">Distribuição por Prioridade</CardTitle>
                </CardHeader>
                <CardContent className="min-h-[220px] flex-1 lg:min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={m.byPriority}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.25} />
                      <XAxis dataKey="priority" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Chamados" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="flex flex-col lg:min-h-0">
                <CardHeader className="shrink-0 pb-2">
                  <CardTitle className="text-sm">Desempenho por Equipe</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto lg:min-h-0">
                  {m.teamPerformance.length === 0 ? (
                    <EmptyState
                      compact
                      title="Sem métricas de equipe ainda"
                      description="Crie equipes em Departamentos & Equipes e atribua chamados para acompanhar o desempenho consolidado."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-300">
                            <th className="py-2">Equipe</th>
                            <th className="py-2">Abertos</th>
                            <th className="py-2">Resolv.</th>
                            <th className="py-2">SLA</th>
                            <th className="py-2">Média</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {m.teamPerformance.map((tp) => (
                            <tr key={tp.teamId}>
                              <td className="py-2 font-semibold">{tp.teamName}</td>
                              <td className="py-2 tabular-nums">{tp.openCount}</td>
                              <td className="py-2 tabular-nums">{tp.resolvedCount}</td>
                              <td className="py-2 tabular-nums">{tp.slaComplianceRate}%</td>
                              <td className="py-2 tabular-nums">{tp.avgResolutionMinutes}m</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

