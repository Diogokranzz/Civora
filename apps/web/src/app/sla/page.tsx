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
} from '@civora/ui';
import { AppShell } from '../../components/app-shell';
import { civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function SlaPanelPage() {
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);

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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:h-full lg:min-h-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Painel de SLA & Calendários Comerciais</h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Metas de primeira resposta, atualização, resolução, feriados e escalonamento progressivo.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Card>
              <CardContent className="px-3.5 py-2">
                <p className="text-[11px] font-medium text-slate-500">Cumprimento SLA</p>
                <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {dashboardQuery.data ? `${dashboardQuery.data.slaComplianceRate}%` : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="px-3.5 py-2">
                <p className="text-[11px] font-medium text-slate-500">MTTA Médio</p>
                <p className="text-lg font-bold tabular-nums">
                  {dashboardQuery.data ? `${dashboardQuery.data.mttaMinutes} min` : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="px-3.5 py-2">
                <p className="text-[11px] font-medium text-slate-500">Em Risco / Violados</p>
                <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
                  {dashboardQuery.data?.slaAtRiskTickets.length ?? '—'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-3">
          <Card className="flex flex-col lg:min-h-0">
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

          <Card className="flex flex-col lg:min-h-0">
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

          <Card className="flex flex-col lg:min-h-0">
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

