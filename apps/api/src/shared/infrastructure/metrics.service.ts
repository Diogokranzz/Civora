import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry: client.Registry;
  readonly httpRequestsTotal: client.Counter<string>;
  readonly httpRequestDuration: client.Histogram<string>;
  readonly ticketsCreatedTotal: client.Counter<string>;
  readonly slaBreachesTotal: client.Counter<string>;
  readonly jobFailuresTotal: client.Counter<string>;
  readonly realtimeEventsEmittedTotal: client.Counter<string>;
  readonly cmdbCacheHitsTotal: client.Counter<string>;
  readonly cmdbCacheMissesTotal: client.Counter<string>;
  readonly cmdbHydrationDurationSeconds: client.Histogram<string>;
  readonly cmdbCascadeSimulationsTotal: client.Counter<string>;
  readonly cmdbGovernanceDenialsTotal: client.Counter<string>;
  readonly frontendFpsDropsTotal: client.Counter<string>;
  readonly frontendFpsMinGauge: client.Gauge<string>;
  readonly frontendInpDurationMs: client.Histogram<string>;
  readonly frontendWebVitalHistogram: client.Histogram<string>;
  readonly frontendWsCoalescedTotal: client.Counter<string>;
  readonly frontendWsDroppedTotal: client.Counter<string>;
  readonly redisCircuitOpenTotal: client.Counter<string>;
  readonly redisCircuitState: client.Gauge<string>;

  constructor() {
    this.registry = new client.Registry();
    client.collectDefaultMetrics({ register: this.registry, prefix: 'civora_' });

    this.httpRequestsTotal = new client.Counter({
      name: 'civora_http_requests_total',
      help: 'Total HTTP requests processed by Civora API',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new client.Histogram({
      name: 'civora_http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.ticketsCreatedTotal = new client.Counter({
      name: 'civora_tickets_created_total',
      help: 'Total tickets created per tenant and priority',
      labelNames: ['tenant_id', 'priority'],
      registers: [this.registry],
    });

    this.slaBreachesTotal = new client.Counter({
      name: 'civora_sla_breaches_total',
      help: 'Total SLA breaches recorded',
      labelNames: ['tenant_id', 'priority'],
      registers: [this.registry],
    });

    this.jobFailuresTotal = new client.Counter({
      name: 'civora_job_failures_total',
      help: 'Total background job failures',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.realtimeEventsEmittedTotal = new client.Counter({
      name: 'civora_realtime_events_emitted_total',
      help: 'Total Socket.IO realtime events emitted by Civora API',
      labelNames: ['tenant_id', 'event'],
      registers: [this.registry],
    });

    this.cmdbCacheHitsTotal = new client.Counter({
      name: 'civora_cmdb_cache_hits_total',
      help: 'Total CMDB static topology Redis cache hits',
      labelNames: ['tenant_id'],
      registers: [this.registry],
    });

    this.cmdbCacheMissesTotal = new client.Counter({
      name: 'civora_cmdb_cache_misses_total',
      help: 'Total CMDB topology Redis cache misses hydrated via DataLoader',
      labelNames: ['tenant_id'],
      registers: [this.registry],
    });

    this.cmdbHydrationDurationSeconds = new client.Histogram({
      name: 'civora_cmdb_hydration_duration_seconds',
      help: 'CMDB topology hydration duration in seconds by source',
      labelNames: ['tenant_id', 'source'],
      buckets: [0.001, 0.005, 0.015, 0.05, 0.15, 0.5, 1.5],
      registers: [this.registry],
    });

    this.cmdbCascadeSimulationsTotal = new client.Counter({
      name: 'civora_cmdb_cascade_simulations_total',
      help: 'Total CMDB failure cascade simulations executed',
      labelNames: ['tenant_id'],
      registers: [this.registry],
    });

    this.cmdbGovernanceDenialsTotal = new client.Counter({
      name: 'civora_cmdb_governance_denials_total',
      help: 'Total CMDB relationship writes blocked by bidirectional governance',
      labelNames: ['tenant_id', 'side'],
      registers: [this.registry],
    });

    this.frontendFpsDropsTotal = new client.Counter({
      name: 'civora_frontend_fps_drops_total',
      help: 'Total WebGL FPS drops reported by client telemetry',
      labelNames: ['scene'],
      registers: [this.registry],
    });

    this.frontendFpsMinGauge = new client.Gauge({
      name: 'civora_frontend_fps_min',
      help: 'Lowest sampled FPS per WebGL scene reported from browser telemetry',
      labelNames: ['scene'],
      registers: [this.registry],
    });

    this.frontendInpDurationMs = new client.Histogram({
      name: 'civora_frontend_inp_milliseconds',
      help: 'Browser Interaction to Next Paint (INP) latency in milliseconds',
      buckets: [16, 40, 80, 120, 200, 350, 500, 1000, 2500],
      registers: [this.registry],
    });

    this.frontendWebVitalHistogram = new client.Histogram({
      name: 'civora_frontend_web_vital_value',
      help: 'Web Vitals values captured in browser telemetry',
      labelNames: ['metric'],
      buckets: [0.05, 0.1, 0.25, 25, 100, 250, 500, 1000, 2500, 4000],
      registers: [this.registry],
    });

    this.frontendWsCoalescedTotal = new client.Counter({
      name: 'civora_frontend_ws_coalesced_events_total',
      help: 'Total WebSocket events coalesced by RealtimeEventBatcher on client',
      registers: [this.registry],
    });

    this.frontendWsDroppedTotal = new client.Counter({
      name: 'civora_frontend_ws_dropped_events_total',
      help: 'Total WebSocket ticket IDs shed by RealtimeEventBatcher queue cap on client',
      registers: [this.registry],
    });

    this.redisCircuitOpenTotal = new client.Counter({
      name: 'civora_redis_circuit_open_total',
      help: 'Total times Redis circuit breaker tripped open triggering PostgreSQL fallback',
      labelNames: ['operation'],
      registers: [this.registry],
    });

    this.redisCircuitState = new client.Gauge({
      name: 'civora_redis_circuit_state',
      help: 'Current Redis circuit breaker state (0=closed, 0.5=half_open, 1=open)',
      labelNames: ['breaker'],
      registers: [this.registry],
    });
  }

  async getMetricsText(): Promise<string> {
    return this.registry.metrics();
  }
}
