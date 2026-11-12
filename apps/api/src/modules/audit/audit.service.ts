import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { getRequestContext } from '../../shared/infrastructure/correlation.middleware';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'mfaSecret',
  'mfaSecretEncrypted',
  'secret',
  'secretEncrypted',
  'accessToken',
  'refreshToken',
  'tokenHash',
]);

function redactObject(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactObject);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactObject(v);
    }
  }
  return out;
}

export interface RecordAuditParams {
  tenantId: string;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  origin?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    params: RecordAuditParams,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const reqCtx = getRequestContext();
    const client = tx ?? this.prisma;

    await client.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId ?? reqCtx?.actorId ?? null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        beforeState: params.beforeState
          ? (redactObject(params.beforeState) as Prisma.InputJsonValue)
          : undefined,
        afterState: params.afterState
          ? (redactObject(params.afterState) as Prisma.InputJsonValue)
          : undefined,
        ipAddress: reqCtx?.ipAddress ?? null,
        userAgent: reqCtx?.userAgent ?? null,
        correlationId: reqCtx?.correlationId ?? null,
        origin: params.origin ?? 'API',
      },
    });
  }
}

