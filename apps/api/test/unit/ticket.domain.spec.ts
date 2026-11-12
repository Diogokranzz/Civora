import { describe, expect, it } from 'vitest';
import {
  InvalidStateTransitionError,
  TenantIsolationError,
  UnauthorizedDomainActionError,
  ValidationDomainError,
} from '../../src/shared/domain/domain-errors';
import { TicketAggregate } from '../../src/modules/tickets/domain/ticket.entity';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '99999999-9999-4999-8999-999999999999';
const REQUESTER = '22222222-2222-4222-8222-222222222222';
const AGENT = '33333333-3333-4333-8333-333333333333';

describe('TicketAggregate Domain Rules', () => {
  it('derives priority from impact + urgency matrix and emits TicketCreated v1', () => {
    const ticket = TicketAggregate.create({
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: TENANT_A,
      publicNumber: 'CIV-2026-000001',
      title: 'Falha no servidor WMS Campinas',
      descriptionHtml: '<p>Indisponibilidade na doca B.</p>',
      descriptionText: 'Indisponibilidade na doca B.',
      type: 'INCIDENT',
      channel: 'PORTAL',
      impact: 'HIGH',
      urgency: 'HIGH',
      requesterId: REQUESTER,
      correlationId: 'corr-1',
    });

    expect(ticket.snapshot.priority).toBe('CRITICAL');
    expect(ticket.snapshot.status).toBe('NEW');
    const events = ticket.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('TicketCreated');
    expect(events[0]?.eventVersion).toBe(1);
  });

  it('prevents invalid state transitions and closing without resolution', () => {
    const ticket = TicketAggregate.create({
      id: '44444444-4444-4444-8444-444444444445',
      tenantId: TENANT_A,
      publicNumber: 'CIV-2026-000002',
      title: 'Erro de impressão fiscal',
      descriptionHtml: '<p>Impressora térmica offline.</p>',
      descriptionText: 'Impressora térmica offline.',
      type: 'INCIDENT',
      channel: 'PORTAL',
      impact: 'HIGH',
      urgency: 'MEDIUM',
      requesterId: REQUESTER,
      correlationId: 'corr-2',
    });

    expect(ticket.snapshot.priority).toBe('HIGH');

    expect(() =>
      ticket.transitionTo({
        targetStatus: 'CLOSED',
        actorId: AGENT,
        canReopenCanceled: false,
        correlationId: 'corr-2',
      }),
    ).toThrow(InvalidStateTransitionError);

    ticket.transitionTo({
      targetStatus: 'OPEN',
      actorId: AGENT,
      canReopenCanceled: false,
      correlationId: 'corr-2',
    });

    expect(() =>
      ticket.transitionTo({
        targetStatus: 'RESOLVED',
        actorId: AGENT,
        canReopenCanceled: false,
        correlationId: 'corr-2',
      }),
    ).toThrow(InvalidStateTransitionError);

    ticket.transitionTo({
      targetStatus: 'RESOLVED',
      actorId: AGENT,
      canReopenCanceled: false,
      resolutionSummary: 'Driver USB reinstalado e spooler reiniciado.',
      correlationId: 'corr-2',
    });

    ticket.transitionTo({
      targetStatus: 'CLOSED',
      actorId: REQUESTER,
      canReopenCanceled: false,
      correlationId: 'corr-2',
    });
    expect(ticket.snapshot.status).toBe('CLOSED');
  });

  it('requires specific permission to reopen a canceled ticket', () => {
    const ticket = TicketAggregate.create({
      id: '44444444-4444-4444-8444-444444444446',
      tenantId: TENANT_A,
      publicNumber: 'CIV-2026-000003',
      title: 'Acesso temporário',
      descriptionHtml: '<p>Solicitação duplicada.</p>',
      descriptionText: 'Solicitação duplicada.',
      type: 'SERVICE_REQUEST',
      channel: 'PORTAL',
      impact: 'LOW',
      urgency: 'LOW',
      requesterId: REQUESTER,
      correlationId: 'corr-3',
    });

    ticket.transitionTo({
      targetStatus: 'CANCELED',
      actorId: AGENT,
      canReopenCanceled: false,
      cancellationReason: 'Solicitante abriu em duplicidade.',
      correlationId: 'corr-3',
    });

    expect(() =>
      ticket.transitionTo({
        targetStatus: 'REOPENED',
        actorId: AGENT,
        canReopenCanceled: false,
        correlationId: 'corr-3',
      }),
    ).toThrow(UnauthorizedDomainActionError);

    ticket.transitionTo({
      targetStatus: 'REOPENED',
      actorId: AGENT,
      canReopenCanceled: true,
      reason: 'Supervisor autorizou retomada.',
      correlationId: 'corr-3',
    });
    expect(ticket.snapshot.status).toBe('REOPENED');
  });

  it('blocks cross-tenant assignment and requires auditable reason for priority override', () => {
    const ticket = TicketAggregate.create({
      id: '44444444-4444-4444-8444-444444444447',
      tenantId: TENANT_A,
      publicNumber: 'CIV-2026-000004',
      title: 'Troca de monitor',
      descriptionHtml: '<p>Tela com flicker.</p>',
      descriptionText: 'Tela com flicker.',
      type: 'INCIDENT',
      channel: 'PORTAL',
      impact: 'LOW',
      urgency: 'LOW',
      requesterId: REQUESTER,
      correlationId: 'corr-4',
    });

    expect(() =>
      ticket.assign({
        assigneeId: AGENT,
        assigneeTenantId: TENANT_B,
        teamId: null,
        teamTenantId: null,
        actorId: AGENT,
        correlationId: 'corr-4',
      }),
    ).toThrow(TenantIsolationError);

    expect(() =>
      ticket.overridePriority({
        priority: 'CRITICAL',
        reason: 'ok',
        actorId: AGENT,
        canOverride: true,
        correlationId: 'corr-4',
      }),
    ).toThrow(ValidationDomainError);

    ticket.overridePriority({
      priority: 'CRITICAL',
      reason: 'Equipamento pertence ao diretor em apresentação ao conselho.',
      actorId: AGENT,
      canOverride: true,
      correlationId: 'corr-4',
    });
    expect(ticket.snapshot.priority).toBe('CRITICAL');
    expect(ticket.snapshot.priorityOverridden).toBe(true);
  });
});

