import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuditLogDto, PaginatedResponse } from '@civora/types';
import { z } from 'zod';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';
import { AuditService } from './audit.service';

const consentSchema = z.object({
  purpose: z.string().min(3).max(120),
  granted: z.boolean(),
  policyVersion: z.string().min(1).max(32),
});

const anonymizeSchema = z.object({
  legalBasis: z.string().min(5).max(200),
});

@ApiTags('Audit & LGPD')
@ApiBearerAuth()
@Controller('api/v1')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Get('audit/logs')
  @RequirePermissions('audit:read')
  async listLogs(
    @CurrentAuth() auth: AuthContext,
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
    @Query('resourceType') resourceType?: string,
    @Query('action') action?: string,
  ): Promise<PaginatedResponse<AuditLogDto>> {
    const page = Math.max(1, Number(pageParam) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeParam) || 25));

    const where = {
      tenantId: auth.organizationId,
      ...(resourceType ? { resourceType } : {}),
      ...(action ? { action: { contains: action, mode: 'insensitive' as const } } : {}),
    };

    const [totalItems, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      data: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        actor: row.actor,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        beforeState: (row.beforeState as Record<string, unknown> | null) ?? null,
        afterState: (row.afterState as Record<string, unknown> | null) ?? null,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        correlationId: row.correlationId,
        origin: row.origin,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  @Get('lgpd/export/:userId')
  async exportDataSubject(
    @CurrentAuth() auth: AuthContext,
    @Param('userId') userId: string,
  ) {
    const canManage = auth.permissions.includes('lgpd:manage');
    if (userId !== auth.userId && !canManage) {
      throw new ForbiddenException('You can only export your own personal data.');
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: auth.organizationId,
          userId,
        },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, createdAt: true, anonymizedAt: true },
        },
        role: { select: { code: true, name: true } },
      },
    });
    if (!membership) {
      throw new NotFoundException('Data subject not found in this organization.');
    }

    const [tickets, comments, consents] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { tenantId: auth.organizationId, requesterId: userId },
        select: {
          id: true,
          publicNumber: true,
          title: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.ticketComment.findMany({
        where: { tenantId: auth.organizationId, authorId: userId, isInternal: false },
        select: { id: true, ticketId: true, bodyText: true, createdAt: true },
      }),
      this.prisma.consentRecord.findMany({
        where: { tenantId: auth.organizationId, userId },
      }),
    ]);

    await this.prisma.lgpdRequest.create({
      data: {
        tenantId: auth.organizationId,
        subjectId: userId,
        requestType: 'EXPORT',
        status: 'COMPLETED',
        processedBy: auth.userId,
        completedAt: new Date(),
      },
    });

    await this.auditService.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'LGPD_DATA_EXPORTED',
      resourceType: 'User',
      resourceId: userId,
    });

    return {
      exportedAt: new Date().toISOString(),
      organizationId: auth.organizationId,
      subject: membership.user,
      role: membership.role,
      requestedTickets: tickets,
      publicComments: comments,
      consents,
    };
  }

  @Post('lgpd/anonymize/:userId')
  @RequirePermissions('lgpd:manage')
  async anonymizeDataSubject(
    @CurrentAuth() auth: AuthContext,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(anonymizeSchema)) body: z.infer<typeof anonymizeSchema>,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: { organizationId: auth.organizationId, userId },
      },
      include: { user: true },
    });
    if (!membership) {
      throw new NotFoundException('Data subject not found in this organization.');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({
        where: { id: membership.id },
        data: { isActive: false },
      });

      const activeMemberships = await tx.membership.count({
        where: { userId, isActive: true },
      });

      if (activeMemberships === 0) {
        await tx.user.update({
          where: { id: userId },
          data: {
            name: 'Titular Anonimizado',
            email: `anon-${userId}@anonymized.civora.local`,
            avatarUrl: null,
            mfaEnabled: false,
            mfaSecretEncrypted: null,
            anonymizedAt: now,
          },
        });
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
      }

      await tx.lgpdRequest.create({
        data: {
          tenantId: auth.organizationId,
          subjectId: userId,
          requestType: 'ANONYMIZATION',
          status: 'COMPLETED',
          legalBasis: body.legalBasis,
          processedBy: auth.userId,
          completedAt: now,
        },
      });

      await this.auditService.record(
        {
          tenantId: auth.organizationId,
          actorId: auth.userId,
          action: 'LGPD_SUBJECT_ANONYMIZED',
          resourceType: 'User',
          resourceId: userId,
          afterState: { legalBasis: body.legalBasis, anonymizedAt: now.toISOString() },
        },
        tx,
      );
    });

    return { status: 'COMPLETED', userId, anonymizedAt: now.toISOString() };
  }

  @Post('lgpd/consents')
  async recordConsent(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(consentSchema)) body: z.infer<typeof consentSchema>,
  ) {
    const record = await this.prisma.consentRecord.create({
      data: {
        tenantId: auth.organizationId,
        userId: auth.userId,
        purpose: body.purpose,
        granted: body.granted,
        policyVersion: body.policyVersion,
        revokedAt: body.granted ? null : new Date(),
      },
    });

    await this.auditService.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: body.granted ? 'LGPD_CONSENT_GRANTED' : 'LGPD_CONSENT_REVOKED',
      resourceType: 'ConsentRecord',
      resourceId: record.id,
      afterState: { purpose: body.purpose, policyVersion: body.policyVersion },
    });

    return record;
  }

  @Get('lgpd/requests')
  @RequirePermissions('lgpd:manage')
  async listLgpdRequests(@CurrentAuth() auth: AuthContext) {
    return this.prisma.lgpdRequest.findMany({
      where: { tenantId: auth.organizationId },
      include: { subject: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}

