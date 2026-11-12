import { ForbiddenException } from '@nestjs/common';
import { ROLE_PERMISSION_MATRIX } from '@civora/config';
import { describe, expect, it, vi } from 'vitest';
import { AssetsGovernanceService } from '../../src/modules/assets/assets-governance.service';
import {
  AssetsTopologyService,
  getSkeletonCoordsKey,
} from '../../src/modules/assets/assets-topology.service';
import type { AuthContext } from '../../src/modules/identity/auth.decorators';
import type { AuditService } from '../../src/modules/audit/audit.service';
import type { RealtimeGateway } from '../../src/modules/notifications/realtime.gateway';
import { MetricsService } from '../../src/shared/infrastructure/metrics.service';
import type { PrismaService } from '../../src/shared/infrastructure/prisma.service';
import type { RedisService } from '../../src/shared/infrastructure/redis.service';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const DEPT_INFRA_ID = 'aaaa1111-1111-4111-8111-111111111111';
const DEPT_FAC_CAMPINAS_ID = 'cccc3333-3333-4333-8333-333333333333';
const DEPT_FIN_ID = 'bbbb2222-2222-4222-8222-222222222222';
const UNIT_CAMPINAS_ID = 'u-campinas';
const UNIT_HQ_ID = 'u-hq-sp';
const NET_OP_ID = '33333333-3333-4333-8333-333333333333';
const CAMPINAS_OP_ID = '55555555-5555-4555-8555-555555555555';
const FIN_OWNER_ID = '44444444-4444-4444-8444-444444444444';

function buildActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: NET_OP_ID,
    email: 'rede.ops@civora.local',
    name: 'Operador de Rede',
    isPlatformAdmin: false,
    organizationId: ORG_ID,
    unitId: 'u-dc-pri',
    roleCode: 'ServiceManager',
    permissions: ROLE_PERMISSION_MATRIX.ServiceManager,
    ...overrides,
  };
}

describe('CMDB Governance, Zero-Leak Skeleton Cache, DataLoader & Redis Circuit Breaker', () => {
  it('enforces bidirectional write permission on both source and target assets', async () => {
    const metrics = new MetricsService();
    const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const prisma = {
      team: {
        findMany: vi.fn().mockResolvedValue([
          { departmentId: DEPT_INFRA_ID, department: { code: 'INFRA' } },
        ]),
      },
    } as unknown as PrismaService;

    const governance = new AssetsGovernanceService(prisma, audit, metrics);
    const networkOperator = buildActor();

    const routerAsset = {
      id: 'asset-rtr-1',
      tenantId: ORG_ID,
      assetTag: 'RTR-CORE-01',
      assetType: 'ROUTER',
      unitId: 'u-dc-pri',
      departmentId: DEPT_INFRA_ID,
      department: { id: DEPT_INFRA_ID, code: 'INFRA', name: 'Infraestrutura' },
      ownerId: null,
    };

    const switchAsset = {
      id: 'asset-sw-1',
      tenantId: ORG_ID,
      assetTag: 'SW-TOR-01',
      assetType: 'SWITCH',
      unitId: 'u-dc-pri',
      departmentId: DEPT_INFRA_ID,
      department: { id: DEPT_INFRA_ID, code: 'INFRA', name: 'Infraestrutura' },
      ownerId: null,
    };

    const financeDbAsset = {
      id: 'asset-db-fin',
      tenantId: ORG_ID,
      assetTag: 'DB-FIN-01',
      assetType: 'DATABASE',
      unitId: UNIT_HQ_ID,
      departmentId: DEPT_FIN_ID,
      department: { id: DEPT_FIN_ID, code: 'FIN', name: 'Financeiro' },
      ownerId: FIN_OWNER_ID,
      metadata: { sensitivity: 'FINANCIAL' },
    };

    await expect(
      governance.assertBidirectionalRelationshipWrite(
        networkOperator,
        routerAsset,
        switchAsset,
        'CONNECTS_TO',
      ),
    ).resolves.toBeUndefined();

    await expect(
      governance.assertBidirectionalRelationshipWrite(
        networkOperator,
        routerAsset,
        financeDbAsset,
        'DEPENDS_ON',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ASSET_RELATIONSHIP_DENIED',
        afterState: expect.objectContaining({
          sourceTag: 'RTR-CORE-01',
          targetTag: 'DB-FIN-01',
          deniedSide: 'target',
        }),
      }),
    );

    await expect(
      governance.assertBidirectionalRelationshipWrite(
        networkOperator,
        financeDbAsset,
        routerAsset,
        'DEPENDS_ON',
      ),
    ).rejects.toThrow(/denied on source/i);

    const orgOwner = buildActor({
      roleCode: 'OrganizationOwner',
      permissions: ROLE_PERMISSION_MATRIX.OrganizationOwner,
    });
    await expect(
      governance.assertBidirectionalRelationshipWrite(
        orgOwner,
        routerAsset,
        financeDbAsset,
        'DEPENDS_ON',
      ),
    ).resolves.toBeUndefined();
  });

  it('stores only anonymous spatial skeleton coords in Redis, isolates scoped RBAC reads via SQL+DataLoader, and eliminates N+1', async () => {
    const metrics = new MetricsService();
    const realtime = { emitToTenant: vi.fn() } as unknown as RealtimeGateway;
    const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;

    const redisHashes = new Map<string, Map<string, string>>();
    const redis = {
      client: {
        hmget: vi.fn(async (key: string, ...fields: string[]) => {
          const hash = redisHashes.get(key);
          return fields.map((f) => hash?.get(f) ?? null);
        }),
        hset: vi.fn(async (key: string, payload: Record<string, string>) => {
          let hash = redisHashes.get(key);
          if (!hash) {
            hash = new Map<string, string>();
            redisHashes.set(key, hash);
          }
          for (const [k, v] of Object.entries(payload)) {
            hash.set(k, v);
          }
          return Object.keys(payload).length;
        }),
        expire: vi.fn().mockResolvedValue(1),
        del: vi.fn(async (key: string) => {
          redisHashes.delete(key);
          return 1;
        }),
      },
    } as unknown as RedisService;

    const now = new Date('2026-11-11T12:00:00Z');
    const allTenantAssets = [
      {
        id: 'asset-camp-1',
        tenantId: ORG_ID,
        assetTag: 'HVAC-CMP-01',
        name: 'Chiller Campinas',
        assetType: 'STORAGE',
        status: 'ACTIVE',
        serialNumber: 'SN-CMP-1',
        manufacturer: null,
        model: null,
        unitId: UNIT_CAMPINAS_ID,
        departmentId: DEPT_FAC_CAMPINAS_ID,
        ownerId: CAMPINAS_OP_ID,
        metadata: {},
        version: 1,
        updatedAt: now,
      },
      {
        id: 'asset-hq-fin-1',
        tenantId: ORG_ID,
        assetTag: 'ERP-CTRL-HQ',
        name: 'Servidor Controladoria Matriz',
        assetType: 'DATABASE',
        status: 'ACTIVE',
        serialNumber: 'SN-FIN-SECRET',
        manufacturer: null,
        model: null,
        unitId: UNIT_HQ_ID,
        departmentId: DEPT_FIN_ID,
        ownerId: FIN_OWNER_ID,
        metadata: { sensitivity: 'FINANCIAL' },
        version: 1,
        updatedAt: now,
      },
    ];

    const prisma = {
      team: {
        findMany: vi.fn().mockResolvedValue([
          { departmentId: DEPT_FAC_CAMPINAS_ID, department: { code: 'FAC' } },
        ]),
      },
      asset: {
        findMany: vi.fn().mockImplementation(({ where, select }) => {
          if (select?.id && !select?.name) {
            return Promise.resolve(allTenantAssets.map((a) => ({ id: a.id, assetTag: a.assetTag })));
          }
          if (where?.OR) {
            return Promise.resolve([allTenantAssets[0]]);
          }
          return Promise.resolve(allTenantAssets);
        }),
      },
      unit: {
        findMany: vi.fn().mockResolvedValue([{ id: UNIT_CAMPINAS_ID, name: 'Operações Prediais Campinas' }]),
      },
      department: {
        findMany: vi.fn().mockResolvedValue([{ id: DEPT_FAC_CAMPINAS_ID, name: 'Facilities Campinas' }]),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([{ id: CAMPINAS_OP_ID, name: 'Operador Campinas' }]),
      },
      assetRelationship: {
        findMany: vi.fn().mockImplementation(({ select, where }) => {
          if (select && !select.id) {
            return Promise.resolve([
              { sourceId: 'asset-camp-1', targetId: 'asset-hq-fin-1' },
            ]);
          }
          const sourceAllowed = new Set<string>(where?.sourceId?.in ?? []);
          const targetAllowed = new Set<string>(where?.targetId?.in ?? []);
          const edge = {
            id: 'rel-cross',
            sourceId: 'asset-camp-1',
            targetId: 'asset-hq-fin-1',
            relationType: 'DEPENDS_ON',
          };
          if (sourceAllowed.has(edge.sourceId) && targetAllowed.has(edge.targetId)) {
            return Promise.resolve([edge]);
          }
          return Promise.resolve([]);
        }),
      },
    } as unknown as PrismaService;

    const governance = new AssetsGovernanceService(prisma, audit, metrics);
    const service = new AssetsTopologyService(prisma, redis, metrics, realtime, governance);

    const campinasActor = buildActor({
      userId: CAMPINAS_OP_ID,
      email: 'campinas.fac@civora.local',
      name: 'Operador Predial Campinas',
      unitId: UNIT_CAMPINAS_ID,
    });

    const first = await service.getTopologyGraph(campinasActor);
    expect(first.cacheStatus).toBe('MISS');
    expect(first.nodes.map((n) => n.id)).toEqual(['asset-camp-1']);
    expect(first.nodes.some((n) => n.assetTag === 'ERP-CTRL-HQ')).toBe(false);
    expect(first.edges).toEqual([]);

    // Confirm Redis Hash stores ONLY [x, y, z] spatial tuples, zero names/tags/serials/metadata
    const skeletonKey = getSkeletonCoordsKey(ORG_ID);
    const storedHash = redisHashes.get(skeletonKey);
    expect(storedHash?.size).toBe(2);
    const serializedRedis = JSON.stringify(Array.from(storedHash?.entries() ?? []));
    expect(serializedRedis).not.toContain('Controladoria');
    expect(serializedRedis).not.toContain('SN-FIN-SECRET');
    expect(serializedRedis).not.toContain('ERP-CTRL-HQ');
    expect(JSON.parse(storedHash?.get('asset-camp-1') ?? 'null')).toHaveLength(3);

    // Second call hits Redis HMGET cleanly ONLY for authorized node IDs
    const second = await service.getTopologyGraph(campinasActor);
    expect(second.cacheStatus).toBe('HIT');
    expect(second.nodes).toHaveLength(1);
    expect(redis.client.hmget).toHaveBeenLastCalledWith(skeletonKey, 'asset-camp-1');

    // DataLoader batched metadata queries without N+1 amplification
    expect(prisma.unit.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.department.findMany).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
  });

  it('opens opossum circuit breaker on consecutive Redis failures and falls back cleanly to PostgreSQL/DataLoader', async () => {
    const metrics = new MetricsService();
    const realtime = { emitToTenant: vi.fn() } as unknown as RealtimeGateway;
    const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;

    const redis = {
      client: {
        hmget: vi.fn().mockRejectedValue(new Error('ECONNREFUSED redis:6379')),
        hset: vi.fn().mockRejectedValue(new Error('ECONNREFUSED redis:6379')),
        expire: vi.fn().mockRejectedValue(new Error('ECONNREFUSED redis:6379')),
        del: vi.fn().mockRejectedValue(new Error('ECONNREFUSED redis:6379')),
      },
    } as unknown as RedisService;

    const now = new Date('2026-11-11T12:00:00Z');
    const prisma = {
      team: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      asset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'r1',
            tenantId: ORG_ID,
            assetTag: 'RTR-01',
            name: 'Core Router',
            assetType: 'ROUTER',
            status: 'ACTIVE',
            serialNumber: null,
            manufacturer: null,
            model: null,
            unitId: null,
            departmentId: null,
            ownerId: null,
            metadata: {},
            version: 1,
            updatedAt: now,
          },
        ]),
      },
      unit: { findMany: vi.fn().mockResolvedValue([]) },
      department: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      assetRelationship: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const governance = new AssetsGovernanceService(prisma, audit, metrics);
    const service = new AssetsTopologyService(prisma, redis, metrics, realtime, governance);

    const adminActor = buildActor({
      roleCode: 'OrganizationOwner',
      permissions: ROLE_PERMISSION_MATRIX.OrganizationOwner,
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await service.getTopologyGraph(adminActor);
      expect(result.cacheStatus).toBe('CIRCUIT_OPEN');
      expect(result.nodes).toHaveLength(1);
      expect(result.layoutPositions['r1']).toEqual([0, 0, 0]);
    }

    expect(service.skeletonReadBreaker.opened).toBe(true);
    const metricsOutput = await metrics.getMetricsText();
    expect(metricsOutput).toContain('civora_redis_circuit_open_total{operation="topology_skeleton_read"} 1');

    // Subsequent call must short-circuit without calling failing Redis hmget
    const callsBeforeShortCircuit = (redis.client.hmget as ReturnType<typeof vi.fn>).mock.calls.length;
    const resilientResult = await service.getTopologyGraph(adminActor);
    expect(resilientResult.cacheStatus).toBe('CIRCUIT_OPEN');
    expect((redis.client.hmget as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsBeforeShortCircuit,
    );

    service.onModuleDestroy();
  });
});
