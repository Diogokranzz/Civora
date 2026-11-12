import type {
  AiSuggestionDto,
  ApprovalDto,
  AssetDto,
  AuditLogDto,
  AuthenticatedUser,
  AutomationRuleDto,
  ChangeDto,
  CursorPaginatedResponse,
  DashboardMetricsDto,
  KnowledgeArticleDto,
  NotificationDto,
  PaginatedResponse,
  ProblemDetails,
  ProblemDto,
  TicketDetailDto,
  TicketSummaryDto,
  TicketTimelineEventDto,
  TopologyGraphDto,
} from '@civora/types';
import { useCivoraStore } from './store';
import { traceUiInteraction } from './telemetry';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ProblemDetails,
  ) {
    super(problem.detail || problem.title);
    this.name = 'ApiClientError';
  }
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string; skipRefresh?: boolean } = {},
): Promise<T> {
  const state = useCivoraStore.getState();
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (state.accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${state.accessToken}`);
  }
  if (state.activeOrganizationId && !headers.has('x-organization-id')) {
    headers.set('x-organization-id', state.activeOrganizationId);
  }
  if (state.activeUnitId && !headers.has('x-unit-id')) {
    headers.set('x-unit-id', state.activeUnitId);
  }
  if (init.idempotencyKey) {
    headers.set('Idempotency-Key', init.idempotencyKey);
  }
  if (!headers.has('x-correlation-id')) {
    headers.set('x-correlation-id', crypto.randomUUID());
  }

  const method = (init.method || 'GET').toUpperCase();
  const performFetch = () =>
    fetch(`${API_BASE}/api/v1${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });

  const res =
    method === 'GET' || method === 'HEAD'
      ? await performFetch()
      : await traceUiInteraction(
          `${method.toLowerCase()}.${path.split('/').filter(Boolean)[0] ?? 'api'}`,
          { 'http.method': method, 'http.target': path },
          performFetch,
        );

  if (res.status === 401 && !init.skipRefresh && !path.startsWith('/auth/')) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      return apiRequest<T>(path, { ...init, skipRefresh: true });
    }
  }

  if (!res.ok) {
    let problem: ProblemDetails;
    try {
      problem = (await res.json()) as ProblemDetails;
    } catch {
      problem = {
        type: 'about:blank',
        title: res.statusText || 'HTTP Error',
        status: res.status,
        detail: `Erro HTTP ${res.status}`,
        instance: path,
        correlationId: headers.get('x-correlation-id') ?? '',
      };
    }
    throw new ApiClientError(res.status, problem);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    return (await res.text()) as unknown as T;
  }

  return (await res.json()) as T;
}

async function tryRefreshSession(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { user: AuthenticatedUser; accessToken: string };
    useCivoraStore.getState().setSession(data.user, data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export const civoraApi = {
  getApiBaseUrl: () => API_BASE,

  login: (body: { email: string; password: string; mfaCode?: string }) =>
    apiRequest<{ user: AuthenticatedUser; accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
      skipRefresh: true,
    }),

  register: (body: {
    name: string;
    email: string;
    password: string;
    roleCode: 'Requester' | 'Agent' | 'Supervisor' | 'Approver' | 'ServiceManager' | 'Auditor';
  }) =>
    apiRequest<{ user: AuthenticatedUser; accessToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
      skipRefresh: true,
    }),

  refresh: () =>
    apiRequest<{ user: AuthenticatedUser; accessToken: string }>('/auth/refresh', {
      method: 'POST',
      skipRefresh: true,
    }),

  logout: () => apiRequest<void>('/auth/logout', { method: 'POST', skipRefresh: true }),

  me: () => apiRequest<AuthenticatedUser>('/auth/me'),

  switchOrganization: (organizationId: string, unitId?: string | null) =>
    apiRequest<{ user: AuthenticatedUser; accessToken: string }>('/auth/switch-organization', {
      method: 'POST',
      body: JSON.stringify({ organizationId, unitId }),
    }),

  setupMfa: () => apiRequest<{ otpauthUrl: string; secretBase32: string }>('/auth/mfa/setup', { method: 'POST' }),

  enableMfa: (code: string) =>
    apiRequest<{ mfaEnabled: boolean }>('/auth/mfa/enable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  getDashboard: (params?: { unitId?: string; departmentId?: string; days?: number }) => {
    const qs = new URLSearchParams();
    if (params?.unitId) qs.set('unitId', params.unitId);
    if (params?.departmentId) qs.set('departmentId', params.departmentId);
    if (params?.days) qs.set('days', String(params.days));
    const q = qs.toString();
    return apiRequest<DashboardMetricsDto>(`/reports/dashboard${q ? `?${q}` : ''}`);
  },

  listTickets: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    const q = qs.toString();
    return apiRequest<PaginatedResponse<TicketSummaryDto>>(`/tickets${q ? `?${q}` : ''}`);
  },

  exportTicketsCsv: (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) qs.set(k, v);
    }
    const q = qs.toString();
    return apiRequest<string>(`/tickets/export/csv${q ? `?${q}` : ''}`);
  },

  listSavedViews: () =>
    apiRequest<Array<{ id: string; name: string; filtersJson: Record<string, unknown> }>>('/tickets/views'),

  createSavedView: (body: { name: string; filters: Record<string, unknown> }) =>
    apiRequest<{ id: string; name: string }>('/tickets/views', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getTicket: (id: string) => apiRequest<TicketDetailDto>(`/tickets/${id}`),

  getTicketTimeline: (id: string, cursor?: string) =>
    apiRequest<CursorPaginatedResponse<TicketTimelineEventDto>>(
      `/tickets/${id}/timeline${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),

  createTicket: (body: Record<string, unknown>, idempotencyKey?: string) =>
    apiRequest<TicketDetailDto>('/tickets', {
      method: 'POST',
      body: JSON.stringify(body),
      idempotencyKey,
    }),

  transitionTicket: (
    id: string,
    body: {
      targetStatus: string;
      version?: number;
      reason?: string;
      resolutionSummary?: string;
      cancellationReason?: string;
    },
  ) =>
    apiRequest<TicketDetailDto>(`/tickets/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  assignTicket: (
    id: string,
    body: { assigneeId?: string | null; teamId?: string | null; version?: number },
  ) =>
    apiRequest<TicketDetailDto>(`/tickets/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  overridePriority: (id: string, body: { priority: string; reason: string; version?: number }) =>
    apiRequest<TicketDetailDto>(`/tickets/${id}/priority-override`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  bulkUpdateTickets: (body: {
    ticketIds: string[];
    assigneeId?: string | null;
    status?: string;
    reason?: string;
  }) =>
    apiRequest<{ processed: number }>('/tickets/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  deleteTicket: (id: string) =>
    apiRequest<{ deleted: boolean; id: string }>(`/tickets/${id}`, {
      method: 'DELETE',
    }),

  bulkDeleteTickets: (body: { ticketIds: string[]; reason?: string }) =>
    apiRequest<{ processed: number; deletedCount: number }>('/tickets/bulk-delete', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  addComment: (id: string, body: { body: string; isInternal: boolean }) =>
    apiRequest(`/tickets/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  rateTicket: (id: string, body: { score: number; comment?: string }) =>
    apiRequest(`/tickets/${id}/csat`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  uploadAttachment: (ticketId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiRequest(`/tickets/${ticketId}/attachments`, {
      method: 'POST',
      body: form,
    });
  },

  runAiAssist: (ticketId: string, featureType: string) =>
    apiRequest<AiSuggestionDto>(`/ai/tickets/${ticketId}/assist`, {
      method: 'POST',
      body: JSON.stringify({ featureType }),
    }),

  decideAiSuggestion: (id: string, decision: 'ACCEPTED' | 'REJECTED') =>
    apiRequest<AiSuggestionDto>(`/ai/suggestions/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  listUnits: () =>
    apiRequest<
      Array<{
        id: string;
        name: string;
        code: string;
        timezone: string;
        address: string | null;
        isActive: boolean;
      }>
    >('/units'),
  createUnit: (body: { name: string; code: string; timezone: string; address?: string }) =>
    apiRequest<{
      id: string;
      name: string;
      code: string;
      timezone: string;
      address: string | null;
      isActive: boolean;
    }>('/units', { method: 'POST', body: JSON.stringify(body) }),
  updateUnit: (
    id: string,
    body: {
      name?: string;
      code?: string;
      timezone?: string;
      address?: string;
      isActive?: boolean;
    },
  ) =>
    apiRequest<{
      id: string;
      name: string;
      code: string;
      timezone: string;
      address: string | null;
      isActive: boolean;
    }>(`/units/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteUnit: (id: string) =>
    apiRequest<{ deleted: boolean; id: string }>(`/units/${id}`, { method: 'DELETE' }),

  listDepartments: () =>
    apiRequest<
      Array<{
        id: string;
        name: string;
        code: string;
        unitId: string | null;
        unit?: { id: string; name: string; code: string } | null;
      }>
    >('/departments'),
  createDepartment: (body: { name: string; code: string; unitId?: string | null }) =>
    apiRequest<{
      id: string;
      name: string;
      code: string;
      unitId: string | null;
    }>('/departments', { method: 'POST', body: JSON.stringify(body) }),
  updateDepartment: (
    id: string,
    body: { name?: string; code?: string; unitId?: string | null },
  ) =>
    apiRequest<{
      id: string;
      name: string;
      code: string;
      unitId: string | null;
    }>(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteDepartment: (id: string) =>
    apiRequest<{ deleted: boolean; id: string }>(`/departments/${id}`, { method: 'DELETE' }),

  listTeams: () =>
    apiRequest<
      Array<{
        id: string;
        name: string;
        departmentId: string | null;
        supervisorId: string | null;
        department?: { id: string; name: string } | null;
        supervisor?: { id: string; name: string; email?: string } | null;
        members: Array<{ user: { id: string; name: string; email: string } }>;
      }>
    >('/teams'),
  createTeam: (body: { name: string; departmentId?: string | null; supervisorId?: string | null }) =>
    apiRequest<{
      id: string;
      name: string;
      departmentId: string | null;
      supervisorId: string | null;
    }>('/teams', { method: 'POST', body: JSON.stringify(body) }),
  addTeamMember: (teamId: string, userId: string) =>
    apiRequest(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  removeTeamMember: (teamId: string, userId: string) =>
    apiRequest<{ removed: boolean }>(`/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
    }),

  listUsers: () =>
    apiRequest<
      Array<{
        membershipId: string;
        userId: string;
        email: string;
        name: string;
        avatarUrl: string | null;
        mfaEnabled: boolean;
        role: { id: string; code: string; name: string };
        defaultUnit?: { id: string; name: string; code?: string } | null;
        department?: { id: string; name: string } | null;
        isActive: boolean;
      }>
    >('/users'),
  createUser: (body: {
    email: string;
    name: string;
    password?: string;
    roleCode: string;
    defaultUnitId?: string | null;
    departmentId?: string | null;
  }) =>
    apiRequest('/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUserMembership: (
    userId: string,
    body: {
      roleCode?: string;
      defaultUnitId?: string | null;
      departmentId?: string | null;
      isActive?: boolean;
    },
  ) =>
    apiRequest(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  listRoles: () =>
    apiRequest<
      Array<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        isSystem: boolean;
      }>
    >('/roles'),

  listServices: (q?: string) =>
    apiRequest<
      Array<{
        id: string;
        name: string;
        slug: string;
        description: string;
        defaultType: string;
        defaultImpact: string;
        defaultUrgency: string;
        requiresApproval: boolean;
        category?: { id: string; name: string } | null;
        department?: { id: string; name: string } | null;
        form?: {
          fields: Array<{
            id: string;
            key: string;
            label: string;
            fieldType: string;
            required: boolean;
            placeholder: string | null;
            optionsJson: string[] | null;
          }>;
        } | null;
      }>
    >(`/catalog/services${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  listCategories: () => apiRequest<Array<{ id: string; name: string; slug: string }>>('/catalog/categories'),

  listKnowledge: (q?: string) =>
    apiRequest<PaginatedResponse<KnowledgeArticleDto>>(
      `/knowledge/articles${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    ),
  getKnowledgeArticle: (id: string) => apiRequest<KnowledgeArticleDto>(`/knowledge/articles/${id}`),
  createKnowledgeArticle: (body: Record<string, unknown>) =>
    apiRequest<KnowledgeArticleDto>('/knowledge/articles', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateKnowledgeArticle: (id: string, body: Record<string, unknown>) =>
    apiRequest<KnowledgeArticleDto>(`/knowledge/articles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  voteKnowledgeArticle: (id: string, helpful: boolean) =>
    apiRequest(`/knowledge/articles/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ helpful }),
    }),

  listCalendars: () =>
    apiRequest<
      Array<{
        id: string;
        name: string;
        timezone: string;
        isDefault: boolean;
        businessHours: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
        holidays: Array<{ id: string; date: string; name: string }>;
      }>
    >('/sla/calendars'),

  listSlaPolicies: () =>
    apiRequest<
      Array<{
        id: string;
        name: string;
        contractCode: string | null;
        isActive: boolean;
        calendar: { name: string; timezone: string };
        targets: Array<{
          priority: string;
          firstResponseMinutes: number;
          updateMinutes: number;
          resolutionMinutes: number;
          warningThresholdPct: number;
        }>;
      }>
    >('/sla/policies'),

  listAssets: () => apiRequest<AssetDto[]>('/assets'),
  getAssetsTopology: () => apiRequest<TopologyGraphDto>('/assets/topology'),
  createAsset: (body: Record<string, unknown>) =>
    apiRequest<AssetDto>('/assets', { method: 'POST', body: JSON.stringify(body) }),
  updateAsset: (id: string, body: Record<string, unknown>) =>
    apiRequest<AssetDto>(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAsset: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/assets/${id}`, { method: 'DELETE' }),
  simulateAssetCascade: (id: string, burstCount = 1) =>
    apiRequest<{
      rootAssetId: string;
      impactedNodeIds: string[];
      impactedEdgeIds: string[];
      emittedEvents: number;
    }>(`/assets/${id}/simulate-cascade`, {
      method: 'POST',
      body: JSON.stringify({ burstCount }),
    }),
  addAssetRelationship: (
    sourceId: string,
    body: { targetId: string; relationType: 'DEPENDS_ON' | 'HOSTED_ON' | 'CONNECTS_TO' },
  ) =>
    apiRequest(`/assets/${sourceId}/relationships`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeAssetRelationship: (sourceId: string, relId: string) =>
    apiRequest(`/assets/${sourceId}/relationships/${relId}`, { method: 'DELETE' }),

  listMajorIncidentsPublic: () =>
    apiRequest<
      Array<{
        id: string;
        serviceImpactNote: string | null;
        ticket: { id: string; publicNumber: string; title: string; status: string; priority: string };
      }>
    >('/incidents/public-notices'),

  listProblems: () => apiRequest<ProblemDto[]>('/problems'),
  createProblem: (body: Record<string, unknown>) =>
    apiRequest<ProblemDto>('/problems', { method: 'POST', body: JSON.stringify(body) }),

  listChanges: () => apiRequest<ChangeDto[]>('/changes'),
  createChange: (body: Record<string, unknown>) =>
    apiRequest<ChangeDto>('/changes', { method: 'POST', body: JSON.stringify(body) }),

  listApprovals: () =>
    apiRequest<Array<ApprovalDto & { ticket: { id: string; publicNumber: string; title: string; priority: string } }>>(
      '/approvals',
    ),
  decideApproval: (approvalId: string, body: { decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
    apiRequest(`/approvals/${approvalId}/decide`, { method: 'POST', body: JSON.stringify(body) }),

  listAutomationRules: () => apiRequest<AutomationRuleDto[]>('/automations/rules'),
  createAutomationRule: (body: Record<string, unknown>) =>
    apiRequest<AutomationRuleDto>('/automations/rules', { method: 'POST', body: JSON.stringify(body) }),
  toggleAutomationRule: (id: string, isActive: boolean) =>
    apiRequest(`/automations/rules/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  deleteAutomationRule: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/automations/rules/${id}`, { method: 'DELETE' }),
  listAutomationExecutions: () =>
    apiRequest<
      Array<{
        id: string;
        status: string;
        correlationId: string;
        depth: number;
        executedAt: string;
        errorMessage: string | null;
        rule: { name: string; trigger: string };
      }>
    >('/automations/executions'),

  listWebhooks: () =>
    apiRequest<
      Array<{
        id: string;
        name: string;
        url: string;
        events: string[];
        isActive: boolean;
        deliveries: Array<{ id: string; eventType: string; status: string; responseCode: number | null; createdAt: string }>;
      }>
    >('/integrations/webhooks'),
  createWebhook: (body: { name: string; url: string; secret: string; events: string[] }) =>
    apiRequest('/integrations/webhooks', { method: 'POST', body: JSON.stringify(body) }),

  listNotifications: () => apiRequest<NotificationDto[]>('/notifications'),
  markNotificationRead: (id: string) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => apiRequest('/notifications/read-all', { method: 'PATCH' }),

  listAuditLogs: (page = 1) => apiRequest<PaginatedResponse<AuditLogDto>>(`/audit/logs?page=${page}`),
  exportLgpdData: (userId: string) => apiRequest<Record<string, unknown>>(`/lgpd/export/${userId}`),

  getCurrentOrg: () =>
    apiRequest<{
      id: string;
      name: string;
      slug: string;
      aiEnabled: boolean;
      dataRetentionDays: number;
      defaultTimezone: string;
      featureFlags: Array<{ key: string; enabled: boolean }>;
      subscription?: { plan: string; status: string; maxAgents: number; maxUnits: number } | null;
    }>('/organizations/current'),
  updateCurrentOrg: (body: Record<string, unknown>) =>
    apiRequest('/organizations/current', { method: 'PATCH', body: JSON.stringify(body) }),
  getAdaptersStatus: () => apiRequest<Record<string, Record<string, unknown>>>('/integrations/adapters'),
};

