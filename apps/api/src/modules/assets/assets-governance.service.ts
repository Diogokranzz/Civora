import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RoleCode } from '@civora/types';
import { MetricsService } from '../../shared/infrastructure/metrics.service';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../identity/auth.decorators';

export interface AssetGovernanceCandidate {
  id: string;
  tenantId: string;
  assetTag: string;
  assetType: string;
  unitId: string | null;
  departmentId: string | null;
  ownerId: string | null;
  metadata?: unknown;
  department?: { id: string; code: string; name: string } | null;
}

export interface ActorAssetScope {
  departmentIds: Set<string>;
  departmentCodes: Set<string>;
  unitIds: Set<string>;
}

const TENANT_WIDE_ADMIN_ROLES = new Set<RoleCode>([
  'PlatformAdmin',
  'OrganizationOwner',
  'Administrator',
]);

const SENSITIVE_DEPARTMENT_CODES = new Set(['FIN', 'SEC', 'JUR']);

function parseMetadataRecord(raw: unknown): {
  allowedRoles: string[];
  sensitivity: string | null;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { allowedRoles: [], sensitivity: null };
  }
  const record = raw as Record<string, unknown>;
  const allowedRoles = Array.isArray(record.allowedRoles)
    ? record.allowedRoles.filter((v): v is string => typeof v === 'string')
    : [];
  const sensitivity =
    typeof record.sensitivity === 'string' ? record.sensitivity.toUpperCase() : null;
  return { allowedRoles, sensitivity };
}

@Injectable()
export class AssetsGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  isTenantWideAdmin(actor: AuthContext): boolean {
    return actor.isPlatformAdmin || TENANT_WIDE_ADMIN_ROLES.has(actor.roleCode);
  }

  async loadActorScope(actor: AuthContext): Promise<ActorAssetScope> {
    const departmentIds = new Set<string>();
    const departmentCodes = new Set<string>();
    const unitIds = new Set<string>();

    if (actor.unitId) {
      unitIds.add(actor.unitId);
    }

    const teams = await this.prisma.team.findMany({
      where: {
        tenantId: actor.organizationId,
        OR: [
          { supervisorId: actor.userId },
          { members: { some: { userId: actor.userId } } },
        ],
      },
      select: {
        departmentId: true,
        department: { select: { code: true } },
      },
    });

    for (const team of teams) {
      if (team.departmentId) {
        departmentIds.add(team.departmentId);
      }
      if (team.department?.code) {
        departmentCodes.add(team.department.code.toUpperCase());
      }
    }

    return { departmentIds, departmentCodes, unitIds };
  }

  /**
   * Builds a SQL-enforced Prisma predicate so unauthorized unit/department assets
   * are excluded by PostgreSQL before any row reaches application memory or DataLoader.
   */
  buildReadScopeWhere(
    actor: AuthContext,
    scope: ActorAssetScope,
  ): Prisma.AssetWhereInput {
    const base: Prisma.AssetWhereInput = {
      tenantId: actor.organizationId,
      deletedAt: null,
    };

    if (this.isTenantWideAdmin(actor)) {
      return base;
    }

    const unitList = Array.from(scope.unitIds);
    const deptList = Array.from(scope.departmentIds);
    const orConditions: Prisma.AssetWhereInput[] = [{ ownerId: actor.userId }];

    if (deptList.length > 0 && unitList.length > 0) {
      orConditions.push({
        AND: [
          { departmentId: { in: deptList } },
          { OR: [{ unitId: null }, { unitId: { in: unitList } }] },
        ],
      });
      orConditions.push({
        AND: [{ departmentId: null }, { unitId: { in: unitList } }],
      });
    } else if (deptList.length > 0) {
      orConditions.push({ departmentId: { in: deptList } });
    } else if (unitList.length > 0) {
      orConditions.push({
        AND: [{ departmentId: null }, { unitId: { in: unitList } }],
      });
    } else {
      orConditions.push({
        AND: [{ departmentId: null }, { unitId: null }, { ownerId: null }],
      });
    }

    return {
      ...base,
      OR: orConditions,
    };
  }

  canActorReadAsset(
    actor: AuthContext,
    scope: ActorAssetScope,
    asset: Pick<
      AssetGovernanceCandidate,
      'tenantId' | 'unitId' | 'departmentId' | 'ownerId' | 'metadata'
    >,
  ): boolean {
    if (asset.tenantId !== actor.organizationId) {
      return false;
    }
    if (this.isTenantWideAdmin(actor)) {
      return true;
    }

    const meta = parseMetadataRecord(asset.metadata);
    if (meta.allowedRoles.length > 0 && !meta.allowedRoles.includes(actor.roleCode)) {
      return false;
    }

    if (
      (meta.sensitivity === 'FINANCIAL' || meta.sensitivity === 'RESTRICTED') &&
      asset.ownerId !== actor.userId &&
      !Array.from(scope.departmentCodes).some((code) => SENSITIVE_DEPARTMENT_CODES.has(code))
    ) {
      return false;
    }

    if (asset.ownerId && asset.ownerId === actor.userId) {
      return true;
    }

    if (asset.departmentId) {
      if (!scope.departmentIds.has(asset.departmentId)) {
        return false;
      }
      if (asset.unitId && scope.unitIds.size > 0 && !scope.unitIds.has(asset.unitId)) {
        return false;
      }
      return true;
    }

    if (asset.unitId) {
      return scope.unitIds.size > 0 && scope.unitIds.has(asset.unitId);
    }

    return asset.ownerId === null || asset.ownerId === actor.userId;
  }

  evaluateAssetWriteAccess(
    actor: AuthContext,
    scope: ActorAssetScope,
    asset: AssetGovernanceCandidate,
  ): { allowed: true } | { allowed: false; reason: string } {
    if (asset.tenantId !== actor.organizationId) {
      return { allowed: false, reason: 'Asset is outside active tenant isolation boundary.' };
    }

    if (!actor.permissions.includes('assets:manage')) {
      return { allowed: false, reason: 'Actor does not hold assets:manage permission.' };
    }

    if (this.isTenantWideAdmin(actor)) {
      return { allowed: true };
    }

    const meta = parseMetadataRecord(asset.metadata);
    if (meta.allowedRoles.length > 0 && !meta.allowedRoles.includes(actor.roleCode)) {
      return {
        allowed: false,
        reason: `Role ${actor.roleCode} is not authorized to mutate asset ${asset.assetTag}.`,
      };
    }

    if (
      (meta.sensitivity === 'FINANCIAL' || meta.sensitivity === 'RESTRICTED') &&
      asset.ownerId !== actor.userId &&
      !Array.from(scope.departmentCodes).some((code) => SENSITIVE_DEPARTMENT_CODES.has(code))
    ) {
      return {
        allowed: false,
        reason: `Restricted classification (${meta.sensitivity}) on ${asset.assetTag} requires domain custodian privileges.`,
      };
    }

    if (asset.ownerId && asset.ownerId === actor.userId) {
      return { allowed: true };
    }

    if (asset.departmentId) {
      if (!scope.departmentIds.has(asset.departmentId)) {
        const deptCode = asset.department?.code ? ` (${asset.department.code})` : '';
        return {
          allowed: false,
          reason: `Missing write scope on department${deptCode} for asset ${asset.assetTag}.`,
        };
      }
      if (asset.unitId && scope.unitIds.size > 0 && !scope.unitIds.has(asset.unitId)) {
        return {
          allowed: false,
          reason: `Actor unit scope does not cover asset ${asset.assetTag}.`,
        };
      }
      return { allowed: true };
    }

    if (asset.unitId && scope.unitIds.size > 0 && !scope.unitIds.has(asset.unitId)) {
      return {
        allowed: false,
        reason: `Actor unit scope does not cover asset ${asset.assetTag}.`,
      };
    }

    if (asset.ownerId && asset.ownerId !== actor.userId) {
      return {
        allowed: false,
        reason: `Asset ${asset.assetTag} is exclusively owned by another custodian.`,
      };
    }

    return { allowed: true };
  }

  async assertCanWriteSingleAsset(
    actor: AuthContext,
    asset: AssetGovernanceCandidate,
    side: 'source' | 'target' = 'source',
  ): Promise<void> {
    const scope = await this.loadActorScope(actor);
    const verdict = this.evaluateAssetWriteAccess(actor, scope, asset);
    if (verdict.allowed) {
      return;
    }

    this.metrics.cmdbGovernanceDenialsTotal.inc({ tenant_id: actor.organizationId, side });
    throw new ForbiddenException(verdict.reason);
  }

  async assertBidirectionalRelationshipWrite(
    actor: AuthContext,
    source: AssetGovernanceCandidate,
    target: AssetGovernanceCandidate,
    relationType: string,
  ): Promise<void> {
    const scope = await this.loadActorScope(actor);
    const sourceVerdict = this.evaluateAssetWriteAccess(actor, scope, source);
    const targetVerdict = this.evaluateAssetWriteAccess(actor, scope, target);

    if (sourceVerdict.allowed && targetVerdict.allowed) {
      return;
    }

    const failedSide = !sourceVerdict.allowed ? 'source' : 'target';
    const denialReason = !sourceVerdict.allowed
      ? sourceVerdict.reason
      : !targetVerdict.allowed
        ? targetVerdict.reason
        : 'Bidirectional write authorization denied.';

    this.metrics.cmdbGovernanceDenialsTotal.inc({
      tenant_id: actor.organizationId,
      side: failedSide,
    });

    await this.audit.record({
      tenantId: actor.organizationId,
      actorId: actor.userId,
      action: 'ASSET_RELATIONSHIP_DENIED',
      resourceType: 'AssetRelationship',
      resourceId: `${source.id}:${target.id}`,
      afterState: {
        sourceTag: source.assetTag,
        targetTag: target.assetTag,
        relationType,
        deniedSide: failedSide,
        reason: denialReason,
      },
    });

    throw new ForbiddenException(
      `Bidirectional CMDB governance denied on ${failedSide}: ${denialReason}`,
    );
  }
}
