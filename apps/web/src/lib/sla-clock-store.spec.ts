import { describe, expect, it } from 'vitest';
import { computeSlaClockState } from './sla-clock-store';

describe('Decoupled SLA clock calculator', () => {
  const baseNow = Date.UTC(2026, 10, 11, 12, 0, 0);

  it('reports paused state without advancing countdown', () => {
    const state = computeSlaClockState(
      new Date(baseNow + 30 * 60 * 1000).toISOString(),
      new Date(baseNow - 60 * 1000).toISOString(),
      false,
      baseNow,
    );
    expect(state.urgency).toBe('paused');
    expect(state.label).toBe('Pausado');
  });

  it('transitions smoothly from ok to warning to breached', () => {
    const okState = computeSlaClockState(
      new Date(baseNow + 3 * 3600 * 1000).toISOString(),
      null,
      false,
      baseNow,
    );
    expect(okState.urgency).toBe('ok');
    expect(okState.label).toContain('3h');

    const warnState = computeSlaClockState(
      new Date(baseNow + 15 * 60 * 1000).toISOString(),
      null,
      false,
      baseNow,
    );
    expect(warnState.urgency).toBe('warning');
    expect(warnState.label).toContain('15m');

    const breachedState = computeSlaClockState(
      new Date(baseNow - 125 * 1000).toISOString(),
      null,
      true,
      baseNow,
    );
    expect(breachedState.urgency).toBe('breached');
    expect(breachedState.label).toContain('Estourado');
  });
});

