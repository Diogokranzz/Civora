'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  ForbiddenState,
  TableSkeleton,
} from '@civora/ui';
import { AppShell } from '../../components/app-shell';
import { ApiClientError, civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

export default function AuditLgpdPage() {
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);
  const [page, setPage] = React.useState(1);

  const logsQuery = useQuery({
    queryKey: ['audit-logs', activeOrganizationId, page],
    queryFn: () => civoraApi.listAuditLogs(page),
    enabled: Boolean(user && activeOrganizationId),
  });

  const handleSelfExport = async () => {
    if (!user) return;
    const data = await civoraApi.exportLgpdData(user.id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `civora-lgpd-export-${user.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell breadcrumb="Auditoria & LGPD">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:h-full lg:min-h-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Trilha de Auditoria Imutável & LGPD</h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Registro completo de autor, ação, recurso, estado anterior/posterior, IP, correlationId e direitos do titular.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleSelfExport()}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Exportar Meus Dados (LGPD)
          </Button>
        </div>

        <Card className="flex flex-1 flex-col overflow-hidden lg:min-h-0">
          <CardHeader className="shrink-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
              Eventos Auditados da Organização
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col overflow-hidden lg:min-h-0">
            {logsQuery.isLoading ? (
              <TableSkeleton rows={6} />
            ) : logsQuery.isError ? (
              logsQuery.error instanceof ApiClientError && logsQuery.error.status === 403 ? (
                <ForbiddenState />
              ) : (
                <ErrorState
                  description={
                    logsQuery.error instanceof Error
                      ? logsQuery.error.message
                      : 'Falha ao carregar auditoria'
                  }
                />
              )
            ) : (logsQuery.data?.data ?? []).length === 0 ? (
              <EmptyState
                compact
                title="Nenhum evento de auditoria registrado"
                description="As operações executadas pelo Administrador PRO e pelos membros da organização serão listadas nesta trilha."
              />
            ) : (
              <>
                <div className="flex-1 overflow-auto lg:min-h-0">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white dark:bg-slate-900">
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                        <th className="py-2">Data/Hora</th>
                        <th className="py-2">Ator</th>
                        <th className="py-2">Ação</th>
                        <th className="py-2">Recurso</th>
                        <th className="py-2">Correlation ID</th>
                        <th className="py-2">Origem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {(logsQuery.data?.data ?? []).map((log) => (
                        <tr key={log.id}>
                          <td className="whitespace-nowrap py-2 font-mono">
                            {new Date(log.createdAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2">{log.actor?.name ?? 'Sistema'}</td>
                          <td className="py-2">
                            <Badge variant="info">{log.action}</Badge>
                          </td>
                          <td className="py-2 font-mono">
                            {log.resourceType}:{log.resourceId.slice(0, 8)}
                          </td>
                          <td className="py-2 font-mono text-slate-500">
                            {log.correlationId?.slice(0, 12) ?? '—'}
                          </td>
                          <td className="py-2">{log.origin}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex shrink-0 items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">
                  <span>
                    Página {logsQuery.data?.meta.page} de {logsQuery.data?.meta.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!logsQuery.data?.meta.hasPreviousPage}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!logsQuery.data?.meta.hasNextPage}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

