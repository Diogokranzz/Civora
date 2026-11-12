import type { ProblemDetails } from '@civora/types';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ProblemDetails,
  ) {
    super(problem.detail || problem.title);
    this.name = 'ApiClientError';
  }
}

export function createProblemError(
  status: number,
  title: string,
  detail: string,
  instance: string,
  code?: string,
): ApiClientError {
  return new ApiClientError(status, {
    type: 'about:blank',
    title,
    status,
    detail,
    instance,
    correlationId:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `demo-${Date.now()}`,
    ...(code ? { code } : {}),
  });
}
