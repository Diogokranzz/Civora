'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, CheckCircle2, LifeBuoy, Search, Star } from 'lucide-react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  PriorityBadge,
  Textarea,
  TicketStatusBadge,
} from '@civora/ui';
import { AppShell } from '../../components/app-shell';
import { civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

export default function RequesterPortalPage() {
  const queryClient = useQueryClient();
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);

  const [search, setSearch] = React.useState('');
  const [selectedServiceId, setSelectedServiceId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [customFields, setCustomFields] = React.useState<Record<string, string>>({});
  const [createdBanner, setCreatedBanner] = React.useState<string | null>(null);
  const [rightTab, setRightTab] = React.useState<'requests' | 'articles'>('requests');

  const servicesQuery = useQuery({
    queryKey: ['portal-services', activeOrganizationId, search],
    queryFn: () => civoraApi.listServices(search || undefined),
    enabled: Boolean(user && activeOrganizationId),
  });

  const majorIncidentsQuery = useQuery({
    queryKey: ['portal-incidents', activeOrganizationId],
    queryFn: () => civoraApi.listMajorIncidentsPublic(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const myTicketsQuery = useQuery({
    queryKey: ['portal-my-tickets', activeOrganizationId],
    queryFn: () => civoraApi.listTickets({ page: 1, pageSize: 20 }),
    enabled: Boolean(user && activeOrganizationId),
  });

  const myApprovalsQuery = useQuery({
    queryKey: ['portal-approvals', activeOrganizationId],
    queryFn: () => civoraApi.listApprovals(),
    enabled: Boolean(user && activeOrganizationId),
  });

  // Pre-submission intelligent KB & own-request suggestions without leaking other users' private data
  const preSubmitQueryText = (title.trim().length >= 3 ? title : search).trim();
  const suggestedKbQuery = useQuery({
    queryKey: ['portal-kb-suggest', activeOrganizationId, preSubmitQueryText],
    queryFn: () => civoraApi.listKnowledge(preSubmitQueryText),
    enabled: Boolean(user && activeOrganizationId && preSubmitQueryText.length >= 3),
  });

  const selectedService = (servicesQuery.data ?? []).find((s) => s.id === selectedServiceId);

  const submitMutation = useMutation({
    mutationFn: () =>
      civoraApi.createTicket(
        {
          title,
          description: `<p>${description.replace(/</g, '&lt;')}</p>`,
          serviceId: selectedServiceId,
          channel: 'PORTAL',
          customFields,
        },
        crypto.randomUUID(),
      ),
    onSuccess: (created) => {
      setCreatedBanner(`Solicitação ${created.publicNumber} registrada com sucesso.`);
      setSelectedServiceId(null);
      setTitle('');
      setDescription('');
      setCustomFields({});
      void queryClient.invalidateQueries({ queryKey: ['portal-my-tickets'] });
    },
  });

  const pendingApprovals = (myApprovalsQuery.data ?? []).filter((a) => a.status === 'PENDING');
  const myTickets = myTicketsQuery.data?.data ?? [];

  return (
    <AppShell breadcrumb="Portal do Solicitante">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 lg:h-full lg:min-h-0">
        {/* Major Incidents Banner */}
        {(majorIncidentsQuery.data ?? []).length > 0 ? (
          <div
            role="status"
            className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <span>Comunicado de Incidente Geral em Andamento</span>
            </div>
            <ul className="mt-1 space-y-0.5 text-xs">
              {(majorIncidentsQuery.data ?? []).map((inc) => (
                <li key={inc.id}>
                  <span className="font-mono font-semibold">{inc.ticket.publicNumber}</span>:{' '}
                  {inc.ticket.title} {inc.serviceImpactNote ? `— ${inc.serviceImpactNote}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Compact Top Search Band */}
        <Card className="shrink-0">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-50">
                  <LifeBuoy className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                  Central de Autoatendimento Civora
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pesquise serviços internos, consulte artigos e acompanhe suas solicitações.
                </p>
              </div>
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Como podemos ajudar? Ex: VPN, notebook..."
                  className="h-9 pl-9 text-xs"
                />
              </div>
            </div>

            {createdBanner ? (
              <div className="mt-2.5 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>{createdBanner}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* 3-Column Single-Screen Workspace */}
        <div className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-12">
          {/* Column 1: Service Catalog */}
          <Card className="flex flex-col overflow-hidden lg:col-span-4 lg:h-full lg:min-h-0">
            <CardHeader className="shrink-0 border-b border-slate-100 py-3 dark:border-slate-800/80">
              <CardTitle className="text-sm">Catálogo de Serviços</CardTitle>
              <CardDescription className="text-[11px]">
                Selecione um serviço ou abra uma solicitação direta.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-2.5 overflow-y-auto pt-3 lg:min-h-0">
              {(servicesQuery.data ?? []).length === 0 ? (
                <EmptyState
                  compact
                  title="Nenhum serviço disponível no catálogo"
                  description="A administração ainda não publicou itens no catálogo desta organização."
                  hint="Utilize o formulário ao lado para registrar uma solicitação direta."
                />
              ) : (
                <div className="space-y-2.5">
                  {(servicesQuery.data ?? []).map((svc) => (
                    <div
                      key={svc.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        selectedServiceId === svc.id
                          ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600 dark:bg-blue-950/20'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xs font-semibold">{svc.name}</h3>
                        {svc.requiresApproval ? <Badge variant="purple">Aprovação</Badge> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">
                        {svc.description}
                      </p>
                      <Button
                        size="sm"
                        variant={selectedServiceId === svc.id ? 'default' : 'outline'}
                        className="mt-2 h-7 text-[11px]"
                        onClick={() => {
                          setSelectedServiceId(svc.id);
                          setTitle(svc.name);
                        }}
                      >
                        Solicitar Serviço
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column 2: Dynamic Request Form */}
          <Card className="flex flex-col overflow-hidden lg:col-span-4 lg:h-full lg:min-h-0">
            <CardHeader className="shrink-0 border-b border-slate-100 py-3 dark:border-slate-800/80">
              <CardTitle className="text-sm">
                {selectedService
                  ? `Formulário: ${selectedService.name}`
                  : 'Abrir Nova Solicitação Direta'}
              </CardTitle>
              <CardDescription className="text-[11px]">
                Preencha os detalhes para roteamento imediato.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto pt-3 lg:min-h-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitMutation.mutate();
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-1">
                    <Label htmlFor="portal-title">Assunto</Label>
                    <Input
                      id="portal-title"
                      required
                      minLength={3}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Descreva sua solicitação ou problema"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="portal-desc">Detalhes</Label>
                    <Textarea
                      id="portal-desc"
                      required
                      minLength={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Inclua detalhes que ajudem a equipe a resolver rapidamente"
                    />
                  </div>

                  {selectedService?.form?.fields.map((field) => (
                    <div key={field.id} className="space-y-1">
                      <Label htmlFor={`cf-${field.key}`}>
                        {field.label} {field.required ? '*' : ''}
                      </Label>
                      {field.fieldType === 'select' ? (
                        <select
                          id={`cf-${field.key}`}
                          required={field.required}
                          value={customFields[field.key] ?? ''}
                          onChange={(e) =>
                            setCustomFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="">Selecione...</option>
                          {(field.optionsJson ?? []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.fieldType === 'textarea' ? (
                        <Textarea
                          id={`cf-${field.key}`}
                          required={field.required}
                          placeholder={field.placeholder ?? ''}
                          value={customFields[field.key] ?? ''}
                          onChange={(e) =>
                            setCustomFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                        />
                      ) : (
                        <Input
                          id={`cf-${field.key}`}
                          type={field.fieldType === 'number' ? 'number' : 'text'}
                          required={field.required}
                          placeholder={field.placeholder ?? ''}
                          value={customFields[field.key] ?? ''}
                          onChange={(e) =>
                            setCustomFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                        />
                      )}
                    </div>
                  ))}

                  <Button type="submit" className="w-full" disabled={submitMutation.isPending}>
                    {submitMutation.isPending ? 'Enviando...' : 'Enviar Solicitação'}
                  </Button>
                </form>
              </CardContent>
            </Card>

          {/* Column 3: My Requests & KB/Approvals Tabs */}
          <Card className="flex flex-col overflow-hidden lg:col-span-4 lg:h-full lg:min-h-0">
            <div
              role="tablist"
              aria-label="Acompanhamento e apoio"
              className="flex shrink-0 border-b border-slate-200 px-3 pt-2 dark:border-slate-800"
            >
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === 'requests'}
                onClick={() => setRightTab('requests')}
                className={`border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                  rightTab === 'requests'
                    ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                Minhas Solicitações ({myTickets.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === 'articles'}
                onClick={() => setRightTab('articles')}
                className={`border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                  rightTab === 'articles'
                    ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                Artigos & Aprovações ({pendingApprovals.length})
              </button>
            </div>

            <CardContent className="flex-1 space-y-3 overflow-y-auto pt-3 lg:min-h-0">
              {rightTab === 'requests' ? (
                myTickets.length === 0 ? (
                  <EmptyState
                    compact
                    title="Nenhuma solicitação registrada"
                    description="Suas solicitações e chamados abertos aparecerão aqui em tempo real."
                  />
                ) : (
                  myTickets.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-2.5 text-xs dark:border-slate-800"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/tickets/${t.id}`}
                            className="font-mono font-semibold text-blue-700 hover:underline dark:text-blue-400"
                          >
                            {t.publicNumber}
                          </Link>
                          <TicketStatusBadge status={t.status} />
                          <PriorityBadge priority={t.priority} />
                        </div>
                        <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {t.title}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {(t.status === 'RESOLVED' || t.status === 'CLOSED') && !t.csatScore ? (
                          <div className="flex items-center gap-0.5" aria-label="Avaliar atendimento">
                            {[1, 2, 3, 4, 5].map((score) => (
                              <button
                                key={score}
                                type="button"
                                aria-label={`Avaliar com ${score} estrelas`}
                                onClick={async () => {
                                  await civoraApi.rateTicket(t.id, { score });
                                  void queryClient.invalidateQueries({
                                    queryKey: ['portal-my-tickets'],
                                  });
                                }}
                                className="rounded p-1 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                              >
                                <Star className="h-3.5 w-3.5" />
                              </button>
                            ))}
                          </div>
                        ) : t.csatScore ? (
                          <Badge variant="success">Avaliado: {t.csatScore}/5</Badge>
                        ) : null}
                        <Link
                          href={`/tickets/${t.id}`}
                          className="rounded border border-slate-300 px-2 py-1 font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          Acompanhar
                        </Link>
                      </div>
                    </div>
                  ))
                )
              ) : (
                <div className="space-y-4 text-xs">
                  <div className="space-y-2">
                    <h2 className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                      <BookOpen className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                      Artigos Sugeridos
                    </h2>
                    {(suggestedKbQuery.data?.data ?? []).length === 0 ? (
                      <p className="text-slate-500">
                        Digite pelo menos 3 caracteres no assunto ou na busca para ver artigos relacionados.
                      </p>
                    ) : (
                      (suggestedKbQuery.data?.data ?? []).slice(0, 4).map((art) => (
                        <Link
                          key={art.id}
                          href={`/knowledge?article=${art.id}`}
                          className="block rounded border border-slate-200 p-2.5 hover:border-blue-400 dark:border-slate-800"
                        >
                          <span className="font-semibold text-blue-700 dark:text-blue-400">
                            {art.title}
                          </span>
                          <p className="mt-0.5 text-slate-600 dark:text-slate-400">{art.summary}</p>
                        </Link>
                      ))
                    )}
                  </div>

                  {pendingApprovals.length > 0 ? (
                    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                      <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                        Aprovações Pendentes
                      </h2>
                      {pendingApprovals.map((ap) => (
                        <div
                          key={ap.id}
                          className="rounded border border-slate-200 p-2.5 dark:border-slate-800"
                        >
                          <p className="font-semibold">{ap.title}</p>
                          <p className="text-slate-500">{ap.ticket.publicNumber}</p>
                          <div className="mt-2 flex gap-2">
                            <Button
                              size="sm"
                              onClick={async () => {
                                await civoraApi.decideApproval(ap.id, { decision: 'APPROVED' });
                                void queryClient.invalidateQueries({ queryKey: ['portal-approvals'] });
                              }}
                            >
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={async () => {
                                await civoraApi.decideApproval(ap.id, { decision: 'REJECTED' });
                                void queryClient.invalidateQueries({ queryKey: ['portal-approvals'] });
                              }}
                            >
                              Rejeitar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

