import type {
  AiDecision,
  AiFeatureType,
  ApprovalStatus,
  AssetStatus,
  AutomationActionType,
  AutomationTrigger,
  ChangeRisk,
  ChangeStatus,
  ConditionOperator,
  ImpactLevel,
  KnowledgeStatus,
  KnowledgeVisibility,
  PermissionCode,
  PriorityLevel,
  ProblemStatus,
  RoleCode,
  SlaInstanceState,
  TicketChannel,
  TicketStatus,
  TicketType,
  UrgencyLevel,
} from './enums';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  correlationId: string;
  code?: string;
  errors?: Array<{ field: string; message: string }>;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  mfaEnabled: boolean;
  activeOrganizationId: string;
  activeUnitId: string | null;
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    roleCode: RoleCode;
    permissions: PermissionCode[];
    defaultUnitId: string | null;
  }>;
}

export interface TicketSummaryDto {
  id: string;
  tenantId: string;
  publicNumber: string;
  title: string;
  type: TicketType;
  channel: TicketChannel;
  status: TicketStatus;
  impact: ImpactLevel;
  urgency: UrgencyLevel;
  priority: PriorityLevel;
  priorityOverridden: boolean;
  tags: string[];
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
  unit: { id: string; name: string; code: string } | null;
  department: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  service: { id: string; name: string } | null;
  sla: {
    state: SlaInstanceState;
    policyName: string;
    firstResponseDueAt: string | null;
    firstResponseMetAt: string | null;
    resolutionDueAt: string | null;
    resolutionMetAt: string | null;
    pausedAt: string | null;
    consumedPercent: number;
    warningTriggered: boolean;
    breached: boolean;
  } | null;
  dueAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  csatScore: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketCommentDto {
  id: string;
  ticketId: string;
  author: { id: string; name: string; email: string };
  bodyHtml: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketAttachmentDto {
  id: string;
  ticketId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: { id: string; name: string };
  createdAt: string;
}

export interface TicketTimelineEventDto {
  id: string;
  ticketId: string;
  eventType: string;
  actor: { id: string; name: string } | null;
  payload: Record<string, unknown>;
  correlationId: string | null;
  createdAt: string;
}

export interface TicketDetailDto extends TicketSummaryDto {
  descriptionHtml: string;
  subcategory: string | null;
  resolutionSummary: string | null;
  cancellationReason: string | null;
  priorityOverrideReason: string | null;
  csatComment: string | null;
  customFields: Record<string, unknown>;
  participants: Array<{
    userId: string;
    name: string;
    email: string;
    kind: 'WATCHER' | 'COLLABORATOR';
  }>;
  comments: TicketCommentDto[];
  attachments: TicketAttachmentDto[];
  approvals: ApprovalDto[];
  slaClockEvents: Array<{
    id: string;
    eventType: string;
    occurredAt: string;
    reason: string | null;
    elapsedBusinessMinutes: number;
  }>;
}

export interface ApprovalDto {
  id: string;
  ticketId: string;
  title: string;
  status: ApprovalStatus;
  requestedBy: { id: string; name: string };
  steps: Array<{
    id: string;
    stepOrder: number;
    approver: { id: string; name: string; email: string };
    status: ApprovalStatus;
    decisionNote: string | null;
    decidedAt: string | null;
  }>;
  createdAt: string;
}

export interface DashboardMetricsDto {
  totalTickets: number;
  criticalTickets: number;
  inProgressTickets: number;
  resolvedToday: number;
  backlogTickets: number;
  mttaMinutes: number;
  mttrMinutes: number;
  slaComplianceRate: number;
  reopenRate: number;
  avgCsat: number | null;
  byPriority: Array<{ priority: PriorityLevel; count: number }>;
  byStatus: Array<{ status: TicketStatus; count: number }>;
  volumeOverTime: Array<{ date: string; created: number; resolved: number }>;
  teamPerformance: Array<{
    teamId: string;
    teamName: string;
    openCount: number;
    resolvedCount: number;
    slaComplianceRate: number;
    avgResolutionMinutes: number;
  }>;
  slaAtRiskTickets: TicketSummaryDto[];
}

export interface KnowledgeArticleDto {
  id: string;
  tenantId: string;
  slug: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  status: KnowledgeStatus;
  visibility: KnowledgeVisibility;
  tags: string[];
  category: { id: string; name: string } | null;
  author: { id: string; name: string };
  reviewer: { id: string; name: string } | null;
  currentVersion: number;
  helpfulCount: number;
  notHelpfulCount: number;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AssetRelationshipRefDto {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: 'DEPENDS_ON' | 'HOSTED_ON' | 'CONNECTS_TO' | string;
  target?: { id: string; assetTag: string; name: string; assetType?: string; status?: AssetStatus };
  source?: { id: string; assetTag: string; name: string; assetType?: string; status?: AssetStatus };
}

export interface AssetDto {
  id: string;
  tenantId: string;
  assetTag: string;
  name: string;
  assetType: string;
  status: AssetStatus;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  unit: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  outgoingRels?: AssetRelationshipRefDto[];
  incomingRels?: AssetRelationshipRefDto[];
  layoutPosition?: readonly [number, number, number];
  version: number;
  updatedAt: string;
}

export interface TopologyGraphDto {
  nodes: AssetDto[];
  edges: AssetRelationshipRefDto[];
  layoutPositions: Record<string, readonly [number, number, number]>;
  cacheStatus: 'HIT' | 'MISS' | 'CIRCUIT_OPEN';
  hydratedAt: string;
}

export interface ClientTelemetryPayloadDto {
  fpsDrops?: Array<{
    scene: string;
    fps: number;
    maxFrameMs: number;
    windowMs?: number;
  }>;
  vitals?: Array<{
    name: 'LCP' | 'FID' | 'CLS' | 'INP' | 'FCP' | 'TTFB';
    value: number;
  }>;
  backpressure?: {
    coalescedCount: number;
    droppedCount: number;
  };
}

export interface ProblemDto {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  description: string;
  rootCause: string | null;
  workaround: string | null;
  status: ProblemStatus;
  priority: PriorityLevel;
  linkedTicketCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeDto {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  description: string;
  risk: ChangeRisk;
  status: ChangeStatus;
  implementationPlan: string;
  rollbackPlan: string;
  windowStartAt: string | null;
  windowEndAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationCondition {
  field: string;
  operator: ConditionOperator;
  value?: string | number | boolean | string[];
}

export interface AutomationAction {
  type: AutomationActionType;
  params: Record<string, string | number | boolean | string[]>;
}

export interface AutomationRuleDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  isActive: boolean;
  priorityOrder: number;
  executionCount: number;
  lastExecutedAt: string | null;
}

export interface AiSuggestionDto {
  id: string;
  featureType: AiFeatureType;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  tokenUsage: number;
  suggestionPayload: Record<string, unknown>;
  decision: AiDecision;
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  title: string;
  message: string;
  category: string;
  ticketId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  tenantId: string;
  actor: { id: string; name: string; email: string } | null;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  origin: string;
  createdAt: string;
}

export const SOCKET_EVENTS = {
  TICKET_CREATED: 'ticket.created',
  TICKET_UPDATED: 'ticket.updated',
  TICKET_COMMENT_ADDED: 'ticket.comment.added',
  SLA_UPDATED: 'sla.updated',
  DASHBOARD_REFRESH: 'dashboard.refresh',
  NOTIFICATION_CREATED: 'notification.created',
  PRESENCE_VIEWING: 'presence.viewing',
} as const;

export interface TicketRealtimePayload {
  tenantId: string;
  ticketId: string;
  publicNumber: string;
  status: TicketStatus;
  priority: PriorityLevel;
  assigneeId: string | null;
  correlationId: string;
}

