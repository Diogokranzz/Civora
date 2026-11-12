import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SLA_PAUSE_STATUSES } from '@civora/config';
import type { PriorityLevel, TicketStatus } from '@civora/types';
import type { Prisma } from '@prisma/client';
import { OutboxService } from '../../shared/infrastructure/outbox.service';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import type { BusinessCalendarConfig } from './domain/sla-clock';
import { SlaInstanceAggregate, type SlaTargetConfig } from './domain/sla-instance.entity';

@Injectable()
export class SlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async startSlaForTicket(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      ticketId: string;
      priority: PriorityLevel;
      unitId: string | null;
      departmentId: string | null;
      categoryId: string | null;
      serviceId: string | null;
      now: Date;
      correlationId: string;
    },
  ): Promise<Date | null> {
    const policy = await this.findMatchingPolicy(tx, params);
    if (!policy) return null;

    const targetRow = policy.targets.find((t) => t.priority === params.priority);
    if (!targetRow) return null;

    const calendarConfig: BusinessCalendarConfig = {
      timezone: policy.calendar.timezone,
      shifts: policy.calendar.businessHours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
      })),
      holidayDates: policy.calendar.holidays.map((h) => h.date.toISOString().slice(0, 10)),
    };

    const targetConfig: SlaTargetConfig = {
      firstResponseMinutes: targetRow.firstResponseMinutes,
      updateMinutes: targetRow.updateMinutes,
      resolutionMinutes: targetRow.resolutionMinutes,
      warningThresholdPct: targetRow.warningThresholdPct,
      escalationThresholdPct: targetRow.escalationThresholdPct,
    };

    const instance = SlaInstanceAggregate.start({
      id: randomUUID(),
      tenantId: params.tenantId,
      ticketId: params.ticketId,
      policyId: policy.id,
      priority: params.priority,
      target: targetConfig,
      calendar: calendarConfig,
      startedAt: params.now,
      correlationId: params.correlationId,
    });

    const snap = instance.snapshot;
    await tx.slaInstance.create({
      data: {
        id: snap.id,
        tenantId: snap.tenantId,
        ticketId: snap.ticketId,
        policyId: snap.policyId,
        priority: snap.priority,
        state: snap.state,
        startedAt: snap.startedAt,
        firstResponseDueAt: snap.firstResponseDueAt,
        nextUpdateDueAt: snap.nextUpdateDueAt,
        resolutionDueAt: snap.resolutionDueAt,
        clockEvents: {
          create: instance.clockLogs,
        },
      },
    });

    await this.outbox.persistEvents(tx, instance.pullDomainEvents());
    return snap.resolutionDueAt;
  }

  async syncOnTicketStatusChange(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      ticketId: string;
      fromStatus: TicketStatus;
      toStatus: TicketStatus;
      now: Date;
      correlationId: string;
    },
  ): Promise<Date | null> {
    const row = await tx.slaInstance.findFirst({
      where: { tenantId: params.tenantId, ticketId: params.ticketId },
      include: {
        policy: {
          include: {
            targets: true,
            calendar: { include: { businessHours: true, holidays: true } },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (!row) return null;

    const targetRow = row.policy.targets.find((t) => t.priority === row.priority);
    if (!targetRow) return row.resolutionDueAt;

    const calendar: BusinessCalendarConfig = {
      timezone: row.policy.calendar.timezone,
      shifts: row.policy.calendar.businessHours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
      })),
      holidayDates: row.policy.calendar.holidays.map((h) => h.date.toISOString().slice(0, 10)),
    };

    const target: SlaTargetConfig = {
      firstResponseMinutes: targetRow.firstResponseMinutes,
      updateMinutes: targetRow.updateMinutes,
      resolutionMinutes: targetRow.resolutionMinutes,
      warningThresholdPct: targetRow.warningThresholdPct,
      escalationThresholdPct: targetRow.escalationThresholdPct,
    };

    const aggregate = SlaInstanceAggregate.reconstitute({
      id: row.id,
      tenantId: row.tenantId,
      ticketId: row.ticketId,
      policyId: row.policyId,
      priority: row.priority,
      state: row.state,
      startedAt: row.startedAt,
      pausedAt: row.pausedAt,
      accumulatedPauseMs: row.accumulatedPauseMs,
      elapsedBusinessMin: row.elapsedBusinessMin,
      firstResponseDueAt: row.firstResponseDueAt,
      firstResponseMetAt: row.firstResponseMetAt,
      nextUpdateDueAt: row.nextUpdateDueAt,
      resolutionDueAt: row.resolutionDueAt,
      resolutionMetAt: row.resolutionMetAt,
      warningTriggeredAt: row.warningTriggeredAt,
      escalationTriggeredAt: row.escalationTriggeredAt,
      breachedAt: row.breachedAt,
      version: row.version,
    });

    const enteringPause = SLA_PAUSE_STATUSES.has(params.toStatus);
    const leavingPause = SLA_PAUSE_STATUSES.has(params.fromStatus) && !enteringPause;

    if (enteringPause) {
      aggregate.pause(params.now, `Status alterado para ${params.toStatus}`, params.correlationId);
    } else if (leavingPause) {
      aggregate.resume(
        params.now,
        `Status retomado para ${params.toStatus}`,
        target,
        calendar,
        params.correlationId,
      );
    }

    if (params.toStatus === 'RESOLVED' || params.toStatus === 'CLOSED') {
      aggregate.markResolved(params.now);
    } else if (params.toStatus === 'REOPENED') {
      aggregate.reopen(params.now, target, calendar, params.correlationId);
    }

    const snap = aggregate.snapshot;
    await tx.slaInstance.update({
      where: { id: row.id },
      data: {
        state: snap.state,
        pausedAt: snap.pausedAt,
        accumulatedPauseMs: snap.accumulatedPauseMs,
        elapsedBusinessMin: snap.elapsedBusinessMin,
        firstResponseDueAt: snap.firstResponseDueAt,
        resolutionDueAt: snap.resolutionDueAt,
        nextUpdateDueAt: snap.nextUpdateDueAt,
        resolutionMetAt: snap.resolutionMetAt,
        version: { increment: 1 },
      },
    });

    if (aggregate.clockLogs.length > 0) {
      await tx.slaClockEvent.createMany({
        data: aggregate.clockLogs.map((c) => ({
          slaInstanceId: row.id,
          eventType: c.eventType,
          occurredAt: c.occurredAt,
          reason: c.reason,
          elapsedBusinessMinutes: c.elapsedBusinessMinutes,
        })),
      });
    }

    await this.outbox.persistEvents(tx, aggregate.pullDomainEvents());
    return snap.resolutionDueAt;
  }

  async syncOnPriorityChange(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      ticketId: string;
      newPriority: PriorityLevel;
      now: Date;
      correlationId: string;
    },
  ): Promise<Date | null> {
    const row = await tx.slaInstance.findFirst({
      where: { tenantId: params.tenantId, ticketId: params.ticketId },
      include: {
        policy: {
          include: {
            targets: true,
            calendar: { include: { businessHours: true, holidays: true } },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (!row) return null;

    const targetRow = row.policy.targets.find((t) => t.priority === params.newPriority);
    if (!targetRow) return row.resolutionDueAt;

    const calendar: BusinessCalendarConfig = {
      timezone: row.policy.calendar.timezone,
      shifts: row.policy.calendar.businessHours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
      })),
      holidayDates: row.policy.calendar.holidays.map((h) => h.date.toISOString().slice(0, 10)),
    };

    const aggregate = SlaInstanceAggregate.reconstitute({
      id: row.id,
      tenantId: row.tenantId,
      ticketId: row.ticketId,
      policyId: row.policyId,
      priority: row.priority,
      state: row.state,
      startedAt: row.startedAt,
      pausedAt: row.pausedAt,
      accumulatedPauseMs: row.accumulatedPauseMs,
      elapsedBusinessMin: row.elapsedBusinessMin,
      firstResponseDueAt: row.firstResponseDueAt,
      firstResponseMetAt: row.firstResponseMetAt,
      nextUpdateDueAt: row.nextUpdateDueAt,
      resolutionDueAt: row.resolutionDueAt,
      resolutionMetAt: row.resolutionMetAt,
      warningTriggeredAt: row.warningTriggeredAt,
      escalationTriggeredAt: row.escalationTriggeredAt,
      breachedAt: row.breachedAt,
      version: row.version,
    });

    aggregate.retargetForPriority(
      params.newPriority,
      params.now,
      {
        firstResponseMinutes: targetRow.firstResponseMinutes,
        updateMinutes: targetRow.updateMinutes,
        resolutionMinutes: targetRow.resolutionMinutes,
        warningThresholdPct: targetRow.warningThresholdPct,
        escalationThresholdPct: targetRow.escalationThresholdPct,
      },
      calendar,
      params.correlationId,
    );

    const snap = aggregate.snapshot;
    await tx.slaInstance.update({
      where: { id: row.id },
      data: {
        priority: snap.priority,
        firstResponseDueAt: snap.firstResponseDueAt,
        resolutionDueAt: snap.resolutionDueAt,
        version: { increment: 1 },
      },
    });

    if (aggregate.clockLogs.length > 0) {
      await tx.slaClockEvent.createMany({
        data: aggregate.clockLogs.map((c) => ({
          slaInstanceId: row.id,
          eventType: c.eventType,
          occurredAt: c.occurredAt,
          reason: c.reason,
          elapsedBusinessMinutes: c.elapsedBusinessMinutes,
        })),
      });
    }

    await this.outbox.persistEvents(tx, aggregate.pullDomainEvents());
    return snap.resolutionDueAt;
  }

  async markFirstResponseMet(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ticketId: string,
    now: Date,
  ): Promise<void> {
    const row = await tx.slaInstance.findFirst({
      where: { tenantId, ticketId, firstResponseMetAt: null },
    });
    if (!row) return;

    await tx.slaInstance.update({
      where: { id: row.id },
      data: { firstResponseMetAt: now },
    });
    await tx.slaClockEvent.create({
      data: {
        slaInstanceId: row.id,
        eventType: 'FirstResponseMet',
        occurredAt: now,
        reason: 'Primeira resposta pública registrada',
        elapsedBusinessMinutes: row.elapsedBusinessMin,
      },
    });
  }

  private async findMatchingPolicy(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      unitId: string | null;
      departmentId: string | null;
      categoryId: string | null;
      serviceId: string | null;
    },
  ) {
    const policies = await tx.slaPolicy.findMany({
      where: { tenantId: params.tenantId, isActive: true },
      include: {
        targets: true,
        calendar: { include: { businessHours: true, holidays: true } },
      },
      orderBy: { matchOrder: 'asc' },
    });

    const scored = policies
      .filter((p) => {
        if (p.serviceId && p.serviceId !== params.serviceId) return false;
        if (p.categoryId && p.categoryId !== params.categoryId) return false;
        if (p.departmentId && p.departmentId !== params.departmentId) return false;
        if (p.unitId && p.unitId !== params.unitId) return false;
        return true;
      })
      .map((p) => ({
        policy: p,
        specificity:
          (p.serviceId ? 8 : 0) +
          (p.categoryId ? 4 : 0) +
          (p.departmentId ? 2 : 0) +
          (p.unitId ? 1 : 0),
      }))
      .sort((a, b) => b.specificity - a.specificity || a.policy.matchOrder - b.policy.matchOrder);

    return scored[0]?.policy ?? null;
  }
}

