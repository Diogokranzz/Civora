'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Network, RotateCcw } from 'lucide-react';
import { cn } from '@civora/ui';
import { CmdbTopologyCanvas } from './cmdb-topology-canvas';
import {
  computeFailureCascade,
  computeTopologyLayout,
  type TopologyAssetNode,
  type TopologyEdge,
  type TopologyPosition3D,
} from './topology-math';
import {
  detectWebGLSupport,
  type FpsDropSample,
  GlassSurfaceProfiler,
  type SurfaceRenderSample,
  useFpsMonitor,
  useReducedMotionPreference,
  WebGLBoundary,
} from './webgl-runtime';

export interface CmdbTopologyGraph3DProps {
  nodes: readonly TopologyAssetNode[];
  edges: readonly TopologyEdge[];
  cachedPositions?: Record<string, TopologyPosition3D>;
  selectedNodeId: string | null;
  simulatedFailedNodeIds: readonly string[];
  onSelectNode: (nodeId: string | null) => void;
  onResetSimulation?: () => void;
  onFpsDrop?: (sample: FpsDropSample) => void;
  onSurfaceRender?: (sample: SurfaceRenderSample) => void;
  className?: string;
}

function AccessibleTopologyFallback({
  nodes,
  edges,
  cascadeDepthByNode,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: readonly TopologyAssetNode[];
  edges: readonly TopologyEdge[];
  cascadeDepthByNode: Record<string, number>;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-4 p-5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {nodes.map((node) => {
          const depth = cascadeDepthByNode[node.id];
          const isSelected = selectedNodeId === node.id;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelectNode(node.id)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
                depth === 0
                  ? 'border-red-500/60 bg-red-950/40 text-red-100'
                  : depth !== undefined
                    ? 'border-amber-500/60 bg-amber-950/35 text-amber-100'
                    : isSelected
                      ? 'border-sky-400 bg-blue-950/50 text-slate-100'
                      : 'border-slate-700/80 bg-slate-900/70 text-slate-200 hover:border-sky-500/50',
              )}
            >
              <span className="font-mono text-xs font-semibold">{node.assetTag}</span>
              <span className="text-xs font-medium">{node.name}</span>
              <span className="text-[11px] text-slate-400">
                {node.assetType} · {depth === 0 ? 'Falha Raiz' : depth ? `Cascata nível ${depth}` : node.status}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">
        Visualização estrutural acessível ativa ({nodes.length} ativos · {edges.length} dependências mapeadas).
      </p>
    </div>
  );
}

export function CmdbTopologyGraph3D({
  nodes,
  edges,
  cachedPositions,
  selectedNodeId,
  simulatedFailedNodeIds,
  onSelectNode,
  onResetSimulation,
  onFpsDrop,
  onSurfaceRender,
  className,
}: CmdbTopologyGraph3DProps) {
  const reducedMotion = useReducedMotionPreference();
  const [webglReady, setWebglReady] = React.useState(false);

  React.useEffect(() => {
    setWebglReady(detectWebGLSupport());
  }, []);

  const positions = React.useMemo(() => {
    if (cachedPositions && nodes.length > 0 && nodes.every((n) => cachedPositions[n.id])) {
      return cachedPositions;
    }
    return computeTopologyLayout(nodes, edges);
  }, [cachedPositions, nodes, edges]);
  const cascade = React.useMemo(
    () => computeFailureCascade(nodes, edges, simulatedFailedNodeIds),
    [nodes, edges, simulatedFailedNodeIds],
  );

  const hasNodes = nodes.length > 0;
  useFpsMonitor('cmdb-topology-graph', webglReady && hasNodes, onFpsDrop);

  return (
    <GlassSurfaceProfiler surfaceId="cmdb-topology-surface" onSurfaceRender={onSurfaceRender}>
      <div
        className={cn(
          'relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/85 bg-[#050B16] shadow-[0_24px_60px_-24px_rgba(2,6,23,0.95)] dark:border-white/[0.08]',
          className,
        )}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-slate-950/95 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-100">
              <Network className="h-4 w-4 text-sky-400" aria-hidden="true" />
              Grafo Espacial de Dependências CMDB
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-900/90 px-2.5 py-0.5 text-[11px] text-slate-300">
              {nodes.length} nó(s) · {edges.length} conexão(ões)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1.5 text-sky-300">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Operacional
            </span>
            <span className="inline-flex items-center gap-1.5 text-red-300">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Falha Raiz
            </span>
            <span className="inline-flex items-center gap-1.5 text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Cascata Afetada
            </span>
            <span className="inline-flex items-center gap-1.5 text-violet-300">
              <span className="h-2 w-2 rounded-full bg-violet-400" />
              Manutenção
            </span>
            {simulatedFailedNodeIds.length > 0 && onResetSimulation ? (
              <button
                type="button"
                onClick={onResetSimulation}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition-colors hover:border-sky-400/60 hover:text-white"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Limpar simulação
              </button>
            ) : null}
          </div>
        </div>

        <div className="relative min-h-[240px] w-full flex-1">
          {cascade.failedRootIds.length > 0 ? (
            <div className="pointer-events-none absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-xl border border-red-500/45 bg-red-950/95 px-3 py-1.5 text-xs font-medium text-red-100">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
              <span>
                {cascade.failedRootIds.length} origem(ns) em falha · {cascade.impactedNodeIds.length} ativo(s) impactado(s) em cascata
              </span>
            </div>
          ) : (
            <div className="pointer-events-none absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-slate-950/95 px-3 py-1.5 text-xs font-medium text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Topologia nominal · clique em um nó para inspecionar ou simular queda</span>
            </div>
          )}

          {webglReady ? (
            <WebGLBoundary
              fallback={
                <AccessibleTopologyFallback
                  nodes={nodes}
                  edges={edges}
                  cascadeDepthByNode={cascade.depthByNodeId}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={onSelectNode}
                />
              }
            >
              <CmdbTopologyCanvas
                nodes={nodes}
                edges={edges}
                positions={positions}
                cascade={cascade}
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectNode}
                reducedMotion={reducedMotion}
              />
            </WebGLBoundary>
          ) : (
            <AccessibleTopologyFallback
              nodes={nodes}
              edges={edges}
              cascadeDepthByNode={cascade.depthByNodeId}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          )}

          <div className="pointer-events-none absolute bottom-3 right-4 rounded-lg border border-white/10 bg-slate-950/90 px-2.5 py-1 text-[10px] font-medium tracking-wider text-slate-400">
            ARRASTE PARA ORBITAR · SCROLL PARA ZOOM
          </div>
        </div>
      </div>
    </GlassSurfaceProfiler>
  );
}

