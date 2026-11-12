import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const start = process.hrtime.bigint();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: () => this.observe(req, res, start),
        error: () => this.observe(req, res, start),
      }),
    );
  }

  private observe(req: Request, res: Response, start: bigint): void {
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path ? String(req.route.path) : req.path;
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode || 200),
    };
    this.metrics.httpRequestsTotal.inc(labels);
    this.metrics.httpRequestDuration.observe(labels, durationSec);
  }
}

