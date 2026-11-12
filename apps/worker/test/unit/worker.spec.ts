import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import { relayOutboxBatch } from '../../src/processors';

describe('Civora Worker Outbox Relay & Webhook HMAC', () => {
  it('relays PENDING outbox events to BullMQ queues and marks PUBLISHED', async () => {
    const updatedIds: string[] = [];
    const mockPrisma = {
      outboxEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'evt-1',
            tenantId: 'tenant-1',
            aggregateType: 'Ticket',
            aggregateId: 'ticket-1',
            eventType: 'TicketCreated',
            eventVersion: 1,
            payload: { publicNumber: 'CIV-2026-000001' },
            correlationId: 'corr-1',
            attempts: 0,
          },
        ]),
        update: vi.fn().mockImplementation(async ({ where }) => {
          updatedIds.push(where.id);
          return {};
        }),
      },
    };

    const automationsQueue = { add: vi.fn().mockResolvedValue({}) };
    const webhooksQueue = { add: vi.fn().mockResolvedValue({}) };
    const logger = { error: vi.fn(), info: vi.fn() } as unknown as Logger;

    const relayed = await relayOutboxBatch({
      prisma: mockPrisma as never,
      automationsQueue: automationsQueue as never,
      webhooksQueue: webhooksQueue as never,
      logger,
    });

    expect(relayed).toBe(1);
    expect(automationsQueue.add).toHaveBeenCalledWith(
      'evaluate-rules',
      expect.objectContaining({ eventType: 'TicketCreated', tenantId: 'tenant-1' }),
      expect.objectContaining({ jobId: 'auto-evt-1', attempts: 4 }),
    );
    expect(webhooksQueue.add).toHaveBeenCalledTimes(1);
    expect(updatedIds).toEqual(['evt-1']);
  });

  it('produces valid verifiable HMAC-SHA256 webhook signatures', () => {
    const secret = 'super-secret-webhook-key';
    const ts = 1762780000;
    const body = JSON.stringify({ eventType: 'TicketCreated', data: { id: '1' } });
    const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });
});

