import { beforeEach, describe, expect, it } from 'vitest';
import {
  getTelemetrySummary,
  reportFpsDrop,
  reportRenderMetric,
  resetTelemetryForTesting,
  traceUiInteraction,
} from './telemetry';

describe('Client OpenTelemetry instrumentation helpers', () => {
  beforeEach(() => {
    resetTelemetryForTesting();
  });
  it('propagates result and records interaction span without throwing outside browser OTel', async () => {
    const result = await traceUiInteraction('ticket.create', { 'civora.priority': 'HIGH' }, async () => {
      return { id: 'ok-1' };
    });
    expect(result).toEqual({ id: 'ok-1' });
  });

  it('rethrows failed operations cleanly after closing span', async () => {
    await expect(
      traceUiInteraction('ticket.fail', {}, async () => {
        throw new Error('simulated upstream failure');
      }),
    ).rejects.toThrow('simulated upstream failure');
  });

  it('buffers significant FPS drops and slow backdrop-blur surface renders while filtering sub-4ms noise', () => {
    reportFpsDrop({ sceneName: 'cmdb-topology', fps: 28, maxFrameMs: 48, windowMs: 2000 });
    reportRenderMetric({
      surfaceId: 'kpi-card-fast',
      phase: 'update',
      actualDurationMs: 1.8,
      baseDurationMs: 2.1,
    });
    reportRenderMetric({
      surfaceId: 'kpi-card-blur',
      phase: 'mount',
      actualDurationMs: 11.4,
      baseDurationMs: 14.0,
    });

    const summary = getTelemetrySummary();
    expect(summary.fpsDrops.some((d) => d.sceneName === 'cmdb-topology' && d.fps === 28)).toBe(true);
    expect(summary.slowGlassRenders.some((r) => r.surfaceId === 'kpi-card-blur')).toBe(true);
    expect(summary.slowGlassRenders.some((r) => r.surfaceId === 'kpi-card-fast')).toBe(false);
  });
});

