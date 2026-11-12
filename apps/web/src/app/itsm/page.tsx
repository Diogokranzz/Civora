'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  GitPullRequest,
  HardDrive,
  Link2,
  Trash2,
  Wrench,
  ZapOff,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  PriorityBadge,
} from '@civora/ui';
import { ASSET_STATUSES } from '@civora/types';
import { computeFailureCascade } from '@civora/ui-spatial/math';
import { AppShell } from '../../components/app-shell';
import {
  CmdbTopologyGraph3D,
  MagneticButton,
  SpatialEmptyState,
} from '../../components/spatial';
import { ApiClientError, civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

const ASSET_TYPE_PRESETS = [
  'ROUTER',
  'SWITCH',
  'FIREWALL',
  'SERVER',
  'DATABASE',
  'APPLICATION',
  'STORAGE',
  'WORKSTATION',
] as const;

const RELATION_TYPES = ['DEPENDS_ON', 'HOSTED_ON', 'CONNECTS_TO'] as const;

const SELECT_CLS =
  'h-9 rounded-lg border border-slate-300/90 bg-white/90 px-2.5 text-xs text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-100';

export default function ItsmAssetsPage() {
  const queryClient = useQueryClient();
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);

  const [assetTag, setAssetTag] = React.useState('');
  const [assetName, setAssetName] = React.useState('');
  const [assetType, setAssetType] = React.useState<string>('ROUTER');
  const [selectedAssetId, setSelectedAssetId] = React.useState<string | null>(null);
  const [simulatedFailedIds, setSimulatedFailedIds] = React.useState<string[]>([]);
  const [relTargetId, setRelTargetId] = React.useState('');
  const [relType, setRelType] = React.useState<'DEPENDS_ON' | 'HOSTED_ON' | 'CONNECTS_TO'>('DEPENDS_ON');
  const [rightTab, setRightTab] = React.useState<'inspector' | 'problems' | 'changes'>('inspector');
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const topologyQuery = useQuery({
    queryKey: ['assets', 'topology', activeOrganizationId],
    queryFn: () => civoraApi.getAssetsTopology(),
    enabled: Boolean(user && activeOrganizationId),
  });
  const problemsQuery = useQuery({
    queryKey: ['problems', activeOrganizationId],
    queryFn: () => civoraApi.listProblems(),
    enabled: Boolean(user && activeOrganizationId),
  });
  const changesQuery = useQuery({
    queryKey: ['changes', activeOrganizationId],
    queryFn: () => civoraApi.listChanges(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const assets = React.useMemo(() => topologyQuery.data?.nodes ?? [], [topologyQuery.data]);
  const cachedLayoutPositions = topologyQuery.data?.layoutPositions;
  const topologyCacheStatus = topologyQuery.data?.cacheStatus;

  const topologyEdges = React.useMemo(() => {
    const map = new Map<
      string,
      { id: string; sourceId: string; targetId: string; relationType: string }
    >();
    for (const asset of assets) {
      for (const rel of asset.outgoingRels ?? []) {
        const targetId = rel.target?.id ?? rel.targetId;
        map.set(rel.id, {
          id: rel.id,
          sourceId: asset.id,
          targetId,
          relationType: rel.relationType,
        });
      }
    }
    return Array.from(map.values());
  }, [assets]);

  const selectedAsset = React.useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? assets[0] ?? null,
    [assets, selectedAssetId],
  );

  const cascade = React.useMemo(
    () => computeFailureCascade(assets, topologyEdges, simulatedFailedIds),
    [assets, topologyEdges, simulatedFailedIds],
  );

  const assetById = React.useMemo(() => {
    const record = new Map<string, (typeof assets)[number]>();
    for (const item of assets) {
      record.set(item.id, item);
    }
    return record;
  }, [assets]);

  const simulateCascadeMutation = useMutation({
    mutationFn: (assetId: string) => civoraApi.simulateAssetCascade(assetId, 1),
    onError: () => undefined,
  });

  const toggleSimulatedFailure = (assetId: string) => {
    const enabling = !simulatedFailedIds.includes(assetId);
    setSimulatedFailedIds((prev) =>
      enabling ? [...prev, assetId] : prev.filter((id) => id !== assetId),
    );
    if (enabling) {
      simulateCascadeMutation.mutate(assetId);
    }
  };

  const createAssetMutation = useMutation({
    mutationFn: () =>
      civoraApi.createAsset({
        assetTag,
        name: assetName,
        assetType,
      }),
    onSuccess: (created) => {
      setAssetTag('');
      setAssetName('');
      setSelectedAssetId(created.id);
      setFeedback(`Ativo ${created.assetTag} registrado na topologia.`);
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (err) => {
      setFeedback(err instanceof ApiClientError ? err.problem.detail : 'Falha ao cadastrar ativo.');
    },
  });

  const updateAssetStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      civoraApi.updateAsset(id, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });

  const addRelationshipMutation = useMutation({
    mutationFn: () => {
      if (!selectedAsset || !relTargetId) {
        throw new Error('Selecione o ativo de origem e destino.');
      }
      return civoraApi.addAssetRelationship(selectedAsset.id, {
        targetId: relTargetId,
        relationType: relType,
      });
    },
    onSuccess: () => {
      setRelTargetId('');
      setFeedback('Dependência mapeada na topologia CMDB.');
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (err) => {
      setFeedback(
        err instanceof ApiClientError ? err.problem.detail : 'Não foi possível vincular a dependência.',
      );
    },
  });

  const removeRelationshipMutation = useMutation({
    mutationFn: ({ sourceId, relId }: { sourceId: string; relId: string }) =>
      civoraApi.removeAssetRelationship(sourceId, relId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: (id: string) => civoraApi.deleteAsset(id),
    onSuccess: (_res, deletedId) => {
      setSimulatedFailedIds((prev) => prev.filter((id) => id !== deletedId));
      setSelectedAssetId((prev) => (prev === deletedId ? null : prev));
      setFeedback('Ativo removido do inventário CMDB.');
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (err) => {
      setFeedback(err instanceof ApiClientError ? err.problem.detail : 'Não foi possível apagar o ativo.');
    },
  });

  return (
    <AppShell breadcrumb="Ativos & ITSM">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:h-full lg:min-h-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              CMDB Espacial, Topologia & ITSM
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Dependências 3D com simulação de impacto em cascata, DataLoader e esqueleto em Redis.
            </p>
          </div>
          {topologyCacheStatus ? (
            <Badge
              variant={
                topologyCacheStatus === 'HIT'
                  ? 'success'
                  : topologyCacheStatus === 'CIRCUIT_OPEN'
                    ? 'warning'
                    : 'info'
              }
            >
              {topologyCacheStatus === 'CIRCUIT_OPEN'
                ? 'Esqueleto Redis: Fallback PostgreSQL'
                : `Esqueleto Redis: ${topologyCacheStatus}`}
            </Badge>
          ) : null}
        </div>

        {feedback ? (
          <div
            role="status"
            className="flex shrink-0 items-center justify-between rounded-xl border border-sky-300/70 bg-sky-50/90 px-4 py-2 text-xs font-medium text-sky-900 dark:border-sky-500/35 dark:bg-sky-950/50 dark:text-sky-100"
          >
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[11px] font-semibold underline"
            >
              Ocultar
            </button>
          </div>
        ) : null}

        <div className="grid flex-1 gap-4 lg:min-h-0 xl:grid-cols-12">
          <div className="flex flex-col gap-3 lg:min-h-0 xl:col-span-7">
            <div className="min-h-[240px] flex-[1.15] lg:min-h-0">
              {assets.length === 0 ? (
                <SpatialEmptyState
                  emblem="cmdb"
                  className="flex h-full flex-col justify-center"
                  eyebrow="Topologia CMDB Limpa"
                  title="Nenhum ativo de infraestrutura mapeado"
                  description="Cadastre servidores, roteadores, bancos de dados ou serviços para ativar o grafo 3D e análise de falhas em cascata."
                  hint="Exemplo: cadastre um Core Router, um Banco PostgreSQL e uma Aplicação vinculados por DEPENDS_ON."
                  action={
                    <MagneticButton
                      size="sm"
                      onClick={() => {
                        const tagInput = document.getElementById('cmdb-asset-tag-input');
                        tagInput?.focus();
                      }}
                    >
                      Mapear primeiro ativo
                    </MagneticButton>
                  }
                />
              ) : (
                <CmdbTopologyGraph3D
                  className="h-full"
                  nodes={assets}
                  edges={topologyEdges}
                  cachedPositions={cachedLayoutPositions}
                  selectedNodeId={selectedAsset?.id ?? null}
                  simulatedFailedNodeIds={simulatedFailedIds}
                  onSelectNode={(nodeId) => {
                    setSelectedAssetId(nodeId);
                    setRightTab('inspector');
                  }}
                  onResetSimulation={() => setSimulatedFailedIds([])}
                />
              )}
            </div>

            <Card className="flex flex-1 flex-col overflow-hidden lg:min-h-0">
              <CardHeader className="shrink-0 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <HardDrive className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  Inventário de Ativos & Cadastro CMDB
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden pt-0 lg:min-h-0">
                {assets.length > 0 ? (
                  <div className="flex-1 overflow-auto lg:min-h-0">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-white dark:bg-slate-900">
                        <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-300">
                          <th className="py-1.5">Tag</th>
                          <th className="py-1.5">Ativo</th>
                          <th className="py-1.5">Tipo</th>
                          <th className="py-1.5">Status</th>
                          <th className="py-1.5">Conexões</th>
                          <th className="py-1.5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {assets.map((asset) => {
                          const depth = cascade.depthByNodeId[asset.id];
                          const connectionCount =
                            (asset.outgoingRels?.length ?? 0) + (asset.incomingRels?.length ?? 0);
                          return (
                            <tr
                              key={asset.id}
                              className={
                                selectedAsset?.id === asset.id
                                  ? 'bg-sky-50/70 dark:bg-sky-950/30'
                                  : ''
                              }
                            >
                              <td className="py-1.5 font-mono font-semibold text-blue-600 dark:text-sky-300">
                                {asset.assetTag}
                              </td>
                              <td className="py-1.5 font-medium text-slate-900 dark:text-slate-100">
                                {asset.name}
                              </td>
                              <td className="py-1.5 text-slate-600 dark:text-slate-300">
                                {asset.assetType}
                              </td>
                              <td className="py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <Badge
                                    variant={
                                      asset.status === 'ACTIVE'
                                        ? 'success'
                                        : asset.status === 'IN_MAINTENANCE'
                                          ? 'warning'
                                          : 'danger'
                                    }
                                  >
                                    {asset.status}
                                  </Badge>
                                  {depth === 0 ? (
                                    <Badge variant="danger">Origem</Badge>
                                  ) : depth !== undefined ? (
                                    <Badge variant="warning">+{depth}</Badge>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-1.5 text-slate-600 dark:text-slate-300">
                                {connectionCount} vínculo(s)
                              </td>
                              <td className="py-1.5 text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedAssetId(asset.id);
                                      setRightTab('inspector');
                                    }}
                                  >
                                    Inspecionar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      deleteAssetMutation.isPending &&
                                      deleteAssetMutation.variables === asset.id
                                    }
                                    aria-label={`Apagar ativo ${asset.assetTag}`}
                                    className="border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/60 dark:hover:text-red-200"
                                    onClick={() => deleteAssetMutation.mutate(asset.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    {deleteAssetMutation.isPending &&
                                    deleteAssetMutation.variables === asset.id
                                      ? 'Apagando...'
                                      : 'Apagar'}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createAssetMutation.mutate();
                  }}
                  className="flex shrink-0 flex-wrap gap-2 border-t border-slate-200/80 pt-2.5 dark:border-slate-800"
                >
                  <Input
                    id="cmdb-asset-tag-input"
                    placeholder="Tag (ex: RTR-CORE-01)"
                    value={assetTag}
                    onChange={(e) => setAssetTag(e.target.value)}
                    required
                    className="h-8 w-36 text-xs"
                  />
                  <Input
                    placeholder="Nome do ativo (ex: Core Router Matriz)"
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    required
                    className="h-8 min-w-[160px] flex-1 text-xs"
                  />
                  <select
                    aria-label="Tipo de ativo CMDB"
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value)}
                    className={SELECT_CLS}
                  >
                    {ASSET_TYPE_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" disabled={createAssetMutation.isPending}>
                    Cadastrar Ativo
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card className="flex flex-col overflow-hidden border-slate-200/85 bg-white dark:border-white/[0.08] dark:bg-[#0F172A] lg:min-h-0 xl:col-span-5">
            <CardHeader className="shrink-0 space-y-2.5 border-b border-slate-200/80 py-3 dark:border-white/[0.08]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="tablist" aria-label="Painéis de governança ITSM" className="flex flex-wrap gap-1.5">
                  <button
                    role="tab"
                    type="button"
                    aria-selected={rightTab === 'inspector'}
                    onClick={() => setRightTab('inspector')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      rightTab === 'inspector'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                    Inspetor
                  </button>
                  <button
                    role="tab"
                    type="button"
                    aria-selected={rightTab === 'problems'}
                    onClick={() => setRightTab('problems')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      rightTab === 'problems'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                    Problemas ({(problemsQuery.data ?? []).length})
                  </button>
                  <button
                    role="tab"
                    type="button"
                    aria-selected={rightTab === 'changes'}
                    onClick={() => setRightTab('changes')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      rightTab === 'changes'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
                    Mudanças ({(changesQuery.data ?? []).length})
                  </button>
                </div>
                {rightTab === 'inspector' && selectedAsset ? (
                  <span className="font-mono text-xs font-semibold text-sky-600 dark:text-sky-300">
                    {selectedAsset.assetTag}
                  </span>
                ) : null}
              </div>
            </CardHeader>

            <CardContent className="flex-1 space-y-4 overflow-y-auto pt-3 text-xs lg:min-h-0">
              {rightTab === 'inspector' ? (
                selectedAsset ? (
                  <>
                    <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-white/[0.08] dark:bg-slate-950/60">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {selectedAsset.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Tipo: {selectedAsset.assetType}
                          </p>
                        </div>
                        <select
                          aria-label="Status do ativo selecionado"
                          value={selectedAsset.status}
                          onChange={(e) =>
                            updateAssetStatusMutation.mutate({
                              id: selectedAsset.id,
                              status: e.target.value,
                            })
                          }
                          className={SELECT_CLS}
                        >
                          {ASSET_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <Button
                          size="sm"
                          variant={
                            simulatedFailedIds.includes(selectedAsset.id) ? 'primary' : 'outline'
                          }
                          onClick={() => toggleSimulatedFailure(selectedAsset.id)}
                          className="w-full"
                        >
                          <ZapOff className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          {simulatedFailedIds.includes(selectedAsset.id)
                            ? 'Interromper Simulação deste Ativo'
                            : 'Simular Queda deste Ativo'}
                        </Button>
                      </div>
                    </div>

                    {cascade.failedRootIds.length > 0 ? (
                      <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3">
                        <p className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          Análise de Cascata ({cascade.impactedNodeIds.length} afetado(s))
                        </p>
                        {cascade.impactedNodeIds.length === 0 ? (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300">
                            Nenhum serviço dependente afetado até o momento.
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {cascade.impactedNodeIds.map((impactedId) => {
                              const target = assetById.get(impactedId);
                              if (!target) return null;
                              return (
                                <li
                                  key={impactedId}
                                  className="flex items-center justify-between text-[11px]"
                                >
                                  <span className="font-medium text-slate-800 dark:text-slate-200">
                                    {target.assetTag} · {target.name}
                                  </span>
                                  <Badge variant="warning">
                                    Salto {cascade.depthByNodeId[impactedId]}
                                  </Badge>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <p className="font-semibold text-slate-700 dark:text-slate-200">
                        Dependências de Saída ({selectedAsset.outgoingRels?.length ?? 0})
                      </p>
                      {(selectedAsset.outgoingRels ?? []).length === 0 ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Este ativo não possui dependências registradas.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {(selectedAsset.outgoingRels ?? []).map((rel) => (
                            <li
                              key={rel.id}
                              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 px-2.5 py-1.5 dark:border-slate-800"
                            >
                              <div className="min-w-0 truncate">
                                <span className="font-mono text-[11px] font-semibold text-sky-600 dark:text-sky-300">
                                  {rel.relationType}
                                </span>{' '}
                                <span className="text-slate-700 dark:text-slate-200">
                                  {rel.target?.assetTag ?? rel.targetId} · {rel.target?.name ?? 'Ativo vinculado'}
                                </span>
                              </div>
                              <button
                                type="button"
                                aria-label={`Remover dependência para ${rel.target?.assetTag ?? rel.targetId}`}
                                onClick={() =>
                                  removeRelationshipMutation.mutate({
                                    sourceId: selectedAsset.id,
                                    relId: rel.id,
                                  })
                                }
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {assets.length > 1 ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            addRelationshipMutation.mutate();
                          }}
                          className="space-y-2 border-t border-slate-200/80 pt-3 dark:border-slate-800"
                        >
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            <Link2 className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
                            Vincular Dependência a partir de {selectedAsset.assetTag}
                          </p>
                          <div className="flex flex-col gap-2">
                            <select
                              aria-label="Tipo de vínculo CMDB"
                              value={relType}
                              onChange={(e) =>
                                setRelType(
                                  e.target.value as 'DEPENDS_ON' | 'HOSTED_ON' | 'CONNECTS_TO',
                                )
                              }
                              className={SELECT_CLS}
                            >
                              {RELATION_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label="Ativo de destino CMDB"
                              value={relTargetId}
                              onChange={(e) => setRelTargetId(e.target.value)}
                              className={SELECT_CLS}
                            >
                              <option value="">Selecionar ativo destino...</option>
                              {assets
                                .filter((candidate) => candidate.id !== selectedAsset.id)
                                .map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.assetTag} — {candidate.name} ({candidate.assetType})
                                  </option>
                                ))}
                            </select>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={!relTargetId || addRelationshipMutation.isPending}
                            >
                              Adicionar Vínculo
                            </Button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="Selecione ou cadastre um ativo"
                    description="Clique em um nó na topologia 3D ou em Inspecionar no inventário para simular falhas e dependências."
                  />
                )
              ) : rightTab === 'problems' ? (
                (problemsQuery.data ?? []).length === 0 ? (
                  <EmptyState
                    title="Sem problemas registrados"
                    description="Vincule incidentes recorrentes para registrar causa raiz e contorno conhecido."
                  />
                ) : (
                  (problemsQuery.data ?? []).map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {p.title}
                        </span>
                        <Badge variant="warning">{p.status}</Badge>
                      </div>
                      {p.rootCause ? (
                        <p className="mt-1 text-slate-600 dark:text-slate-300">
                          Causa raiz: {p.rootCause}
                        </p>
                      ) : null}
                      {p.workaround ? (
                        <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                          Contorno: {p.workaround}
                        </p>
                      ) : null}
                    </div>
                  ))
                )
              ) : (changesQuery.data ?? []).length === 0 ? (
                <EmptyState
                  title="Nenhuma mudança programada"
                  description="Mudanças aprovadas com janela de manutenção aparecem aqui."
                />
              ) : (
                (changesQuery.data ?? []).map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {c.title}
                      </span>
                      <PriorityBadge priority={c.risk === 'HIGH' ? 'HIGH' : 'MEDIUM'} />
                    </div>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                      Status: {c.status} · Risco: {c.risk}
                    </p>
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
