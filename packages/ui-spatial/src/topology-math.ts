export type CmdbRelationType = 'DEPENDS_ON' | 'HOSTED_ON' | 'CONNECTS_TO' | string;

export interface TopologyAssetNode {
  id: string;
  assetTag: string;
  name: string;
  assetType: string;
  status: string;
}

export interface TopologyEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: CmdbRelationType;
}

export interface CascadeAnalysisResult {
  failedRootIds: string[];
  impactedNodeIds: string[];
  impactedEdgeIds: string[];
  depthByNodeId: Record<string, number>;
}

export type TopologyPosition3D = readonly [number, number, number];

export type AssetVisualKind = 'network' | 'database' | 'compute' | 'service' | 'endpoint';

const VISUAL_KIND_RULES: ReadonlyArray<readonly [string, AssetVisualKind]> = [
  ['ROUTER', 'network'],
  ['SWITCH', 'network'],
  ['FIREWALL', 'network'],
  ['LOAD_BALANCER', 'network'],
  ['NETWORK', 'network'],
  ['REDE', 'network'],
  ['DATABASE', 'database'],
  ['POSTGRES', 'database'],
  ['MYSQL', 'database'],
  ['REDIS', 'database'],
  ['MONGO', 'database'],
  ['SQL', 'database'],
  ['STORAGE', 'database'],
  ['BANCO', 'database'],
  ['DB', 'database'],
  ['APPLICATION', 'service'],
  ['SERVICE', 'service'],
  ['SERVICO', 'service'],
  ['API', 'service'],
  ['SAAS', 'service'],
  ['SERVER', 'compute'],
  ['SERVIDOR', 'compute'],
  ['CLUSTER', 'compute'],
  ['HOST', 'compute'],
  ['CONTAINER', 'compute'],
  ['VM', 'compute'],
];

/** Maps arbitrary CMDB asset types into uniform geometric node categories. */
export function classifyAssetVisualKind(assetType: string): AssetVisualKind {
  const normalized = assetType.trim().toUpperCase().replace(/[\s-]+/g, '_');
  for (const [token, kind] of VISUAL_KIND_RULES) {
    if (normalized.includes(token)) {
      return kind;
    }
  }
  return 'endpoint';
}

/**
 * Computes downstream failure propagation across CMDB dependency links.
 * DEPENDS_ON and HOSTED_ON propagate from target infrastructure up to dependent source assets.
 * CONNECTS_TO propagates symmetrically across peer links while breaking cycles safely.
 */
export function computeFailureCascade(
  nodes: readonly TopologyAssetNode[],
  edges: readonly TopologyEdge[],
  explicitFailedIds: readonly string[],
): CascadeAnalysisResult {
  const validNodeIds = new Set(nodes.map((node) => node.id));
  const rootSet = new Set<string>();

  for (const id of explicitFailedIds) {
    if (validNodeIds.has(id)) {
      rootSet.add(id);
    }
  }

  for (const node of nodes) {
    if (node.status === 'RETIRED' || node.status === 'DISPOSED' || node.status === 'LOST') {
      rootSet.add(node.id);
    }
  }

  const adjacency = new Map<string, Array<{ nextId: string; edgeId: string }>>();
  const pushAdj = (fromId: string, nextId: string, edgeId: string) => {
    if (!validNodeIds.has(fromId) || !validNodeIds.has(nextId) || fromId === nextId) {
      return;
    }
    const list = adjacency.get(fromId);
    if (list) {
      list.push({ nextId, edgeId });
    } else {
      adjacency.set(fromId, [{ nextId, edgeId }]);
    }
  };

  for (const edge of edges) {
    pushAdj(edge.targetId, edge.sourceId, edge.id);
    if (edge.relationType === 'CONNECTS_TO') {
      pushAdj(edge.sourceId, edge.targetId, edge.id);
    }
  }

  const depthByNodeId: Record<string, number> = {};
  const queue: string[] = [];
  const impactedEdgeSet = new Set<string>();

  for (const rootId of rootSet) {
    depthByNodeId[rootId] = 0;
    queue.push(rootId);
  }

  let cursor = 0;
  while (cursor < queue.length) {
    const currentId = queue[cursor]!;
    cursor += 1;
    const currentDepth = depthByNodeId[currentId] ?? 0;
    const neighbors = adjacency.get(currentId) ?? [];

    for (const { nextId, edgeId } of neighbors) {
      if (depthByNodeId[nextId] === undefined) {
        depthByNodeId[nextId] = currentDepth + 1;
        impactedEdgeSet.add(edgeId);
        queue.push(nextId);
      } else if ((depthByNodeId[nextId] ?? 0) > 0) {
        impactedEdgeSet.add(edgeId);
      }
    }
  }

  const impactedNodeIds = Object.entries(depthByNodeId)
    .filter(([, depth]) => depth > 0)
    .map(([id]) => id);

  return {
    failedRootIds: Array.from(rootSet),
    impactedNodeIds,
    impactedEdgeIds: Array.from(impactedEdgeSet),
    depthByNodeId,
  };
}

/**
 * Computes deterministic 3D coordinates grouping foundation nodes lower in Y
 * and dependent application layers progressively higher on radial rings.
 */
export function computeTopologyLayout(
  nodes: readonly TopologyAssetNode[],
  edges: readonly TopologyEdge[],
): Record<string, TopologyPosition3D> {
  const positions: Record<string, TopologyPosition3D> = {};
  if (nodes.length === 0) {
    return positions;
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const outgoingCount = new Map<string, number>();
  const depsOf = new Map<string, string[]>();

  for (const node of nodes) {
    outgoingCount.set(node.id, 0);
    depsOf.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId) || edge.sourceId === edge.targetId) {
      continue;
    }
    outgoingCount.set(edge.sourceId, (outgoingCount.get(edge.sourceId) ?? 0) + 1);
    depsOf.get(edge.sourceId)?.push(edge.targetId);
  }

  const depthCache = new Map<string, number>();
  const visiting = new Set<string>();

  const computeTier = (id: string): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(id)) {
      return 0;
    }
    visiting.add(id);
    const targets = depsOf.get(id) ?? [];
    let maxTargetTier = -1;
    for (const targetId of targets) {
      maxTargetTier = Math.max(maxTargetTier, computeTier(targetId));
    }
    visiting.delete(id);
    const tier = maxTargetTier + 1;
    depthCache.set(id, tier);
    return tier;
  };

  const tiers = new Map<number, TopologyAssetNode[]>();
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
    const ringNodes = (tiers.get(tierValue) ?? []).slice().sort((a, b) =>
      a.assetTag.localeCompare(b.assetTag),
    );
    const y = (tierIdx - (tierCount - 1) / 2) * 1.65;
    const count = ringNodes.length;
    const radius = count === 1 ? 0 : Math.max(2.1, Math.min(4.8, 1.55 + count * 0.48));

    for (const [idx, node] of ringNodes.entries()) {
      if (count === 1) {
        positions[node.id] = [0, y, 0];
      } else {
        const angle = (idx / count) * Math.PI * 2 + tierIdx * 0.45;
        const x = Number((Math.cos(angle) * radius).toFixed(4));
        const z = Number((Math.sin(angle) * radius).toFixed(4));
        positions[node.id] = [x, Number(y.toFixed(4)), z];
      }
    }
  }

  return positions;
}
