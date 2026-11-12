'use client';

import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Tracer,
} from '@opentelemetry/api';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { Resource } from '@opentelemetry/resources';
import { BatchSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { FpsDropSample, SurfaceRenderSample } from '@civora/ui-spatial';
import { onCLS, onFCP, onFID, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

export interface TelemetrySnapshot {
  initialized: boolean;
  vitals: Partial<Record<'LCP' | 'FID' | 'CLS' | 'INP' | 'FCP' | 'TTFB', number>>;
  fpsDrops: FpsDropSample[];
  slowGlassRenders: SurfaceRenderSample[];
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const OTEL_BASE = (process.env.NEXT_PUBLIC_OTEL_URL || 'http://localhost:4318').replace(/\/+$/, '');

let initialized = false;
let providerInstance: WebTracerProvider | null = null;
const lastSurfaceEmitAt = new Map<string, number>();

const telemetryState: TelemetrySnapshot = {
  initialized: false,
  vitals: {},
  fpsDrops: [],
  slowGlassRenders: [],
};

interface BufferedClientTelemetry {
  fpsDrops: Array<{ scene: string; fps: number; maxFrameMs: number }>;
  vitals: Array<{ name: 'LCP' | 'FID' | 'CLS' | 'INP' | 'FCP' | 'TTFB'; value: number }>;
  coalescedCount: number;
  droppedCount: number;
}

const pendingBeacon: BufferedClientTelemetry = {
  fpsDrops: [],
  vitals: [],
  coalescedCount: 0,
  droppedCount: 0,
};
let beaconTimer: ReturnType<typeof setTimeout> | null = null;

function flushClientBeacon(): void {
  beaconTimer = null;
  if (typeof window === 'undefined') return;
  if (
    pendingBeacon.fpsDrops.length === 0 &&
    pendingBeacon.vitals.length === 0 &&
    pendingBeacon.coalescedCount === 0 &&
    pendingBeacon.droppedCount === 0
  ) {
    return;
  }

  const payload = {
    fpsDrops: pendingBeacon.fpsDrops.splice(0, 50),
    vitals: pendingBeacon.vitals.splice(0, 20),
    ...(pendingBeacon.coalescedCount > 0 || pendingBeacon.droppedCount > 0
      ? {
          backpressure: {
            coalescedCount: pendingBeacon.coalescedCount,
            droppedCount: pendingBeacon.droppedCount,
          },
        }
      : {}),
  };
  pendingBeacon.coalescedCount = 0;
  pendingBeacon.droppedCount = 0;

  void fetch(`${API_BASE}/api/v1/telemetry/client`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}

function scheduleClientBeacon(): void {
  if (typeof window === 'undefined' || beaconTimer !== null) {
    return;
  }
  beaconTimer = setTimeout(flushClientBeacon, 2000);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTracer(): Tracer {
  return trace.getTracer('civora-web', '1.0.0');
}

function emitVitalSpan(metric: Metric): void {
  const vitalName = metric.name as keyof TelemetrySnapshot['vitals'];
  const normalizedValue = Number(metric.value.toFixed(metric.name === 'CLS' ? 4 : 2));
  telemetryState.vitals[vitalName] = normalizedValue;

  if (pendingBeacon.vitals.length < 20) {
    pendingBeacon.vitals.push({ name: vitalName, value: normalizedValue });
    scheduleClientBeacon();
  }

  const span = getTracer().startSpan(`web_vital.${metric.name}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'web_vital.name': metric.name,
      'web_vital.value': metric.value,
      'web_vital.rating': metric.rating,
      'web_vital.navigation_type': metric.navigationType,
    },
  });
  span.end();
}

export function initClientTelemetry(): void {
  if (initialized || typeof window === 'undefined') {
    return;
  }
  initialized = true;
  telemetryState.initialized = true;

  try {
    const exporter = new OTLPTraceExporter({
      url: `${OTEL_BASE}/v1/traces`,
    });
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: 'civora-web',
      [ATTR_SERVICE_VERSION]: '1.0.0',
    });

    const provider = new WebTracerProvider({
      resource,
      spanProcessors: [
        new BatchSpanProcessor(exporter, {
          scheduledDelayMillis: 2500,
          maxExportBatchSize: 64,
        }),
      ],
    });

    provider.register({
      contextManager: new ZoneContextManager(),
    });
    providerInstance = provider;

    registerInstrumentations({
      instrumentations: [
        new FetchInstrumentation({
          propagateTraceHeaderCorsUrls: [new RegExp(`^${escapeRegExp(API_BASE)}`)],
          ignoreUrls: [new RegExp(`^${escapeRegExp(OTEL_BASE)}`)],
          clearTimingResources: true,
        }),
      ],
    });
  } catch {
    // Allow app boot even if browser restricts telemetry exporters.
  }

  try {
    onLCP(emitVitalSpan);
    onFID(emitVitalSpan);
    onCLS(emitVitalSpan);
    onINP(emitVitalSpan);
    onFCP(emitVitalSpan);
    onTTFB(emitVitalSpan);
  } catch {
    // Ignore unsupported browser PerformanceObserver entries.
  }
}

export async function shutdownClientTelemetry(): Promise<void> {
  if (providerInstance) {
    await providerInstance.shutdown();
    providerInstance = null;
  }
  initialized = false;
  telemetryState.initialized = false;
}

/**
 * Wraps an asynchronous UI operation inside an active OpenTelemetry client span
 * so downstream fetch calls carry linked W3C traceparent headers to NestJS and PostgreSQL.
 */
export async function traceUiInteraction<T>(
  actionName: string,
  attributes: Attributes,
  operation: () => Promise<T>,
): Promise<T> {
  const span = getTracer().startSpan(`ui.action.${actionName}`, {
    kind: SpanKind.CLIENT,
    attributes,
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'UI action failed',
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

export function reportFpsDrop(sample: FpsDropSample): void {
  if (telemetryState.fpsDrops.length >= 25) {
    telemetryState.fpsDrops.shift();
  }
  telemetryState.fpsDrops.push(sample);

  if (pendingBeacon.fpsDrops.length < 50) {
    pendingBeacon.fpsDrops.push({
      scene: sample.sceneName,
      fps: sample.fps,
      maxFrameMs: sample.maxFrameMs,
    });
    scheduleClientBeacon();
  }

  const span = getTracer().startSpan('webgl.fps_drop', {
    kind: SpanKind.CLIENT,
    attributes: {
      'scene.name': sample.sceneName,
      'webgl.fps': sample.fps,
      'webgl.max_frame_ms': sample.maxFrameMs,
      'webgl.window_ms': sample.windowMs,
    },
  });
  span.end();
}

export function reportBackpressureBatch(coalescedCount: number, droppedCount: number): void {
  if (coalescedCount <= 0 && droppedCount <= 0) {
    return;
  }
  pendingBeacon.coalescedCount += coalescedCount;
  pendingBeacon.droppedCount += droppedCount;
  scheduleClientBeacon();
}

export function reportRenderMetric(sample: SurfaceRenderSample): void {
  if (sample.actualDurationMs < 4) {
    return;
  }

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const prev = lastSurfaceEmitAt.get(sample.surfaceId);
  if (prev !== undefined && now - prev < 5000) {
    return;
  }
  lastSurfaceEmitAt.set(sample.surfaceId, now);

  if (telemetryState.slowGlassRenders.length >= 25) {
    telemetryState.slowGlassRenders.shift();
  }
  telemetryState.slowGlassRenders.push(sample);

  const span = getTracer().startSpan('react.surface_render', {
    kind: SpanKind.CLIENT,
    attributes: {
      'surface.id': sample.surfaceId,
      'react.phase': sample.phase,
      'react.actual_duration_ms': sample.actualDurationMs,
      'react.base_duration_ms': sample.baseDurationMs,
      'surface.backdrop_blur': true,
    },
  });
  span.end();
}

export function resetTelemetryForTesting(): void {
  lastSurfaceEmitAt.clear();
  telemetryState.fpsDrops = [];
  telemetryState.slowGlassRenders = [];
}

export function getTelemetrySummary(): TelemetrySnapshot {
  return {
    initialized: telemetryState.initialized,
    vitals: { ...telemetryState.vitals },
    fpsDrops: [...telemetryState.fpsDrops],
    slowGlassRenders: [...telemetryState.slowGlassRenders],
  };
}

