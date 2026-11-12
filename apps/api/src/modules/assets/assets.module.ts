import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ASSET_STATUSES } from '@civora/types';
import { z } from 'zod';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';
import { AssetsGovernanceService } from './assets-governance.service';
import { AssetsTopologyService } from './assets-topology.service';

const createAssetSchema = z.object({
  assetTag: z.string().min(2).max(60).toUpperCase(),
  name: z.string().min(2).max(180),
  assetType: z.string().min(2).max(80),
  status: z.enum(ASSET_STATUSES).default('ACTIVE'),
  serialNumber: z.string().max(120).optional(),
  manufacturer: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
  unitId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
});

const relationSchema = z.object({
  targetId: z.string().uuid(),
  relationType: z.enum(['DEPENDS_ON', 'HOSTED_ON', 'CONNECTS_TO']),
});

const simulateCascadeSchema = z.object({
  burstCount: z.number().int().min(1).max(250).default(1),
});

@ApiTags('Assets & CMDB')
@ApiBearerAuth()
@Controller('api/v1/assets')
export class AssetsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly governance: AssetsGovernanceService,
    private readonly topology: AssetsTopologyService,
  ) {}

  @Get()
  @RequirePermissions('assets:read')
  list(@CurrentAuth() auth: AuthContext) {
    return this.topology.listAssets(auth);
  }

  @Get('topology')
  @RequirePermissions('assets:read')
  getTopology(@CurrentAuth() auth: AuthContext) {
    return this.topology.getTopologyGraph(auth);
  }

  @Post()
  @RequirePermissions('assets:manage')
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createAssetSchema)) body: z.infer<typeof createAssetSchema>,
  ) {
    await this.governance.assertCanWriteSingleAsset(
      auth,
      {
        id: 'pending',
        tenantId: auth.organizationId,
        assetTag: body.assetTag.trim(),
        assetType: body.assetType.trim(),
        unitId: body.unitId ?? null,
        departmentId: body.departmentId ?? null,
        ownerId: body.ownerId ?? null,
      },
      'source',
    );

    const asset = await this.prisma.asset.create({
      data: {
        tenantId: auth.organizationId,
        assetTag: body.assetTag.trim(),
        name: body.name.trim(),
        assetType: body.assetType.trim(),
        status: body.status,
        serialNumber: body.serialNumber ?? null,
        manufacturer: body.manufacturer ?? null,
        model: body.model ?? null,
        unitId: body.unitId ?? null,
        departmentId: body.departmentId ?? null,
        ownerId: body.ownerId ?? null,
      },
    });
    await this.topology.invalidateTopologyCache(auth.organizationId);
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'ASSET_CREATED',
      resourceType: 'Asset',
      resourceId: asset.id,
      afterState: { assetTag: asset.assetTag, name: asset.name },
    });
    return asset;
  }

  @Patch(':id')
  @RequirePermissions('assets:manage')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createAssetSchema.partial()))
    body: Partial<z.infer<typeof createAssetSchema>>,
  ) {
    const existing = await this.prisma.asset.findFirst({
      where: { id, tenantId: auth.organizationId, deletedAt: null },
      include: { department: { select: { id: true, code: true, name: true } } },
    });
    if (!existing) throw new NotFoundException('Asset not found.');

    await this.governance.assertCanWriteSingleAsset(auth, existing, 'source');

    const updated = await this.prisma.asset.update({
      where: { id },
      data: { ...body, version: { increment: 1 } },
    });
    await this.topology.invalidateTopologyCache(auth.organizationId);
    return updated;
  }

  @Delete(':id')
  @RequirePermissions('assets:manage')
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    const existing = await this.prisma.asset.findFirst({
      where: { id, tenantId: auth.organizationId, deletedAt: null },
      include: { department: { select: { id: true, code: true, name: true } } },
    });
    if (!existing) throw new NotFoundException('Asset not found.');

    await this.governance.assertCanWriteSingleAsset(auth, existing, 'source');

    await this.prisma.$transaction(async (tx) => {
      await tx.assetRelationship.deleteMany({
        where: {
          tenantId: auth.organizationId,
          OR: [{ sourceId: id }, { targetId: id }],
        },
      });
      await tx.ticketAsset.deleteMany({ where: { assetId: id } });
      await tx.asset.delete({ where: { id } });
    });

    await this.topology.invalidateTopologyCache(auth.organizationId);
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'ASSET_DELETED',
      resourceType: 'Asset',
      resourceId: id,
      beforeState: { assetTag: existing.assetTag, name: existing.name },
    });
    return { deleted: true };
  }

  @Post(':id/relationships')
  @RequirePermissions('assets:manage')
  async addRelationship(
    @CurrentAuth() auth: AuthContext,
    @Param('id') sourceId: string,
    @Body(new ZodValidationPipe(relationSchema)) body: z.infer<typeof relationSchema>,
  ) {
    if (sourceId === body.targetId) {
      throw new BadRequestException('An asset cannot depend on itself.');
    }
    const [src, tgt] = await Promise.all([
      this.prisma.asset.findFirst({
        where: { id: sourceId, tenantId: auth.organizationId, deletedAt: null },
        include: { department: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.asset.findFirst({
        where: { id: body.targetId, tenantId: auth.organizationId, deletedAt: null },
        include: { department: { select: { id: true, code: true, name: true } } },
      }),
    ]);
    if (!src || !tgt) throw new NotFoundException('Asset not found in organization.');

    await this.governance.assertBidirectionalRelationshipWrite(
      auth,
      src,
      tgt,
      body.relationType,
    );

    const created = await this.prisma.assetRelationship.upsert({
      where: {
        sourceId_targetId_relationType: {
          sourceId,
          targetId: body.targetId,
          relationType: body.relationType,
        },
      },
      create: {
        tenantId: auth.organizationId,
        sourceId,
        targetId: body.targetId,
        relationType: body.relationType,
      },
      update: {},
    });

    await this.topology.invalidateTopologyCache(auth.organizationId);
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'ASSET_RELATIONSHIP_LINKED',
      resourceType: 'AssetRelationship',
      resourceId: created.id,
      afterState: {
        sourceTag: src.assetTag,
        targetTag: tgt.assetTag,
        relationType: body.relationType,
      },
    });
    return created;
  }

  @Delete(':id/relationships/:relId')
  @RequirePermissions('assets:manage')
  async removeRelationship(
    @CurrentAuth() auth: AuthContext,
    @Param('id') sourceId: string,
    @Param('relId') relId: string,
  ) {
    const existingRel = await this.prisma.assetRelationship.findFirst({
      where: { id: relId, sourceId, tenantId: auth.organizationId },
      include: {
        source: {
          include: { department: { select: { id: true, code: true, name: true } } },
        },
        target: {
          include: { department: { select: { id: true, code: true, name: true } } },
        },
      },
    });
    if (!existingRel) {
      throw new NotFoundException('Asset relationship not found.');
    }

    await this.governance.assertBidirectionalRelationshipWrite(
      auth,
      existingRel.source,
      existingRel.target,
      existingRel.relationType,
    );

    await this.prisma.assetRelationship.deleteMany({
      where: { id: relId, sourceId, tenantId: auth.organizationId },
    });
    await this.topology.invalidateTopologyCache(auth.organizationId);
    return { removed: true };
  }

  @Post(':id/simulate-cascade')
  @RequirePermissions('assets:manage')
  @Throttle({ default: { limit: 6000, ttl: 60_000 } })
  async simulateCascade(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(simulateCascadeSchema)) body: z.infer<typeof simulateCascadeSchema>,
  ) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, tenantId: auth.organizationId, deletedAt: null },
      include: { department: { select: { id: true, code: true, name: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found in organization.');

    await this.governance.assertCanWriteSingleAsset(auth, asset, 'source');
    return this.topology.emitCascadeSimulation(auth, id, body.burstCount);
  }
}

@Module({
  controllers: [AssetsController],
  providers: [AssetsGovernanceService, AssetsTopologyService],
  exports: [AssetsGovernanceService, AssetsTopologyService],
})
export class AssetsModule {}
