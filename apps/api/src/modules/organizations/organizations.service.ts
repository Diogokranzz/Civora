import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, isActive: true },
      include: {
        organization: {
          include: { subscription: true, featureFlags: true },
        },
        role: { select: { code: true, name: true } },
      },
    });
    return memberships.map((m) => ({
      ...m.organization,
      myRole: m.role,
    }));
  }

  async getCurrent(tenantId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: tenantId },
      include: { subscription: true, featureFlags: true },
    });
    if (!org) throw new NotFoundException('Organization not found.');
    return org;
  }

  async createOrganization(params: {
    actorId: string;
    isPlatformAdmin: boolean;
    name: string;
    slug: string;
    defaultTimezone?: string;
  }) {
    if (!params.isPlatformAdmin) {
      throw new ForbiddenException('Only platform administrators can provision new organizations.');
    }
    const existing = await this.prisma.organization.findUnique({ where: { slug: params.slug } });
    if (existing) {
      throw new ConflictException('Organization slug already in use.');
    }

    const ownerRole = await this.prisma.role.findUnique({ where: { code: 'OrganizationOwner' } });
    if (!ownerRole) {
      throw new NotFoundException('System role OrganizationOwner is not seeded.');
    }

    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: params.name.trim(),
          slug: params.slug.trim().toLowerCase(),
          defaultTimezone: params.defaultTimezone || 'America/Sao_Paulo',
          subscription: {
            create: { plan: 'ENTERPRISE', status: 'ACTIVE', maxAgents: 100, maxUnits: 25 },
          },
          units: {
            create: {
              name: 'Sede Corporativa',
              code: 'HQ',
              timezone: params.defaultTimezone || 'America/Sao_Paulo',
            },
          },
        },
        include: { units: true, subscription: true },
      });

      await tx.membership.create({
        data: {
          organizationId: created.id,
          userId: params.actorId,
          roleId: ownerRole.id,
          defaultUnitId: created.units[0]?.id ?? null,
        },
      });

      await this.audit.record(
        {
          tenantId: created.id,
          actorId: params.actorId,
          action: 'ORGANIZATION_CREATED',
          resourceType: 'Organization',
          resourceId: created.id,
          afterState: { name: created.name, slug: created.slug },
        },
        tx,
      );

      return created;
    });

    return org;
  }

  async updateSettings(
    tenantId: string,
    actorId: string,
    data: { name?: string; defaultTimezone?: string; aiEnabled?: boolean; dataRetentionDays?: number },
  ) {
    const before = await this.getCurrent(tenantId);
    const updated = await this.prisma.organization.update({
      where: { id: tenantId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.defaultTimezone !== undefined ? { defaultTimezone: data.defaultTimezone } : {}),
        ...(data.aiEnabled !== undefined ? { aiEnabled: data.aiEnabled } : {}),
        ...(data.dataRetentionDays !== undefined
          ? { dataRetentionDays: data.dataRetentionDays }
          : {}),
      },
      include: { subscription: true, featureFlags: true },
    });

    await this.audit.record({
      tenantId,
      actorId,
      action: 'ORGANIZATION_UPDATED',
      resourceType: 'Organization',
      resourceId: tenantId,
      beforeState: {
        name: before.name,
        aiEnabled: before.aiEnabled,
        dataRetentionDays: before.dataRetentionDays,
      },
      afterState: {
        name: updated.name,
        aiEnabled: updated.aiEnabled,
        dataRetentionDays: updated.dataRetentionDays,
      },
    });

    return updated;
  }

  async upsertFeatureFlag(tenantId: string, actorId: string, key: string, enabled: boolean) {
    const flag = await this.prisma.featureFlag.upsert({
      where: { organizationId_key: { organizationId: tenantId, key } },
      create: { organizationId: tenantId, key, enabled },
      update: { enabled },
    });

    await this.audit.record({
      tenantId,
      actorId,
      action: 'FEATURE_FLAG_UPDATED',
      resourceType: 'FeatureFlag',
      resourceId: flag.id,
      afterState: { key, enabled },
    });
    return flag;
  }
}

