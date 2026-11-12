import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContextData {
  correlationId: string;
  causationId?: string;
  tenantId?: string;
  actorId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContextData>();

export function getRequestContext(): RequestContextData | undefined {
  return requestContextStorage.getStore();
}

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const headerCorr = req.header('x-correlation-id');
    const correlationId =
      headerCorr && /^[a-zA-Z0-9_-]{8,64}$/.test(headerCorr) ? headerCorr : randomUUID();
    const causationId = req.header('x-causation-id') || undefined;

    res.setHeader('x-correlation-id', correlationId);

    const context: RequestContextData = {
      correlationId,
      causationId,
      ipAddress: req.ip || req.socket.remoteAddress || undefined,
      userAgent: req.header('user-agent') || undefined,
    };

    requestContextStorage.run(context, () => next());
  }
}

