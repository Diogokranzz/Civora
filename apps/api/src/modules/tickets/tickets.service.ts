import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ATTACHMENT_POLICY, SLA_PAUSE_STATUSES } from '@civora/config';
import {
  type CursorPaginatedResponse,
  type ImpactLevel,
  type PaginatedResponse,
  type PriorityLevel,
  SOCKET_EVENTS,
  type TicketChannel,
  type TicketDetailDto,
  type TicketStatus,
  type TicketSummaryDto,
  type TicketTimelineEventDto,
  type TicketType,
  type UrgencyLevel,
} from '@civora/types';
import type { Prisma } from '@prisma/client';
import { OptimisticConcurrencyError } from '../../shared/domain/domain-errors';
import { getRequestContext } from '../../shared/infrastructure/correlation.middleware';
import { MetricsService } from '../../shared/infrastructure/metrics.service';
import { OutboxService } from '../../shared/infrastructure/outbox.service';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { escapeCsvCell, sanitizeRichText } from '../../shared/infrastructure/sanitize';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../identity/auth.decorators';
import { HybridStorageService } from '../integrations/storage.service';
import { RealtimeGateway } from '../notifications/realtime.gateway';
import { validateServiceCustomFields } from '../service-catalog/service-catalog.module';
import { SlaService } from '../sla/sla.service';
import { TicketAggregate } from './domain/ticket.entity';

const SAFE_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'dueAt',
  'priority',
  'status',
  'publicNumber',
]);

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly sla: SlaService,
    private readonly storage: HybridStorageService,
    private readonly realtime: RealtimeGateway,
    private readonly metrics: MetricsService,
  ) {}

  async createTicket(
    auth: AuthContext,
    input: {
      title: string;
      description: string;
      type?: TicketType;
      channel?: TicketChannel;
      impact?: ImpactLevel;
      urgency?: UrgencyLevel;
      unitId?: string | null;
      departmentId?: string | null;
      assignedTeamId?: string | null;
      categoryId?: string | null;
      serviceId?: string | null;
      subcategory?: string | null;
      tags?: string[];
      customFields?: Record<string, unknown>;
      isMajorIncident?: boolean;
      assetIds?: string[];
    },
  ): Promise<TicketDetailDto> {
    const correlationId = getRequestContext()?.correlationId ?? randomUUID();
    const now = new Date();
    const { html, text } = sanitizeRichText(input.description);

    await validateServiceCustomFields(
      this.prisma,
      input.serviceId,
      auth.organizationId,
      input.customFields ?? {},
    );

    let effectiveDepartmentId = input.departmentId ?? null;
    let effectiveTeamId = input.assignedTeamId ?? null;
    let effectiveCategoryId = input.categoryId ?? null;
    let effectiveType = input.type ?? 'INCIDENT';
    let effectiveImpact = input.impact ?? 'MEDIUM';
    let effectiveUrgency = input.urgency ?? 'MEDIUM';
    let requiresApproval = false;

    if (input.serviceId) {
      const service = await this.prisma.service.findFirst({
        where: { id: input.serviceId, tenantId: auth.organizationId, deletedAt: null },
      });
      if (service) {
        effectiveDepartmentId = effectiveDepartmentId ?? service.departmentId;
        effectiveTeamId = effectiveTeamId ?? service.defaultTeamId;
        effectiveCategoryId = effectiveCategoryId ?? service.categoryId;
        effectiveType = input.type ?? (service.defaultType as TicketType);
        effectiveImpact = input.impact ?? (service.defaultImpact as ImpactLevel);
        effectiveUrgency = input.urgency ?? (service.defaultUrgency as UrgencyLevel);
        requiresApproval = service.requiresApproval;
      }
    }

    const ticketId = randomUUID();

    const createdId = await this.prisma.$transaction(async (tx) => {
      const year = now.getUTCFullYear();
      const seq = await tx.ticketSequence.upsert({
        where: { tenantId_year: { tenantId: auth.organizationId, year } },
        create: { tenantId: auth.organizationId, year, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const publicNumber = `CIV-${year}-${String(seq.lastNumber).padStart(6, '0')}`;

      const aggregate = TicketAggregate.create({
        id: ticketId,
        tenantId: auth.organizationId,
        publicNumber,
        title: input.title,
        descriptionHtml: html,
        descriptionText: text,
        type: effectiveType,
        channel: input.channel ?? (auth.roleCode === 'Requester' ? 'PORTAL' : 'AGENT_CONSOLE'),
        impact: effectiveImpact,
        urgency: effectiveUrgency,
        requesterId: auth.userId,
        unitId: input.unitId ?? auth.unitId,
        departmentId: effectiveDepartmentId,
        assignedTeamId: effectiveTeamId,
        categoryId: effectiveCategoryId,
        serviceId: input.serviceId ?? null,
        subcategory: input.subcategory ?? null,
        tags: input.tags,
        customFields: input.customFields,
        correlationId,
        now,
      });

      const snap = aggregate.snapshot;

      await tx.ticket.create({
        data: {
          id: snap.id,
          tenantId: snap.tenantId,
          publicNumber: snap.publicNumber,
          title: snap.title,
          descriptionHtml: snap.descriptionHtml,
          descriptionText: snap.descriptionText,
          type: snap.type,
          channel: snap.channel,
          status: requiresApproval ? 'WAITING_APPROVAL' : snap.status,
          impact: snap.impact,
          urgency: snap.urgency,
          priority: snap.priority,
          priorityOverridden: false,
          tags: snap.tags,
          subcategory: snap.subcategory,
          customFields: snap.customFields as Prisma.InputJsonValue,
          requesterId: snap.requesterId,
          unitId: snap.unitId,
          departmentId: snap.departmentId,
          assignedTeamId: snap.assignedTeamId,
          categoryId: snap.categoryId,
          serviceId: snap.serviceId,
        },
      });

      const dueAt = await this.sla.startSlaForTicket(tx, {
        tenantId: snap.tenantId,
        ticketId: snap.id,
        priority: snap.priority,
        unitId: snap.unitId,
        departmentId: snap.departmentId,
        categoryId: snap.categoryId,
        serviceId: snap.serviceId,
        now,
        correlationId,
      });

      if (dueAt) {
        await tx.ticket.update({
          where: { id: snap.id },
          data: { dueAt },
        });
      }

      await tx.ticketStatusHistory.create({
        data: {
          tenantId: snap.tenantId,
          ticketId: snap.id,
          actorId: auth.userId,
          fromStatus: null,
          toStatus: requiresApproval ? 'WAITING_APPROVAL' : snap.status,
          reason: 'Chamado aberto',
          changedAt: now,
        },
      });

      if (effectiveType === 'INCIDENT' || input.isMajorIncident) {
        await tx.incident.create({
          data: {
            tenantId: snap.tenantId,
            ticketId: snap.id,
            isMajorIncident: Boolean(input.isMajorIncident),
          },
        });
      }

      if (input.assetIds && input.assetIds.length > 0) {
        const validAssets = await tx.asset.findMany({
          where: { id: { in: input.assetIds }, tenantId: auth.organizationId, deletedAt: null },
          select: { id: true },
        });
        if (validAssets.length > 0) {
          await tx.ticketAsset.createMany({
            data: validAssets.map((a) => ({ ticketId: snap.id, assetId: a.id })),
            skipDuplicates: true,
          });
        }
      }

      const events = aggregate.pullDomainEvents();
      await tx.ticketEvent.createMany({
        data: events.map((ev) => ({
          tenantId: ev.tenantId,
          ticketId: ev.aggregateId,
          actorId: auth.userId,
          eventType: ev.eventType,
          eventVersion: ev.eventVersion,
          payload: ev.payload as Prisma.InputJsonValue,
          correlationId: ev.correlationId,
          causationId: ev.causationId,
          createdAt: ev.occurredAt,
        })),
      });

      await this.outbox.persistEvents(tx, events);

      await this.audit.record(
        {
          tenantId: snap.tenantId,
          actorId: auth.userId,
          action: 'TICKET_CREATED',
          resourceType: 'Ticket',
          resourceId: snap.id,
          afterState: {
            publicNumber: snap.publicNumber,
            priority: snap.priority,
            status: requiresApproval ? 'WAITING_APPROVAL' : snap.status,
          },
        },
        tx,
      );

      this.metrics.ticketsCreatedTotal.inc({
        tenant_id: snap.tenantId,
        priority: snap.priority,
      });

      return snap.id;
    });

    const detail = await this.getTicketDetail(auth, createdId);
    this.realtime.emitToTenant(auth.organizationId, SOCKET_EVENTS.TICKET_CREATED, {
      tenantId: auth.organizationId,
      ticketId: detail.id,
      publicNumber: detail.publicNumber,
      status: detail.status,
      priority: detail.priority,
      assigneeId: detail.assignee?.id ?? null,
      correlationId,
    });
    this.realtime.emitToTenant(auth.organizationId, SOCKET_EVENTS.DASHBOARD_REFRESH, {
      tenantId: auth.organizationId,
    });

    return detail;
  }

  async listTickets(
    auth: AuthContext,
    query: {
      page?: number;
      pageSize?: number;
      status?: string;
      statuses?: string;
      priority?: string;
      departmentId?: string;
      unitId?: string;
      assigneeId?: string;
      assignedTeamId?: string;
      slaState?: string;
      search?: string;
      fromDate?: string;
      toDate?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<PaginatedResponse<TicketSummaryDto>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where = this.buildListWhere(auth, query);

    const sortField = SAFE_SORT_FIELDS.has(query.sortBy ?? '')
      ? (query.sortBy as string)
      : 'createdAt';
    const sortDir = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [totalItems, rows] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        include: this.summaryInclude(),
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      data: rows.map((r) => this.mapSummary(r)),
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

  async exportCsv(
    auth: AuthContext,
    query: Parameters<TicketsService['listTickets']>[1],
  ): Promise<string> {
    const where = this.buildListWhere(auth, query);
    const rows = await this.prisma.ticket.findMany({
      where,
      include: this.summaryInclude(),
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const header = [
      'Ticket',
      'Título',
      'Solicitante',
      'Departamento',
      'Unidade',
      'Status',
      'Responsável',
      'Prioridade',
      'SLA',
      'Prazo',
      'Criado em',
    ].map(escapeCsvCell);

    const lines = rows.map((r) => {
      const dto = this.mapSummary(r);
      return [
        dto.publicNumber,
        dto.title,
        dto.requester.name,
        dto.department?.name ?? '',
        dto.unit?.name ?? '',
        dto.status,
        dto.assignee?.name ?? 'Não atribuído',
        dto.priority,
        dto.sla?.state ?? 'N/A',
        dto.dueAt ?? '',
        dto.createdAt,
      ]
        .map(escapeCsvCell)
        .join(',');
    });

    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'TICKETS_CSV_EXPORTED',
      resourceType: 'TicketExport',
      resourceId: auth.organizationId,
      afterState: { rowCount: rows.length },
    });

    return [header.join(','), ...lines].join('\n');
  }

  async getTicketDetail(auth: AuthContext, ticketId: string): Promise<TicketDetailDto> {
    const canReadAll = auth.permissions.includes('tickets:read_all');
    const canReadInternal = auth.permissions.includes('tickets:comment_internal');

    const row = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        tenantId: auth.organizationId,
        ...(canReadAll
          ? {}
          : {
              OR: [
                { requesterId: auth.userId },
                { participants: { some: { userId: auth.userId } } },
                { approvals: { some: { steps: { some: { approverId: auth.userId } } } } },
              ],
            }),
      },
      include: {
        ...this.summaryInclude(),
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        comments: {
          where: canReadInternal ? {} : { isInternal: false },
          include: { author: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          where: { deletedAt: null },
          include: { uploadedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        approvals: {
          include: {
            requestedBy: { select: { id: true, name: true } },
            steps: {
              include: { approver: { select: { id: true, name: true, email: true } } },
              orderBy: { stepOrder: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Ticket not found or access denied.');
    }

    const latestSla = row.slaInstances[0] ?? null;
    const summary = this.mapSummary(row);

    return {
      ...summary,
      descriptionHtml: row.descriptionHtml,
      subcategory: row.subcategory,
      resolutionSummary: row.resolutionSummary,
      cancellationReason: row.cancellationReason,
      priorityOverrideReason: row.priorityOverrideReason,
      csatComment: row.csatComment,
      customFields: (row.customFields as Record<string, unknown>) ?? {},
      participants: row.participants.map((p) => ({
        userId: p.userId,
        name: p.user.name,
        email: p.user.email,
        kind: p.kind,
      })),
      comments: row.comments.map((c) => ({
        id: c.id,
        ticketId: c.ticketId,
        author: c.author,
        bodyHtml: c.bodyHtml,
        isInternal: c.isInternal,
        createdAt: c.createdAt.toISOString(),
      })),
      attachments: row.attachments.map((a) => ({
        id: a.id,
        ticketId: a.ticketId,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        uploadedBy: a.uploadedBy,
        createdAt: a.createdAt.toISOString(),
      })),
      approvals: row.approvals.map((ap) => ({
        id: ap.id,
        ticketId: ap.ticketId,
        title: ap.title,
        status: ap.status,
        requestedBy: ap.requestedBy,
        steps: ap.steps.map((s) => ({
          id: s.id,
          stepOrder: s.stepOrder,
          approver: s.approver,
          status: s.status,
          decisionNote: s.decisionNote,
          decidedAt: s.decidedAt?.toISOString() ?? null,
        })),
        createdAt: ap.createdAt.toISOString(),
      })),
      slaClockEvents:
        latestSla?.clockEvents.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          occurredAt: e.occurredAt.toISOString(),
          reason: e.reason,
          elapsedBusinessMinutes: e.elapsedBusinessMinutes,
        })) ?? [],
    };
  }

  async getTimeline(
    auth: AuthContext,
    ticketId: string,
    cursor?: string,
    limit = 30,
  ): Promise<CursorPaginatedResponse<TicketTimelineEventDto>> {
    await this.getTicketDetail(auth, ticketId);

    const rows = await this.prisma.ticketEvent.findMany({
      where: {
        tenantId: auth.organizationId,
        ticketId,
      },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (slice[slice.length - 1]?.id ?? null) : null;

    return {
      data: slice.map((r) => ({
        id: r.id,
        ticketId: r.ticketId,
        eventType: r.eventType,
        actor: r.actor,
        payload: (r.payload as Record<string, unknown>) ?? {},
        correlationId: r.correlationId,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor,
      hasMore,
    };
  }

  async transitionStatus(
    auth: AuthContext,
    ticketId: string,
    input: {
      targetStatus: TicketStatus;
      version?: number;
      reason?: string;
      resolutionSummary?: string;
      cancellationReason?: string;
    },
  ): Promise<TicketDetailDto> {
    const correlationId = getRequestContext()?.correlationId ?? randomUUID();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.ticket.findFirst({
        where: { id: ticketId, tenantId: auth.organizationId },
      });
      if (!row) throw new NotFoundException('Ticket not found.');

      if (input.version !== undefined && row.version !== input.version) {
        throw new OptimisticConcurrencyError('Ticket', ticketId);
      }

      if (auth.roleCode === 'Requester') {
        const requesterAllowed =
          row.requesterId === auth.userId &&
          ((row.status === 'RESOLVED' &&
            (input.targetStatus === 'CLOSED' || input.targetStatus === 'REOPENED')) ||
            (row.status === 'CLOSED' && input.targetStatus === 'REOPENED') ||
            (row.status === 'NEW' && input.targetStatus === 'CANCELED'));
        if (!requesterAllowed) {
          throw new ForbiddenException('Requester cannot perform this status transition.');
        }
      }

      const aggregate = this.toAggregate(row);
      const previousStatus = aggregate.snapshot.status;

      aggregate.transitionTo({
        targetStatus: input.targetStatus,
        actorId: auth.userId,
        canReopenCanceled: auth.permissions.includes('tickets:reopen_canceled'),
        reason: input.reason,
        resolutionSummary: input.resolutionSummary,
        cancellationReason: input.cancellationReason,
        correlationId,
        now,
      });

      const snap = aggregate.snapshot;
      const dueAt = await this.sla.syncOnTicketStatusChange(tx, {
        tenantId: snap.tenantId,
        ticketId: snap.id,
        fromStatus: previousStatus,
        toStatus: snap.status,
        now,
        correlationId,
      });

      const updated = await tx.ticket.updateMany({
        where: { id: row.id, tenantId: auth.organizationId, version: row.version },
        data: {
          status: snap.status,
          resolutionSummary: snap.resolutionSummary,
          cancellationReason: snap.cancellationReason,
          resolvedAt: snap.resolvedAt,
          closedAt: snap.closedAt,
          canceledAt: snap.canceledAt,
          dueAt: dueAt ?? row.dueAt,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new OptimisticConcurrencyError('Ticket', ticketId);
      }

      await tx.ticketStatusHistory.create({
        data: {
          tenantId: snap.tenantId,
          ticketId: snap.id,
          actorId: auth.userId,
          fromStatus: previousStatus,
          toStatus: snap.status,
          reason: input.reason ?? input.cancellationReason ?? input.resolutionSummary ?? null,
          changedAt: now,
        },
      });

      const events = aggregate.pullDomainEvents();
      await tx.ticketEvent.createMany({
        data: events.map((ev) => ({
          tenantId: ev.tenantId,
          ticketId: ev.aggregateId,
          actorId: auth.userId,
          eventType: ev.eventType,
          eventVersion: ev.eventVersion,
          payload: ev.payload as Prisma.InputJsonValue,
          correlationId: ev.correlationId,
          causationId: ev.causationId,
          createdAt: ev.occurredAt,
        })),
      });

      await this.outbox.persistEvents(tx, events);

      await this.audit.record(
        {
          tenantId: snap.tenantId,
          actorId: auth.userId,
          action: 'TICKET_STATUS_CHANGED',
          resourceType: 'Ticket',
          resourceId: snap.id,
          beforeState: { status: previousStatus },
          afterState: {
            status: snap.status,
            pausedSla: SLA_PAUSE_STATUSES.has(snap.status),
          },
        },
        tx,
      );
    });

    const detail = await this.getTicketDetail(auth, ticketId);
    this.broadcastTicketUpdate(detail, correlationId);
    return detail;
  }

  async assignTicket(
    auth: AuthContext,
    ticketId: string,
    input: {
      assigneeId?: string | null;
      teamId?: string | null;
      version?: number;
    },
  ): Promise<TicketDetailDto> {
    const correlationId = getRequestContext()?.correlationId ?? randomUUID();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.ticket.findFirst({
        where: { id: ticketId, tenantId: auth.organizationId },
      });
      if (!row) throw new NotFoundException('Ticket not found.');

      if (input.version !== undefined && row.version !== input.version) {
        throw new OptimisticConcurrencyError('Ticket', ticketId);
      }

      let assigneeTenantId: string | null = null;
      if (input.assigneeId) {
        const membership = await tx.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: auth.organizationId,
              userId: input.assigneeId,
            },
          },
        });
        assigneeTenantId = membership?.isActive ? membership.organizationId : null;
      }

      let teamTenantId: string | null = null;
      if (input.teamId) {
        const team = await tx.team.findUnique({ where: { id: input.teamId } });
        teamTenantId = team?.tenantId ?? null;
      }

      const aggregate = this.toAggregate(row);
      const prevAssignee = row.assigneeId;
      const prevTeam = row.assignedTeamId;

      aggregate.assign({
        assigneeId: input.assigneeId === undefined ? row.assigneeId : input.assigneeId,
        assigneeTenantId:
          input.assigneeId === undefined
            ? row.assigneeId
              ? auth.organizationId
              : null
            : assigneeTenantId,
        teamId: input.teamId === undefined ? row.assignedTeamId : input.teamId,
        teamTenantId:
          input.teamId === undefined
            ? row.assignedTeamId
              ? auth.organizationId
              : null
            : teamTenantId,
        actorId: auth.userId,
        correlationId,
        now,
      });

      const snap = aggregate.snapshot;
      const updated = await tx.ticket.updateMany({
        where: { id: row.id, tenantId: auth.organizationId, version: row.version },
        data: {
          assigneeId: snap.assigneeId,
          assignedTeamId: snap.assignedTeamId,
          status: snap.status,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new OptimisticConcurrencyError('Ticket', ticketId);
      }

      await tx.ticketAssignment.create({
        data: {
          tenantId: snap.tenantId,
          ticketId: snap.id,
          actorId: auth.userId,
          previousAssigneeId: prevAssignee,
          newAssigneeId: snap.assigneeId,
          previousTeamId: prevTeam,
          newTeamId: snap.assignedTeamId,
          assignedAt: now,
        },
      });

      const events = aggregate.pullDomainEvents();
      await tx.ticketEvent.createMany({
        data: events.map((ev) => ({
          tenantId: ev.tenantId,
          ticketId: ev.aggregateId,
          actorId: auth.userId,
          eventType: ev.eventType,
          eventVersion: ev.eventVersion,
          payload: ev.payload as Prisma.InputJsonValue,
          correlationId: ev.correlationId,
          createdAt: ev.occurredAt,
        })),
      });

      await this.outbox.persistEvents(tx, events);

      await this.audit.record(
        {
          tenantId: snap.tenantId,
          actorId: auth.userId,
          action: 'TICKET_ASSIGNED',
          resourceType: 'Ticket',
          resourceId: snap.id,
          beforeState: { assigneeId: prevAssignee, teamId: prevTeam },
          afterState: { assigneeId: snap.assigneeId, teamId: snap.assignedTeamId },
        },
        tx,
      );
    });

    const detail = await this.getTicketDetail(auth, ticketId);
    this.broadcastTicketUpdate(detail, correlationId);
    return detail;
  }

  async overridePriority(
    auth: AuthContext,
    ticketId: string,
    input: { priority: PriorityLevel; reason: string; version?: number },
  ): Promise<TicketDetailDto> {
    const correlationId = getRequestContext()?.correlationId ?? randomUUID();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.ticket.findFirst({
        where: { id: ticketId, tenantId: auth.organizationId },
      });
      if (!row) throw new NotFoundException('Ticket not found.');
      if (input.version !== undefined && row.version !== input.version) {
        throw new OptimisticConcurrencyError('Ticket', ticketId);
      }

      const aggregate = this.toAggregate(row);
      const prevPriority = row.priority;

      aggregate.overridePriority({
        priority: input.priority,
        reason: input.reason,
        actorId: auth.userId,
        canOverride: auth.permissions.includes('tickets:override_priority'),
        correlationId,
        now,
      });

      const snap = aggregate.snapshot;
      const dueAt = await this.sla.syncOnPriorityChange(tx, {
        tenantId: snap.tenantId,
        ticketId: snap.id,
        newPriority: snap.priority,
        now,
        correlationId,
      });

      const updated = await tx.ticket.updateMany({
        where: { id: row.id, tenantId: auth.organizationId, version: row.version },
        data: {
          priority: snap.priority,
          priorityOverridden: true,
          priorityOverrideReason: snap.priorityOverrideReason,
          dueAt: dueAt ?? row.dueAt,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new OptimisticConcurrencyError('Ticket', ticketId);
      }

      const events = aggregate.pullDomainEvents();
      await tx.ticketEvent.createMany({
        data: events.map((ev) => ({
          tenantId: ev.tenantId,
          ticketId: ev.aggregateId,
          actorId: auth.userId,
          eventType: ev.eventType,
          eventVersion: ev.eventVersion,
          payload: ev.payload as Prisma.InputJsonValue,
          correlationId: ev.correlationId,
          createdAt: ev.occurredAt,
        })),
      });
      await this.outbox.persistEvents(tx, events);

      await this.audit.record(
        {
          tenantId: snap.tenantId,
          actorId: auth.userId,
          action: 'TICKET_PRIORITY_OVERRIDDEN',
          resourceType: 'Ticket',
          resourceId: snap.id,
          beforeState: { priority: prevPriority },
          afterState: { priority: snap.priority, reason: snap.priorityOverrideReason },
        },
        tx,
      );
    });

    const detail = await this.getTicketDetail(auth, ticketId);
    this.broadcastTicketUpdate(detail, correlationId);
    return detail;
  }

  async addComment(
    auth: AuthContext,
    ticketId: string,
    input: { body: string; isInternal: boolean },
  ) {
    if (input.isInternal && !auth.permissions.includes('tickets:comment_internal')) {
      throw new ForbiddenException('Missing permission to post internal notes.');
    }

    const detailCheck = await this.getTicketDetail(auth, ticketId);
    const correlationId = getRequestContext()?.correlationId ?? randomUUID();
    const now = new Date();
    const { html, text } = sanitizeRichText(input.body);
    if (text.length < 1) {
      throw new BadRequestException('Comment body cannot be empty.');
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          tenantId: auth.organizationId,
          ticketId,
          authorId: auth.userId,
          bodyHtml: html,
          bodyText: text,
          isInternal: input.isInternal,
        },
        include: { author: { select: { id: true, name: true, email: true } } },
      });

      const isAgentPublicReply = !input.isInternal && auth.userId !== detailCheck.requester.id;
      if (isAgentPublicReply && !detailCheck.firstResponseAt) {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { firstResponseAt: now },
        });
        await this.sla.markFirstResponseMet(tx, auth.organizationId, ticketId, now);
      }

      await tx.ticketEvent.create({
        data: {
          tenantId: auth.organizationId,
          ticketId,
          actorId: auth.userId,
          eventType: input.isInternal ? 'InternalNoteAdded' : 'PublicCommentAdded',
          eventVersion: 1,
          payload: { commentId: created.id, isInternal: input.isInternal },
          correlationId,
          createdAt: now,
        },
      });

      await this.outbox.persistEvents(tx, [
        {
          eventId: randomUUID(),
          eventType: 'CommentAdded',
          eventVersion: 1,
          aggregateType: 'Ticket',
          aggregateId: ticketId,
          tenantId: auth.organizationId,
          occurredAt: now,
          correlationId,
          causationId: null,
          payload: {
            ticketId,
            commentId: created.id,
            authorId: auth.userId,
            isInternal: input.isInternal,
          },
        },
      ]);

      return created;
    });

    this.realtime.emitToTicket(ticketId, SOCKET_EVENTS.TICKET_COMMENT_ADDED, {
      ticketId,
      commentId: comment.id,
      isInternal: comment.isInternal,
    });

    return {
      id: comment.id,
      ticketId: comment.ticketId,
      author: comment.author,
      bodyHtml: comment.bodyHtml,
      isInternal: comment.isInternal,
      createdAt: comment.createdAt.toISOString(),
    };
  }

  async rateSatisfaction(
    auth: AuthContext,
    ticketId: string,
    input: { score: number; comment?: string },
  ) {
    const row = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId: auth.organizationId },
    });
    if (!row) throw new NotFoundException('Ticket not found.');

    const aggregate = this.toAggregate(row);
    aggregate.rateSatisfaction(input.score, input.comment ?? null, auth.userId);

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        csatScore: aggregate.snapshot.csatScore,
        csatComment: aggregate.snapshot.csatComment,
      },
    });

    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'TICKET_CSAT_SUBMITTED',
      resourceType: 'Ticket',
      resourceId: ticketId,
      afterState: { score: input.score },
    });

    return { ticketId: updated.id, csatScore: updated.csatScore, csatComment: updated.csatComment };
  }

  async uploadAttachment(
    auth: AuthContext,
    ticketId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    await this.getTicketDetail(auth, ticketId);

    if (file.size > ATTACHMENT_POLICY.MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Attachment exceeds 10 MB size limit.');
    }
    const ext = extname(file.originalname).toLowerCase();
    if (
      !ATTACHMENT_POLICY.ALLOWED_EXTENSIONS.includes(
        ext as (typeof ATTACHMENT_POLICY.ALLOWED_EXTENSIONS)[number],
      ) ||
      !ATTACHMENT_POLICY.ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof ATTACHMENT_POLICY.ALLOWED_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException('File extension or MIME type is not allowed.');
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `${auth.organizationId}/${ticketId}/${randomUUID()}${ext}`;
    await this.storage.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimetype,
    });

    const attachment = await this.prisma.ticketAttachment.create({
      data: {
        tenantId: auth.organizationId,
        ticketId,
        uploadedById: auth.userId,
        fileName: file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        sha256,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'TICKET_ATTACHMENT_UPLOADED',
      resourceType: 'TicketAttachment',
      resourceId: attachment.id,
      afterState: { fileName: attachment.fileName, sizeBytes: attachment.sizeBytes },
    });

    return attachment;
  }

  async getAttachmentDownload(auth: AuthContext, ticketId: string, attachmentId: string) {
    await this.getTicketDetail(auth, ticketId);
    const attachment = await this.prisma.ticketAttachment.findFirst({
      where: {
        id: attachmentId,
        ticketId,
        tenantId: auth.organizationId,
        deletedAt: null,
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    if (this.storage.shouldRedirectSignedUrl()) {
      const signedUrl = await this.storage.getSignedDownloadUrl({
        key: attachment.storageKey,
        fileName: attachment.fileName,
        expiresInSeconds: 300,
      });
      return { mode: 'redirect' as const, signedUrl, attachment };
    }

    const stream = await this.storage.readStream(attachment.storageKey);
    if (!stream) throw new NotFoundException('Stored file payload missing.');
    return { mode: 'stream' as const, stream, attachment };
  }

  async bulkAction(
    auth: AuthContext,
    input: {
      ticketIds: string[];
      assigneeId?: string | null;
      status?: TicketStatus;
      reason?: string;
    },
  ) {
    const results: Array<{ ticketId: string; ok: boolean; error?: string }> = [];
    for (const ticketId of input.ticketIds) {
      try {
        if (input.assigneeId !== undefined) {
          await this.assignTicket(auth, ticketId, { assigneeId: input.assigneeId });
        }
        if (input.status) {
          await this.transitionStatus(auth, ticketId, {
            targetStatus: input.status,
            reason: input.reason ?? 'Atualização em massa via console operacional',
          });
        }
        results.push({ ticketId, ok: true });
      } catch (err) {
        results.push({
          ticketId,
          ok: false,
          error: err instanceof Error ? err.message : 'Failed',
        });
      }
    }
    return { processed: results.length, results };
  }

  async deleteTicket(auth: AuthContext, ticketId: string): Promise<{ deleted: true; id: string }> {
    const row = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId: auth.organizationId },
      select: {
        id: true,
        tenantId: true,
        publicNumber: true,
        title: true,
        status: true,
        priority: true,
        requesterId: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Ticket not found.');
    }

    const canReadAll = auth.permissions.includes('tickets:read_all');
    if (!canReadAll && row.requesterId !== auth.userId) {
      throw new ForbiddenException('Access denied.');
    }

    await this.prisma.ticket.delete({ where: { id: ticketId } });

    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'TICKET_DELETED',
      resourceType: 'Ticket',
      resourceId: ticketId,
      beforeState: {
        publicNumber: row.publicNumber,
        title: row.title,
        status: row.status,
        priority: row.priority,
      },
    });

    this.realtime.emitToTenant(auth.organizationId, SOCKET_EVENTS.DASHBOARD_REFRESH, {
      tenantId: auth.organizationId,
    });

    return { deleted: true, id: ticketId };
  }

  async bulkDelete(
    auth: AuthContext,
    input: { ticketIds: string[]; reason?: string },
  ) {
    const results: Array<{ ticketId: string; ok: boolean; error?: string }> = [];
    for (const ticketId of input.ticketIds) {
      try {
        await this.deleteTicket(auth, ticketId);
        results.push({ ticketId, ok: true });
      } catch (err) {
        results.push({
          ticketId,
          ok: false,
          error: err instanceof Error ? err.message : 'Failed',
        });
      }
    }
    const deletedCount = results.filter((r) => r.ok).length;
    return { processed: results.length, deletedCount, results };
  }

  listSavedViews(auth: AuthContext) {
    return this.prisma.savedTicketView.findMany({
      where: {
        tenantId: auth.organizationId,
        OR: [{ userId: auth.userId }, { isShared: true }],
      },
      orderBy: { name: 'asc' },
    });
  }

  createSavedView(
    auth: AuthContext,
    input: { name: string; filters: Record<string, unknown>; isShared?: boolean },
  ) {
    return this.prisma.savedTicketView.create({
      data: {
        tenantId: auth.organizationId,
        userId: auth.userId,
        name: input.name.trim(),
        filtersJson: input.filters as Prisma.InputJsonValue,
        isShared: Boolean(input.isShared),
      },
    });
  }

  private broadcastTicketUpdate(detail: TicketDetailDto, correlationId: string): void {
    this.realtime.emitToTenant(detail.tenantId, SOCKET_EVENTS.TICKET_UPDATED, {
      tenantId: detail.tenantId,
      ticketId: detail.id,
      publicNumber: detail.publicNumber,
      status: detail.status,
      priority: detail.priority,
      assigneeId: detail.assignee?.id ?? null,
      correlationId,
    });
    this.realtime.emitToTicket(detail.id, SOCKET_EVENTS.TICKET_UPDATED, detail);
    this.realtime.emitToTenant(detail.tenantId, SOCKET_EVENTS.DASHBOARD_REFRESH, {
      tenantId: detail.tenantId,
    });
  }

  private buildListWhere(
    auth: AuthContext,
    query: Parameters<TicketsService['listTickets']>[1],
  ): Prisma.TicketWhereInput {
    const canReadAll = auth.permissions.includes('tickets:read_all');
    const statusList = query.statuses
      ? (query.statuses.split(',').filter(Boolean) as TicketStatus[])
      : undefined;

    return {
      tenantId: auth.organizationId,
      ...(canReadAll ? {} : { requesterId: auth.userId }),
      ...(query.status ? { status: query.status as TicketStatus } : {}),
      ...(statusList && statusList.length > 0 ? { status: { in: statusList } } : {}),
      ...(query.priority ? { priority: query.priority as PriorityLevel } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.assignedTeamId ? { assignedTeamId: query.assignedTeamId } : {}),
      ...(query.slaState
        ? {
            slaInstances: {
              some: { state: query.slaState as Prisma.EnumSlaInstanceStateFilter['equals'] },
            },
          }
        : {}),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { publicNumber: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              { descriptionText: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private summaryInclude() {
    return {
      requester: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
      unit: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true } },
      assignedTeam: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      service: { select: { id: true, name: true } },
      slaInstances: {
        include: {
          policy: {
            include: { targets: true },
          },
          clockEvents: { orderBy: { occurredAt: 'desc' as const }, take: 20 },
        },
        orderBy: { startedAt: 'desc' as const },
        take: 1,
      },
    };
  }

  private mapSummary(
    row: Prisma.TicketGetPayload<{ include: ReturnType<TicketsService['summaryInclude']> }>,
  ): TicketSummaryDto {
    const sla = row.slaInstances[0];
    const target = sla?.policy.targets.find((t) => t.priority === sla.priority);
    const consumedPercent =
      sla && target && target.resolutionMinutes > 0
        ? Math.min(100, Math.round((sla.elapsedBusinessMin / target.resolutionMinutes) * 100))
        : 0;

    return {
      id: row.id,
      tenantId: row.tenantId,
      publicNumber: row.publicNumber,
      title: row.title,
      type: row.type,
      channel: row.channel,
      status: row.status,
      impact: row.impact,
      urgency: row.urgency,
      priority: row.priority,
      priorityOverridden: row.priorityOverridden,
      tags: row.tags,
      requester: row.requester,
      assignee: row.assignee,
      unit: row.unit,
      department: row.department,
      team: row.assignedTeam,
      category: row.category,
      service: row.service,
      sla: sla
        ? {
            state: sla.state,
            policyName: sla.policy.name,
            firstResponseDueAt: sla.firstResponseDueAt.toISOString(),
            firstResponseMetAt: sla.firstResponseMetAt?.toISOString() ?? null,
            resolutionDueAt: sla.resolutionDueAt.toISOString(),
            resolutionMetAt: sla.resolutionMetAt?.toISOString() ?? null,
            pausedAt: sla.pausedAt?.toISOString() ?? null,
            consumedPercent,
            warningTriggered: Boolean(sla.warningTriggeredAt),
            breached: Boolean(sla.breachedAt),
          }
        : null,
      dueAt: row.dueAt?.toISOString() ?? null,
      firstResponseAt: row.firstResponseAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      csatScore: row.csatScore,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toAggregate(row: {
    id: string;
    tenantId: string;
    publicNumber: string;
    title: string;
    descriptionHtml: string;
    descriptionText: string;
    type: TicketType;
    channel: TicketChannel;
    status: TicketStatus;
    impact: ImpactLevel;
    urgency: UrgencyLevel;
    priority: PriorityLevel;
    priorityOverridden: boolean;
    priorityOverrideReason: string | null;
    requesterId: string;
    unitId: string | null;
    departmentId: string | null;
    assignedTeamId: string | null;
    assigneeId: string | null;
    categoryId: string | null;
    serviceId: string | null;
    subcategory: string | null;
    tags: string[];
    customFields: Prisma.JsonValue;
    resolutionSummary: string | null;
    cancellationReason: string | null;
    csatScore: number | null;
    csatComment: string | null;
    firstResponseAt: Date | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
    canceledAt: Date | null;
    dueAt: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): TicketAggregate {
    return TicketAggregate.reconstitute({
      ...row,
      customFields: (row.customFields as Record<string, unknown>) ?? {},
    });
  }
}

