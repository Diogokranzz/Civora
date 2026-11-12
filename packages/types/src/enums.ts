export const ROLE_CODES = [
  'PlatformAdmin',
  'OrganizationOwner',
  'Administrator',
  'ServiceManager',
  'Supervisor',
  'Agent',
  'Approver',
  'Requester',
  'Auditor',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const PERMISSION_CODES = [
  'tickets:read',
  'tickets:read_all',
  'tickets:create',
  'tickets:update',
  'tickets:assign',
  'tickets:transition',
  'tickets:reopen_canceled',
  'tickets:override_priority',
  'tickets:comment_public',
  'tickets:comment_internal',
  'tickets:bulk_update',
  'tickets:export',
  'sla:read',
  'sla:manage',
  'kb:read',
  'kb:write',
  'kb:review',
  'kb:publish',
  'catalog:read',
  'catalog:manage',
  'assets:read',
  'assets:manage',
  'itsm:read',
  'itsm:manage',
  'approvals:read',
  'approvals:decide',
  'automations:read',
  'automations:manage',
  'reports:read',
  'reports:export',
  'audit:read',
  'lgpd:manage',
  'org:read',
  'org:manage',
  'users:read',
  'users:manage',
  'webhooks:manage',
  'ai:use',
  'ai:configure',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const TICKET_STATUSES = [
  'NEW',
  'TRIAGE',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_THIRD_PARTY',
  'WAITING_APPROVAL',
  'RESOLVED',
  'CLOSED',
  'CANCELED',
  'REOPENED',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_TYPES = [
  'INCIDENT',
  'SERVICE_REQUEST',
  'ACCESS_REQUEST',
  'QUESTION',
  'CHANGE_REQUEST',
] as const;

export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_CHANNELS = [
  'PORTAL',
  'AGENT_CONSOLE',
  'EMAIL',
  'API',
  'WEBHOOK',
  'SLACK',
  'TEAMS',
] as const;

export type TicketChannel = (typeof TICKET_CHANNELS)[number];

export const IMPACT_URGENCY_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type ImpactLevel = (typeof IMPACT_URGENCY_LEVELS)[number];
export type UrgencyLevel = (typeof IMPACT_URGENCY_LEVELS)[number];

export const PRIORITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const SLA_INSTANCE_STATES = [
  'ACTIVE',
  'PAUSED',
  'WARNING',
  'BREACHED',
  'MET',
  'CANCELED',
] as const;

export type SlaInstanceState = (typeof SLA_INSTANCE_STATES)[number];

export const KNOWLEDGE_STATUSES = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const KNOWLEDGE_VISIBILITIES = ['INTERNAL', 'PUBLIC'] as const;
export type KnowledgeVisibility = (typeof KNOWLEDGE_VISIBILITIES)[number];

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const AUTOMATION_TRIGGERS = [
  'TICKET_CREATED',
  'TICKET_STATUS_CHANGED',
  'TICKET_PRIORITY_CHANGED',
  'TICKET_ASSIGNEE_CHANGED',
  'SLA_WARNING_REACHED',
  'SLA_BREACHED',
  'COMMENT_ADDED',
  'APPROVAL_RESPONDED',
  'TICKET_STALE',
  'WEBHOOK_RECEIVED',
] as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

export const CONDITION_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'in',
  'gt',
  'lt',
  'is_empty',
  'not_empty',
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const AUTOMATION_ACTION_TYPES = [
  'CHANGE_STATUS',
  'SET_PRIORITY',
  'ASSIGN_TEAM',
  'ASSIGN_AGENT',
  'ADD_TAG',
  'SEND_NOTIFICATION',
  'CREATE_APPROVAL',
  'EXECUTE_WEBHOOK',
  'ADD_INTERNAL_NOTE',
  'ESCALATE_SUPERVISOR',
  'CREATE_ASYNC_TASK',
] as const;

export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

export const PROBLEM_STATUSES = [
  'LOGGED',
  'INVESTIGATING',
  'KNOWN_ERROR',
  'RESOLVED',
  'CLOSED',
] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

export const CHANGE_STATUSES = [
  'DRAFT',
  'ASSESSMENT',
  'CAB_APPROVAL',
  'SCHEDULED',
  'IMPLEMENTING',
  'COMPLETED',
  'ROLLED_BACK',
  'CANCELED',
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export const CHANGE_RISKS = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as const;
export type ChangeRisk = (typeof CHANGE_RISKS)[number];

export const ASSET_STATUSES = [
  'ACTIVE',
  'IN_MAINTENANCE',
  'RETIRED',
  'DISPOSED',
  'LOST',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const AI_FEATURE_TYPES = [
  'CLASSIFY_CATEGORY',
  'SUGGEST_PRIORITY',
  'SUMMARIZE_TIMELINE',
  'SUGGEST_REPLY',
  'SIMILAR_TICKETS',
  'RECOMMEND_ARTICLES',
  'DETECT_SENSITIVE_INFO',
  'DRAFT_ARTICLE',
  'SEMANTIC_KB_SEARCH',
] as const;
export type AiFeatureType = (typeof AI_FEATURE_TYPES)[number];

export const AI_DECISIONS = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type AiDecision = (typeof AI_DECISIONS)[number];

