import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CHANGE_RISKS,
  CHANGE_STATUSES,
  PRIORITY_LEVELS,
  PROBLEM_STATUSES,
  SOCKET_EVENTS,
} from '@civora/types';
import { z } from 'zod';
import { MetricsService } from '../../shared/infrastructure/metrics.service';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';
import { RealtimeGateway } from '../notifications/realtime.gateway';

const createProblemSchema = z.object({
  title: z.string().min(4).max(200),
  description: z.string().min(5),
  rootCause: z.string().optional(),
  workaround: z.string().optional(),
  priority: z.enum(PRIORITY_LEVELS).default('MEDIUM'),
  linkedTicketIds: z.array(z.string().uuid()).optional(),
});

const updateProblemSchema = createProblemSchema.partial().extend({
  status: z.enum(PROBLEM_STATUSES).optional(),
});

const createChangeSchema = z.object({
  title: z.string().min(4).max(200),
  description: z.string().min(5),
  risk: z.enum(CHANGE_RISKS).default('MEDIUM'),
  implementationPlan: z.string().min(5),
  rollbackPlan: z.string().min(5),
  windowStartAt: z.string().datetime().optional(),
  windowEndAt: z.string().datetime().optional(),
  linkedTicketIds: z.array(z.string().uuid()).optional(),
});

const updateChangeSchema = createChangeSchema.partial().extend({
  status: z.enum(CHANGE_STATUSES).optional(),
});

const slaBurstSchema = z.object({
  burstCount: z.number().int().min(1).max(500).default(100),
  priority: z.enum(PRIORITY_LEVELS).default('CRITICAL'),
});

@ApiTags('ITSM (Incidents, Problems, Changes)')
@ApiBearerAuth()
@Controller('api/v1')
export class ItsmController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get('incidents')
  @RequirePermissions('itsm:read')
  listIncidents(@CurrentAuth() auth: AuthContext) {
    return this.prisma.incident.findMany({
      where: { tenantId: auth.organizationId },
      include: {
        ticket: {
          select: {
            id: true,
            publicNumber: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
            assignee: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { detectedAt: 'desc' },
      take: 100,
    });
  }

  @Get('incidents/public-notices')
  @RequirePermissions('tickets:read')
  listPublicMajorIncidents(@CurrentAuth() auth: AuthContext) {
    return this.prisma.incident.findMany({
      where: {
        tenantId: auth.organizationId,
        isMajorIncident: true,
        ticket: { status: { notIn: ['CLOSED', 'CANCELED'] } },
      },
      include: {
        ticket: {
          select: { id: true, publicNumber: true, title: true, status: true, priority: true },
        },
      },
      orderBy: { detectedAt: 'desc' },
    });
  }

  @Get('problems')
  @RequirePermissions('itsm:read')
  async listProblems(@CurrentAuth() auth: AuthContext) {
    const rows = await this.prisma.problem.findMany({
      where: { tenantId: auth.organizationId },
      include: {
        _count: { select: { ticketLinks: true } },
        ticketLinks: {
          include: {
            ticket: { select: { id: true, publicNumber: true, title: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      ...r,
      linkedTicketCount: r._count.ticketLinks,
    }));
  }

  @Post('problems')
  @RequirePermissions('itsm:manage')
  async createProblem(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createProblemSchema)) body: z.infer<typeof createProblemSchema>,
  ) {
    const count = await this.prisma.problem.count({ where: { tenantId: auth.organizationId } });
    const code = `PRB-${new Date().getUTCFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const validTickets = body.linkedTicketIds?.length
      ? await this.prisma.ticket.findMany({
          where: { id: { in: body.linkedTicketIds }, tenantId: auth.organizationId },
          select: { id: true },
        })
      : [];

    const problem = await this.prisma.problem.create({
      data: {
        tenantId: auth.organizationId,
        code,
        title: body.title.trim(),
        description: body.description.trim(),
        rootCause: body.rootCause ?? null,
        workaround: body.workaround ?? null,
        priority: body.priority,
        ticketLinks: {
          create: validTickets.map((t) => ({ ticketId: t.id })),
        },
      },
    });
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'PROBLEM_CREATED',
      resourceType: 'Problem',
      resourceId: problem.id,
      afterState: { code: problem.code, title: problem.title },
    });
    return problem;
  }

  @Patch('problems/:id')
  @RequirePermissions('itsm:manage')
  async updateProblem(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProblemSchema)) body: z.infer<typeof updateProblemSchema>,
  ) {
    const existing = await this.prisma.problem.findFirst({
      where: { id, tenantId: auth.organizationId },
    });
    if (!existing) throw new NotFoundException('Problem not found.');
    const { linkedTicketIds: _ignored, ...rest } = body;
    return this.prisma.problem.update({
      where: { id },
      data: { ...rest, version: { increment: 1 } },
    });
  }

  @Get('changes')
  @RequirePermissions('itsm:read')
  listChanges(@CurrentAuth() auth: AuthContext) {
    return this.prisma.change.findMany({
      where: { tenantId: auth.organizationId },
      include: {
        ticketLinks: {
          include: {
            ticket: { select: { id: true, publicNumber: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('changes')
  @RequirePermissions('itsm:manage')
  async createChange(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createChangeSchema)) body: z.infer<typeof createChangeSchema>,
  ) {
    const count = await this.prisma.change.count({ where: { tenantId: auth.organizationId } });
    const code = `CHG-${new Date().getUTCFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const validTickets = body.linkedTicketIds?.length
      ? await this.prisma.ticket.findMany({
          where: { id: { in: body.linkedTicketIds }, tenantId: auth.organizationId },
          select: { id: true },
        })
      : [];

    const change = await this.prisma.change.create({
      data: {
        tenantId: auth.organizationId,
        code,
        title: body.title.trim(),
        description: body.description.trim(),
        risk: body.risk,
        implementationPlan: body.implementationPlan.trim(),
        rollbackPlan: body.rollbackPlan.trim(),
        windowStartAt: body.windowStartAt ? new Date(body.windowStartAt) : null,
        windowEndAt: body.windowEndAt ? new Date(body.windowEndAt) : null,
        ticketLinks: {
          create: validTickets.map((t) => ({ ticketId: t.id })),
        },
      },
    });
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'CHANGE_CREATED',
      resourceType: 'Change',
      resourceId: change.id,
      afterState: { code: change.code, risk: change.risk },
    });
    return change;
  }

  @Patch('changes/:id')
  @RequirePermissions('itsm:manage')
  async updateChange(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateChangeSchema)) body: z.infer<typeof updateChangeSchema>,
  ) {
    const existing = await this.prisma.change.findFirst({
      where: { id, tenantId: auth.organizationId },
    });
    if (!existing) throw new NotFoundException('Change request not found.');
    const { linkedTicketIds: _ignored, windowStartAt, windowEndAt, ...rest } = body;
    return this.prisma.change.update({
      where: { id },
      data: {
        ...rest,
        ...(windowStartAt ? { windowStartAt: new Date(windowStartAt) } : {}),
        ...(windowEndAt ? { windowEndAt: new Date(windowEndAt) } : {}),
        version: { increment: 1 },
      },
    });
  }

  @Post('itsm/stress/sla-breach-burst')
  @RequirePermissions('itsm:manage', 'sla:manage')
  @Throttle({ default: { limit: 6000, ttl: 60_000 } })
  async emitSlaBreachBurst(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(slaBurstSchema)) body: z.infer<typeof slaBurstSchema>,
  ) {
    if (process.env.NODE_ENV === 'production' && process.env.CIVORA_ALLOW_LOAD_TEST !== 'true') {
      throw new ForbiddenException('Load stress bursts are disabled in strict production mode.');
    }

    const CHUNK_SIZE = 20;
    for (let i = 0; i < body.burstCount; i += 1) {
      this.metrics.slaBreachesTotal.inc({
        tenant_id: auth.organizationId,
        priority: body.priority,
      });
      this.realtime.emitToTenant(auth.organizationId, SOCKET_EVENTS.SLA_UPDATED, {
        tenantId: auth.organizationId,
        kind: 'SLA_BREACH_BURST',
        priority: body.priority,
        sequence: i + 1,
      });
      this.realtime.emitToTenant(auth.organizationId, SOCKET_EVENTS.TICKET_UPDATED, {
        tenantId: auth.organizationId,
        priority: body.priority,
        breached: true,
        sequence: i + 1,
      });

      if ((i + 1) % CHUNK_SIZE === 0 && i + 1 < body.burstCount) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
      }
    }

    return {
      accepted: true,
      emittedEvents: body.burstCount * 2,
      priority: body.priority,
    };
  }
}

@Module({ controllers: [ItsmController] })
export class ItsmModule {}

