import { createHash } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  hashPayload(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex');
  }

  async execute<T>(params: {
    tenantId: string;
    actorId: string;
    idempotencyKey?: string;
    method: string;
    path: string;
    payload: unknown;
    status?: number;
    handler: () => Promise<T>;
  }): Promise<{ body: T; replayed: boolean }> {
    const key = params.idempotencyKey?.trim();
    if (!key) {
      return { body: await params.handler(), replayed: false };
    }

    const requestHash = this.hashPayload(params.payload);
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        tenantId_actorId_idempotencyKey_method_path: {
          tenantId: params.tenantId,
          actorId: params.actorId,
          idempotencyKey: key,
          method: params.method,
          path: params.path,
        },
      },
    });

    if (existing && existing.expiresAt > new Date()) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency-Key was already used with a different request payload.',
        );
      }
      return { body: existing.responseBody as T, replayed: true };
    }

    const body = await params.handler();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.idempotencyKey.upsert({
      where: {
        tenantId_actorId_idempotencyKey_method_path: {
          tenantId: params.tenantId,
          actorId: params.actorId,
          idempotencyKey: key,
          method: params.method,
          path: params.path,
        },
      },
      create: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        idempotencyKey: key,
        method: params.method,
        path: params.path,
        requestHash,
        responseStatus: params.status ?? 201,
        responseBody: body as Prisma.InputJsonValue,
        expiresAt,
      },
      update: {
        requestHash,
        responseStatus: params.status ?? 201,
        responseBody: body as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    return { body, replayed: false };
  }
}

