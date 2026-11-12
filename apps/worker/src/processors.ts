import { createDecipheriv, createHmac, hkdfSync, randomUUID } from 'node:crypto';
import {
  BULLMQ_QUEUES,
  checkAutomationLoopProtection,
  evaluateAllConditions,
  SlaClockCalculator,
  type BusinessCalendarConfig,
} from '@civora/config';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
  PriorityLevel,
  TicketStatus,
} from '@civora/types';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import nodemailer from 'nodemailer';
import type { Logger } from 'pino';

export interface OutboxJobPayload {
  outboxEventId: string;
  tenantId: string;
  eventType: string;
  aggregateId: string;
  correlationId: string;
  payload: Record<string, unknown>;
  depth?: number;
  executedRuleIds?: string[];
}

const EVENT_TO_TRIGGER: Record<string, AutomationTrigger> = {
  TicketCreated: 'TICKET_CREATED',
  TicketStatusChanged: 'TICKET_STATUS_CHANGED',
  TicketPriorityChanged: 'TICKET_PRIORITY_CHANGED',
  TicketAssigned: 'TICKET_ASSIGNEE_CHANGED',
  SlaWarningReached: 'SLA_WARNING_REACHED',
  SlaBreached: 'SLA_BREACHED',
  CommentAdded: 'COMMENT_ADDED',
  ApprovalResponded: 'APPROVAL_RESPONDED',
};

function decryptWebhookSecret(cipherText: string): string {
  const [ivB64, tagB64, dataB64] = cipherText.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted webhook secret');
  }
  const master =
    process.env.JWT_ACCESS_SECRET || 'civora-dev-access-secret-change-in-production-32chars-min';
  const key = Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(master, 'utf8'),
      Buffer.from('civora-aes-salt'),
      Buffer.from('civora-field-encryption'),
      32,
    ),
  );
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export async function relayOutboxBatch(params: {
  prisma: PrismaClient;
  automationsQueue: Queue;
  webhooksQueue: Queue;
  logger: Logger;
}): Promise<number> {
  const { prisma, automationsQueue, webhooksQueue, logger } = params;
  const events = await prisma.outboxEvent.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  for (const ev of events) {
    try {
      const payload = (ev.payload as Record<string, unknown>) ?? {};
      const jobData: OutboxJobPayload = {
        outboxEventId: ev.id,
        tenantId: ev.tenantId,
        eventType: ev.eventType,
        aggregateId: ev.aggregateId,
        correlationId: ev.correlationId,
        payload,
        depth: Number(payload._automationDepth ?? 0),
        executedRuleIds: Array.isArray(payload._executedRuleIds)
          ? (payload._executedRuleIds as string[])
          : [],
      };

      if (EVENT_TO_TRIGGER[ev.eventType]) {
        await automationsQueue.add('evaluate-rules', jobData, {
          jobId: `auto-${ev.id}`,
          attempts: 4,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 500,
        });
      }

      await webhooksQueue.add('dispatch-webhook', jobData, {
        jobId: `wh-${ev.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 500,
      });

      await prisma.outboxEvent.update({
        where: { id: ev.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    } catch (err) {
      const attempts = ev.attempts + 1;
      const dead = attempts >= 5;
      await prisma.outboxEvent.update({
        where: { id: ev.id },
        data: {
          attempts,
          status: dead ? 'DEAD_LETTER' : 'PENDING',
          nextAttemptAt: new Date(Date.now() + Math.pow(2, attempts) * 5000),
          lastError: err instanceof Error ? err.message : String(err),
        },
      });
      logger.error({ outboxEventId: ev.id, err }, 'Failed to relay outbox event');
    }
  }

  return events.length;
}

export async function processSlaEvaluationTick(
  prisma: PrismaClient,
  logger: Logger,
): Promise<number> {
  const now = new Date();
  const instances = await prisma.slaInstance.findMany({
    where: { state: { in: ['ACTIVE', 'WARNING'] } },
    include: {
      policy: {
        include: {
          targets: true,
          calendar: { include: { businessHours: true, holidays: true } },
        },
      },
    },
    take: 200,
  });

  let updatedCount = 0;
  for (const row of instances) {
    const target = row.policy.targets.find((t) => t.priority === row.priority);
    if (!target) continue;

    const calendar: BusinessCalendarConfig = {
      timezone: row.policy.calendar.timezone,
      shifts: row.policy.calendar.businessHours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
      })),
      holidayDates: row.policy.calendar.holidays.map((h) => h.date.toISOString().slice(0, 10)),
    };

    const pausedMin = Math.floor(Number(row.accumulatedPauseMs) / 60_000);
    const rawElapsed = SlaClockCalculator.calculateBusinessMinutesBetween(
      row.startedAt,
      now,
      calendar,
    );
    const elapsedMin = Math.max(0, rawElapsed - pausedMin);
    const pct =
      target.resolutionMinutes > 0 ? (elapsedMin / target.resolutionMinutes) * 100 : 100;

    const isBreached = !row.breachedAt && now.getTime() > row.resolutionDueAt.getTime();
    const isWarning = !row.warningTriggeredAt && pct >= target.warningThresholdPct;
    const isEscalation = !row.escalationTriggeredAt && pct >= target.escalationThresholdPct;

    if (!isBreached && !isWarning && !isEscalation && elapsedMin === row.elapsedBusinessMin) {
      continue;
    }

    const correlationId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.slaInstance.update({
        where: { id: row.id },
        data: {
          elapsedBusinessMin: elapsedMin,
          ...(isBreached ? { breachedAt: now, state: 'BREACHED' } : {}),
          ...(isWarning && !isBreached
            ? { warningTriggeredAt: now, state: 'WARNING' }
            : {}),
          ...(isEscalation ? { escalationTriggeredAt: now } : {}),
          version: { increment: 1 },
        },
      });

      if (isWarning) {
        await tx.slaClockEvent.create({
          data: {
            slaInstanceId: row.id,
            eventType: 'SlaWarningReached',
            occurredAt: now,
            reason: `Consumo atingiu ${Math.round(pct)}%`,
            elapsedBusinessMinutes: elapsedMin,
          },
        });
        await tx.outboxEvent.create({
          data: {
            id: randomUUID(),
            tenantId: row.tenantId,
            aggregateType: 'SlaInstance',
            aggregateId: row.ticketId,
            eventType: 'SlaWarningReached',
            eventVersion: 1,
            payload: { ticketId: row.ticketId, consumedPercent: Math.round(pct) },
            correlationId,
          },
        });
      }

      if (isBreached) {
        await tx.slaClockEvent.create({
          data: {
            slaInstanceId: row.id,
            eventType: 'SlaBreached',
            occurredAt: now,
            reason: 'Prazo de resolução expirado',
            elapsedBusinessMinutes: elapsedMin,
          },
        });
        await tx.outboxEvent.create({
          data: {
            id: randomUUID(),
            tenantId: row.tenantId,
            aggregateType: 'SlaInstance',
            aggregateId: row.ticketId,
            eventType: 'SlaBreached',
            eventVersion: 1,
            payload: { ticketId: row.ticketId, elapsedBusinessMinutes: elapsedMin },
            correlationId,
          },
        });
      }
    });

    updatedCount += 1;
  }

  if (updatedCount > 0) {
    logger.info({ updatedCount }, 'SLA evaluation tick updated instances');
  }
  return updatedCount;
}

export async function processAutomationJob(params: {
  prisma: PrismaClient;
  emailQueue: Queue;
  job: Job<OutboxJobPayload>;
  logger: Logger;
}): Promise<void> {
  const { prisma, emailQueue, job, logger } = params;
  const trigger = EVENT_TO_TRIGGER[job.data.eventType];
  if (!trigger) return;

  const ticketId =
    (job.data.payload.ticketId as string | undefined) || job.data.aggregateId;
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId: job.data.tenantId },
    include: { assignedTeam: true, category: true, department: true },
  });
  if (!ticket) return;

  const rules = await prisma.automationRule.findMany({
    where: {
      tenantId: job.data.tenantId,
      trigger,
      isActive: true,
    },
    orderBy: { priorityOrder: 'asc' },
  });

  const depth = job.data.depth ?? 0;
  const executedRuleIds = job.data.executedRuleIds ?? [];

  const context: Record<string, unknown> = {
    ticket: {
      id: ticket.id,
      publicNumber: ticket.publicNumber,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      impact: ticket.impact,
      urgency: ticket.urgency,
      type: ticket.type,
      tags: ticket.tags,
      assigneeId: ticket.assigneeId,
      assignedTeamId: ticket.assignedTeamId,
      departmentId: ticket.departmentId,
      unitId: ticket.unitId,
    },
    event: job.data.payload,
  };

  for (const rule of rules) {
    const idempotencyKey = `${job.data.correlationId}:${rule.id}:${trigger}:${ticket.id}`;
    const alreadyRun = await prisma.automationExecution.findUnique({
      where: { idempotencyKey },
    });
    if (alreadyRun) continue;

    const loopCheck = checkAutomationLoopProtection({
      depth,
      ruleId: rule.id,
      executedRuleIdsInChain: executedRuleIds,
    });

    if (!loopCheck.allowed) {
      await prisma.automationExecution.create({
        data: {
          tenantId: rule.tenantId,
          ruleId: rule.id,
          ticketId: ticket.id,
          correlationId: job.data.correlationId,
          idempotencyKey,
          depth,
          status: 'SKIPPED_LOOP',
          errorMessage: loopCheck.reason ?? 'Loop protection triggered',
        },
      });
      continue;
    }

    const conditions = (rule.conditionsJson as unknown as AutomationCondition[]) ?? [];
    if (!evaluateAllConditions(conditions, context)) {
      continue;
    }

    const actions = (rule.actionsJson as unknown as AutomationAction[]) ?? [];
    const executedActions: string[] = [];

    try {
      for (const action of actions) {
        await executeAutomationAction({
          prisma,
          emailQueue,
          ticket,
          action,
          correlationId: job.data.correlationId,
          depth: depth + 1,
          executedRuleIds: [...executedRuleIds, rule.id],
        });
        executedActions.push(action.type);
      }

      await prisma.$transaction([
        prisma.automationExecution.create({
          data: {
            tenantId: rule.tenantId,
            ruleId: rule.id,
            ticketId: ticket.id,
            correlationId: job.data.correlationId,
            idempotencyKey,
            depth,
            status: 'SUCCEEDED',
            resultJson: { executedActions } as Prisma.InputJsonValue,
          },
        }),
        prisma.automationRule.update({
          where: { id: rule.id },
          data: { executionCount: { increment: 1 }, lastExecutedAt: new Date() },
        }),
      ]);
    } catch (err) {
      logger.error({ ruleId: rule.id, ticketId: ticket.id, err }, 'Automation execution failed');
      await prisma.automationExecution.create({
        data: {
          tenantId: rule.tenantId,
          ruleId: rule.id,
          ticketId: ticket.id,
          correlationId: job.data.correlationId,
          idempotencyKey,
          depth,
          status: 'FAILED',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }
}

async function executeAutomationAction(params: {
  prisma: PrismaClient;
  emailQueue: Queue;
  ticket: {
    id: string;
    tenantId: string;
    publicNumber: string;
    title: string;
    tags: string[];
    assignedTeamId: string | null;
    assigneeId: string | null;
    requesterId: string;
  };
  action: AutomationAction;
  correlationId: string;
  depth: number;
  executedRuleIds: string[];
}) {
  const { prisma, emailQueue, ticket, action } = params;

  switch (action.type) {
    case 'ADD_TAG': {
      const tag = String(action.params.tag ?? '').trim();
      if (tag && !ticket.tags.includes(tag)) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { tags: [...ticket.tags, tag] },
        });
      }
      break;
    }
    case 'SET_PRIORITY': {
      const priority = action.params.priority as PriorityLevel | undefined;
      if (priority) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { priority },
        });
      }
      break;
    }
    case 'CHANGE_STATUS': {
      const status = action.params.status as TicketStatus | undefined;
      if (status) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { status },
        });
      }
      break;
    }
    case 'ASSIGN_TEAM': {
      const teamId = String(action.params.teamId ?? '');
      if (teamId) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { assignedTeamId: teamId },
        });
      }
      break;
    }
    case 'ASSIGN_AGENT': {
      const assigneeId = String(action.params.assigneeId ?? '');
      if (assigneeId) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { assigneeId },
        });
      }
      break;
    }
    case 'ADD_INTERNAL_NOTE': {
      const note = String(action.params.note ?? 'Nota automática de regra Civora.');
      await prisma.ticketComment.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          authorId: ticket.assigneeId ?? ticket.requesterId,
          bodyHtml: `<p>${note}</p>`,
          bodyText: note,
          isInternal: true,
        },
      });
      break;
    }
    case 'ESCALATE_SUPERVISOR': {
      if (ticket.assignedTeamId) {
        const team = await prisma.team.findUnique({ where: { id: ticket.assignedTeamId } });
        if (team?.supervisorId) {
          await prisma.notification.create({
            data: {
              tenantId: ticket.tenantId,
              userId: team.supervisorId,
              title: `Escalonamento automático: ${ticket.publicNumber}`,
              message: `O chamado "${ticket.title}" foi escalonado automaticamente.`,
              category: 'SLA_ESCALATION',
              ticketId: ticket.id,
            },
          });
        }
      }
      break;
    }
    case 'SEND_NOTIFICATION': {
      const targetUserId = String(action.params.userId ?? ticket.assigneeId ?? ticket.requesterId);
      const title = String(action.params.title ?? `Atualização: ${ticket.publicNumber}`);
      const message = String(action.params.message ?? ticket.title);
      await prisma.notification.create({
        data: {
          tenantId: ticket.tenantId,
          userId: targetUserId,
          title,
          message,
          category: 'AUTOMATION',
          ticketId: ticket.id,
        },
      });
      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { email: true },
      });
      if (user?.email) {
        await emailQueue.add(
          'send-email',
          { to: user.email, subject: title, text: message },
          { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
        );
      }
      break;
    }
    default:
      break;
  }
}

export async function processWebhookJob(
  prisma: PrismaClient,
  job: Job<OutboxJobPayload>,
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      tenantId: job.data.tenantId,
      isActive: true,
      events: { has: job.data.eventType },
    },
  });

  for (const endpoint of endpoints) {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      eventType: job.data.eventType,
      correlationId: job.data.correlationId,
      timestamp,
      data: job.data.payload,
    });
    const secret = decryptWebhookSecret(endpoint.secretEncrypted);
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    let responseCode: number | null = null;
    let responseBody: string | null = null;
    let status = 'DELIVERED';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-civora-signature': `t=${timestamp},v1=${signature}`,
          'x-correlation-id': job.data.correlationId,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      responseCode = res.status;
      responseBody = (await res.text()).slice(0, 1000);
      if (!res.ok) status = 'FAILED';
    } catch (err) {
      status = 'FAILED';
      responseBody = err instanceof Error ? err.message : String(err);
    }

    await prisma.webhookDelivery.create({
      data: {
        tenantId: job.data.tenantId,
        endpointId: endpoint.id,
        eventType: job.data.eventType,
        correlationId: job.data.correlationId,
        payload: job.data.payload as Prisma.InputJsonValue,
        responseCode,
        responseBody,
        attempts: job.attemptsMade + 1,
        status,
        deliveredAt: status === 'DELIVERED' ? new Date() : null,
      },
    });

    if (status === 'FAILED') {
      throw new Error(`Webhook delivery failed with HTTP ${responseCode ?? 'NETWORK_ERR'}`);
    }
  }
}

export async function processEmailJob(
  job: Job<{ to: string; subject: string; text: string }>,
  logger: Logger,
): Promise<void> {
  if (process.env.EMAIL_PROVIDER !== 'smtp') {
    logger.info({ to: job.data.to, subject: job.data.subject }, 'Console email dispatched');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT || 1025),
    secure: process.env.SMTP_SECURE === 'true',
    ...(process.env.SMTP_USER
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
      : {}),
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'Civora Platform <noreply@civora.local>',
    to: job.data.to,
    subject: job.data.subject,
    text: job.data.text,
  });
}

export const WORKER_QUEUE_NAMES = BULLMQ_QUEUES;

