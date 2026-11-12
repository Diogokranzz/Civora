import { randomUUID } from 'node:crypto';
import {
  calculatePriorityFromMatrix,
  TICKET_ALLOWED_TRANSITIONS,
} from '@civora/config';
import type {
  ImpactLevel,
  PriorityLevel,
  TicketChannel,
  TicketStatus,
  TicketType,
  UrgencyLevel,
} from '@civora/types';
import { AggregateRoot, type DomainEvent } from '../../../shared/domain/aggregate-root';
import {
  InvalidStateTransitionError,
  TenantIsolationError,
  UnauthorizedDomainActionError,
  ValidationDomainError,
} from '../../../shared/domain/domain-errors';

export interface TicketProps {
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
  customFields: Record<string, unknown>;
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
}

export interface CreateTicketDomainInput {
  id: string;
  tenantId: string;
  publicNumber: string;
  title: string;
  descriptionHtml: string;
  descriptionText: string;
  type: TicketType;
  channel: TicketChannel;
  impact: ImpactLevel;
  urgency: UrgencyLevel;
  requesterId: string;
  unitId?: string | null;
  departmentId?: string | null;
  assignedTeamId?: string | null;
  categoryId?: string | null;
  serviceId?: string | null;
  subcategory?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  correlationId: string;
  now?: Date;
}

export class TicketAggregate extends AggregateRoot {
  private props: TicketProps;

  private constructor(props: TicketProps) {
    super(props.id, props.version);
    this.props = { ...props };
  }

  static reconstitute(props: TicketProps): TicketAggregate {
    return new TicketAggregate(props);
  }

  static create(input: CreateTicketDomainInput): TicketAggregate {
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length < 3) {
      throw new ValidationDomainError('Ticket title must contain at least 3 characters.');
    }
    if (input.descriptionText.trim().length < 3) {
      throw new ValidationDomainError('Ticket description must contain at least 3 characters.');
    }

    const now = input.now ?? new Date();
    const priority = calculatePriorityFromMatrix(input.impact, input.urgency);

    const ticket = new TicketAggregate({
      id: input.id,
      tenantId: input.tenantId,
      publicNumber: input.publicNumber,
      title: trimmedTitle,
      descriptionHtml: input.descriptionHtml,
      descriptionText: input.descriptionText.trim(),
      type: input.type,
      channel: input.channel,
      status: 'NEW',
      impact: input.impact,
      urgency: input.urgency,
      priority,
      priorityOverridden: false,
      priorityOverrideReason: null,
      requesterId: input.requesterId,
      unitId: input.unitId ?? null,
      departmentId: input.departmentId ?? null,
      assignedTeamId: input.assignedTeamId ?? null,
      assigneeId: null,
      categoryId: input.categoryId ?? null,
      serviceId: input.serviceId ?? null,
      subcategory: input.subcategory ?? null,
      tags: Array.from(new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean))),
      customFields: input.customFields ?? {},
      resolutionSummary: null,
      cancellationReason: null,
      csatScore: null,
      csatComment: null,
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      canceledAt: null,
      dueAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    ticket.emit(
      'TicketCreated',
      {
        publicNumber: ticket.props.publicNumber,
        title: ticket.props.title,
        type: ticket.props.type,
        status: ticket.props.status,
        priority: ticket.props.priority,
        impact: ticket.props.impact,
        urgency: ticket.props.urgency,
        requesterId: ticket.props.requesterId,
        unitId: ticket.props.unitId,
        departmentId: ticket.props.departmentId,
        categoryId: ticket.props.categoryId,
        serviceId: ticket.props.serviceId,
      },
      input.correlationId,
      null,
      now,
    );

    return ticket;
  }

  get snapshot(): Readonly<TicketProps> {
    return { ...this.props };
  }

  transitionTo(params: {
    targetStatus: TicketStatus;
    actorId: string;
    canReopenCanceled: boolean;
    reason?: string;
    resolutionSummary?: string;
    cancellationReason?: string;
    correlationId: string;
    causationId?: string | null;
    now?: Date;
  }): void {
    const { targetStatus } = params;
    const current = this.props.status;
    const now = params.now ?? new Date();

    if (current === targetStatus) {
      throw new InvalidStateTransitionError(current, targetStatus, 'Ticket is already in this status.');
    }

    const allowed = TICKET_ALLOWED_TRANSITIONS[current];
    if (!allowed.includes(targetStatus)) {
      throw new InvalidStateTransitionError(current, targetStatus);
    }

    if (current === 'CANCELED' && targetStatus === 'REOPENED' && !params.canReopenCanceled) {
      throw new UnauthorizedDomainActionError(
        'Reopening a canceled ticket requires tickets:reopen_canceled permission.',
      );
    }

    if (targetStatus === 'RESOLVED') {
      const resolution = (params.resolutionSummary ?? this.props.resolutionSummary ?? '').trim();
      if (resolution.length < 5) {
        throw new InvalidStateTransitionError(
          current,
          targetStatus,
          'A resolution summary (minimum 5 characters) is required to resolve a ticket.',
        );
      }
      this.props.resolutionSummary = resolution;
      this.props.resolvedAt = now;
    }

    if (targetStatus === 'CLOSED') {
      const resolution = (params.resolutionSummary ?? this.props.resolutionSummary ?? '').trim();
      if (resolution.length < 5) {
        throw new InvalidStateTransitionError(
          current,
          targetStatus,
          'Cannot close a ticket without a documented resolution.',
        );
      }
      this.props.resolutionSummary = resolution;
      this.props.closedAt = now;
    }

    if (targetStatus === 'CANCELED') {
      const cancelReason = (params.cancellationReason ?? params.reason ?? '').trim();
      if (cancelReason.length < 5) {
        throw new InvalidStateTransitionError(
          current,
          targetStatus,
          'A cancellation reason (minimum 5 characters) is required.',
        );
      }
      this.props.cancellationReason = cancelReason;
      this.props.canceledAt = now;
    }

    if (targetStatus === 'REOPENED') {
      this.props.closedAt = null;
      this.props.resolvedAt = null;
    }

    const previousStatus = current;
    this.props.status = targetStatus;
    this.props.updatedAt = now;

    this.emit(
      'TicketStatusChanged',
      {
        fromStatus: previousStatus,
        toStatus: targetStatus,
        actorId: params.actorId,
        reason: params.reason ?? params.cancellationReason ?? params.resolutionSummary ?? null,
      },
      params.correlationId,
      params.causationId ?? null,
      now,
    );

    if (targetStatus === 'RESOLVED') {
      this.emit(
        'TicketResolved',
        {
          actorId: params.actorId,
          resolutionSummary: this.props.resolutionSummary,
          resolvedAt: now.toISOString(),
        },
        params.correlationId,
        null,
        now,
      );
    } else if (targetStatus === 'CLOSED') {
      this.emit(
        'TicketClosed',
        {
          actorId: params.actorId,
          closedAt: now.toISOString(),
        },
        params.correlationId,
        null,
        now,
      );
    } else if (targetStatus === 'REOPENED') {
      this.emit(
        'TicketReopened',
        {
          actorId: params.actorId,
          previousStatus,
          reason: params.reason ?? null,
        },
        params.correlationId,
        null,
        now,
      );
    }
  }

  assign(params: {
    assigneeId: string | null;
    assigneeTenantId: string | null;
    teamId: string | null;
    teamTenantId: string | null;
    actorId: string;
    correlationId: string;
    now?: Date;
  }): void {
    if (params.assigneeId && params.assigneeTenantId !== this.props.tenantId) {
      throw new TenantIsolationError('Cannot assign a ticket to an agent outside the organization.');
    }
    if (params.teamId && params.teamTenantId !== this.props.tenantId) {
      throw new TenantIsolationError('Cannot assign a ticket to a team outside the organization.');
    }

    const now = params.now ?? new Date();
    const prevAssignee = this.props.assigneeId;
    const prevTeam = this.props.assignedTeamId;

    this.props.assigneeId = params.assigneeId;
    this.props.assignedTeamId = params.teamId;
    if (this.props.status === 'NEW' && (params.assigneeId || params.teamId)) {
      this.props.status = 'OPEN';
    }
    this.props.updatedAt = now;

    this.emit(
      'TicketAssigned',
      {
        previousAssigneeId: prevAssignee,
        newAssigneeId: params.assigneeId,
        previousTeamId: prevTeam,
        newTeamId: params.teamId,
        actorId: params.actorId,
      },
      params.correlationId,
      null,
      now,
    );
  }

  overridePriority(params: {
    priority: PriorityLevel;
    reason: string;
    actorId: string;
    canOverride: boolean;
    correlationId: string;
    now?: Date;
  }): void {
    if (!params.canOverride) {
      throw new UnauthorizedDomainActionError(
        'Manual priority override requires tickets:override_priority permission.',
      );
    }
    const reason = params.reason.trim();
    if (reason.length < 5) {
      throw new ValidationDomainError(
        'An auditable justification (minimum 5 characters) is required to override priority.',
      );
    }

    const now = params.now ?? new Date();
    const previousPriority = this.props.priority;
    this.props.priority = params.priority;
    this.props.priorityOverridden = true;
    this.props.priorityOverrideReason = reason;
    this.props.updatedAt = now;

    this.emit(
      'TicketPriorityChanged',
      {
        previousPriority,
        newPriority: params.priority,
        reason,
        overridden: true,
        actorId: params.actorId,
      },
      params.correlationId,
      null,
      now,
    );
  }

  recordFirstResponse(at: Date): boolean {
    if (this.props.firstResponseAt) {
      return false;
    }
    this.props.firstResponseAt = at;
    this.props.updatedAt = at;
    return true;
  }

  rateSatisfaction(score: number, comment: string | null, actorId: string, now = new Date()): void {
    if (actorId !== this.props.requesterId) {
      throw new UnauthorizedDomainActionError('Only the ticket requester can submit CSAT evaluation.');
    }
    if (this.props.status !== 'RESOLVED' && this.props.status !== 'CLOSED') {
      throw new ValidationDomainError('Satisfaction can only be rated on resolved or closed tickets.');
    }
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new ValidationDomainError('CSAT score must be an integer between 1 and 5.');
    }
    this.props.csatScore = score;
    this.props.csatComment = comment?.trim() || null;
    this.props.updatedAt = now;
  }

  private emit(
    eventType: string,
    payload: Record<string, unknown>,
    correlationId: string,
    causationId: string | null,
    occurredAt: Date,
  ): void {
    const event: DomainEvent = {
      eventId: randomUUID(),
      eventType,
      eventVersion: 1,
      aggregateType: 'Ticket',
      aggregateId: this.props.id,
      tenantId: this.props.tenantId,
      occurredAt,
      correlationId,
      causationId,
      payload,
    };
    this.addDomainEvent(event);
  }
}

