import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import {
  type OutboxJobPayload,
  processAutomationJob,
  processEmailJob,
  processSlaEvaluationTick,
  processWebhookJob,
  relayOutboxBatch,
  WORKER_QUEUE_NAMES,
} from './processors';

const logger = pino({
  name: 'civora-worker',
  level: process.env.LOG_LEVEL || 'info',
});

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const automationsQueue = new Queue(WORKER_QUEUE_NAMES.AUTOMATIONS, { connection });
  const webhooksQueue = new Queue(WORKER_QUEUE_NAMES.WEBHOOKS, { connection });
  const emailQueue = new Queue(WORKER_QUEUE_NAMES.EMAIL, { connection });
  const slaQueue = new Queue(WORKER_QUEUE_NAMES.SLA_EVALUATION, { connection });
  const dlqQueue = new Queue(WORKER_QUEUE_NAMES.DEAD_LETTER, { connection });

  await slaQueue.upsertJobScheduler(
    'sla-periodic-tick',
    { every: 60_000 },
    { name: 'evaluate-sla-clocks', data: {} },
  );

  const automationWorker = new Worker<OutboxJobPayload>(
    WORKER_QUEUE_NAMES.AUTOMATIONS,
    async (job) => processAutomationJob({ prisma, emailQueue, job, logger }),
    { connection, concurrency: 5 },
  );

  const webhookWorker = new Worker<OutboxJobPayload>(
    WORKER_QUEUE_NAMES.WEBHOOKS,
    async (job) => processWebhookJob(prisma, job),
    { connection, concurrency: 5 },
  );

  const emailWorker = new Worker<{ to: string; subject: string; text: string }>(
    WORKER_QUEUE_NAMES.EMAIL,
    async (job) => processEmailJob(job, logger),
    { connection, concurrency: 5 },
  );

  const slaWorker = new Worker(
    WORKER_QUEUE_NAMES.SLA_EVALUATION,
    async () => processSlaEvaluationTick(prisma, logger),
    { connection, concurrency: 1 },
  );

  for (const [name, worker] of [
    ['automations', automationWorker],
    ['webhooks', webhookWorker],
    ['email', emailWorker],
    ['sla', slaWorker],
  ] as const) {
    worker.on('failed', async (job, err) => {
      logger.error({ queue: name, jobId: job?.id, err: err.message }, 'Worker job failed');
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        await dlqQueue.add('dead-letter-record', {
          originalQueue: name,
          jobId: job.id,
          data: job.data,
          error: err.message,
          failedAt: new Date().toISOString(),
        });
      }
    });
  }

  let running = true;
  const outboxTimer = setInterval(() => {
    if (!running) return;
    void relayOutboxBatch({ prisma, automationsQueue, webhooksQueue, logger });
  }, 2000);

  logger.info('Civora BullMQ Worker started');

  const shutdown = async () => {
    running = false;
    clearInterval(outboxTimer);
    await Promise.all([
      automationWorker.close(),
      webhookWorker.close(),
      emailWorker.close(),
      slaWorker.close(),
      automationsQueue.close(),
      webhooksQueue.close(),
      emailQueue.close(),
      slaQueue.close(),
      dlqQueue.close(),
    ]);
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main();

