import {
  calculatePriorityFromMatrix,
  ROLE_PERMISSION_MATRIX,
  TICKET_ALLOWED_TRANSITIONS,
} from '@civora/config';
import type {
  AiSuggestionDto,
  ApprovalDto,
  AssetDto,
  AssetRelationshipRefDto,
  AuditLogDto,
  AuthenticatedUser,
  AutomationRuleDto,
  ChangeDto,
  CursorPaginatedResponse,
  DashboardMetricsDto,
  KnowledgeArticleDto,
  PaginatedResponse,
  ProblemDetails,
  ProblemDto,
  RoleCode,
  TicketDetailDto,
  PriorityLevel,
  TicketStatus,
  TicketSummaryDto,
  TicketTimelineEventDto,
  TopologyGraphDto,
} from '@civora/types';
import {
  buildDemoRolesList,
  createInitialDemoState,
  type DemoDatabaseState,
  type DemoDepartment,
  type DemoTeam,
  type DemoUnit,
  type DemoUserRecord,
  type DemoWebhook,
} from './demo-seed';
import { ApiClientError } from './errors';

const DEMO_STORAGE_KEY = 'civora_demo_db_v1';

let memoryState: DemoDatabaseState | null = null;

export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return true;
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname.endsWith('github.io')) return true;
    if (window.location.search.includes('demo=true')) return true;
    if (window.localStorage.getItem('civora_force_demo') === 'true') return true;
    // Also if API base is not configured or fails, we can fall back to demo mode
    if (process.env.NEXT_PUBLIC_API_URL === '' && window.location.protocol === 'https:') {
      return true;
    }
  }
  return false;
}

function loadDemoState(): DemoDatabaseState {
  if (typeof window === 'undefined') {
    if (!memoryState) memoryState = createInitialDemoState();
    return memoryState;
  }
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDatabaseState;
      if (parsed && parsed.version === 1) {
        return parsed;
      }
    }
  } catch {
    // Ignore JSON/localStorage errors
  }
  const fresh = createInitialDemoState();
  saveDemoState(fresh);
  return fresh;
}

function saveDemoState(state: DemoDatabaseState): void {
  memoryState = state;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage quota or private mode fallback
    }
  }
}

export function resetDemoDatabase(): DemoDatabaseState {
  const fresh = createInitialDemoState();
  saveDemoState(fresh);
  return fresh;
}

function buildAuthenticatedUser(
  user: DemoUserRecord,
  state: DemoDatabaseState,
): AuthenticatedUser {
  const permissions = ROLE_PERMISSION_MATRIX[user.roleCode] ?? [];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: null,
    mfaEnabled: user.mfaEnabled,
    activeOrganizationId: state.organization.id,
    activeUnitId: user.defaultUnitId,
    memberships: [
      {
        organizationId: state.organization.id,
        organizationName: state.organization.name,
        organizationSlug: state.organization.slug,
        roleCode: user.roleCode,
        permissions: [...permissions],
        defaultUnitId: user.defaultUnitId,
      },
    ],
  };
}

function makeProblemError(
  status: number,
  title: string,
  detail: string,
  instance: string,
): ApiClientError {
  const problem: ProblemDetails = {
    type: 'about:blank',
    title,
    status,
    detail,
    instance,
    correlationId: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  return new ApiClientError(status, problem);
}

function toTicketSummary(ticket: TicketDetailDto): TicketSummaryDto {
  const {
    descriptionHtml: _desc,
    resolutionSummary: _res,
    cancellationReason: _canc,
    priorityOverrideReason: _prio,
    csatComment: _csat,
    customFields: _fields,
    participants: _parts,
    comments: _cmts,
    attachments: _atts,
    approvals: _apprs,
    slaClockEvents: _events,
    ...summary
  } = ticket;
  return summary;
}

export async function handleDemoRequest<T>(
  path: string,
  init: RequestInit = {},
  activeUserId?: string | null,
): Promise<T> {
  const [pathname, searchString] = path.split('?');
  const normalizedPath = pathname ?? '';
  const searchParams = new URLSearchParams(searchString ?? '');
  const method = (init.method || 'GET').toUpperCase();
  const rawBody = typeof init.body === 'string' ? init.body : null;
  const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};

  const state = loadDemoState();
  const currentUser =
    state.users.find((u) => u.id === activeUserId) ??
    state.users.find((u) => u.roleCode === 'OrganizationOwner') ??
    state.users[0]!;

  const addAudit = (
    action: string,
    resourceType: string,
    resourceId: string,
    afterState: Record<string, unknown> | null = null,
    beforeState: Record<string, unknown> | null = null,
  ) => {
    const log: AuditLogDto = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId: state.organization.id,
      actor: currentUser
        ? { id: currentUser.id, name: currentUser.name, email: currentUser.email }
        : null,
      action,
      resourceType,
      resourceId,
      beforeState,
      afterState,
      ipAddress: '127.0.0.1 (Demo Local)',
      userAgent: 'Civora Browser Demo',
      correlationId: `corr-${Date.now()}`,
      origin: 'DEMO',
      createdAt: new Date().toISOString(),
    };
    state.auditLogs.unshift(log);
    if (state.auditLogs.length > 150) state.auditLogs.pop();
  };

  // 1. AUTH & SESSION
  if (normalizedPath === '/auth/login' && method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const mfaCode = String(body.mfaCode ?? '');

    const user = state.users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      throw makeProblemError(401, 'Unauthorized', 'Credenciais inválidas ou e-mail corporativo não encontrado.', path);
    }
    if (password !== user.password && password !== 'Civora@2026!') {
      throw makeProblemError(401, 'Unauthorized', 'Senha incorreta para a conta informada.', path);
    }
    if (user.mfaEnabled && !mfaCode) {
      throw makeProblemError(401, 'MFA Required', 'Código MFA TOTP obrigatório para autenticar esta conta.', path);
    }
    const authUser = buildAuthenticatedUser(user, state);
    addAudit('AUTH_LOGIN_SUCCESS', 'User', user.id, { email: user.email });
    saveDemoState(state);
    return { user: authUser, accessToken: `demo-jwt-${user.id}` } as unknown as T;
  }

  if (normalizedPath === '/auth/register' && method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const name = String(body.name ?? '').trim();
    const password = String(body.password ?? '');
    const roleCode = String(body.roleCode ?? 'Requester') as RoleCode;

    const blockedRoles: RoleCode[] = ['PlatformAdmin', 'OrganizationOwner', 'Administrator'];
    if (blockedRoles.includes(roleCode)) {
      throw makeProblemError(400, 'Bad Request', 'Não é permitido auto-cadastro para papéis administrativos.', path);
    }

    if (state.users.some((u) => u.email.toLowerCase() === email)) {
      throw makeProblemError(409, 'Conflict', 'Já existe um usuário cadastrado com este e-mail corporativo.', path);
    }

    const newUser: DemoUserRecord = {
      id: `user-${Date.now()}`,
      email,
      name,
      password: password || 'Civora@2026!',
      roleCode,
      defaultUnitId: state.units[0]?.id ?? null,
      departmentId: state.departments[0]?.id ?? null,
      isActive: true,
      mfaEnabled: false,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
    };
    state.users.push(newUser);
    addAudit('AUTH_SELF_REGISTERED', 'User', newUser.id, { email: newUser.email, roleCode: newUser.roleCode });
    saveDemoState(state);
    const authUser = buildAuthenticatedUser(newUser, state);
    return { user: authUser, accessToken: `demo-jwt-${newUser.id}` } as unknown as T;
  }

  if (normalizedPath === '/auth/refresh' && method === 'POST') {
    const authUser = buildAuthenticatedUser(currentUser, state);
    return { user: authUser, accessToken: `demo-jwt-${currentUser.id}` } as unknown as T;
  }

  if (normalizedPath === '/auth/logout' && method === 'POST') {
    addAudit('AUTH_LOGOUT', 'User', currentUser.id);
    saveDemoState(state);
    return undefined as unknown as T;
  }

  if (normalizedPath === '/auth/me' && method === 'GET') {
    return buildAuthenticatedUser(currentUser, state) as unknown as T;
  }

  if (normalizedPath === '/auth/switch-organization' && method === 'POST') {
    const authUser = buildAuthenticatedUser(currentUser, state);
    return { user: authUser, accessToken: `demo-jwt-${currentUser.id}` } as unknown as T;
  }

  if (normalizedPath === '/auth/mfa/setup' && method === 'POST') {
    return {
      otpauthUrl: `otpauth://totp/Civora:${currentUser.email}?secret=JBSWY3DPEHPK3PXP&issuer=Civora`,
      secretBase32: 'JBSWY3DPEHPK3PXP',
    } as unknown as T;
  }

  if (normalizedPath === '/auth/mfa/enable' && method === 'POST') {
    currentUser.mfaEnabled = true;
    addAudit('AUTH_MFA_ENABLED', 'User', currentUser.id);
    saveDemoState(state);
    return { mfaEnabled: true } as unknown as T;
  }

  // 2. TICKETS
  if (normalizedPath === '/tickets' && method === 'GET') {
    let filtered = [...state.tickets];

    const statusParam = searchParams.get('status');
    if (statusParam) {
      const statuses = statusParam.split(',').map((s) => s.trim());
      filtered = filtered.filter((t) => statuses.includes(t.status));
    }

    const priorityParam = searchParams.get('priority');
    if (priorityParam) {
      const priorities = priorityParam.split(',').map((p) => p.trim());
      filtered = filtered.filter((t) => priorities.includes(t.priority));
    }

    const unitIdParam = searchParams.get('unitId');
    if (unitIdParam) {
      filtered = filtered.filter((t) => t.unit?.id === unitIdParam);
    }

    const departmentIdParam = searchParams.get('departmentId');
    if (departmentIdParam) {
      filtered = filtered.filter((t) => t.department?.id === departmentIdParam);
    }

    const teamIdParam = searchParams.get('teamId');
    if (teamIdParam) {
      filtered = filtered.filter((t) => t.team?.id === teamIdParam);
    }

    const search = searchParams.get('search');
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.publicNumber.toLowerCase().includes(q) ||
          t.requester.name.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    // Role isolation: if requester, only show own tickets on general query
    if (currentUser.roleCode === 'Requester') {
      filtered = filtered.filter((t) => t.requester.id === currentUser.id);
    }

    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') || 25)));
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginated = filtered.slice(startIndex, startIndex + pageSize).map(toTicketSummary);

    const response: PaginatedResponse<TicketSummaryDto> = {
      data: paginated,
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
    return response as unknown as T;
  }

  if (normalizedPath === '/tickets' && method === 'POST') {
    const title = String(body.title ?? '').trim();
    if (!title) {
      throw makeProblemError(400, 'Bad Request', 'O assunto do chamado é obrigatório.', path);
    }
    const descriptionHtml = String(body.description ?? '<p>Sem descrição informada.</p>');
    const impact = (body.impact as 'LOW' | 'MEDIUM' | 'HIGH') || 'MEDIUM';
    const urgency = (body.urgency as 'LOW' | 'MEDIUM' | 'HIGH') || 'MEDIUM';
    const priority = calculatePriorityFromMatrix(impact, urgency) as PriorityLevel;
    const type = (body.type as TicketDetailDto['type']) || 'SERVICE_REQUEST';
    const channel = (body.channel as TicketDetailDto['channel']) || 'AGENT_CONSOLE';

    const unit = state.units.find((u) => u.id === body.unitId) ?? state.units[0];
    const department = state.departments.find((d) => d.id === body.departmentId) ?? null;
    const team = state.teams.find((t) => t.id === body.teamId) ?? null;
    const service = state.services.find((s) => s.id === body.serviceId) ?? null;

    const seq = state.nextTicketSeq++;
    const publicNumber = `CIV-2026-${String(seq).padStart(6, '0')}`;
    const id = `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    const newTicket: TicketDetailDto = {
      id,
      tenantId: state.organization.id,
      publicNumber,
      title,
      type,
      channel,
      status: 'NEW',
      impact,
      urgency,
      priority,
      priorityOverridden: false,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : ['portal'],
      requester: { id: currentUser.id, name: currentUser.name, email: currentUser.email },
      assignee: null,
      unit: unit ? { id: unit.id, name: unit.name, code: unit.code } : null,
      department: department ? { id: department.id, name: department.name } : null,
      team: team ? { id: team.id, name: team.name } : null,
      category: service?.category ?? { id: 'cat-geral', name: 'Suporte Geral' },
      service: service ? { id: service.id, name: service.name } : null,
      sla: {
        state: 'ACTIVE',
        policyName: 'Política SLA Corporativa Padrão',
        firstResponseDueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        firstResponseMetAt: null,
        resolutionDueAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        resolutionMetAt: null,
        pausedAt: null,
        consumedPercent: 5,
        warningTriggered: false,
        breached: false,
      },
      dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      csatScore: null,
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      descriptionHtml,
      subcategory: null,
      resolutionSummary: null,
      cancellationReason: null,
      priorityOverrideReason: null,
      csatComment: null,
      customFields: (body.customFields as Record<string, unknown>) || {},
      participants: [],
      comments: [],
      attachments: [],
      approvals: [],
      slaClockEvents: [
        {
          id: `sce-${Date.now()}`,
          eventType: 'CLOCK_STARTED',
          occurredAt: nowIso,
          reason: 'Criação do chamado e início do cálculo de SLA',
          elapsedBusinessMinutes: 0,
        },
      ],
    };

    state.tickets.unshift(newTicket);
    state.timelines[id] = [
      {
        id: `tl-${Date.now()}`,
        ticketId: id,
        eventType: 'TICKET_CREATED',
        actor: { id: currentUser.id, name: currentUser.name },
        payload: { publicNumber, priority },
        correlationId: `corr-${Date.now()}`,
        createdAt: nowIso,
      },
    ];

    addAudit('TICKET_CREATED', 'Ticket', id, { publicNumber, title, priority });
    saveDemoState(state);
    return newTicket as unknown as T;
  }

  if (normalizedPath === '/tickets/export/csv' && method === 'GET') {
    const lines = [
      'Ticket,Assunto,Status,Prioridade,Solicitante,Atribuído,Unidade,Departamento,CriadoEm',
      ...state.tickets.map(
        (t) =>
          `"${t.publicNumber}","${t.title.replace(/"/g, '""')}","${t.status}","${t.priority}","${t.requester.name}","${t.assignee?.name ?? '—'}","${t.unit?.code ?? '—'}","${t.department?.name ?? '—'}","${t.createdAt}"`,
      ),
    ];
    return lines.join('\n') as unknown as T;
  }

  if (normalizedPath === '/tickets/views' && method === 'GET') {
    return state.savedViews as unknown as T;
  }

  if (normalizedPath === '/tickets/views' && method === 'POST') {
    const view = {
      id: `view-${Date.now()}`,
      name: String(body.name ?? 'Visualização Personalizada'),
      filtersJson: (body.filters as Record<string, unknown>) || {},
    };
    state.savedViews.push(view);
    saveDemoState(state);
    return view as unknown as T;
  }

  if (normalizedPath === '/tickets/bulk' && method === 'POST') {
    const ids = Array.isArray(body.ticketIds) ? (body.ticketIds as string[]) : [];
    let count = 0;
    for (const ticket of state.tickets) {
      if (ids.includes(ticket.id)) {
        if (body.status) ticket.status = body.status as TicketStatus;
        if (body.assigneeId !== undefined) {
          const assignee = state.users.find((u) => u.id === body.assigneeId);
          ticket.assignee = assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null;
        }
        ticket.version++;
        ticket.updatedAt = new Date().toISOString();
        count++;
      }
    }
    saveDemoState(state);
    return { processed: count } as unknown as T;
  }

  if (normalizedPath === '/tickets/bulk-delete' && method === 'POST') {
    const ids = Array.isArray(body.ticketIds) ? (body.ticketIds as string[]) : [];
    const beforeCount = state.tickets.length;
    state.tickets = state.tickets.filter((t) => !ids.includes(t.id));
    const deletedCount = beforeCount - state.tickets.length;
    addAudit('TICKET_BULK_DELETED', 'Ticket', ids.join(','), { deletedCount });
    saveDemoState(state);
    return { processed: ids.length, deletedCount } as unknown as T;
  }

  // Individual ticket operations by ID (/tickets/:id)
  const ticketDetailMatch = normalizedPath.match(/^\/tickets\/([^/]+)$/);
  if (ticketDetailMatch) {
    const ticketId = ticketDetailMatch[1]!;

    if (method === 'GET') {
      const ticket = state.tickets.find((t) => t.id === ticketId || t.publicNumber === ticketId);
      if (!ticket) {
        throw makeProblemError(404, 'Not Found', `Chamado ${ticketId} não foi encontrado.`, path);
      }
      return ticket as unknown as T;
    }

    if (method === 'DELETE') {
      const idx = state.tickets.findIndex((t) => t.id === ticketId || t.publicNumber === ticketId);
      if (idx === -1) {
        throw makeProblemError(404, 'Not Found', `Chamado ${ticketId} não encontrado.`, path);
      }
      const [deleted] = state.tickets.splice(idx, 1);
      addAudit('TICKET_DELETED', 'Ticket', deleted?.id ?? ticketId, { publicNumber: deleted?.publicNumber });
      saveDemoState(state);
      return { deleted: true, id: ticketId } as unknown as T;
    }
  }

  const timelineMatch = normalizedPath.match(/^\/tickets\/([^/]+)\/timeline$/);
  if (timelineMatch && method === 'GET') {
    const ticketId = timelineMatch[1]!;
    const events = state.timelines[ticketId] ?? [
      {
        id: `tl-base-${ticketId}`,
        ticketId,
        eventType: 'TICKET_CREATED',
        actor: { id: currentUser.id, name: currentUser.name },
        payload: { ticketId },
        correlationId: `corr-${ticketId}`,
        createdAt: new Date().toISOString(),
      },
    ];
    const response: CursorPaginatedResponse<TicketTimelineEventDto> = {
      data: events,
      nextCursor: null,
      hasMore: false,
    };
    return response as unknown as T;
  }

  const transitionMatch = normalizedPath.match(/^\/tickets\/([^/]+)\/transition$/);
  if (transitionMatch && method === 'POST') {
    const ticketId = transitionMatch[1]!;
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw makeProblemError(404, 'Not Found', 'Chamado não encontrado.', path);

    const targetStatus = body.targetStatus as TicketStatus;
    const allowed = TICKET_ALLOWED_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw makeProblemError(400, 'Bad Request', `Transição de ${ticket.status} para ${targetStatus} não é permitida.`, path);
    }

    const previousStatus = ticket.status;
    ticket.status = targetStatus;
    ticket.version++;
    ticket.updatedAt = new Date().toISOString();

    if (targetStatus === 'RESOLVED') {
      ticket.resolvedAt = new Date().toISOString();
      ticket.resolutionSummary = String(body.resolutionSummary ?? 'Resolvido pelo operador.');
      if (ticket.sla) ticket.sla.state = 'MET';
    } else if (targetStatus === 'CANCELED') {
      ticket.cancellationReason = String(body.cancellationReason ?? 'Cancelado pelo solicitante.');
      if (ticket.sla) ticket.sla.state = 'CANCELED';
    }

    const tlEvents = state.timelines[ticket.id] ?? [];
    tlEvents.unshift({
      id: `tl-${Date.now()}`,
      ticketId: ticket.id,
      eventType: 'TICKET_TRANSITIONED',
      actor: { id: currentUser.id, name: currentUser.name },
      payload: { previousStatus, targetStatus, reason: body.reason },
      correlationId: `corr-${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
    state.timelines[ticket.id] = tlEvents;

    addAudit('TICKET_TRANSITIONED', 'Ticket', ticket.id, { previousStatus, targetStatus });
    saveDemoState(state);
    return ticket as unknown as T;
  }

  const assignMatch = normalizedPath.match(/^\/tickets\/([^/]+)\/assign$/);
  if (assignMatch && method === 'POST') {
    const ticketId = assignMatch[1]!;
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw makeProblemError(404, 'Not Found', 'Chamado não encontrado.', path);

    if (body.assigneeId !== undefined) {
      const assignee = state.users.find((u) => u.id === body.assigneeId);
      ticket.assignee = assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null;
    }
    if (body.teamId !== undefined) {
      const team = state.teams.find((t) => t.id === body.teamId);
      ticket.team = team ? { id: team.id, name: team.name } : null;
    }
    ticket.version++;
    ticket.updatedAt = new Date().toISOString();

    addAudit('TICKET_ASSIGNED', 'Ticket', ticket.id, { assignee: ticket.assignee, team: ticket.team });
    saveDemoState(state);
    return ticket as unknown as T;
  }

  const overrideMatch = normalizedPath.match(/^\/tickets\/([^/]+)\/priority-override$/);
  if (overrideMatch && method === 'POST') {
    const ticketId = overrideMatch[1]!;
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw makeProblemError(404, 'Not Found', 'Chamado não encontrado.', path);

    ticket.priority = body.priority as PriorityLevel;
    ticket.priorityOverridden = true;
    ticket.priorityOverrideReason = String(body.reason ?? 'Sobrescrito manualmente');
    ticket.version++;
    ticket.updatedAt = new Date().toISOString();

    addAudit('TICKET_PRIORITY_OVERRIDDEN', 'Ticket', ticket.id, { priority: ticket.priority, reason: body.reason });
    saveDemoState(state);
    return ticket as unknown as T;
  }

  const commentsMatch = normalizedPath.match(/^\/tickets\/([^/]+)\/comments$/);
  if (commentsMatch && method === 'POST') {
    const ticketId = commentsMatch[1]!;
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw makeProblemError(404, 'Not Found', 'Chamado não encontrado.', path);

    const comment = {
      id: `cmt-${Date.now()}`,
      ticketId: ticket.id,
      author: { id: currentUser.id, name: currentUser.name, email: currentUser.email },
      bodyHtml: String(body.body ?? ''),
      isInternal: Boolean(body.isInternal),
      createdAt: new Date().toISOString(),
    };
    ticket.comments.push(comment);
    ticket.updatedAt = new Date().toISOString();

    saveDemoState(state);
    return comment as unknown as T;
  }

  const csatMatch = normalizedPath.match(/^\/tickets\/([^/]+)\/csat$/);
  if (csatMatch && method === 'POST') {
    const ticketId = csatMatch[1]!;
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw makeProblemError(404, 'Not Found', 'Chamado não encontrado.', path);

    ticket.csatScore = Math.max(1, Math.min(5, Number(body.score || 5)));
    ticket.csatComment = body.comment ? String(body.comment) : null;
    ticket.updatedAt = new Date().toISOString();

    addAudit('TICKET_CSAT_RATED', 'Ticket', ticket.id, { score: ticket.csatScore });
    saveDemoState(state);
    return ticket as unknown as T;
  }

  const attachmentsMatch = normalizedPath.match(/^\/tickets\/([^/]+)\/attachments$/);
  if (attachmentsMatch && method === 'POST') {
    const ticketId = attachmentsMatch[1]!;
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw makeProblemError(404, 'Not Found', 'Chamado não encontrado.', path);

    const att = {
      id: `att-${Date.now()}`,
      ticketId: ticket.id,
      fileName: 'documento-anexado.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024 * 42,
      uploadedBy: { id: currentUser.id, name: currentUser.name },
      createdAt: new Date().toISOString(),
    };
    ticket.attachments.push(att);
    saveDemoState(state);
    return att as unknown as T;
  }

  const aiAssistMatch = normalizedPath.match(/^\/ai\/tickets\/([^/]+)\/assist$/);
  if (aiAssistMatch && method === 'POST') {
    const ticketId = aiAssistMatch[1]!;
    const ticket = state.tickets.find((t) => t.id === ticketId);
    const featureType = String(body.featureType ?? 'SUGGEST_REPLY');

    const suggestion: AiSuggestionDto = {
      id: `ai-${Date.now()}`,
      featureType: featureType as AiSuggestionDto['featureType'],
      provider: 'demo-local-ai',
      model: 'civora-neural-v2',
      promptVersion: '1.0',
      latencyMs: 140,
      tokenUsage: 312,
      suggestionPayload:
        featureType === 'SUGGEST_REPLY'
          ? {
              text: `Olá ${ticket?.requester.name ?? 'Solicitante'}, analisamos o chamado "${ticket?.title ?? ''}" e confirmamos que a tratativa foi iniciada pela equipe de sustentação. Atualizaremos esta timeline assim que a validação for concluída.`,
            }
          : featureType === 'SUMMARIZE_TIMELINE'
            ? {
                summary: `Incidente registrado com prioridade ${ticket?.priority ?? 'NORMAL'}. O SLA está ativo e o tráfego secundário segue monitorado.`,
              }
            : {
                recommendedPriority: 'HIGH',
                confidence: 0.94,
              },
      decision: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    return suggestion as unknown as T;
  }

  const aiDecisionMatch = normalizedPath.match(/^\/ai\/suggestions\/([^/]+)\/decision$/);
  if (aiDecisionMatch && method === 'POST') {
    return {
      id: aiDecisionMatch[1]!,
      decision: body.decision ?? 'ACCEPTED',
      decidedAt: new Date().toISOString(),
    } as unknown as T;
  }

  // 3. ORGANIZATION: UNITS, DEPARTMENTS, TEAMS, USERS, ROLES
  if (normalizedPath === '/units') {
    if (method === 'GET') return state.units as unknown as T;
    if (method === 'POST') {
      const newUnit: DemoUnit = {
        id: `unit-${Date.now()}`,
        name: String(body.name ?? 'Nova Unidade'),
        code: String(body.code ?? 'NOVA').toUpperCase(),
        timezone: String(body.timezone ?? 'America/Sao_Paulo'),
        address: body.address ? String(body.address) : null,
        isActive: true,
      };
      state.units.push(newUnit);
      addAudit('UNIT_CREATED', 'Unit', newUnit.id, { code: newUnit.code, name: newUnit.name });
      saveDemoState(state);
      return newUnit as unknown as T;
    }
  }

  const unitParamMatch = normalizedPath.match(/^\/units\/([^/]+)$/);
  if (unitParamMatch) {
    const unitId = unitParamMatch[1]!;
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit) throw makeProblemError(404, 'Not Found', 'Unidade não encontrada.', path);

    if (method === 'PATCH') {
      if (body.name !== undefined) unit.name = String(body.name);
      if (body.code !== undefined) unit.code = String(body.code);
      if (body.timezone !== undefined) unit.timezone = String(body.timezone);
      if (body.address !== undefined) unit.address = body.address ? String(body.address) : null;
      if (body.isActive !== undefined) unit.isActive = Boolean(body.isActive);
      addAudit('UNIT_UPDATED', 'Unit', unit.id, { isActive: unit.isActive });
      saveDemoState(state);
      return unit as unknown as T;
    }

    if (method === 'DELETE') {
      const idx = state.units.findIndex((u) => u.id === unitId);
      if (idx !== -1) {
        const [del] = state.units.splice(idx, 1);
        addAudit('UNIT_DELETED', 'Unit', unitId, { code: del?.code });
      }
      saveDemoState(state);
      return { deleted: true, id: unitId } as unknown as T;
    }
  }

  if (normalizedPath === '/departments') {
    if (method === 'GET') {
      const depts = state.departments.map((d) => {
        const u = state.units.find((un) => un.id === d.unitId);
        return {
          ...d,
          unit: u ? { id: u.id, name: u.name, code: u.code } : null,
        };
      });
      return depts as unknown as T;
    }

    if (method === 'POST') {
      const newDept: DemoDepartment = {
        id: `dept-${Date.now()}`,
        name: String(body.name ?? 'Novo Departamento'),
        code: String(body.code ?? 'DEP').toUpperCase(),
        unitId: body.unitId ? String(body.unitId) : null,
      };
      state.departments.push(newDept);
      addAudit('DEPARTMENT_CREATED', 'Department', newDept.id, { code: newDept.code, name: newDept.name });
      saveDemoState(state);
      return newDept as unknown as T;
    }
  }

  const deptParamMatch = normalizedPath.match(/^\/departments\/([^/]+)$/);
  if (deptParamMatch) {
    const deptId = deptParamMatch[1]!;
    const dept = state.departments.find((d) => d.id === deptId);
    if (!dept) throw makeProblemError(404, 'Not Found', 'Departamento não encontrado.', path);

    if (method === 'PATCH') {
      if (body.name !== undefined) dept.name = String(body.name);
      if (body.code !== undefined) dept.code = String(body.code);
      if (body.unitId !== undefined) dept.unitId = body.unitId ? String(body.unitId) : null;
      addAudit('DEPARTMENT_UPDATED', 'Department', dept.id, { name: dept.name });
      saveDemoState(state);
      return dept as unknown as T;
    }

    if (method === 'DELETE') {
      const idx = state.departments.findIndex((d) => d.id === deptId);
      if (idx !== -1) {
        const [del] = state.departments.splice(idx, 1);
        addAudit('DEPARTMENT_DELETED', 'Department', deptId, { code: del?.code });
      }
      saveDemoState(state);
      return { deleted: true, id: deptId } as unknown as T;
    }
  }

  if (normalizedPath === '/teams') {
    if (method === 'GET') {
      const teams = state.teams.map((tm) => {
        const dept = state.departments.find((d) => d.id === tm.departmentId);
        const supervisor = state.users.find((u) => u.id === tm.supervisorId);
        const members = state.users
          .filter((u) => tm.memberIds.includes(u.id))
          .map((u) => ({ user: { id: u.id, name: u.name, email: u.email } }));
        return {
          id: tm.id,
          name: tm.name,
          departmentId: tm.departmentId,
          supervisorId: tm.supervisorId,
          department: dept ? { id: dept.id, name: dept.name } : null,
          supervisor: supervisor ? { id: supervisor.id, name: supervisor.name, email: supervisor.email } : null,
          members,
        };
      });
      return teams as unknown as T;
    }

    if (method === 'POST') {
      const newTeam: DemoTeam = {
        id: `team-${Date.now()}`,
        name: String(body.name ?? 'Nova Equipe'),
        departmentId: body.departmentId ? String(body.departmentId) : null,
        supervisorId: body.supervisorId ? String(body.supervisorId) : null,
        memberIds: body.supervisorId ? [String(body.supervisorId)] : [],
      };
      state.teams.push(newTeam);
      addAudit('TEAM_CREATED', 'Team', newTeam.id, { name: newTeam.name });
      saveDemoState(state);
      return newTeam as unknown as T;
    }
  }

  const teamMemberMatch = normalizedPath.match(/^\/teams\/([^/]+)\/members(?:\/([^/]+))?$/);
  if (teamMemberMatch) {
    const teamId = teamMemberMatch[1]!;
    const team = state.teams.find((t) => t.id === teamId);
    if (!team) throw makeProblemError(404, 'Not Found', 'Equipe não encontrada.', path);

    if (method === 'POST') {
      const userId = String(body.userId ?? '');
      if (userId && !team.memberIds.includes(userId)) {
        team.memberIds.push(userId);
      }
      saveDemoState(state);
      return { added: true } as unknown as T;
    }

    if (method === 'DELETE') {
      const userId = teamMemberMatch[2]!;
      team.memberIds = team.memberIds.filter((id) => id !== userId);
      saveDemoState(state);
      return { removed: true } as unknown as T;
    }
  }

  if (normalizedPath === '/users') {
    if (method === 'GET') {
      const list = state.users.map((u) => {
        const unit = state.units.find((un) => un.id === u.defaultUnitId);
        const dept = state.departments.find((d) => d.id === u.departmentId);
        return {
          membershipId: `mem-${u.id}`,
          userId: u.id,
          email: u.email,
          name: u.name,
          avatarUrl: null,
          mfaEnabled: u.mfaEnabled,
          role: { id: `role-${u.roleCode}`, code: u.roleCode, name: u.roleCode },
          defaultUnit: unit ? { id: unit.id, name: unit.name, code: unit.code } : null,
          department: dept ? { id: dept.id, name: dept.name } : null,
          isActive: u.isActive,
        };
      });
      return list as unknown as T;
    }

    if (method === 'POST') {
      const newUser: DemoUserRecord = {
        id: `user-${Date.now()}`,
        email: String(body.email ?? ''),
        name: String(body.name ?? ''),
        password: String(body.password || 'Civora@2026!'),
        roleCode: (body.roleCode as RoleCode) || 'Requester',
        defaultUnitId: body.defaultUnitId ? String(body.defaultUnitId) : null,
        departmentId: body.departmentId ? String(body.departmentId) : null,
        isActive: true,
        mfaEnabled: false,
        mfaSecret: 'JBSWY3DPEHPK3PXP',
      };
      state.users.push(newUser);
      addAudit('USER_CREATED', 'User', newUser.id, { email: newUser.email, roleCode: newUser.roleCode });
      saveDemoState(state);
      return newUser as unknown as T;
    }
  }

  const userParamMatch = normalizedPath.match(/^\/users\/([^/]+)$/);
  if (userParamMatch && method === 'PATCH') {
    const userId = userParamMatch[1]!;
    const user = state.users.find((u) => u.id === userId);
    if (!user) throw makeProblemError(404, 'Not Found', 'Usuário não encontrado.', path);

    if (body.roleCode !== undefined) user.roleCode = body.roleCode as RoleCode;
    if (body.defaultUnitId !== undefined) user.defaultUnitId = body.defaultUnitId ? String(body.defaultUnitId) : null;
    if (body.departmentId !== undefined) user.departmentId = body.departmentId ? String(body.departmentId) : null;
    if (body.isActive !== undefined) user.isActive = Boolean(body.isActive);

    addAudit('USER_MEMBERSHIP_UPDATED', 'User', user.id, { roleCode: user.roleCode, isActive: user.isActive });
    saveDemoState(state);
    return user as unknown as T;
  }

  if (normalizedPath === '/roles' && method === 'GET') {
    return buildDemoRolesList() as unknown as T;
  }

  // 4. CATALOG & KNOWLEDGE BASE
  if (normalizedPath === '/catalog/services' && method === 'GET') {
    const q = (searchParams.get('q') || '').toLowerCase();
    if (!q) return state.services as unknown as T;
    return state.services.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    ) as unknown as T;
  }

  if (normalizedPath === '/catalog/categories' && method === 'GET') {
    return state.categories as unknown as T;
  }

  if (normalizedPath === '/knowledge/articles' && method === 'GET') {
    const q = (searchParams.get('q') || '').toLowerCase();
    let list = state.knowledge;
    if (q) {
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.bodyMarkdown.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    const response: PaginatedResponse<KnowledgeArticleDto> = {
      data: list,
      meta: {
        page: 1,
        pageSize: list.length,
        totalItems: list.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
    return response as unknown as T;
  }

  if (normalizedPath === '/knowledge/articles' && method === 'POST') {
    const newArticle: KnowledgeArticleDto = {
      id: `kb-${Date.now()}`,
      tenantId: state.organization.id,
      slug: String(body.slug || `kb-${Date.now()}`),
      title: String(body.title ?? 'Novo Artigo'),
      summary: String(body.summary ?? ''),
      bodyMarkdown: String(body.bodyMarkdown ?? ''),
      status: 'PUBLISHED',
      visibility: (body.visibility as KnowledgeArticleDto['visibility']) || 'PUBLIC',
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : ['geral'],
      category: { id: 'cat-geral', name: 'Suporte Geral' },
      author: { id: currentUser.id, name: currentUser.name },
      reviewer: null,
      currentVersion: 1,
      helpfulCount: 0,
      notHelpfulCount: 0,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.knowledge.unshift(newArticle);
    addAudit('KB_ARTICLE_CREATED', 'KnowledgeArticle', newArticle.id, { title: newArticle.title });
    saveDemoState(state);
    return newArticle as unknown as T;
  }

  const kbDetailMatch = normalizedPath.match(/^\/knowledge\/articles\/([^/]+)$/);
  if (kbDetailMatch) {
    const articleId = kbDetailMatch[1]!;
    const article = state.knowledge.find((a) => a.id === articleId || a.slug === articleId);
    if (!article) throw makeProblemError(404, 'Not Found', 'Artigo não encontrado.', path);

    if (method === 'GET') return article as unknown as T;

    if (method === 'PATCH') {
      if (body.title !== undefined) article.title = String(body.title);
      if (body.summary !== undefined) article.summary = String(body.summary);
      if (body.bodyMarkdown !== undefined) article.bodyMarkdown = String(body.bodyMarkdown);
      if (body.status !== undefined) article.status = body.status as KnowledgeArticleDto['status'];
      article.currentVersion++;
      article.updatedAt = new Date().toISOString();
      saveDemoState(state);
      return article as unknown as T;
    }
  }

  const kbFeedbackMatch = normalizedPath.match(/^\/knowledge\/articles\/([^/]+)\/feedback$/);
  if (kbFeedbackMatch && method === 'POST') {
    const articleId = kbFeedbackMatch[1]!;
    const article = state.knowledge.find((a) => a.id === articleId);
    if (article) {
      if (body.helpful) article.helpfulCount++;
      else article.notHelpfulCount++;
      saveDemoState(state);
    }
    return { ok: true } as unknown as T;
  }

  // 5. ASSETS, CMDB & TOPOLOGY
  if (normalizedPath === '/assets/topology' && method === 'GET') {
    const topology: TopologyGraphDto = {
      nodes: state.assets,
      edges: state.assetRelationships,
      layoutPositions: state.assetLayoutPositions,
      cacheStatus: 'HIT',
      hydratedAt: new Date().toISOString(),
    };
    return topology as unknown as T;
  }

  if (normalizedPath === '/assets' && method === 'GET') {
    return state.assets as unknown as T;
  }

  if (normalizedPath === '/assets' && method === 'POST') {
    const newAsset: AssetDto = {
      id: `asset-${Date.now()}`,
      tenantId: state.organization.id,
      assetTag: String(body.assetTag || `AST-${Date.now().toString().slice(-4)}`).toUpperCase(),
      name: String(body.name ?? 'Novo Ativo'),
      assetType: String(body.assetType ?? 'SERVER'),
      status: 'ACTIVE',
      serialNumber: null,
      manufacturer: null,
      model: null,
      unit: state.units[0] ? { id: state.units[0].id, name: state.units[0].name } : null,
      department: state.departments[0] ? { id: state.departments[0].id, name: state.departments[0].name } : null,
      owner: { id: currentUser.id, name: currentUser.name },
      layoutPosition: [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4],
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    state.assets.push(newAsset);
    if (newAsset.layoutPosition) {
      state.assetLayoutPositions[newAsset.id] = newAsset.layoutPosition;
    }
    addAudit('ASSET_CREATED', 'Asset', newAsset.id, { tag: newAsset.assetTag, name: newAsset.name });
    saveDemoState(state);
    return newAsset as unknown as T;
  }

  const assetDetailMatch = normalizedPath.match(/^\/assets\/([^/]+)$/);
  if (assetDetailMatch) {
    const assetId = assetDetailMatch[1]!;
    const asset = state.assets.find((a) => a.id === assetId);
    if (!asset) throw makeProblemError(404, 'Not Found', 'Ativo não encontrado.', path);

    if (method === 'PATCH') {
      if (body.status !== undefined) asset.status = body.status as AssetDto['status'];
      if (body.name !== undefined) asset.name = String(body.name);
      asset.version++;
      asset.updatedAt = new Date().toISOString();
      saveDemoState(state);
      return asset as unknown as T;
    }

    if (method === 'DELETE') {
      state.assets = state.assets.filter((a) => a.id !== assetId);
      state.assetRelationships = state.assetRelationships.filter(
        (r) => r.sourceId !== assetId && r.targetId !== assetId,
      );
      delete state.assetLayoutPositions[assetId];
      addAudit('ASSET_DELETED', 'Asset', assetId, { tag: asset.assetTag });
      saveDemoState(state);
      return { deleted: true } as unknown as T;
    }
  }

  const assetRelMatch = normalizedPath.match(/^\/assets\/([^/]+)\/relationships(?:\/([^/]+))?$/);
  if (assetRelMatch) {
    const sourceId = assetRelMatch[1]!;
    if (method === 'POST') {
      const rel: AssetRelationshipRefDto = {
        id: `rel-${Date.now()}`,
        sourceId,
        targetId: String(body.targetId ?? ''),
        relationType: String(body.relationType ?? 'DEPENDS_ON'),
      };
      state.assetRelationships.push(rel);
      addAudit('ASSET_RELATIONSHIP_CREATED', 'AssetRelationship', rel.id, { sourceId, targetId: rel.targetId });
      saveDemoState(state);
      return rel as unknown as T;
    }

    if (method === 'DELETE') {
      const relId = assetRelMatch[2]!;
      state.assetRelationships = state.assetRelationships.filter((r) => r.id !== relId);
      saveDemoState(state);
      return { deleted: true } as unknown as T;
    }
  }

  const cascadeMatch = normalizedPath.match(/^\/assets\/([^/]+)\/simulate-cascade$/);
  if (cascadeMatch && method === 'POST') {
    const rootId = cascadeMatch[1]!;
    // Breadth-first search of impacted dependencies
    const impactedNodes = new Set<string>();
    const impactedEdges = new Set<string>();
    const queue = [rootId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const rel of state.assetRelationships) {
        if (rel.targetId === current && !impactedNodes.has(rel.sourceId)) {
          impactedNodes.add(rel.sourceId);
          impactedEdges.add(rel.id);
          queue.push(rel.sourceId);
        }
      }
    }

    return {
      rootAssetId: rootId,
      impactedNodeIds: Array.from(impactedNodes),
      impactedEdgeIds: Array.from(impactedEdges),
      emittedEvents: impactedNodes.size + 1,
    } as unknown as T;
  }

  if (normalizedPath === '/incidents/public-notices' && method === 'GET') {
    const notices = state.tickets
      .filter((t) => t.type === 'INCIDENT' && t.priority === 'CRITICAL' && t.status !== 'RESOLVED' && t.status !== 'CLOSED')
      .map((t) => ({
        id: `notice-${t.id}`,
        serviceImpactNote: 'Possível lentidão ou intermitência em análise pela engenharia.',
        ticket: { id: t.id, publicNumber: t.publicNumber, title: t.title, status: t.status, priority: t.priority },
      }));
    return notices as unknown as T;
  }

  if (normalizedPath === '/problems') {
    if (method === 'GET') return state.problems as unknown as T;
    if (method === 'POST') {
      const prb: ProblemDto = {
        id: `prb-${Date.now()}`,
        tenantId: state.organization.id,
        code: `PRB-2026-${String(state.problems.length + 1).padStart(3, '0')}`,
        title: String(body.title ?? 'Novo Problema Conhecido'),
        description: String(body.description ?? ''),
        rootCause: body.rootCause ? String(body.rootCause) : null,
        workaround: body.workaround ? String(body.workaround) : null,
        status: 'LOGGED',
        priority: (body.priority as ProblemDto['priority']) || 'MEDIUM',
        linkedTicketCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.problems.push(prb);
      addAudit('PROBLEM_CREATED', 'Problem', prb.id, { code: prb.code, title: prb.title });
      saveDemoState(state);
      return prb as unknown as T;
    }
  }

  if (normalizedPath === '/changes') {
    if (method === 'GET') return state.changes as unknown as T;
    if (method === 'POST') {
      const chg: ChangeDto = {
        id: `chg-${Date.now()}`,
        tenantId: state.organization.id,
        code: `CHG-2026-${String(state.changes.length + 1).padStart(3, '0')}`,
        title: String(body.title ?? 'Nova Solicitação de Mudança'),
        description: String(body.description ?? ''),
        risk: (body.risk as ChangeDto['risk']) || 'MEDIUM',
        status: 'DRAFT',
        implementationPlan: String(body.implementationPlan ?? ''),
        rollbackPlan: String(body.rollbackPlan ?? ''),
        windowStartAt: null,
        windowEndAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.changes.push(chg);
      addAudit('CHANGE_CREATED', 'Change', chg.id, { code: chg.code, title: chg.title });
      saveDemoState(state);
      return chg as unknown as T;
    }
  }

  // 6. APPROVALS
  if (normalizedPath === '/approvals' && method === 'GET') {
    const list: Array<ApprovalDto & { ticket: { id: string; publicNumber: string; title: string; priority: string } }> = [];
    for (const t of state.tickets) {
      for (const a of t.approvals) {
        list.push({
          ...a,
          ticket: { id: t.id, publicNumber: t.publicNumber, title: t.title, priority: t.priority },
        });
      }
    }
    return list as unknown as T;
  }

  const approvalDecideMatch = normalizedPath.match(/^\/approvals\/([^/]+)\/decide$/);
  if (approvalDecideMatch && method === 'POST') {
    const approvalId = approvalDecideMatch[1]!;
    const decision = body.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    let found = false;

    for (const t of state.tickets) {
      for (const a of t.approvals) {
        if (a.id === approvalId) {
          a.status = decision;
          for (const s of a.steps) {
            s.status = decision;
            s.decidedAt = new Date().toISOString();
            if (body.note) s.decisionNote = String(body.note);
          }
          found = true;
          if (decision === 'APPROVED') {
            t.status = 'IN_PROGRESS';
          }
          break;
        }
      }
      if (found) break;
    }

    addAudit('APPROVAL_DECIDED', 'Approval', approvalId, { decision, note: body.note });
    saveDemoState(state);
    return { decided: true, decision } as unknown as T;
  }

  // 7. AUTOMATIONS & WEBHOOKS
  if (normalizedPath === '/automations/rules') {
    if (method === 'GET') return state.automationRules as unknown as T;
    if (method === 'POST') {
      const rule: AutomationRuleDto = {
        id: `auto-${Date.now()}`,
        tenantId: state.organization.id,
        name: String(body.name ?? 'Regra Automatizada'),
        description: body.description ? String(body.description) : null,
        trigger: (body.trigger as AutomationRuleDto['trigger']) || 'TICKET_CREATED',
        conditions: (body.conditions as AutomationRuleDto['conditions']) || [],
        actions: (body.actions as AutomationRuleDto['actions']) || [],
        isActive: true,
        priorityOrder: state.automationRules.length + 1,
        executionCount: 0,
        lastExecutedAt: null,
      };
      state.automationRules.push(rule);
      addAudit('AUTOMATION_RULE_CREATED', 'AutomationRule', rule.id, { name: rule.name });
      saveDemoState(state);
      return rule as unknown as T;
    }
  }

  const ruleParamMatch = normalizedPath.match(/^\/automations\/rules\/([^/]+)$/);
  if (ruleParamMatch) {
    const ruleId = ruleParamMatch[1]!;
    const rule = state.automationRules.find((r) => r.id === ruleId);
    if (!rule) throw makeProblemError(404, 'Not Found', 'Regra não encontrada.', path);

    if (method === 'PATCH') {
      if (body.isActive !== undefined) rule.isActive = Boolean(body.isActive);
      saveDemoState(state);
      return rule as unknown as T;
    }

    if (method === 'DELETE') {
      state.automationRules = state.automationRules.filter((r) => r.id !== ruleId);
      addAudit('AUTOMATION_RULE_DELETED', 'AutomationRule', ruleId, { name: rule.name });
      saveDemoState(state);
      return { deleted: true } as unknown as T;
    }
  }

  if (normalizedPath === '/automations/executions' && method === 'GET') {
    return state.automationExecutions as unknown as T;
  }

  if (normalizedPath === '/integrations/webhooks') {
    if (method === 'GET') return state.webhooks as unknown as T;
    if (method === 'POST') {
      const wh: DemoWebhook = {
        id: `wh-${Date.now()}`,
        name: String(body.name ?? 'Webhook de Integração'),
        url: String(body.url ?? 'https://exemplo.local/webhook'),
        events: Array.isArray(body.events) ? (body.events as string[]) : ['ticket.created'],
        isActive: true,
        deliveries: [],
      };
      state.webhooks.push(wh);
      addAudit('WEBHOOK_CREATED', 'Webhook', wh.id, { name: wh.name, url: wh.url });
      saveDemoState(state);
      return wh as unknown as T;
    }
  }

  // 8. NOTIFICATIONS & AUDIT & LGPD
  if (normalizedPath === '/notifications' && method === 'GET') {
    return state.notifications as unknown as T;
  }

  const notifReadMatch = normalizedPath.match(/^\/notifications\/([^/]+)\/read$/);
  if (notifReadMatch && method === 'PATCH') {
    const notifId = notifReadMatch[1]!;
    const n = state.notifications.find((item) => item.id === notifId);
    if (n) n.readAt = new Date().toISOString();
    saveDemoState(state);
    return { ok: true } as unknown as T;
  }

  if (normalizedPath === '/notifications/read-all' && method === 'PATCH') {
    for (const n of state.notifications) {
      if (!n.readAt) n.readAt = new Date().toISOString();
    }
    saveDemoState(state);
    return { ok: true } as unknown as T;
  }

  if (normalizedPath === '/audit/logs' && method === 'GET') {
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = 20;
    const totalItems = state.auditLogs.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const data = state.auditLogs.slice(startIndex, startIndex + pageSize);

    const response: PaginatedResponse<AuditLogDto> = {
      data,
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
    return response as unknown as T;
  }

  const lgpdExportMatch = normalizedPath.match(/^\/lgpd\/export\/([^/]+)$/);
  if (lgpdExportMatch && method === 'GET') {
    const userId = lgpdExportMatch[1]!;
    const targetUser = state.users.find((u) => u.id === userId) ?? currentUser;
    const exportPayload = {
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        roleCode: targetUser.roleCode,
        mfaEnabled: targetUser.mfaEnabled,
      },
      ticketsRequested: state.tickets.filter((t) => t.requester.id === targetUser.id).map(toTicketSummary),
      auditLogsRelated: state.auditLogs.filter((l) => l.actor?.id === targetUser.id),
      exportedAt: new Date().toISOString(),
      governance: 'Civora LGPD Compliant Platform',
    };
    addAudit('LGPD_DATA_EXPORTED', 'User', targetUser.id);
    saveDemoState(state);
    return exportPayload as unknown as T;
  }

  // 9. SLA & DASHBOARD & REPORTS
  if (normalizedPath === '/sla/calendars' && method === 'GET') {
    return [
      {
        id: 'cal-01',
        name: 'Horário Comercial Corporativo (Seg–Sex 08h–18h)',
        timezone: 'America/Sao_Paulo',
        isDefault: true,
        businessHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: '08:00', endTime: '18:00' })),
        holidays: [
          { id: 'hol-1', date: '2026-01-01', name: 'Confraternização Universal' },
          { id: 'hol-2', date: '2026-11-15', name: 'Proclamação da República' },
        ],
      },
    ] as unknown as T;
  }

  if (normalizedPath === '/sla/policies' && method === 'GET') {
    return [
      {
        id: 'pol-01',
        name: 'Política SLA Corporativa Padrão',
        contractCode: 'SLA-ENTERPRISE-BASE',
        isActive: true,
        calendar: { name: 'Horário Comercial Corporativo', timezone: 'America/Sao_Paulo' },
        targets: [
          { priority: 'CRITICAL', firstResponseMinutes: 15, updateMinutes: 30, resolutionMinutes: 120, warningThresholdPct: 75 },
          { priority: 'HIGH', firstResponseMinutes: 30, updateMinutes: 60, resolutionMinutes: 240, warningThresholdPct: 80 },
          { priority: 'MEDIUM', firstResponseMinutes: 120, updateMinutes: 240, resolutionMinutes: 720, warningThresholdPct: 80 },
          { priority: 'LOW', firstResponseMinutes: 240, updateMinutes: 480, resolutionMinutes: 1440, warningThresholdPct: 85 },
        ],
      },
    ] as unknown as T;
  }

  if (normalizedPath === '/reports/dashboard' && method === 'GET') {
    const tickets = state.tickets;
    const totalTickets = tickets.length;
    const criticalTickets = tickets.filter((t) => t.priority === 'CRITICAL' && t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;
    const inProgressTickets = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
    const resolvedToday = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
    const backlogTickets = tickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;

    const byPriority: DashboardMetricsDto['byPriority'] = [
      { priority: 'CRITICAL', count: tickets.filter((t) => t.priority === 'CRITICAL').length },
      { priority: 'HIGH', count: tickets.filter((t) => t.priority === 'HIGH').length },
      { priority: 'MEDIUM', count: tickets.filter((t) => t.priority === 'MEDIUM').length },
      { priority: 'LOW', count: tickets.filter((t) => t.priority === 'LOW').length },
    ];

    const byStatus: DashboardMetricsDto['byStatus'] = [
      { status: 'NEW', count: tickets.filter((t) => t.status === 'NEW').length },
      { status: 'TRIAGE', count: tickets.filter((t) => t.status === 'TRIAGE').length },
      { status: 'OPEN', count: tickets.filter((t) => t.status === 'OPEN').length },
      { status: 'IN_PROGRESS', count: tickets.filter((t) => t.status === 'IN_PROGRESS').length },
      { status: 'WAITING_APPROVAL', count: tickets.filter((t) => t.status === 'WAITING_APPROVAL').length },
      { status: 'RESOLVED', count: tickets.filter((t) => t.status === 'RESOLVED').length },
    ];

    const volumeOverTime = [
      { date: '06/11', created: 3, resolved: 2 },
      { date: '07/11', created: 4, resolved: 4 },
      { date: '08/11', created: 2, resolved: 3 },
      { date: '09/11', created: 5, resolved: 4 },
      { date: '10/11', created: 6, resolved: 5 },
      { date: '11/11', created: 4, resolved: 3 },
      { date: '12/11', created: totalTickets, resolved: resolvedToday },
    ];

    const teamPerformance = state.teams.map((tm) => {
      const teamTickets = tickets.filter((t) => t.team?.id === tm.id);
      const openCount = teamTickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;
      const resolvedCount = teamTickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
      return {
        teamId: tm.id,
        teamName: tm.name,
        openCount,
        resolvedCount,
        slaComplianceRate: 97,
        avgResolutionMinutes: 48,
      };
    });

    const slaAtRiskTickets = tickets
      .filter((t) => t.sla && (t.sla.state === 'WARNING' || t.sla.state === 'BREACHED'))
      .map(toTicketSummary);

    const metrics: DashboardMetricsDto = {
      totalTickets,
      criticalTickets,
      inProgressTickets,
      resolvedToday,
      backlogTickets,
      mttaMinutes: 14,
      mttrMinutes: 52,
      slaComplianceRate: 98.4,
      reopenRate: 1.2,
      avgCsat: 4.9,
      byPriority,
      byStatus,
      volumeOverTime,
      teamPerformance,
      slaAtRiskTickets,
    };
    return metrics as unknown as T;
  }

  // 10. ORGANIZATIONS & SETTINGS
  if (normalizedPath === '/organizations/current') {
    if (method === 'GET') return state.organization as unknown as T;
    if (method === 'PATCH') {
      if (body.aiEnabled !== undefined) state.organization.aiEnabled = Boolean(body.aiEnabled);
      if (body.name !== undefined) state.organization.name = String(body.name);
      addAudit('ORGANIZATION_UPDATED', 'Organization', state.organization.id, { aiEnabled: state.organization.aiEnabled });
      saveDemoState(state);
      return state.organization as unknown as T;
    }
  }

  if (normalizedPath === '/integrations/adapters' && method === 'GET') {
    return {
      storage: { provider: 'demo-local', bucket: 'civora-attachments-demo', connected: true },
      email: { provider: 'demo-smtp', host: 'localhost', connected: true },
      ai: { provider: state.organization.aiEnabled ? 'demo-neural' : 'disabled', model: 'civora-v2' },
      metrics: { provider: 'prometheus-otel', exporter: 'active' },
    } as unknown as T;
  }

  throw makeProblemError(404, 'Not Found', `Endpoint de demonstração não mapeado: ${method} ${path}`, path);
}
