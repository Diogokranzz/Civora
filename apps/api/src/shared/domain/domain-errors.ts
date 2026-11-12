export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 422,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(from: string, to: string, reason?: string) {
    super(
      'INVALID_STATE_TRANSITION',
      reason
        ? `Invalid transition from ${from} to ${to}: ${reason}`
        : `Transition from ${from} to ${to} is not permitted.`,
      422,
    );
  }
}

export class UnauthorizedDomainActionError extends DomainError {
  constructor(message: string) {
    super('UNAUTHORIZED_ACTION', message, 403);
  }
}

export class TenantIsolationError extends DomainError {
  constructor(message = 'Cross-tenant access or assignment is prohibited.') {
    super('TENANT_ISOLATION_VIOLATION', message, 403);
  }
}

export class OptimisticConcurrencyError extends DomainError {
  constructor(resource: string, id: string) {
    super(
      'OPTIMISTIC_CONCURRENCY_CONFLICT',
      `${resource} (${id}) was modified concurrently. Refresh and retry with the latest version.`,
      409,
    );
  }
}

export class ValidationDomainError extends DomainError {
  constructor(message: string) {
    super('DOMAIN_VALIDATION_ERROR', message, 400);
  }
}

