import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ProblemDetails } from '@civora/types';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { DomainError } from '../domain/domain-errors';
import { getRequestContext } from './correlation.middleware';

@Catch()
export class ProblemDetailsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId =
      getRequestContext()?.correlationId ??
      (request.header('x-correlation-id') || 'unknown');

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail = 'An unexpected error occurred while processing the request.';
    let code = 'INTERNAL_ERROR';
    let errors: Array<{ field: string; message: string }> | undefined;

    if (exception instanceof DomainError) {
      status = exception.statusCode;
      title = exception.name;
      detail = exception.message;
      code = exception.code;
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      title = 'Validation Failed';
      detail = 'One or more request fields failed validation.';
      code = 'VALIDATION_ERROR';
      errors = exception.errors.map((e) => ({
        field: e.path.join('.') || 'root',
        message: e.message,
      }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      title = exception.name;
      if (typeof body === 'string') {
        detail = body;
      } else if (typeof body === 'object' && body !== null) {
        const record = body as Record<string, unknown>;
        detail =
          typeof record.message === 'string'
            ? record.message
            : Array.isArray(record.message)
              ? record.message.join('; ')
              : exception.message;
        if (typeof record.code === 'string') {
          code = record.code;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        title = 'Unique Constraint Conflict';
        detail = 'A record with the same unique identifier already exists.';
        code = 'UNIQUE_CONFLICT';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        title = 'Resource Not Found';
        detail = 'Requested resource was not found or was modified concurrently.';
        code = 'NOT_FOUND_OR_CONFLICT';
      }
    }

    if (status >= 500) {
      this.logger.error(
        {
          correlationId,
          path: request.url,
          method: request.method,
          err: exception instanceof Error ? exception.message : String(exception),
        },
        'Unhandled server exception',
      );
    }

    const problem: ProblemDetails = {
      type: `https://civora.dev/problems/${code.toLowerCase()}`,
      title,
      status,
      detail,
      instance: request.originalUrl || request.url,
      correlationId,
      code,
      ...(errors ? { errors } : {}),
    };

    response.status(status).type('application/problem+json').json(problem);
  }
}

