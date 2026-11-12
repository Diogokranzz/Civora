import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeEventBatcher, type RealtimeBatchFlush } from './realtime-batcher';

describe('RealtimeEventBatcher backpressure handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces 250 rapid WebSocket bursts into a single downstream flush', () => {
    const flushes: RealtimeBatchFlush[] = [];
    const batcher = new RealtimeEventBatcher({
      debounceMs: 200,
      maxWaitMs: 800,
      maxQueueDepth: 100,
      onFlush: (batch) => flushes.push(batch),
    });

    for (let i = 0; i < 250; i += 1) {
      batcher.enqueue(['tickets', 'metrics'], `ticket-${i}`);
    }

    expect(flushes).toHaveLength(0);

    vi.advanceTimersByTime(200);
    expect(flushes).toHaveLength(1);
    expect(flushes[0]?.coalescedCount).toBe(250);
    expect(flushes[0]?.ticketIds.size).toBe(100);
    expect(flushes[0]?.droppedCount).toBe(150);
    expect(flushes[0]?.topics.has('tickets')).toBe(true);
    expect(flushes[0]?.topics.has('metrics')).toBe(true);
    batcher.dispose();
  });

  it('forces periodic flushes at maxWaitMs even during nonstop sustained floods', () => {
    const flushes: RealtimeBatchFlush[] = [];
    const batcher = new RealtimeEventBatcher({
      debounceMs: 250,
      maxWaitMs: 600,
      onFlush: (batch) => flushes.push(batch),
    });

    for (let step = 0; step < 7; step += 1) {
      batcher.enqueue(['tickets'], `t-${step}`);
      vi.advanceTimersByTime(100);
    }

    expect(flushes.length).toBeGreaterThanOrEqual(1);
    batcher.dispose();
  });
});

