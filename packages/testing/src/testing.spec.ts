import { describe, expect, it } from 'vitest';
import { buildTicketSeedInput, FakeClock } from './index';

describe('@civora/testing', () => {
  it('advances deterministic FakeClock and builds ticket seed inputs', () => {
    const clock = new FakeClock('2026-11-10T12:00:00.000Z');
    clock.advanceMinutes(45);
    expect(clock.now().toISOString()).toBe('2026-11-10T12:45:00.000Z');

    const input = buildTicketSeedInput({ title: 'Teste unitário' });
    expect(input.title).toBe('Teste unitário');
  });
});

