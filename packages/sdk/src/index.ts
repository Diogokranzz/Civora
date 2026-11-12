import type {
  AuthenticatedUser,
  CursorPaginatedResponse,
  DashboardMetricsDto,
  KnowledgeArticleDto,
  PaginatedResponse,
  ProblemDetails,
  TicketDetailDto,
  TicketSummaryDto,
  TicketTimelineEventDto,
} from '@civora/types';

export class CivoraApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ProblemDetails,
  ) {
    super(problem.detail || problem.title);
    this.name = 'CivoraApiError';
  }
}

export interface CivoraClientOptions {
  baseUrl: string;
  getOrganizationId?: () => string | null;
  getAccessToken?: () => string | null;
  fetchImpl?: typeof fetch;
}

export class CivoraClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getOrganizationId?: () => string | null;
  private readonly getAccessToken?: () => string | null;

  constructor(options: CivoraClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.getOrganizationId = options.getOrganizationId;
    this.getAccessToken = options.getAccessToken;
  }

  private async request<T>(
    path: string,
    init: RequestInit & { idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    const orgId = this.getOrganizationId?.();
    if (orgId && !headers.has('x-organization-id')) {
      headers.set('x-organization-id', orgId);
    }
    const token = this.getAccessToken?.();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (init.idempotencyKey) {
      headers.set('Idempotency-Key', init.idempotencyKey);
    }
    if (!headers.has('x-correlation-id')) {
      headers.set('x-correlation-id', crypto.randomUUID());
    }

    const res = await this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      let problem: ProblemDetails;
      try {
        problem = (await res.json()) as ProblemDetails;
      } catch {
        problem = {
          type: 'about:blank',
          title: res.statusText || 'Request failed',
          status: res.status,
          detail: `HTTP ${res.status}`,
          instance: path,
          correlationId: headers.get('x-correlation-id') ?? '',
        };
      }
      throw new CivoraApiError(res.status, problem);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return (await res.json()) as T;
  }

  login(input: { email: string; password: string; mfaCode?: string }) {
    return this.request<{ user: AuthenticatedUser; accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  logout() {
    return this.request<void>('/auth/logout', { method: 'POST' });
  }

  me() {
    return this.request<AuthenticatedUser>('/auth/me');
  }

  switchOrganization(organizationId: string, unitId?: string | null) {
    return this.request<{ user: AuthenticatedUser; accessToken: string }>(
      '/auth/switch-organization',
      {
        method: 'POST',
        body: JSON.stringify({ organizationId, unitId }),
      },
    );
  }

  getDashboardMetrics(params?: { unitId?: string; departmentId?: string; days?: number }) {
    const query = new URLSearchParams();
    if (params?.unitId) query.set('unitId', params.unitId);
    if (params?.departmentId) query.set('departmentId', params.departmentId);
    if (params?.days) query.set('days', String(params.days));
    const qs = query.toString();
    return this.request<DashboardMetricsDto>(`/reports/dashboard${qs ? `?${qs}` : ''}`);
  }

  listTickets(params: Record<string, string | number | undefined>) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') query.set(k, String(v));
    }
    const qs = query.toString();
    return this.request<PaginatedResponse<TicketSummaryDto>>(`/tickets${qs ? `?${qs}` : ''}`);
  }

  getTicket(id: string) {
    return this.request<TicketDetailDto>(`/tickets/${id}`);
  }

  getTicketTimeline(id: string, cursor?: string) {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return this.request<CursorPaginatedResponse<TicketTimelineEventDto>>(
      `/tickets/${id}/timeline${qs}`,
    );
  }

  createTicket(
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    return this.request<TicketDetailDto>('/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey,
    });
  }

  searchKnowledge(q: string) {
    return this.request<PaginatedResponse<KnowledgeArticleDto>>(
      `/knowledge/articles?q=${encodeURIComponent(q)}`,
    );
  }
}

