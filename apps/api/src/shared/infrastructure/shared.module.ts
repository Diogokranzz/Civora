import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { MetricsService } from './metrics.service';
import { OutboxService } from './outbox.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    OutboxService,
    IdempotencyService,
    MetricsService,
  ],
  exports: [
    PrismaService,
    RedisService,
    OutboxService,
    IdempotencyService,
    MetricsService,
  ],
})
export class SharedInfrastructureModule {}

