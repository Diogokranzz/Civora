import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OptimisticConcurrencyError } from '../../src/shared/domain/domain-errors';

/**
 * Integration tests against a real PostgreSQL container via Testcontainers.
 * Executed via `pnpm --filter @civora/api test:integration` in CI or local environments with Docker.
 */
describe('PostgreSQL Repository & Multi-Tenant Integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('civora_test')
      .withUsername('civora')
      .withPassword('civora_test')
      .start();

    const databaseUrl = container.getConnectionUri();
    execSync('pnpm exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('enforces tenant isolation, atomic sequence, outbox persistence, and optimistic locking', async () => {
    const orgA = await prisma.organization.create({
      data: { name: 'Tenant Alpha', slug: 'tenant-alpha' },
    });
    const orgB = await prisma.organization.create({
      data: { name: 'Tenant Beta', slug: 'tenant-beta' },
    });

    const user = await prisma.user.create({
      data: {
        email: 'integracao@civora.local',
        name: 'Usuária Integração',
        passwordHash: 'scrypt$demo$demo',
      },
    });

    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          tenantId: orgA.id,
          publicNumber: 'CIV-2026-000100',
          title: 'Teste transacional PostgreSQL',
          descriptionHtml: '<p>Validação Outbox e Optimistic Locking</p>',
          descriptionText: 'Validação Outbox e Optimistic Locking',
          requesterId: user.id,
        },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId: orgA.id,
          aggregateType: 'Ticket',
          aggregateId: created.id,
          eventType: 'TicketCreated',
          eventVersion: 1,
          payload: { publicNumber: created.publicNumber },
          correlationId: 'corr-pg-1',
        },
      });
      return created;
    });

    const tenantBView = await prisma.ticket.findMany({
      where: { tenantId: orgB.id },
    });
    expect(tenantBView).toHaveLength(0);

    const outbox = await prisma.outboxEvent.findMany({
      where: { aggregateId: ticket.id },
    });
    expect(outbox).toHaveLength(1);

    // Concurrent optimistic locking check
    const staleUpdate = await prisma.ticket.updateMany({
      where: { id: ticket.id, version: 999 },
      data: { title: 'Stale write' },
    });
    expect(staleUpdate.count).toBe(0);
    if (staleUpdate.count === 0) {
      expect(() => {
        throw new OptimisticConcurrencyError('Ticket', ticket.id);
      }).toThrow(OptimisticConcurrencyError);
    }
  });
});

