'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TICKET_ALLOWED_TRANSITIONS } from '@civora/config';
import type { AiSuggestionDto, PriorityLevel, TicketStatus } from '@civora/types';
import {
  ArrowLeft,
  Check,
  Clock,
  FileUp,
  Lock,
  Paperclip,
  Send,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { AppShell } from '../../../components/app-shell';
import { ApiClientError, civoraApi } from '../../../lib/api';
import { useCivoraStore } from '../../../lib/store';

export default function TicketDetailPageClient({ idOverride }: { idOverride?: string } = {}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = idOverride || params?.id || 'CIV-2026-000001';
  const queryClient = useQueryClient();
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);

  const activeMembership = user?.memberships.find(
    (m) => m.organizationId === activeOrganizationId,
  );
  const canInternalNote = activeMembership?.permissions.includes('tickets:comment_internal');
  const canAssign = activeMembership?.permissions.includes('tickets:assign');
  const canOverridePriority = activeMembership?.permissions.includes('tickets:override_priority');
  const canUseAi = activeMembership?.permissions.includes('ai:use');

  const [activeTab, setActiveTab] = React.useState<'comments' | 'timeline' | 'attachments' | 'approvals'>('comments');
  const [mobileSection, setMobileSection] = React.useState<'interactions' | 'details'>('interactions');
  const [commentBody, setCommentBody] = React.useState('');
  const [isInternal, setIsInternal] = React.useState(false);

  const [transitionModal, setTransitionModal] = React.useState<TicketStatus | null>(null);
  const [transitionNote, setTransitionNote] = React.useState('');

  const [priorityModalOpen, setPriorityModalOpen] = React.useState(false);
  const [overrideTarget, setOverrideTarget] = React.useState<PriorityLevel>('HIGH');
  const [overrideReason, setOverrideReason] = React.useState('');

  const [latestAi, setLatestAi] = React.useState<AiSuggestionDto | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const ticketQuery = useQuery({
    queryKey: ['ticket', id, activeOrganizationId],
    queryFn: () => civoraApi.getTicket(id),
    enabled: Boolean(user && id),
  });

  const timelineQuery = useQuery({
    queryKey: ['ticket-timeline', id, activeOrganizationId],
    queryFn: () => civoraApi.getTicketTimeline(id),
    enabled: Boolean(user && id && activeTab === 'timeline'),
  });

  const usersQuery = useQuery({
    queryKey: ['users', activeOrganizationId],
    queryFn: () => civoraApi.listUsers(),
    enabled: Boolean(user && canAssign),
  });

  const teamsQuery = useQuery({
    queryKey: ['teams', activeOrganizationId],
    queryFn: () => civoraApi.listTeams(),
    enabled: Boolean(user && canAssign),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['ticket', id] });
    void queryClient.invalidateQueries({ queryKey: ['ticket-timeline', id] });
    void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const transitionMutation = useMutation({
    mutationFn: (payload: {
      targetStatus: TicketStatus;
      reason?: string;
      resolutionSummary?: string;
      cancellationReason?: string;
    }) =>
      civoraApi.transitionTicket(id, {
        ...payload,
        version: ticketQuery.data?.version,
      }),
    onSuccess: () => {
      setActionError(null);
      setTransitionModal(null);
      setTransitionNote('');
      invalidate();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Erro na transição'),
  });

  const assignMutation = useMutation({
    mutationFn: (payload: { assigneeId?: string | null; teamId?: string | null }) =>
      civoraApi.assignTicket(id, { ...payload, version: ticketQuery.data?.version }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Erro na atribuição'),
  });

  const overrideMutation = useMutation({
    mutationFn: () =>
      civoraApi.overridePriority(id, {
        priority: overrideTarget,
        reason: overrideReason,
        version: ticketQuery.data?.version,
      }),
    onSuccess: () => {
      setPriorityModalOpen(false);
      setOverrideReason('');
      setActionError(null);
      invalidate();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Erro ao alterar prioridade'),
  });

  const commentMutation = useMutation({
    mutationFn: () => civoraApi.addComment(id, { body: `<p>${commentBody.replace(/</g, '&lt;')}</p>`, isInternal }),
    onSuccess: () => {
      setCommentBody('');
      setActionError(null);
      invalidate();
    },
  });

  const aiMutation = useMutation({
    mutationFn: (featureType: string) => civoraApi.runAiAssist(id, featureType),
    onSuccess: (data) => setLatestAi(data),
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Falha na assistência de IA'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => civoraApi.deleteTicket(ticketQuery.data?.id || id),
    onSuccess: () => {
      invalidate();
      router.push('/tickets');
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Não foi possível apagar o chamado.'),
  });

  const ticket = ticketQuery.data;

  if (ticketQuery.isLoading) {
    return (
      <AppShell breadcrumb="Carregando chamado...">
        <TableSkeleton rows={8} />
      </AppShell>
    );
  }

  if (ticketQuery.isError) {
    return (
      <AppShell breadcrumb="Chamado">
        {ticketQuery.error instanceof ApiClientError && ticketQuery.error.status === 403 ? (
          <ForbiddenState />
        ) : (
          <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">
              Chamado não localizado
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {ticketQuery.error instanceof Error
                ? ticketQuery.error.message
                : 'O chamado solicitado não foi encontrado no sistema ou foi removido.'}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Link href="/tickets">
                <Button size="sm">Voltar para Central de Chamados</Button>
              </Link>
              <Button size="sm" variant="outline" onClick={() => void ticketQuery.refetch()}>
                Tentar Novamente
              </Button>
            </div>
          </div>
        )}
      </AppShell>
    );
  }

  if (!ticket) return null;

  const allowedTransitions = TICKET_ALLOWED_TRANSITIONS[ticket.status];

  const handleTransitionClick = (target: TicketStatus) => {
    if (target === 'RESOLVED' || target === 'CANCELED' || target === 'CLOSED') {
      setTransitionModal(target);
      return;
    }
    transitionMutation.mutate({ targetStatus: target });
  };

  return (
    <AppShell breadcrumb={ticket.publicNumber}>
      <div className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col gap-2 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link
              href="/tickets"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Voltar
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400">
                  {ticket.publicNumber}
                </span>
                <TicketStatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                {ticket.sla ? (
                  <SlaBadge state={ticket.sla.state} consumedPercent={ticket.sla.consumedPercent} />
                ) : null}
                <Badge variant="neutral">v{ticket.version}</Badge>
              </div>
              <h1 className="mt-0.5 text-base font-bold tracking-tight">{ticket.title}</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {allowedTransitions.map((target) => (
              <Button
                key={target}
                size="sm"
                variant={target === 'RESOLVED' ? 'default' : target === 'CANCELED' ? 'destructive' : 'outline'}
                disabled={transitionMutation.isPending || deleteMutation.isPending}
                onClick={() => handleTransitionClick(target)}
              >
                {target}
              </Button>
            ))}

            <Button
              size="sm"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm(`Tem certeza que deseja apagar o chamado ${ticket.publicNumber}?`)) {
                  deleteMutation.mutate();
                }
              }}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{deleteMutation.isPending ? 'Apagando...' : 'Apagar'}</span>
            </Button>
          </div>
        </div>

        {actionError ? (
          <div
            role="alert"
            className="flex shrink-0 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        ) : null}

        {/* Mobile Section Switcher */}
        <div role="tablist" aria-label="Visualizações do Chamado Mobile" className="flex lg:hidden shrink-0 rounded-xl border border-slate-200/90 bg-white p-1 shadow-xs dark:border-white/[0.08] dark:bg-[#0F172A]">
          <button
            type="button"
            role="tab"
            aria-selected={mobileSection === 'interactions'}
            onClick={() => setMobileSection('interactions')}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-semibold transition-colors',
              mobileSection === 'interactions'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <span>Interações ({ticket.comments.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileSection === 'details'}
            onClick={() => setMobileSection('details')}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-semibold transition-colors',
              mobileSection === 'details'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <span>Detalhes & SLA</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 gap-3 overflow-hidden">
          {/* Left 8 Columns: Description + Tabs */}
          <div className={cn("flex-1 min-h-0 flex flex-col gap-2 lg:col-span-8 overflow-hidden", mobileSection !== 'interactions' && 'hidden lg:flex')}>
            <Card className="shrink-0 overflow-hidden">
              <CardHeader className="py-2.5">
                <CardTitle className="text-sm">Descrição do Chamado</CardTitle>
              </CardHeader>
              <CardContent className="max-h-32 overflow-y-auto pt-0 pb-3">
                <div
                  className="prose prose-sm max-w-none text-slate-800 dark:prose-invert dark:text-slate-200"
                  dangerouslySetInnerHTML={{ __html: ticket.descriptionHtml }}
                />
                {ticket.resolutionSummary ? (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <p className="font-semibold">Resolução registrada:</p>
                    <p className="mt-1">{ticket.resolutionSummary}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="flex flex-1 flex-col overflow-hidden lg:min-h-0">
              <div className="flex shrink-0 border-b border-slate-200 px-2 sm:px-4 pt-1.5 dark:border-slate-800 overflow-x-auto no-scrollbar whitespace-nowrap">
                {(
                  [
                    ['comments', `Interações (${ticket.comments.length})`],
                    ['attachments', `Anexos (${ticket.attachments.length})`],
                    ['approvals', `Aprovações (${ticket.approvals.length})`],
                    ['timeline', 'Timeline de Eventos'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={`border-b-2 px-3 py-2 text-xs font-semibold ${
                      activeTab === key
                        ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                        : 'border-transparent text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <CardContent className="flex-1 overflow-y-auto pt-3 lg:min-h-0">
                {activeTab === 'comments' ? (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      {ticket.comments.map((c) => (
                        <div
                          key={c.id}
                          className={`rounded-lg border p-3 ${
                            c.isInternal
                              ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20'
                              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'
                          }`}
                        >
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="font-semibold">{c.author.name}</span>
                            <div className="flex items-center gap-2">
                              {c.isInternal ? (
                                <Badge variant="warning">
                                  <Lock className="h-3 w-3" aria-hidden="true" />
                                  Nota Interna
                                </Badge>
                              ) : (
                                <Badge variant="info">Público</Badge>
                              )}
                              <span className="text-slate-500">
                                {new Date(c.createdAt).toLocaleString('pt-BR')}
                              </span>
                            </div>
                          </div>
                          <div
                            className="text-sm text-slate-800 dark:text-slate-200"
                            dangerouslySetInnerHTML={{ __html: c.bodyHtml }}
                          />
                        </div>
                      ))}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (commentBody.trim()) commentMutation.mutate();
                      }}
                      className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between">
                        <Label htmlFor="comment-input">Nova resposta</Label>
                        {canInternalNote ? (
                          <label className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={isInternal}
                              onChange={(e) => setIsInternal(e.target.checked)}
                            />
                            <span>Nota interna (oculta do solicitante)</span>
                          </label>
                        ) : null}
                      </div>
                      <Textarea
                        id="comment-input"
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        placeholder={
                          isInternal
                            ? 'Registre observação técnica interna para a equipe...'
                            : 'Escreva uma atualização pública para o solicitante...'
                        }
                      />
                      <div className="flex justify-end">
                        <Button type="submit" size="sm" disabled={commentMutation.isPending}>
                          <Send className="h-3.5 w-3.5" aria-hidden="true" />
                          {isInternal ? 'Salvar Nota Interna' : 'Enviar Comentário'}
                        </Button>
                      </div>
                    </form>
                  </div>
                ) : null}

                {activeTab === 'attachments' ? (
                  <div className="space-y-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                      <FileUp className="h-4 w-4" aria-hidden="true" />
                      <span>Anexar arquivo (PNG, JPG, PDF, TXT, CSV, DOCX, XLSX — máx 10 MB)</span>
                      <input
                        type="file"
                        className="sr-only"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            await civoraApi.uploadAttachment(ticket.id, file);
                            invalidate();
                          } catch (err) {
                            setActionError(err instanceof Error ? err.message : 'Falha no upload');
                          }
                        }}
                      />
                    </label>
                    {ticket.attachments.length === 0 ? (
                      <p className="text-xs text-slate-500">Nenhum anexo enviado neste chamado.</p>
                    ) : (
                      <ul className="space-y-2">
                        {ticket.attachments.map((att) => (
                          <li
                            key={att.id}
                            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"
                          >
                            <span className="flex items-center gap-2 font-medium">
                              <Paperclip className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                              {att.fileName} ({Math.round(att.sizeBytes / 1024)} KB)
                            </span>
                            <a
                              href={`${civoraApi.getApiBaseUrl()}/api/v1/tickets/${ticket.id}/attachments/${att.id}/download`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Baixar
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}

                {activeTab === 'approvals' ? (
                  <div className="space-y-3">
                    {ticket.approvals.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Nenhuma solicitação de aprovação vinculada.
                      </p>
                    ) : (
                      ticket.approvals.map((ap) => (
                        <div
                          key={ap.id}
                          className="rounded-md border border-slate-200 p-3 text-xs dark:border-slate-800"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{ap.title}</span>
                            <Badge variant={ap.status === 'APPROVED' ? 'success' : ap.status === 'REJECTED' ? 'danger' : 'warning'}>
                              {ap.status}
                            </Badge>
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {ap.steps.map((st) => (
                              <div key={st.id} className="flex items-center justify-between">
                                <span>
                                  Etapa {st.stepOrder}: {st.approver.name} ({st.status})
                                </span>
                                {st.status === 'PENDING' && st.approver.id === user?.id ? (
                                  <div className="flex gap-1.5">
                                    <Button
                                      size="sm"
                                      onClick={async () => {
                                        await civoraApi.decideApproval(ap.id, { decision: 'APPROVED' });
                                        invalidate();
                                      }}
                                    >
                                      Aprovar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={async () => {
                                        await civoraApi.decideApproval(ap.id, {
                                          decision: 'REJECTED',
                                          note: 'Rejeitado pelo aprovador',
                                        });
                                        invalidate();
                                      }}
                                    >
                                      Rejeitar
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}

                {activeTab === 'timeline' ? (
                  <div className="space-y-2">
                    {(timelineQuery.data?.data ?? []).map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-start justify-between rounded border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"
                      >
                        <div>
                          <span className="font-mono font-semibold">{ev.eventType}</span>
                          {ev.actor ? (
                            <span className="ml-2 text-slate-500">por {ev.actor.name}</span>
                          ) : null}
                          <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                            {JSON.stringify(ev.payload)}
                          </p>
                        </div>
                        <span className="whitespace-nowrap text-slate-500">
                          {new Date(ev.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Metadata, SLA Clock, AI Copilot */}
          <div className={cn("flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto pr-0.5 lg:col-span-4", mobileSection !== 'details' && 'hidden lg:flex')}>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Propriedades & Atribuição</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Solicitante</span>
                  <span className="font-medium">{ticket.requester.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Unidade</span>
                  <span className="font-medium">{ticket.unit?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Departamento</span>
                  <span className="font-medium">{ticket.department?.name ?? '—'}</span>
                </div>

                {canAssign ? (
                  <>
                    <div className="space-y-1 pt-2">
                      <Label htmlFor="assign-team" className="text-xs">
                        Equipe responsável
                      </Label>
                      <select
                        id="assign-team"
                        value={ticket.team?.id ?? ''}
                        onChange={(e) =>
                          assignMutation.mutate({ teamId: e.target.value || null })
                        }
                        className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="">Sem equipe</option>
                        {(teamsQuery.data ?? []).map((tm) => (
                          <option key={tm.id} value={tm.id}>
                            {tm.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="assign-agent" className="text-xs">
                        Agente responsável
                      </Label>
                      <select
                        id="assign-agent"
                        value={ticket.assignee?.id ?? ''}
                        onChange={(e) =>
                          assignMutation.mutate({ assigneeId: e.target.value || null })
                        }
                        className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="">Não atribuído</option>
                        {(usersQuery.data ?? []).map((u) => (
                          <option key={u.userId} value={u.userId}>
                            {u.name} ({u.role.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Responsável</span>
                    <span className="font-medium">{ticket.assignee?.name ?? 'Não atribuído'}</span>
                  </div>
                )}

                {canOverridePriority ? (
                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setOverrideTarget(ticket.priority);
                        setPriorityModalOpen(true);
                      }}
                    >
                      Substituir Prioridade (Auditável)
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* SLA Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Clock className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  Relógio de SLA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {ticket.sla ? (
                  <>
                    <p className="font-medium">{ticket.sla.policyName}</p>
                    <div className="flex justify-between">
                      <span className="text-slate-500">1ª Resposta até</span>
                      <span className="font-mono">
                        {ticket.sla.firstResponseDueAt
                          ? new Date(ticket.sla.firstResponseDueAt).toLocaleString('pt-BR')
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Resolução até</span>
                      <span className="font-mono">
                        {ticket.sla.resolutionDueAt
                          ? new Date(ticket.sla.resolutionDueAt).toLocaleString('pt-BR')
                          : '—'}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className={`h-full ${
                          ticket.sla.breached
                            ? 'bg-red-600'
                            : ticket.sla.warningTriggered
                              ? 'bg-amber-500'
                              : 'bg-emerald-600'
                        }`}
                        style={{ width: `${Math.min(100, ticket.sla.consumedPercent)}%` }}
                      />
                    </div>
                    <div className="pt-2">
                      <p className="mb-1 font-semibold text-slate-500">Histórico do relógio:</p>
                      <ul className="space-y-1">
                        {ticket.slaClockEvents.slice(0, 5).map((ev) => (
                          <li key={ev.id} className="text-[11px] text-slate-600 dark:text-slate-400">
                            <span className="font-mono font-semibold">{ev.eventType}</span> — {ev.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className="text-slate-500">Nenhuma política SLA vinculada.</p>
                )}
              </CardContent>
            </Card>

            {/* AI Copilot */}
            {canUseAi ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5 text-sm">
                    <Sparkles className="h-4 w-4 text-violet-600" aria-hidden="true" />
                    Civora AI Copilot (Sugestão)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={aiMutation.isPending}
                      onClick={() => aiMutation.mutate('SUMMARIZE_TIMELINE')}
                    >
                      Resumir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={aiMutation.isPending}
                      onClick={() => aiMutation.mutate('SUGGEST_REPLY')}
                    >
                      Sugerir Resposta
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={aiMutation.isPending}
                      onClick={() => aiMutation.mutate('DETECT_SENSITIVE_INFO')}
                    >
                      Verificar Dados
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={aiMutation.isPending}
                      onClick={() => aiMutation.mutate('RECOMMEND_ARTICLES')}
                    >
                      Artigos KB
                    </Button>
                  </div>

                  {latestAi ? (
                    <div className="rounded-md border border-violet-200 bg-violet-50/50 p-2.5 dark:border-violet-900 dark:bg-violet-950/20">
                      <p className="mb-1 text-[11px] font-semibold text-violet-800 dark:text-violet-300">
                        {latestAi.model} • {latestAi.latencyMs}ms (somente sugestão)
                      </p>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-sans text-xs">
                        {JSON.stringify(latestAi.suggestionPayload, null, 2)}
                      </pre>
                      {latestAi.decision === 'PENDING' ? (
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const upd = await civoraApi.decideAiSuggestion(latestAi.id, 'ACCEPTED');
                              setLatestAi(upd);
                            }}
                          >
                            <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                            Aceitar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const upd = await civoraApi.decideAiSuggestion(latestAi.id, 'REJECTED');
                              setLatestAi(upd);
                            }}
                          >
                            <ThumbsDown className="h-3 w-3" aria-hidden="true" />
                            Rejeitar
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-1 font-semibold">Decisão: {latestAi.decision}</p>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>

        {/* Transition Justification Modal */}
        {transitionModal ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar mudança de status"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          >
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-bold">Transicionar para {transitionModal}</h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Informe a justificativa ou resumo de resolução (mínimo 5 caracteres).
              </p>
              <Textarea
                className="mt-3"
                value={transitionNote}
                onChange={(e) => setTransitionNote(e.target.value)}
                placeholder="Descreva a resolução técnica aplicada ou motivo..."
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTransitionModal(null)}>
                  Voltar
                </Button>
                <Button
                  disabled={transitionNote.trim().length < 5 || transitionMutation.isPending}
                  onClick={() =>
                    transitionMutation.mutate({
                      targetStatus: transitionModal,
                      ...(transitionModal === 'RESOLVED' || transitionModal === 'CLOSED'
                        ? { resolutionSummary: transitionNote }
                        : {}),
                      ...(transitionModal === 'CANCELED'
                        ? { cancellationReason: transitionNote }
                        : {}),
                    })
                  }
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Confirmar
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Priority Override Modal */}
        {priorityModalOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Substituir prioridade"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          >
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-bold">Substituição Manual de Prioridade</h2>
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="override-prio">Nova Prioridade</Label>
                  <select
                    id="override-prio"
                    value={overrideTarget}
                    onChange={(e) => setOverrideTarget(e.target.value as PriorityLevel)}
                    className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="override-reason">Justificativa Auditável</Label>
                  <Input
                    id="override-reason"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Motivo operacional para alteração do SLA..."
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPriorityModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={overrideReason.trim().length < 5 || overrideMutation.isPending}
                  onClick={() => overrideMutation.mutate()}
                >
                  Aplicar & Recalcular SLA
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
