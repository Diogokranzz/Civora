import { randomUUID } from 'node:crypto';
import type { PriorityLevel, SlaInstanceState } from '@civora/types';
import { AggregateRoot, type DomainEvent } from '../../../shared/domain/aggregate-root';
import { SlaClockCalculator, type BusinessCalendarConfig } from './sla-clock';

export interface SlaInstanceProps {
  id: string;
  tenantId: string;
  ticketId: string;
  policyId: string;
  priority: PriorityLevel;
  state: SlaInstanceState;
  startedAt: Date;
  pausedAt: Date | null;
  accumulatedPauseMs: bigint;
  elapsedBusinessMin: number;
  firstResponseDueAt: Date;
  firstResponseMetAt: Date | null;
  nextUpdateDueAt: Date | null;
  resolutionDueAt: Date;
  resolutionMetAt: Date | null;
  warningTriggeredAt: Date | null;
  escalationTriggeredAt: Date | null;
  breachedAt: Date | null;
  version: number;
}

export interface SlaTargetConfig {
  firstResponseMinutes: number;
  updateMinutes: number;
  resolutionMinutes: number;
  warningThresholdPct: number;
  escalationThresholdPct: number;
}

export class SlaInstanceAggregate extends AggregateRoot {
  private props: SlaInstanceProps;
  public readonly clockLogs: Array<{
    eventType: string;
    occurredAt: Date;
    reason: string | null;
    elapsedBusinessMinutes: number;
  }> = [];

  private constructor(props: SlaInstanceProps) {
    super(props.id, props.version);
    this.props = { ...props };
  }

  static reconstitute(props: SlaInstanceProps): SlaInstanceAggregate {
    return new SlaInstanceAggregate(props);
  }

  static start(params: {
    id: string;
    tenantId: string;
    ticketId: string;
    policyId: string;
    priority: PriorityLevel;
    target: SlaTargetConfig;
    calendar: BusinessCalendarConfig;
    startedAt: Date;
    correlationId: string;
  }): SlaInstanceAggregate {
    const firstResponseDueAt = SlaClockCalculator.addBusinessMinutes(
      params.startedAt,
      params.target.firstResponseMinutes,
      params.calendar,
    );
    const nextUpdateDueAt = SlaClockCalculator.addBusinessMinutes(
      params.startedAt,
      params.target.updateMinutes,
      params.calendar,
    );
    const resolutionDueAt = SlaClockCalculator.addBusinessMinutes(
      params.startedAt,
      params.target.resolutionMinutes,
      params.calendar,
    );

    const instance = new SlaInstanceAggregate({
      id: params.id,
      tenantId: params.tenantId,
      ticketId: params.ticketId,
      policyId: params.policyId,
      priority: params.priority,
      state: 'ACTIVE',
      startedAt: params.startedAt,
      pausedAt: null,
      accumulatedPauseMs: 0n,
      elapsedBusinessMin: 0,
      firstResponseDueAt,
      firstResponseMetAt: null,
      nextUpdateDueAt,
      resolutionDueAt,
      resolutionMetAt: null,
      warningTriggeredAt: null,
      escalationTriggeredAt: null,
      breachedAt: null,
      version: 1,
    });

    instance.clockLogs.push({
      eventType: 'SlaStarted',
      occurredAt: params.startedAt,
      reason: `Política iniciada (${params.priority})`,
      elapsedBusinessMinutes: 0,
    });

    instance.emit(
      'SlaStarted',
      {
        ticketId: params.ticketId,
        policyId: params.policyId,
        priority: params.priority,
        firstResponseDueAt: firstResponseDueAt.toISOString(),
        resolutionDueAt: resolutionDueAt.toISOString(),
      },
      params.correlationId,
      params.startedAt,
    );

    return instance;
  }

  get snapshot(): Readonly<SlaInstanceProps> {
    return { ...this.props };
  }

  pause(now: Date, reason: string, correlationId: string): boolean {
    if (this.props.state === 'PAUSED' || this.props.state === 'MET' || this.props.state === 'CANCELED') {
      return false;
    }
    this.props.pausedAt = now;
    this.props.state = 'PAUSED';
    this.clockLogs.push({
      eventType: 'SlaPaused',
      occurredAt: now,
      reason,
      elapsedBusinessMinutes: this.props.elapsedBusinessMin,
    });
    this.emit('SlaPaused', { ticketId: this.props.ticketId, reason }, correlationId, now);
    return true;
  }

  resume(
    now: Date,
    reason: string,
    target: SlaTargetConfig,
    calendar: BusinessCalendarConfig,
    correlationId: string,
  ): boolean {
    if (this.props.state !== 'PAUSED' || !this.props.pausedAt) {
      return false;
    }

    const pausedBusinessMinutes = SlaClockCalculator.calculateBusinessMinutesBetween(
      this.props.pausedAt,
      now,
      calendar,
    );
    const pausedWallMs = BigInt(Math.max(0, now.getTime() - this.props.pausedAt.getTime()));
    this.props.accumulatedPauseMs += pausedWallMs;
    this.props.pausedAt = null;

    if (pausedBusinessMinutes > 0) {
      if (!this.props.firstResponseMetAt) {
        this.props.firstResponseDueAt = SlaClockCalculator.addBusinessMinutes(
          this.props.firstResponseDueAt,
          pausedBusinessMinutes,
          calendar,
        );
      }
      this.props.resolutionDueAt = SlaClockCalculator.addBusinessMinutes(
        this.props.resolutionDueAt,
        pausedBusinessMinutes,
        calendar,
      );
      if (this.props.nextUpdateDueAt) {
        this.props.nextUpdateDueAt = SlaClockCalculator.addBusinessMinutes(
          this.props.nextUpdateDueAt,
          pausedBusinessMinutes,
          calendar,
        );
      }
    }

    this.props.state = this.props.breachedAt
      ? 'BREACHED'
      : this.props.warningTriggeredAt
        ? 'WARNING'
        : 'ACTIVE';

    this.clockLogs.push({
      eventType: 'SlaResumed',
      occurredAt: now,
      reason: `${reason} (+${pausedBusinessMinutes}m úteis compensados)`,
      elapsedBusinessMinutes: this.props.elapsedBusinessMin,
    });
    this.emit(
      'SlaResumed',
      {
        ticketId: this.props.ticketId,
        pausedBusinessMinutes,
        resolutionDueAt: this.props.resolutionDueAt.toISOString(),
        targetWarningPct: target.warningThresholdPct,
      },
      correlationId,
      now,
    );
    return true;
  }

  markFirstResponseMet(now: Date): void {
    if (!this.props.firstResponseMetAt) {
      this.props.firstResponseMetAt = now;
      this.clockLogs.push({
        eventType: 'FirstResponseMet',
        occurredAt: now,
        reason: 'Primeira resposta registrada ao solicitante',
        elapsedBusinessMinutes: this.props.elapsedBusinessMin,
      });
    }
  }

  markResolved(now: Date): void {
    if (this.props.state === 'CANCELED') return;
    this.props.resolutionMetAt = now;
    this.props.pausedAt = null;
    if (!this.props.breachedAt && now.getTime() <= this.props.resolutionDueAt.getTime()) {
      this.props.state = 'MET';
    } else {
      this.props.state = 'BREACHED';
    }
    this.clockLogs.push({
      eventType: 'SlaStoppedOnResolution',
      occurredAt: now,
      reason: this.props.state === 'MET' ? 'SLA cumprido dentro do prazo' : 'SLA encerrado com violação',
      elapsedBusinessMinutes: this.props.elapsedBusinessMin,
    });
  }

  reopen(
    now: Date,
    target: SlaTargetConfig,
    calendar: BusinessCalendarConfig,
    correlationId: string,
  ): void {
    if (this.props.state === 'MET' || this.props.state === 'CANCELED') {
      const remainingMinutes = Math.max(15, target.resolutionMinutes - this.props.elapsedBusinessMin);
      this.props.resolutionMetAt = null;
      this.props.resolutionDueAt = SlaClockCalculator.addBusinessMinutes(
        now,
        remainingMinutes,
        calendar,
      );
      this.props.state = this.props.breachedAt ? 'BREACHED' : 'ACTIVE';
      this.clockLogs.push({
        eventType: 'SlaReopened',
        occurredAt: now,
        reason: `Chamado reaberto (${remainingMinutes}m úteis restantes)`,
        elapsedBusinessMinutes: this.props.elapsedBusinessMin,
      });
      this.emit('SlaResumed', { ticketId: this.props.ticketId, reopened: true }, correlationId, now);
    }
  }

  retargetForPriority(
    newPriority: PriorityLevel,
    now: Date,
    target: SlaTargetConfig,
    calendar: BusinessCalendarConfig,
    correlationId: string,
  ): void {
    this.props.priority = newPriority;
    const remainingRes = Math.max(10, target.resolutionMinutes - this.props.elapsedBusinessMin);
    this.props.resolutionDueAt = SlaClockCalculator.addBusinessMinutes(now, remainingRes, calendar);
    if (!this.props.firstResponseMetAt) {
      const remainingFr = Math.max(5, target.firstResponseMinutes - this.props.elapsedBusinessMin);
      this.props.firstResponseDueAt = SlaClockCalculator.addBusinessMinutes(
        now,
        remainingFr,
        calendar,
      );
    }
    this.clockLogs.push({
      eventType: 'SlaRetargeted',
      occurredAt: now,
      reason: `Prioridade alterada para ${newPriority}`,
      elapsedBusinessMinutes: this.props.elapsedBusinessMin,
    });
    this.emit(
      'SlaRetargeted',
      {
        ticketId: this.props.ticketId,
        priority: newPriority,
        resolutionDueAt: this.props.resolutionDueAt.toISOString(),
      },
      correlationId,
      now,
    );
  }

  evaluateTick(
    now: Date,
    target: SlaTargetConfig,
    calendar: BusinessCalendarConfig,
    correlationId: string,
  ): void {
    if (
      this.props.state === 'PAUSED' ||
      this.props.state === 'MET' ||
      this.props.state === 'CANCELED'
    ) {
      return;
    }

    const totalPausedApproxMin = Math.floor(Number(this.props.accumulatedPauseMs) / 60_000);
    const rawElapsedMin = SlaClockCalculator.calculateBusinessMinutesBetween(
      this.props.startedAt,
      now,
      calendar,
    );
    const elapsedMin = Math.max(0, rawElapsedMin - totalPausedApproxMin);
    this.props.elapsedBusinessMin = elapsedMin;

    const pct = target.resolutionMinutes > 0 ? (elapsedMin / target.resolutionMinutes) * 100 : 100;

    if (!this.props.breachedAt && now.getTime() > this.props.resolutionDueAt.getTime()) {
      this.props.breachedAt = now;
      this.props.state = 'BREACHED';
      this.clockLogs.push({
        eventType: 'SlaBreached',
        occurredAt: now,
        reason: 'Meta de resolução do SLA ultrapassada',
        elapsedBusinessMinutes: elapsedMin,
      });
      this.emit(
        'SlaBreached',
        { ticketId: this.props.ticketId, elapsedBusinessMinutes: elapsedMin },
        correlationId,
        now,
      );
      return;
    }

    if (!this.props.warningTriggeredAt && pct >= target.warningThresholdPct) {
      this.props.warningTriggeredAt = now;
      if (this.props.state === 'ACTIVE') {
        this.props.state = 'WARNING';
      }
      this.clockLogs.push({
        eventType: 'SlaWarningReached',
        occurredAt: now,
        reason: `Consumo atingiu ${Math.round(pct)}% (alerta >= ${target.warningThresholdPct}%)`,
        elapsedBusinessMinutes: elapsedMin,
      });
      this.emit(
        'SlaWarningReached',
        { ticketId: this.props.ticketId, consumedPercent: Math.round(pct) },
        correlationId,
        now,
      );
    }

    if (!this.props.escalationTriggeredAt && pct >= target.escalationThresholdPct) {
      this.props.escalationTriggeredAt = now;
      this.clockLogs.push({
        eventType: 'SlaEscalationTriggered',
        occurredAt: now,
        reason: `Escalonamento automático atingiu ${Math.round(pct)}%`,
        elapsedBusinessMinutes: elapsedMin,
      });
      this.emit(
        'SlaEscalationTriggered',
        { ticketId: this.props.ticketId, consumedPercent: Math.round(pct) },
        correlationId,
        now,
      );
    }
  }

  private emit(
    eventType: string,
    payload: Record<string, unknown>,
    correlationId: string,
    occurredAt: Date,
  ): void {
    const event: DomainEvent = {
      eventId: randomUUID(),
      eventType,
      eventVersion: 1,
      aggregateType: 'SlaInstance',
      aggregateId: this.props.id,
      tenantId: this.props.tenantId,
      occurredAt,
      correlationId,
      causationId: null,
      payload,
    };
    this.addDomainEvent(event);
  }
}

