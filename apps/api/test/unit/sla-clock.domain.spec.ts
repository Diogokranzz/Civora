import { describe, expect, it } from 'vitest';
import { SlaClockCalculator, type BusinessCalendarConfig } from '../../src/modules/sla/domain/sla-clock';
import { SlaInstanceAggregate } from '../../src/modules/sla/domain/sla-instance.entity';

const SP_CALENDAR: BusinessCalendarConfig = {
  timezone: 'America/Sao_Paulo',
  shifts: [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
    { dayOfWeek, startTime: '08:00', endTime: '12:00' },
    { dayOfWeek, startTime: '13:00', endTime: '18:00' },
  ]),
  holidayDates: ['2026-11-20'],
};

describe('SLA Clock & Business Calendar Engine', () => {
  it('skips lunch break, weekends, and configured holidays in America/Sao_Paulo', () => {
    // 2026-11-19 is Thursday 17:30 BRT (20:30 UTC). 30 mins left on Thursday.
    // 2026-11-20 is Friday Holiday (skipped!).
    // 2026-11-21 & 22 are Sat & Sun (skipped!).
    // Remaining 90 mins resume Monday 2026-11-23 at 08:00 BRT -> due 09:30 BRT (12:30 UTC).
    const start = new Date('2026-11-19T20:30:00.000Z');
    const due = SlaClockCalculator.addBusinessMinutes(start, 120, SP_CALENDAR);

    expect(due.toISOString()).toBe('2026-11-23T12:30:00.000Z');
  });

  it('pauses and resumes SLA extending due date by paused business minutes', () => {
    const start = new Date('2026-11-10T12:00:00.000Z'); // Tuesday 09:00 BRT
    const target = {
      firstResponseMinutes: 30,
      updateMinutes: 60,
      resolutionMinutes: 180,
      warningThresholdPct: 75,
      escalationThresholdPct: 90,
    };

    const sla = SlaInstanceAggregate.start({
      id: '55555555-5555-4555-8555-555555555555',
      tenantId: '11111111-1111-4111-8111-111111111111',
      ticketId: '44444444-4444-4444-8444-444444444444',
      policyId: '66666666-6666-4666-8666-666666666666',
      priority: 'HIGH',
      target,
      calendar: SP_CALENDAR,
      startedAt: start,
      correlationId: 'corr-sla-1',
    });

    // 09:00 BRT + 180m = 12:00 BRT (15:00 UTC)
    expect(sla.snapshot.resolutionDueAt.toISOString()).toBe('2026-11-10T15:00:00.000Z');

    // Pause at 10:00 BRT (13:00 UTC) and resume at 11:00 BRT (14:00 UTC) -> +60m compensated
    sla.pause(new Date('2026-11-10T13:00:00.000Z'), 'WAITING_CUSTOMER', 'corr-sla-2');
    expect(sla.snapshot.state).toBe('PAUSED');

    sla.resume(
      new Date('2026-11-10T14:00:00.000Z'),
      'Customer replied',
      target,
      SP_CALENDAR,
      'corr-sla-3',
    );
    expect(sla.snapshot.state).toBe('ACTIVE');
    // 12:00 BRT + 60m skipping 12:00-13:00 lunch -> 14:00 BRT (17:00 UTC)
    expect(sla.snapshot.resolutionDueAt.toISOString()).toBe('2026-11-10T17:00:00.000Z');

    // Evaluate tick at 11:30 BRT (14:30 UTC): active elapsed = (10-9) + (11:30-11) = 90m (50%) -> ACTIVE
    sla.evaluateTick(new Date('2026-11-10T14:30:00.000Z'), target, SP_CALENDAR, 'corr-sla-4');
    expect(sla.snapshot.state).toBe('ACTIVE');

    // Evaluate tick at 13:30 BRT (16:30 UTC): active elapsed = 150m (83%) -> WARNING (>= 75%)
    sla.evaluateTick(new Date('2026-11-10T16:30:00.000Z'), target, SP_CALENDAR, 'corr-sla-5');
    expect(sla.snapshot.state).toBe('WARNING');

    // Evaluate tick at 14:15 BRT (17:15 UTC): past due -> BREACHED
    sla.evaluateTick(new Date('2026-11-10T17:15:00.000Z'), target, SP_CALENDAR, 'corr-sla-5');
    expect(sla.snapshot.state).toBe('BREACHED');
    expect(sla.snapshot.breachedAt).not.toBeNull();
  });
});
