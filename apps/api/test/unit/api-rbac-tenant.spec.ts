import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module';
import { AuthAndTenantGuard } from '../../src/modules/identity/auth-tenant.guard';
import { TokenService } from '../../src/modules/identity/token.service';
import { IdempotencyService } from '../../src/shared/infrastructure/idempotency.service';
import { PrismaService } from '../../src/shared/infrastructure/prisma.service';
import { RedisService } from '../../src/shared/infrastructure/redis.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '99999999-9999-4999-8999-999999999999';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function invokeExpress(
  expressApp: Express,
  opts: { method: string; url: string; headers?: Record<string, string> },
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: unknown }> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = opts.method;
    req.url = opts.url;
    req.headers = {};
    for (const [k, v] of Object.entries(opts.headers ?? {})) {
      req.headers[k.toLowerCase()] = v;
    }

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = ((chunk: unknown, ...args: unknown[]) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return (origWrite as (...a: unknown[]) => boolean)(chunk, ...args);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...args: unknown[]) => {
      if (chunk && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed: unknown = raw;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = raw;
      }
      resolve({
        status: res.statusCode,
        headers: res.getHeaders() as Record<string, string | string[] | undefined>,
        body: parsed,
      });
      return (origEnd as (...a: unknown[]) => ServerResponse)(chunk, ...args);
    }) as typeof res.end;

    expressApp(req, res);
    req.push(null);
    res.on('error', reject);
  });
}

describe('HTTP Security: Multi-Tenant Isolation, RBAC & Problem Details', () => {
  let app: INestApplication;
  let expressApp: Express;
  const tokenService = new TokenService();

  const mockPrisma = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    membership: {
      findUnique: vi.fn(({ where }: { where: { organizationId_userId: { organizationId: string } } }) => {
        if (where.organizationId_userId.organizationId === ORG_A) {
          return Promise.resolve({
            id: 'mem-1',
            organizationId: ORG_A,
            userId: USER_ID,
            defaultUnitId: null,
            isActive: true,
            role: {
              code: 'Requester',
              rolePermissions: [],
            },
            user: {
              id: USER_ID,
              email: 'requester@civora.local',
              name: 'Solicitante Teste',
              isPlatformAdmin: false,
              anonymizedAt: null,
            },
          });
        }
        return Promise.resolve(null);
      }),
    },
    ticket: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  const mockRedis = {
    ping: vi.fn().mockResolvedValue(true),
    client: {
      get: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
      del: vi.fn(),
      quit: vi.fn(),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .overrideProvider(AuthAndTenantGuard)
      .useFactory({
        factory: (reflector: Reflector) =>
          new AuthAndTenantGuard(
            reflector,
            tokenService,
            mockPrisma as unknown as PrismaService,
          ),
        inject: [Reflector],
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    expressApp = app.getHttpAdapter().getInstance() as Express;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns RFC 9457 Problem Details 401 with correlationId when unauthenticated', async () => {
    const res = await invokeExpress(expressApp, { method: 'GET', url: '/api/v1/tickets' });
    expect(res.status).toBe(401);
    expect(String(res.headers['content-type'])).toContain('application/problem+json');
    const body = res.body as { status: number; correlationId: string };
    expect(body.status).toBe(401);
    expect(body.correlationId).toBeTruthy();
  });

  it('returns 403 Forbidden when user lacks required RBAC permission', async () => {
    const token = await tokenService.signAccessToken({
      sub: USER_ID,
      email: 'requester@civora.local',
      name: 'Solicitante Teste',
      orgId: ORG_A,
      unitId: null,
      role: 'Requester',
      isPlatformAdmin: false,
    });

    const res = await invokeExpress(expressApp, {
      method: 'GET',
      url: '/api/v1/audit/logs',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(403);
    const body = res.body as { status: number; detail: string };
    expect(body.status).toBe(403);
    expect(body.detail).toContain('audit:read');
  });

  it('blocks cross-tenant access via x-organization-id header with 403', async () => {
    const token = await tokenService.signAccessToken({
      sub: USER_ID,
      email: 'requester@civora.local',
      name: 'Solicitante Teste',
      orgId: ORG_A,
      unitId: null,
      role: 'Requester',
      isPlatformAdmin: false,
    });

    const res = await invokeExpress(expressApp, {
      method: 'GET',
      url: '/api/v1/tickets',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-organization-id': ORG_B,
      },
    });

    expect(res.status).toBe(403);
    const body = res.body as { detail: string };
    expect(body.detail).toContain('active membership');
  });

  it('automatically scopes Requester ticket queries to requesterId in real TicketsService', async () => {
    const { TicketsService } = await import('../../src/modules/tickets/tickets.service');
    const svc = new TicketsService(
      mockPrisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await svc.listTickets(
      {
        userId: USER_ID,
        email: 'requester@civora.local',
        name: 'Solicitante Teste',
        isPlatformAdmin: false,
        organizationId: ORG_A,
        unitId: null,
        roleCode: 'Requester',
        permissions: ['tickets:read'],
      },
      { page: 1, pageSize: 20 },
    );

    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: ORG_A,
          requesterId: USER_ID,
        }),
      }),
    );
  });

  it('prevents duplicate creation with IdempotencyService and rejects payload mismatch', async () => {
    const store = new Map<string, { requestHash: string; responseBody: unknown; expiresAt: Date }>();
    const idempPrisma = {
      idempotencyKey: {
        findUnique: vi.fn(({ where }: { where: { tenantId_actorId_idempotencyKey_method_path: { idempotencyKey: string } } }) =>
          Promise.resolve(store.get(where.tenantId_actorId_idempotencyKey_method_path.idempotencyKey) ?? null),
        ),
        upsert: vi.fn(({ where, create }: { where: { tenantId_actorId_idempotencyKey_method_path: { idempotencyKey: string } }; create: { requestHash: string; responseBody: unknown; expiresAt: Date } }) => {
          store.set(where.tenantId_actorId_idempotencyKey_method_path.idempotencyKey, create);
          return Promise.resolve(create);
        }),
      },
    };
    const idemp = new IdempotencyService(idempPrisma as unknown as PrismaService);
    const handler = vi.fn().mockResolvedValue({ id: 'ticket-1' });

    const first = await idemp.execute({
      tenantId: ORG_A,
      actorId: USER_ID,
      idempotencyKey: 'idem-123',
      method: 'POST',
      path: '/api/v1/tickets',
      payload: { title: 'VPN falha' },
      handler,
    });
    const replay = await idemp.execute({
      tenantId: ORG_A,
      actorId: USER_ID,
      idempotencyKey: 'idem-123',
      method: 'POST',
      path: '/api/v1/tickets',
      payload: { title: 'VPN falha' },
      handler,
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    await expect(
      idemp.execute({
        tenantId: ORG_A,
        actorId: USER_ID,
        idempotencyKey: 'idem-123',
        method: 'POST',
        path: '/api/v1/tickets',
        payload: { title: 'Payload diferente' },
        handler,
      }),
    ).rejects.toThrow();
  });

  it('enforces non-admin roles during public self-registration and issues session for valid roles', async () => {
    const { IdentityService } = await import('../../src/modules/identity/identity.service');
    const regPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'new-user-1',
          email: 'agente.novo@civora.local',
          name: 'Agente Novo',
          avatarUrl: null,
          mfaEnabled: false,
          isPlatformAdmin: false,
          memberships: [
            {
              organizationId: ORG_A,
              defaultUnitId: null,
              organization: { name: 'Civora Corporativo', slug: 'civora-corporativo' },
              role: { code: 'Agent', rolePermissions: [] },
            },
          ],
        }),
      },
      organization: {
        findFirst: vi.fn().mockResolvedValue({ id: ORG_A, name: 'Civora Corporativo', slug: 'civora-corporativo' }),
      },
      role: {
        findUnique: vi.fn().mockResolvedValue({ id: 'role-agent', code: 'Agent' }),
      },
      refreshToken: {
        create: vi.fn().mockResolvedValue({ id: 'rt-1' }),
      },
    };
    const auditMock = { record: vi.fn().mockResolvedValue(undefined) };
    const cryptoMock = {
      hashPassword: vi.fn().mockResolvedValue('hashed-pwd'),
      hashToken: vi.fn().mockReturnValue('token-hash'),
    };
    const identitySvc = new IdentityService(
      regPrisma as unknown as PrismaService,
      {} as unknown as RedisService,
      cryptoMock as never,
      tokenService,
      auditMock as never,
    );

    await expect(
      identitySvc.register({
        name: 'Tentativa Admin',
        email: 'admin.evil@civora.local',
        password: 'Password@123',
        roleCode: 'Administrator' as never,
      }),
    ).rejects.toThrow(/não-administrativas/i);

    const registered = await identitySvc.register({
      name: 'Agente Novo',
      email: 'agente.novo@civora.local',
      password: 'Password@123',
      roleCode: 'Agent',
    });

    expect(registered.user.memberships[0]?.roleCode).toBe('Agent');
    expect(registered.accessToken).toBeTruthy();
    expect(regPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isPlatformAdmin: false,
        }),
      }),
    );
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_SELF_REGISTERED' }),
    );
  });

  it('audits and enforces tenant scope when deleting tickets', async () => {
    const { TicketsService } = await import('../../src/modules/tickets/tickets.service');
    const ticketPrisma = {
      ticket: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: 't-1',
            tenantId: ORG_A,
            publicNumber: 'CIV-2026-000099',
            title: 'Chamado temporário',
            status: 'NEW',
            priority: 'P3_MEDIUM',
            requesterId: USER_ID,
          })
          .mockResolvedValueOnce(null),
        delete: vi.fn().mockResolvedValue({ id: 't-1' }),
      },
    };
    const auditMock = { record: vi.fn().mockResolvedValue(undefined) };
    const realtimeMock = { emitToTenant: vi.fn() };
    const svc = new TicketsService(
      ticketPrisma as unknown as PrismaService,
      {} as never,
      auditMock as never,
      {} as never,
      {} as never,
      realtimeMock as never,
      {} as never,
    );

    const adminAuth = {
      userId: USER_ID,
      email: 'admin@civora.local',
      name: 'Admin',
      isPlatformAdmin: false,
      organizationId: ORG_A,
      unitId: null,
      roleCode: 'Administrator' as const,
      permissions: ['tickets:read_all', 'tickets:update'] as const,
    };

    const deleted = await svc.deleteTicket(adminAuth, 't-1');
    expect(deleted).toEqual({ deleted: true, id: 't-1' });
    expect(ticketPrisma.ticket.delete).toHaveBeenCalledWith({ where: { id: 't-1' } });
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TICKET_DELETED', resourceId: 't-1' }),
    );

    await expect(svc.deleteTicket({ ...adminAuth, organizationId: ORG_B }, 't-1')).rejects.toThrow();
  });
});
