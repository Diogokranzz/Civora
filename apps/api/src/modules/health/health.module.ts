import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Module,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { MetricsService } from '../../shared/infrastructure/metrics.service';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { RedisService } from '../../shared/infrastructure/redis.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { Public } from '../identity/auth.decorators';

const clientTelemetrySchema = z.object({
  fpsDrops: z
    .array(
      z.object({
        scene: z.string().min(1).max(60),
        fps: z.number().min(0).max(240),
        maxFrameMs: z.number().min(0).max(30000),
      }),
    )
    .max(50)
    .optional(),
  vitals: z
    .array(
      z.object({
        name: z.enum(['LCP', 'FID', 'CLS', 'INP', 'FCP', 'TTFB']),
        value: z.number().min(0).max(120_000),
      }),
    )
    .max(20)
    .optional(),
  backpressure: z
    .object({
      coalescedCount: z.number().int().min(0).max(100_000),
      droppedCount: z.number().int().min(0).max(100_000),
    })
    .optional(),
});

function normalizeSceneLabel(scene: string): string {
  if (scene.includes('cmdb-topology')) return 'cmdb-topology-graph';
  if (scene.includes('kpi') || scene.includes('empty')) return 'spatial-surface';
  return 'other';
}

@ApiTags('Health & Observability')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  @Public()
  @Get('health/live')
  liveness() {
    return { status: 'ok', service: 'civora-api', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('health/ready')
  async readiness() {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    const redisOk = await this.redis.ping();
    if (!dbOk) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        checks: { postgres: dbOk, redis: redisOk },
      });
    }

    return {
      status: redisOk ? 'ready' : 'degraded_redis',
      checks: { postgres: dbOk, redis: redisOk },
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async prometheusMetrics() {
    return this.metrics.getMetricsText();
  }

  @Public()
  @Post('api/v1/telemetry/client')
  @HttpCode(202)
  @Throttle({ default: { limit: 6000, ttl: 60_000 } })
  ingestClientTelemetry(
    @Body(new ZodValidationPipe(clientTelemetrySchema))
    body: z.infer<typeof clientTelemetrySchema>,
  ) {
    for (const drop of body.fpsDrops ?? []) {
      const scene = normalizeSceneLabel(drop.scene);
      this.metrics.frontendFpsDropsTotal.inc({ scene });
      this.metrics.frontendFpsMinGauge.set({ scene }, drop.fps);
    }

    for (const vital of body.vitals ?? []) {
      this.metrics.frontendWebVitalHistogram.observe({ metric: vital.name }, vital.value);
      if (vital.name === 'INP') {
        this.metrics.frontendInpDurationMs.observe(vital.value);
      }
    }

    if (body.backpressure) {
      if (body.backpressure.coalescedCount > 0) {
        this.metrics.frontendWsCoalescedTotal.inc(body.backpressure.coalescedCount);
      }
      if (body.backpressure.droppedCount > 0) {
        this.metrics.frontendWsDroppedTotal.inc(body.backpressure.droppedCount);
      }
    }

    return { accepted: true };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
