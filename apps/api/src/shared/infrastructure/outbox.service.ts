import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DomainEvent } from '../domain/aggregate-root';

@Injectable()
export class OutboxService {
  async persistEvents(
    tx: Prisma.TransactionClient,
    events: readonly DomainEvent[],
  ): Promise<void> {
    if (events.length === 0) return;

    await tx.outboxEvent.createMany({
      data: events.map((event) => ({
        id: event.eventId,
        tenantId: event.tenantId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        payload: event.payload as Prisma.InputJsonValue,
        correlationId: event.correlationId,
        causationId: event.causationId,
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
      })),
    });
  }
}

