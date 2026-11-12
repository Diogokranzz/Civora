import type { ImpactLevel, TicketChannel, TicketType, UrgencyLevel } from '@civora/types';

export interface Clock {
  now(): Date;
}

export class FakeClock implements Clock {
  private current: Date;

  constructor(initial: Date | string = '2026-11-10T12:00:00.000Z') {
    this.current = typeof initial === 'string' ? new Date(initial) : new Date(initial.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceMinutes(minutes: number): Date {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
    return this.now();
  }

  advanceHours(hours: number): Date {
    return this.advanceMinutes(hours * 60);
  }

  set(date: Date | string): void {
    this.current = typeof date === 'string' ? new Date(date) : new Date(date.getTime());
  }
}

export function buildTicketSeedInput(overrides?: {
  tenantId?: string;
  requesterId?: string;
  title?: string;
  descriptionHtml?: string;
  type?: TicketType;
  channel?: TicketChannel;
  impact?: ImpactLevel;
  urgency?: UrgencyLevel;
}) {
  return {
    tenantId: overrides?.tenantId ?? '11111111-1111-4111-8111-111111111111',
    requesterId: overrides?.requesterId ?? '22222222-2222-4222-8222-222222222222',
    title: overrides?.title ?? 'Falha intermitente na autenticação VPN corporativa',
    descriptionHtml:
      overrides?.descriptionHtml ??
      '<p>Colaboradores da unidade Campinas não conseguem autenticar na VPN desde 08:30.</p>',
    type: overrides?.type ?? ('INCIDENT' as TicketType),
    channel: overrides?.channel ?? ('PORTAL' as TicketChannel),
    impact: overrides?.impact ?? ('HIGH' as ImpactLevel),
    urgency: overrides?.urgency ?? ('HIGH' as UrgencyLevel),
  };
}

