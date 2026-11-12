import { describe, expect, it } from 'vitest';
import {
  classifyAssetVisualKind,
  computeFailureCascade,
  computeTopologyLayout,
  type TopologyAssetNode,
  type TopologyEdge,
} from './topology-math';

const SAMPLE_NODES: TopologyAssetNode[] = [
  { id: 'r1', assetTag: 'RTR-01', name: 'Core Router SP', assetType: 'ROUTER', status: 'ACTIVE' },
  { id: 's1', assetTag: 'SW-01', name: 'Switch Rack A', assetType: 'SWITCH', status: 'ACTIVE' },
  { id: 'db1', assetTag: 'DB-01', name: 'PostgreSQL Primary', assetType: 'DATABASE', status: 'ACTIVE' },
  { id: 'app1', assetTag: 'APP-01', name: 'Portal Chamados', assetType: 'APPLICATION', status: 'ACTIVE' },
  { id: 'app2', assetTag: 'APP-02', name: 'Biometria RH', assetType: 'APPLICATION', status: 'ACTIVE' },
];

const SAMPLE_EDGES: TopologyEdge[] = [
  { id: 'e1', sourceId: 's1', targetId: 'r1', relationType: 'DEPENDS_ON' },
  { id: 'e2', sourceId: 'db1', targetId: 's1', relationType: 'HOSTED_ON' },
  { id: 'e3', sourceId: 'app1', targetId: 'db1', relationType: 'DEPENDS_ON' },
];

describe('CMDB Topology cascade and 3D layout', () => {
  it('propagates downstream cascade from router outage without infecting isolated services', () => {
    const cascade = computeFailureCascade(SAMPLE_NODES, SAMPLE_EDGES, ['r1']);

    expect(cascade.failedRootIds).toEqual(['r1']);
    expect(cascade.depthByNodeId).toEqual({
      r1: 0,
      s1: 1,
      db1: 2,
      app1: 3,
    });
    expect(cascade.impactedNodeIds).toEqual(['s1', 'db1', 'app1']);
    expect(cascade.impactedEdgeIds).toEqual(['e1', 'e2', 'e3']);
    expect(cascade.depthByNodeId['app2']).toBeUndefined();
  });

  it('handles cyclic CONNECTS_TO links safely without infinite loops', () => {
    const cyclicEdges: TopologyEdge[] = [
      { id: 'c1', sourceId: 'r1', targetId: 's1', relationType: 'CONNECTS_TO' },
      { id: 'c2', sourceId: 's1', targetId: 'r1', relationType: 'CONNECTS_TO' },
    ];
    const cascade = computeFailureCascade(SAMPLE_NODES, cyclicEdges, ['s1']);
    expect(cascade.failedRootIds).toEqual(['s1']);
    expect(cascade.impactedNodeIds).toEqual(['r1']);
  });

  it('computes finite deterministic 3D layered coordinates for all nodes', () => {
    const layout = computeTopologyLayout(SAMPLE_NODES, SAMPLE_EDGES);
    expect(Object.keys(layout)).toHaveLength(SAMPLE_NODES.length);
    for (const node of SAMPLE_NODES) {
      const pos = layout[node.id];
      expect(pos).toBeDefined();
      expect(Number.isFinite(pos?.[0])).toBe(true);
      expect(Number.isFinite(pos?.[1])).toBe(true);
      expect(Number.isFinite(pos?.[2])).toBe(true);
    }
    expect((layout['app1']?.[1] ?? 0)).toBeGreaterThan(layout['r1']?.[1] ?? 0);
  });

  it('classifies CMDB asset types into geometric visual archetypes', () => {
    expect(classifyAssetVisualKind('Core Router')).toBe('network');
    expect(classifyAssetVisualKind('PostgreSQL Cluster')).toBe('database');
    expect(classifyAssetVisualKind('App Server')).toBe('compute');
    expect(classifyAssetVisualKind('Internal Service')).toBe('service');
    expect(classifyAssetVisualKind('Scanner USB')).toBe('endpoint');
  });
});

