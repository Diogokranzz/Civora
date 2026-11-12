import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type {
  AssetDto,
  AssetRelationshipRefDto,
  TopologyGraphDto,
} from '@civora/types';
import { SOCKET_EVENTS } from '@civora/types';
import DataLoader from 'dataloader';
import CircuitBreaker from 'opossum';
import { MetricsService } from '../../shared/infrastructure/metrics.service';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { RedisService } from '../../shared/infrastructure/redis.service';
import type { AuthContext } from '../identity/auth.decorators';
import { RealtimeGateway } from '../notifications/realtime.gateway';
import { AssetsGovernanceService } from './assets-governance.service';

interface FlatAssetSummary {
  id: string;
  assetTag: string;
  name: string;
  assetType: string;
  status: AssetDto['status'];
}

interface FlatRelationRow {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
}

type Position3D = readonly [number, number, number];

const SKELETON_HASH_TTL_SECONDS = 86_400;
const REDIS_BREAKER_TIMEOUT_MS = 250;

export function getSkeletonCoordsKey(tenantId: string): string {
  return `civora:cmdb:skeleton:${tenantId}:coords`;
}

/** Computes deterministic 3D layered coordinates matching the spatial CMDB renderer. */
export function computeStaticTopologyLayout(
  nodes: ReadonlyArray<{ id: string; assetTag: string }>,
  edges: ReadonlyArray<{ sourceId: string; targetId: string }>,
): Record<string, Position3D> {
  const positions: Record<string, Position3D> = {};
  if (nodes.length === 0) {
    return positions;
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const depsOf = new Map<string, string[]>();
  for (const node of nodes) {
    depsOf.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId) || edge.sourceId === edge.targetId) {
      continue;
    }
    depsOf.get(edge.sourceId)?.push(edge.targetId);
  }

  const depthCache = new Map<string, number>();
  const visiting = new Set<string>();

  const computeTier = (id: string): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;

    visiting.add(id);
    let maxTargetTier = -1;
    for (const targetId of depsOf.get(id) ?? []) {
      maxTargetTier = Math.max(maxTargetTier, computeTier(targetId));
    }
    visiting.delete(id);

    const tier = maxTargetTier + 1;
    depthCache.set(id, tier);
    return tier;
  };

  const tiers = new Map<number, Array<{ id: string; assetTag: string }>>();
  for (const node of nodes) {
    const tier = computeTier(node.id);
    const bucket = tiers.get(tier);
    if (bucket) {
      bucket.push(node);
    } else {
      tiers.set(tier, [node]);
    }
  }

  const sortedTiers = Array.from(tiers.keys()).sort((a, b) => a - b);
  const tierCount = sortedTiers.length;

  for (const [tierIdx, tierValue] of sortedTiers.entries()) {
    const ringNodes = (tiers.get(tierValue) ?? [])
      .slice()
      .sort((a, b) => a.assetTag.localeCompare(b.assetTag));
    const y = Number(((tierIdx - (tierCount - 1) / 2) * 1.65).toFixed(4));
    const count = ringNodes.length;
    const radius = count === 1 ? 0 : Math.max(2.1, Math.min(4.8, 1.55 + count * 0.48));

    for (const [idx, node] of ringNodes.entries()) {
      if (count === 1) {
        positions[node.id] = [0, y, 0];
      } else {
        const angle = (idx / count) * Math.PI * 2 + tierIdx * 0.45;
        positions[node.id] = [
          Number((Math.cos(angle) * radius).toFixed(4)),
          y,
          Number((Math.sin(angle) * radius).toFixed(4)),
        ];
      }
    }
  }

  return positions;
}

export function computeCascadeImpactIds(
  nodes: ReadonlyArray<{ id: string; status: string }>,
  edges: ReadonlyArray<{ id: string; sourceId: string; targetId: string; relationType: string }>,
  rootAssetId: string,
): { impactedNodeIds: string[]; impactedEdgeIds: string[] } {
  const validIds = new Set(nodes.map((n) => n.id));
  if (!validIds.has(rootAssetId)) {
    return { impactedNodeIds: [], impactedEdgeIds: [] };
  }

  const adjacency = new Map<string, Array<{ nextId: string; edgeId: string }>>();
  const pushAdj = (fromId: string, nextId: string, edgeId: string) => {
    if (!validIds.has(fromId) || !validIds.has(nextId) || fromId === nextId) return;
    const list = adjacency.get(fromId);
    if (list) list.push({ nextId, edgeId });
    else adjacency.set(fromId, [{ nextId, edgeId }]);
  };

  for (const edge of edges) {
    pushAdj(edge.targetId, edge.sourceId, edge.id);
    if (edge.relationType === 'CONNECTS_TO') {
      pushAdj(edge.sourceId, edge.targetId, edge.id);
    }
  }

  const visited = new Set<string>([rootAssetId]);
  const impactedNodeIds: string[] = [];
  const impactedEdgeIds = new Set<string>();
  const queue = [rootAssetId];
  let cursor = 0;

  while (cursor < queue.length) {
    const currentId = queue[cursor]!;
    cursor += 1;
    for (const { nextId, edgeId } of adjacency.get(currentId) ?? []) {
      impactedEdgeIds.add(edgeId);
      if (!visited.has(nextId)) {
        visited.add(nextId);
        impactedNodeIds.push(nextId);
        queue.push(nextId);
      }
    }
  }

  return { impactedNodeIds, impactedEdgeIds: Array.from(impactedEdgeIds) };
}

function parseCoordinateTuple(raw: string | null | undefined): Position3D | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      typeof parsed[0] === 'number' &&
      typeof parsed[1] === 'number' &&
      typeof parsed[2] === 'number'
    ) {
      return [parsed[0], parsed[1], parsed[2]];
    }
  } catch {
    return null;
  }
  return null;
}

@Injectable()
export class AssetsTopologyService implements OnModuleDestroy {
  private readonly logger = new Logger(AssetsTopologyService.name);
  public readonly skeletonReadBreaker: CircuitBreaker<
    [tenantId: string, nodeIds: string[]],
    Array<string | null> | null
  >;
  public readonly skeletonWriteBreaker: CircuitBreaker<
    [tenantId: string, coords: Record<string, Position3D>],
    boolean
  >;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    private readonly realtime: RealtimeGateway,
    private readonly governance: AssetsGovernanceService,
  ) {
    this.skeletonReadBreaker = new CircuitBreaker(
      async (tenantId: string, nodeIds: string[]): Promise<Array<string | null> | null> => {
        if (nodeIds.length === 0) return [];
        return this.redis.client.hmget(getSkeletonCoordsKey(tenantId), ...nodeIds);
      },
      {
        name: 'cmdb-redis-skeleton-read',
        timeout: REDIS_BREAKER_TIMEOUT_MS,
        errorThresholdPercentage: 50,
        volumeThreshold: 3,
        resetTimeout: 15_000,
      },
    );

    this.skeletonReadBreaker.fallback(() => null);

    this.skeletonReadBreaker.on('open', () => {
      this.logger.error(
        'CRITICAL: Redis CMDB skeleton circuit breaker OPEN; falling back silently to PostgreSQL hydration',
      );
      this.metrics.redisCircuitOpenTotal.inc({ operation: 'topology_skeleton_read' });
      this.metrics.redisCircuitState.set({ breaker: 'topology_skeleton_read' }, 1);
    });
    this.skeletonReadBreaker.on('halfOpen', () => {
      this.metrics.redisCircuitState.set({ breaker: 'topology_skeleton_read' }, 0.5);
    });
    this.skeletonReadBreaker.on('close', () => {
      this.metrics.redisCircuitState.set({ breaker: 'topology_skeleton_read' }, 0);
    });

    this.skeletonWriteBreaker = new CircuitBreaker(
      async (tenantId: string, coords: Record<string, Position3D>): Promise<boolean> => {
        const entries = Object.entries(coords);
        if (entries.length === 0) return true;
        const hashPayload: Record<string, string> = {};
        for (const [nodeId, tuple] of entries) {
          hashPayload[nodeId] = JSON.stringify(tuple);
        }
        const key = getSkeletonCoordsKey(tenantId);
        await this.redis.client.hset(key, hashPayload);
        await this.redis.client.expire(key, SKELETON_HASH_TTL_SECONDS);
        return true;
      },
      {
        name: 'cmdb-redis-skeleton-write',
        timeout: REDIS_BREAKER_TIMEOUT_MS,
        errorThresholdPercentage: 50,
        volumeThreshold: 3,
        resetTimeout: 15_000,
      },
    );
    this.skeletonWriteBreaker.fallback(() => false);
    this.skeletonWriteBreaker.on('open', () => {
      this.logger.error('CRITICAL: Redis CMDB skeleton write circuit breaker OPEN');
      this.metrics.redisCircuitOpenTotal.inc({ operation: 'topology_skeleton_write' });
      this.metrics.redisCircuitState.set({ breaker: 'topology_skeleton_write' }, 1);
    });
    this.skeletonWriteBreaker.on('halfOpen', () => {
      this.metrics.redisCircuitState.set({ breaker: 'topology_skeleton_write' }, 0.5);
    });
    this.skeletonWriteBreaker.on('close', () => {
      this.metrics.redisCircuitState.set({ breaker: 'topology_skeleton_write' }, 0);
    });
  }

  onModuleDestroy(): void {
    this.skeletonReadBreaker.shutdown();
    this.skeletonWriteBreaker.shutdown();
  }

  /** Builds request-scoped DataLoaders batching only edges and metadata within the caller's authorized node boundary. */
  createScopedLoaders(tenantId: string, authorizedIds: readonly string[]) {
    const unitLoader = new DataLoader<string, { id: string; name: string } | null>(async (ids) => {
      const uniqueIds = Array.from(new Set(ids));
      const rows = await this.prisma.unit.findMany({
        where: { tenantId, id: { in: uniqueIds } },
        select: { id: true, name: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id) ?? null);
    });

    const departmentLoader = new DataLoader<string, { id: string; name: string } | null>(
      async (ids) => {
        const uniqueIds = Array.from(new Set(ids));
        const rows = await this.prisma.department.findMany({
          where: { tenantId, id: { in: uniqueIds } },
          select: { id: true, name: true },
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        return ids.map((id) => byId.get(id) ?? null);
      },
    );

    const ownerLoader = new DataLoader<string, { id: string; name: string } | null>(async (ids) => {
      const uniqueIds = Array.from(new Set(ids));
      const rows = await this.prisma.user.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, name: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id) ?? null);
    });

    const authorizedSet = new Set(authorizedIds);
    const assetSummaryLoader = new DataLoader<string, FlatAssetSummary | null>(async (ids) => {
      const uniqueIds = Array.from(new Set(ids)).filter((id) => authorizedSet.has(id));
      if (uniqueIds.length === 0) return ids.map(() => null);
      const rows = await this.prisma.asset.findMany({
        where: { tenantId, id: { in: uniqueIds }, deletedAt: null },
        select: { id: true, assetTag: true, name: true, assetType: true, status: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r as FlatAssetSummary]));
      return ids.map((id) => byId.get(id) ?? null);
    });

    // Edge boundary intersection: both sourceId AND targetId must stay within authorizedIds.
    const outgoingRelsLoader = new DataLoader<string, FlatRelationRow[]>(async (sourceIds) => {
      const uniqueIds = Array.from(new Set(sourceIds)).filter((id) => authorizedSet.has(id));
      if (uniqueIds.length === 0) return sourceIds.map(() => []);
      const rows = await this.prisma.assetRelationship.findMany({
        where: {
          tenantId,
          sourceId: { in: uniqueIds },
          targetId: { in: authorizedIds as string[] },
        },
        select: { id: true, sourceId: true, targetId: true, relationType: true },
      });
      const grouped = new Map<string, FlatRelationRow[]>();
      for (const row of rows) {
        const list = grouped.get(row.sourceId);
        if (list) list.push(row);
        else grouped.set(row.sourceId, [row]);
      }
      return sourceIds.map((id) => grouped.get(id) ?? []);
    });

    const incomingRelsLoader = new DataLoader<string, FlatRelationRow[]>(async (targetIds) => {
      const uniqueIds = Array.from(new Set(targetIds)).filter((id) => authorizedSet.has(id));
      if (uniqueIds.length === 0) return targetIds.map(() => []);
      const rows = await this.prisma.assetRelationship.findMany({
        where: {
          tenantId,
          targetId: { in: uniqueIds },
          sourceId: { in: authorizedIds as string[] },
        },
        select: { id: true, sourceId: true, targetId: true, relationType: true },
      });
      const grouped = new Map<string, FlatRelationRow[]>();
      for (const row of rows) {
        const list = grouped.get(row.targetId);
        if (list) list.push(row);
        else grouped.set(row.targetId, [row]);
      }
      return targetIds.map((id) => grouped.get(id) ?? []);
    });

    return {
      unitLoader,
      departmentLoader,
      ownerLoader,
      assetSummaryLoader,
      outgoingRelsLoader,
      incomingRelsLoader,
    };
  }

  async invalidateTopologyCache(tenantId: string): Promise<void> {
    if (this.skeletonReadBreaker.opened || this.skeletonWriteBreaker.opened) {
      return;
    }
    try {
      await this.redis.client.del(getSkeletonCoordsKey(tenantId));
    } catch {
      // Cache invalidation error must not break primary mutation path
    }
  }

  private async resolveSpatialSkeletonCoords(
    tenantId: string,
    hydratedNodes: readonly AssetDto[],
    authorizedEdges: readonly AssetRelationshipRefDto[],
  ): Promise<{ layoutPositions: Record<string, Position3D>; cacheStatus: TopologyGraphDto['cacheStatus'] }> {
    const nodeIds = hydratedNodes.map((node) => node.id);
    if (nodeIds.length === 0) {
      if (this.skeletonReadBreaker.opened) {
        return { layoutPositions: {}, cacheStatus: 'CIRCUIT_OPEN' };
      }
      return { layoutPositions: {}, cacheStatus: 'HIT' };
    }

    const rawValues = await this.skeletonReadBreaker.fire(tenantId, nodeIds);
    if (rawValues === null) {
      this.metrics.cmdbCacheMissesTotal.inc({ tenant_id: tenantId });
      const fallbackPositions = computeStaticTopologyLayout(hydratedNodes, authorizedEdges);
      return { layoutPositions: fallbackPositions, cacheStatus: 'CIRCUIT_OPEN' };
    }

    const parsedFromRedis: Record<string, Position3D> = {};
    let allMatched = true;
    for (let i = 0; i < nodeIds.length; i += 1) {
      const tuple = parseCoordinateTuple(rawValues[i]);
      if (tuple) {
        parsedFromRedis[nodeIds[i]!] = tuple;
      } else {
        allMatched = false;
      }
    }

    if (allMatched) {
      this.metrics.cmdbCacheHitsTotal.inc({ tenant_id: tenantId });
      return { layoutPositions: parsedFromRedis, cacheStatus: 'HIT' };
    }

    this.metrics.cmdbCacheMissesTotal.inc({ tenant_id: tenantId });
    const [structuralAssets, structuralEdges] = await Promise.all([
      this.prisma.asset.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, assetTag: true },
        orderBy: { assetTag: 'asc' },
      }),
      this.prisma.assetRelationship.findMany({
        where: { tenantId },
        select: { sourceId: true, targetId: true },
      }),
    ]);

    const fullSkeleton = computeStaticTopologyLayout(structuralAssets, structuralEdges);
    if (!this.skeletonWriteBreaker.opened) {
      await this.skeletonWriteBreaker.fire(tenantId, fullSkeleton);
    }

    const scopedPositions: Record<string, Position3D> = {};
    for (const id of nodeIds) {
      const pos = fullSkeleton[id];
      if (pos) scopedPositions[id] = pos;
    }

    return { layoutPositions: scopedPositions, cacheStatus: 'MISS' };
  }

  async getTopologyGraph(auth: AuthContext): Promise<TopologyGraphDto> {
    const startNs = process.hrtime.bigint();
    const isAdmin = this.governance.isTenantWideAdmin(auth);
    const actorScope = isAdmin
      ? { departmentIds: new Set<string>(), departmentCodes: new Set<string>(), unitIds: new Set<string>() }
      : await this.governance.loadActorScope(auth);
    const scopeWhere = this.governance.buildReadScopeWhere(auth, actorScope);

    const candidateAssets = await this.prisma.asset.findMany({
      where: scopeWhere,
      orderBy: { assetTag: 'asc' },
    });

    const authorizedAssets = candidateAssets.filter((asset) =>
      this.governance.canActorReadAsset(auth, actorScope, asset),
    );
    const authorizedIds = authorizedAssets.map((a) => a.id);
    const loaders = this.createScopedLoaders(auth.organizationId, authorizedIds);

    for (const asset of authorizedAssets) {
      loaders.assetSummaryLoader.prime(asset.id, {
        id: asset.id,
        assetTag: asset.assetTag,
        name: asset.name,
        assetType: asset.assetType,
        status: asset.status as AssetDto['status'],
      });
    }

    const hydratedNodes = await Promise.all(
      authorizedAssets.map(async (asset) => {
        const [unit, department, owner, outgoingRows, incomingRows] = await Promise.all([
          asset.unitId ? loaders.unitLoader.load(asset.unitId) : Promise.resolve(null),
          asset.departmentId ? loaders.departmentLoader.load(asset.departmentId) : Promise.resolve(null),
          asset.ownerId ? loaders.ownerLoader.load(asset.ownerId) : Promise.resolve(null),
          loaders.outgoingRelsLoader.load(asset.id),
          loaders.incomingRelsLoader.load(asset.id),
        ]);

        const [outgoingTargets, incomingSources] = await Promise.all([
          Promise.all(outgoingRows.map((rel) => loaders.assetSummaryLoader.load(rel.targetId))),
          Promise.all(incomingRows.map((rel) => loaders.assetSummaryLoader.load(rel.sourceId))),
        ]);

        const outgoingRels: AssetRelationshipRefDto[] = outgoingRows.map((rel, idx) => {
          const target = outgoingTargets[idx];
          return {
            id: rel.id,
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            relationType: rel.relationType,
            ...(target ? { target } : {}),
          };
        });

        const incomingRels: AssetRelationshipRefDto[] = incomingRows.map((rel, idx) => {
          const source = incomingSources[idx];
          return {
            id: rel.id,
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            relationType: rel.relationType,
            ...(source ? { source } : {}),
          };
        });

        const dto: AssetDto = {
          id: asset.id,
          tenantId: asset.tenantId,
          assetTag: asset.assetTag,
          name: asset.name,
          assetType: asset.assetType,
          status: asset.status as AssetDto['status'],
          serialNumber: asset.serialNumber,
          manufacturer: asset.manufacturer,
          model: asset.model,
          unit,
          department,
          owner,
          outgoingRels,
          incomingRels,
          version: asset.version,
          updatedAt: asset.updatedAt.toISOString(),
        };
        return dto;
      }),
    );

    const edgeMap = new Map<string, AssetRelationshipRefDto>();
    for (const node of hydratedNodes) {
      for (const rel of node.outgoingRels ?? []) {
        edgeMap.set(rel.id, rel);
      }
    }
    const edges = Array.from(edgeMap.values());

    const { layoutPositions, cacheStatus } = await this.resolveSpatialSkeletonCoords(
      auth.organizationId,
      hydratedNodes,
      edges,
    );

    for (const node of hydratedNodes) {
      const pos = layoutPositions[node.id];
      if (pos) {
        node.layoutPosition = pos;
      }
    }

    const elapsedSec = Number(process.hrtime.bigint() - startNs) / 1e9;
    this.metrics.cmdbHydrationDurationSeconds.observe(
      {
        tenant_id: auth.organizationId,
        source:
          cacheStatus === 'CIRCUIT_OPEN'
            ? 'pg_fallback'
            : cacheStatus === 'HIT'
              ? 'cache'
              : 'dataloader',
      },
      elapsedSec,
    );

    return {
      nodes: hydratedNodes,
      edges,
      layoutPositions,
      cacheStatus,
      hydratedAt: new Date().toISOString(),
    };
  }

  async listAssets(auth: AuthContext): Promise<AssetDto[]> {
    const topology = await this.getTopologyGraph(auth);
    return topology.nodes;
  }

  async emitCascadeSimulation(
    auth: AuthContext,
    rootAssetId: string,
    burstCount: number,
  ): Promise<{
    rootAssetId: string;
    impactedNodeIds: string[];
    impactedEdgeIds: string[];
    emittedEvents: number;
  }> {
    const topology = await this.getTopologyGraph(auth);
    const { impactedNodeIds, impactedEdgeIds } = computeCascadeImpactIds(
      topology.nodes,
      topology.edges,
      rootAssetId,
    );

    this.metrics.cmdbCascadeSimulationsTotal.inc({ tenant_id: auth.organizationId });

    const CHUNK_SIZE = 20;
    for (let i = 0; i < burstCount; i += 1) {
      const targetNodeId =
        impactedNodeIds.length > 0
          ? impactedNodeIds[i % impactedNodeIds.length]!
          : rootAssetId;
      this.realtime.emitToTenant(auth.organizationId, SOCKET_EVENTS.TICKET_UPDATED, {
        tenantId: auth.organizationId,
        kind: 'CMDB_CASCADE',
        rootAssetId,
        impactedAssetId: targetNodeId,
        sequence: i + 1,
      });

      if ((i + 1) % CHUNK_SIZE === 0 && i + 1 < burstCount) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
      }
    }

    this.realtime.emitToTenant(auth.organizationId, SOCKET_EVENTS.DASHBOARD_REFRESH, {
      tenantId: auth.organizationId,
      reason: 'cmdb_cascade_simulation',
    });

    return {
      rootAssetId,
      impactedNodeIds,
      impactedEdgeIds,
      emittedEvents: burstCount + 1,
    };
  }
}
