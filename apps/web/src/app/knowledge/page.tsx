'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Search, ThumbsDown, ThumbsUp, X } from 'lucide-react';
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
  TableSkeleton,
  Textarea,
  cn,
} from '@civora/ui';
import { AppShell } from '../../components/app-shell';
import { civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

export default function KnowledgeBasePage() {
  const queryClient = useQueryClient();
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);
  const activeMembership = user?.memberships.find(
    (m) => m.organizationId === activeOrganizationId,
  );
  const canWrite = activeMembership?.permissions.includes('kb:write');

  const [q, setQ] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [summary, setSummary] = React.useState('');
  const [bodyMarkdown, setBodyMarkdown] = React.useState('');
  const [visibility, setVisibility] = React.useState<'PUBLIC' | 'INTERNAL'>('PUBLIC');

  const listQuery = useQuery({
    queryKey: ['kb-articles', activeOrganizationId, q],
    queryFn: () => civoraApi.listKnowledge(q || undefined),
    enabled: Boolean(user && activeOrganizationId),
  });

  const detailQuery = useQuery({
    queryKey: ['kb-article', selectedId],
    queryFn: () => civoraApi.getKnowledgeArticle(selectedId!),
    enabled: Boolean(selectedId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      civoraApi.createKnowledgeArticle({
        title,
        slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        summary,
        bodyMarkdown,
        visibility,
      }),
    onSuccess: (created) => {
      setCreateOpen(false);
      setTitle('');
      setSlug('');
      setSummary('');
      setBodyMarkdown('');
      setSelectedId(created.id);
      void queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => civoraApi.updateKnowledgeArticle(id, { status: 'PUBLISHED' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
      void queryClient.invalidateQueries({ queryKey: ['kb-article', selectedId] });
    },
  });

  const articles = listQuery.data?.data ?? [];

  return (
    <AppShell breadcrumb="Base de Conhecimento">
      <div className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col gap-2 overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold tracking-tight truncate">Base de Conhecimento</h1>
            <p className="hidden sm:block text-xs text-slate-600 dark:text-slate-400">
              Busca PostgreSQL FTS com versionamento e controle de visibilidade.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64 sm:w-72">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar procedimentos..."
                className="h-8 pl-9 text-xs"
              />
            </div>
            {canWrite ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Novo Artigo
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-5 gap-3 overflow-hidden">
          <div className={cn("space-y-2 overflow-y-auto pr-1 lg:col-span-2 flex-1 min-h-0", selectedId && "hidden lg:block")}>
            {listQuery.isLoading ? (
              <TableSkeleton rows={4} />
            ) : articles.length === 0 ? (
              <EmptyState
                title="Nenhum artigo encontrado"
                description="Tente outro termo de busca ou publique um novo procedimento."
              />
            ) : (
              articles.map((art) => (
                <button
                  key={art.id}
                  type="button"
                  onClick={() => setSelectedId(art.id)}
                  className={`w-full rounded-lg border p-3.5 text-left transition-colors ${
                    selectedId === art.id
                      ? 'border-blue-600 bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{art.title}</span>
                    <Badge variant={art.visibility === 'PUBLIC' ? 'success' : 'warning'}>
                      {art.visibility}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                    {art.summary}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{art.status}</span>
                    <span>•</span>
                    <span>v{art.currentVersion}</span>
                    <span>•</span>
                    <span>{art.helpfulCount} úteis</span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="flex flex-col lg:col-span-3 lg:min-h-0">
            {detailQuery.data ? (
              <Card className="flex flex-1 flex-col lg:min-h-0">
                <CardHeader className="shrink-0 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={detailQuery.data.status === 'PUBLISHED' ? 'success' : 'warning'}>
                        {detailQuery.data.status}
                      </Badge>
                      <Badge variant="neutral">v{detailQuery.data.currentVersion}</Badge>
                    </div>
                    {canWrite && detailQuery.data.status !== 'PUBLISHED' ? (
                      <Button
                        size="sm"
                        onClick={() => publishMutation.mutate(detailQuery.data.id)}
                      >
                        Publicar Artigo
                      </Button>
                    ) : null}
                  </div>
                  <CardTitle className="mt-2 text-lg">{detailQuery.data.title}</CardTitle>
                  <CardDescription>{detailQuery.data.summary}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto lg:min-h-0">
                  <pre className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 font-sans text-sm leading-relaxed dark:border-slate-800 dark:bg-slate-950">
                    {detailQuery.data.bodyMarkdown}
                  </pre>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
                    <span className="text-slate-500">Este artigo foi útil?</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await civoraApi.voteKnowledgeArticle(detailQuery.data.id, true);
                          void queryClient.invalidateQueries({ queryKey: ['kb-article', selectedId] });
                          void queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
                        }}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                        Sim ({detailQuery.data.helpfulCount})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await civoraApi.voteKnowledgeArticle(detailQuery.data.id, false);
                          void queryClient.invalidateQueries({ queryKey: ['kb-article', selectedId] });
                        }}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                        Não ({detailQuery.data.notHelpfulCount})
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="flex flex-1 items-center justify-center lg:min-h-0">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center text-sm text-slate-500">
                  <BookOpen className="mb-2 h-8 w-8 text-slate-400" aria-hidden="true" />
                  Selecione um artigo ao lado para leitura e histórico de versões.
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {createOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Novo artigo"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          >
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold">Criar Artigo na Base de Conhecimento</h2>
                <button type="button" onClick={() => setCreateOpen(false)} aria-label="Fechar">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
                className="space-y-3"
              >
                <div className="space-y-1">
                  <Label htmlFor="kb-title">Título</Label>
                  <Input id="kb-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="kb-summary">Resumo</Label>
                  <Input
                    id="kb-summary"
                    required
                    minLength={10}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="kb-vis">Visibilidade</Label>
                  <select
                    id="kb-vis"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'INTERNAL')}
                    className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="PUBLIC">Público (Portal + Agentes)</option>
                    <option value="INTERNAL">Interno (Apenas Equipe Operacional)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="kb-body">Conteúdo (Markdown)</Label>
                  <Textarea
                    id="kb-body"
                    required
                    minLength={10}
                    rows={6}
                    value={bodyMarkdown}
                    onChange={(e) => setBodyMarkdown(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    Salvar Rascunho
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

