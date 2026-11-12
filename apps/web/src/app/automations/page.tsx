'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Webhook, Workflow } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
} from '@civora/ui';
import { AppShell } from '../../components/app-shell';
import { civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

export default function AutomationsPage() {
  const queryClient = useQueryClient();
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);

  const [ruleName, setRuleName] = React.useState('');
  const [trigger, setTrigger] = React.useState('TICKET_CREATED');
  const [tagToAdd, setTagToAdd] = React.useState('triagem-auto');

  const rulesQuery = useQuery({
    queryKey: ['automation-rules', activeOrganizationId],
    queryFn: () => civoraApi.listAutomationRules(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const executionsQuery = useQuery({
    queryKey: ['automation-execs', activeOrganizationId],
    queryFn: () => civoraApi.listAutomationExecutions(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const webhooksQuery = useQuery({
    queryKey: ['webhooks', activeOrganizationId],
    queryFn: () => civoraApi.listWebhooks(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const createRuleMutation = useMutation({
    mutationFn: () =>
      civoraApi.createAutomationRule({
        name: ruleName,
        trigger,
        conditions: [{ field: 'ticket.priority', operator: 'in', value: ['HIGH', 'CRITICAL'] }],
        actions: [{ type: 'ADD_TAG', params: { tag: tagToAdd } }],
      }),
    onSuccess: () => {
      setRuleName('');
      void queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => civoraApi.deleteAutomationRule(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      void queryClient.invalidateQueries({ queryKey: ['automation-execs'] });
    },
  });

  return (
    <AppShell breadcrumb="Automações & Webhooks">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:h-full lg:min-h-0">
        <div className="shrink-0">
          <h1 className="text-xl font-bold tracking-tight">Motor de Regras, Automações & Webhooks</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Regras trigger-conditions-actions com proteção contra loops, idempotência, DLQ e webhooks assinados via HMAC-SHA256.
          </p>
        </div>

        <div className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-2">
          <Card className="flex flex-col lg:min-h-0">
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Workflow className="h-4 w-4 text-blue-600" aria-hidden="true" />
                Regras Configuradas
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3 text-xs lg:min-h-0">
              <div className="flex-1 space-y-2.5 overflow-y-auto lg:min-h-0">
              {(rulesQuery.data ?? []).length === 0 ? (
                <EmptyState
                  compact
                  title="Nenhuma regra de automação cadastrada"
                  description="Crie sua primeira regra para automatizar tags, prioridades ou escalonamentos."
                />
              ) : (
                (rulesQuery.data ?? []).map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{r.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={r.isActive ? 'success' : 'neutral'}>
                          {r.isActive ? 'Ativa' : 'Pausada'}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await civoraApi.toggleAutomationRule(r.id, !r.isActive);
                            void queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
                          }}
                        >
                          {r.isActive ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deleteRuleMutation.isPending && deleteRuleMutation.variables === r.id}
                          aria-label={`Apagar regra ${r.name}`}
                          className="border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/60 dark:hover:text-red-200"
                          onClick={() => deleteRuleMutation.mutate(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {deleteRuleMutation.isPending && deleteRuleMutation.variables === r.id
                            ? 'Apagando...'
                            : 'Apagar'}
                        </Button>
                      </div>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-300">
                      Trigger: {r.trigger} • Execuções: {r.executionCount}
                    </p>
                  </div>
                ))
              )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createRuleMutation.mutate();
                }}
                className="shrink-0 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800"
              >
                <Label htmlFor="rule-name">Nova regra rápida (Prioridade Alta/Crítica → Tag)</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="rule-name"
                    required
                    placeholder="Nome da regra"
                    className="flex-1 min-w-[180px]"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                  />
                  <select
                    aria-label="Trigger da regra"
                    value={trigger}
                    onChange={(e) => setTrigger(e.target.value)}
                    className="h-9 rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="TICKET_CREATED">TICKET_CREATED</option>
                    <option value="SLA_WARNING_REACHED">SLA_WARNING_REACHED</option>
                    <option value="SLA_BREACHED">SLA_BREACHED</option>
                  </select>
                  <Input
                    placeholder="Tag"
                    className="w-32"
                    value={tagToAdd}
                    onChange={(e) => setTagToAdd(e.target.value)}
                  />
                  <Button type="submit" size="sm" disabled={createRuleMutation.isPending}>
                    Criar Regra
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="flex flex-col lg:min-h-0">
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Webhook className="h-4 w-4 text-blue-600" aria-hidden="true" />
                Webhooks & Histórico de Execuções
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto text-xs lg:min-h-0">
              {(webhooksQuery.data ?? []).length === 0 ? (
                <p className="text-slate-500">Nenhum webhook externo cadastrado para esta organização.</p>
              ) : (
                (webhooksQuery.data ?? []).map((wh) => (
                  <div key={wh.id} className="rounded border border-slate-200 p-2.5 dark:border-slate-800">
                    <p className="font-semibold">{wh.name}</p>
                    <p className="font-mono text-[11px] text-slate-500">{wh.url}</p>
                  </div>
                ))
              )}

              <div>
                <p className="mb-2 font-semibold text-slate-500">Últimas execuções de automação</p>
                {(executionsQuery.data ?? []).length === 0 ? (
                  <p className="text-slate-500">Nenhuma execução registrada ainda.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {(executionsQuery.data ?? []).slice(0, 10).map((ex) => (
                      <li
                        key={ex.id}
                        className="flex items-center justify-between rounded border border-slate-200 px-2.5 py-1.5 dark:border-slate-800"
                      >
                        <span>
                          <strong>{ex.rule.name}</strong> (depth={ex.depth})
                        </span>
                        <Badge variant={ex.status === 'SUCCEEDED' ? 'success' : 'warning'}>
                          {ex.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

