import { ROLE_PERMISSION_MATRIX } from '@civora/config';
import type {
  ApprovalDto,
  AssetDto,
  AssetRelationshipRefDto,
  AuditLogDto,
  AutomationRuleDto,
  ChangeDto,
  KnowledgeArticleDto,
  NotificationDto,
  ProblemDto,
  RoleCode,
  TicketDetailDto,
  TicketTimelineEventDto,
} from '@civora/types';
import { ROLE_CODES } from '@civora/types';

export interface DemoUserRecord {
  id: string;
  email: string;
  name: string;
  password: string;
  roleCode: RoleCode;
  defaultUnitId: string | null;
  departmentId: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  mfaSecret: string;
}

export interface DemoUnit {
  id: string;
  name: string;
  code: string;
  timezone: string;
  address: string | null;
  isActive: boolean;
}

export interface DemoDepartment {
  id: string;
  name: string;
  code: string;
  unitId: string | null;
}

export interface DemoTeam {
  id: string;
  name: string;
  departmentId: string | null;
  supervisorId: string | null;
  memberIds: string[];
}

export interface DemoServiceItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  defaultType: string;
  defaultImpact: string;
  defaultUrgency: string;
  requiresApproval: boolean;
  category: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  form: {
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
}

export interface DemoSavedView {
  id: string;
  name: string;
  filtersJson: Record<string, unknown>;
}

export interface DemoAutomationExecution {
  id: string;
  status: string;
  correlationId: string;
  depth: number;
  executedAt: string;
  errorMessage: string | null;
  rule: { name: string; trigger: string };
}

export interface DemoWebhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  deliveries: Array<{
    id: string;
    eventType: string;
    status: string;
    responseCode: number | null;
    createdAt: string;
  }>;
}

export interface DemoDatabaseState {
  version: number;
  nextTicketSeq: number;
  organization: {
    id: string;
    name: string;
    slug: string;
    aiEnabled: boolean;
    dataRetentionDays: number;
    defaultTimezone: string;
    featureFlags: Array<{ key: string; enabled: boolean }>;
    subscription: { plan: string; status: string; maxAgents: number; maxUnits: number };
  };
  users: DemoUserRecord[];
  units: DemoUnit[];
  departments: DemoDepartment[];
  teams: DemoTeam[];
  tickets: TicketDetailDto[];
  timelines: Record<string, TicketTimelineEventDto[]>;
  attachmentContents: Record<string, string>;
  savedViews: DemoSavedView[];
  knowledge: KnowledgeArticleDto[];
  assets: AssetDto[];
  assetRelationships: AssetRelationshipRefDto[];
  assetLayoutPositions: Record<string, readonly [number, number, number]>;
  problems: ProblemDto[];
  changes: ChangeDto[];
  automationRules: AutomationRuleDto[];
  automationExecutions: DemoAutomationExecution[];
  webhooks: DemoWebhook[];
  notifications: NotificationDto[];
  auditLogs: AuditLogDto[];
  services: DemoServiceItem[];
  categories: Array<{ id: string; name: string; slug: string }>;
}

export const DEMO_TENANT_ID = 'org-civora-corp';

export const DEMO_STATIC_TICKET_IDS = [
  'demo-ticket-01',
  'demo-ticket-02',
  'demo-ticket-03',
  'demo-ticket-04',
  'demo-ticket-05',
  'demo-ticket-06',
] as const;

export const ROLE_METADATA: Record<RoleCode, { name: string; description: string }> = {
  PlatformAdmin: {
    name: 'Administrador da Plataforma',
    description: 'Governança global multi-tenant e administração irrestrita.',
  },
  OrganizationOwner: {
    name: 'Proprietário da Organização',
    description: 'Controle total da organização, estrutura, RBAC, IA e LGPD.',
  },
  Administrator: {
    name: 'Administrador',
    description: 'Administração operacional de unidades, usuários, SLA e segurança.',
  },
  ServiceManager: {
    name: 'Gestor de Serviços',
    description: 'Gestão de catálogo, políticas de SLA, automações e relatórios.',
  },
  Supervisor: {
    name: 'Supervisor',
    description: 'Coordenação de equipes, escalonamentos e aprovações.',
  },
  Agent: {
    name: 'Agente de Atendimento',
    description: 'Operação de fila, incidentes, conhecimento e topologia CMDB.',
  },
  Approver: {
    name: 'Aprovador',
    description: 'Decisão formal de aprovações e mudanças críticas.',
  },
  Requester: {
    name: 'Solicitante',
    description: 'Abertura e acompanhamento no Portal do Solicitante.',
  },
  Auditor: {
    name: 'Auditor',
    description: 'Leitura de trilhas imutáveis, indicadores e conformidade LGPD.',
  },
};

export function createInitialDemoState(): DemoDatabaseState {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const hoursAhead = (h: number) => new Date(now + h * 3_600_000).toISOString();

  const units: DemoUnit[] = [
    { id: 'unit-hq-sp', code: 'HQ-SP', name: 'Matriz Corporativa — São Paulo', timezone: 'America/Sao_Paulo', address: 'Sede Administrativa Principal — SP', isActive: true },
    { id: 'unit-fil-rj', code: 'FIL-RJ', name: 'Filial Executiva — Rio de Janeiro', timezone: 'America/Sao_Paulo', address: 'Centro Empresarial — RJ', isActive: true },
    { id: 'unit-fil-mg', code: 'FIL-MG', name: 'Unidade Regional — Belo Horizonte', timezone: 'America/Sao_Paulo', address: 'Escritório Regional Sudeste — MG', isActive: true },
    { id: 'unit-fil-pr', code: 'FIL-PR', name: 'Unidade Sul — Curitiba', timezone: 'America/Sao_Paulo', address: 'Polo Operacional Sul — PR', isActive: true },
    { id: 'unit-cd-ops', code: 'CD-OPS', name: 'Centro de Distribuição & Logística', timezone: 'America/Sao_Paulo', address: 'Complexo Logístico Integrado', isActive: true },
    { id: 'unit-dc-pri', code: 'DC-PRI', name: 'Datacenter Principal & NOC', timezone: 'America/Sao_Paulo', address: 'Infraestrutura Crítica & Operações 24x7', isActive: true },
    { id: 'unit-lab-ti', code: 'LAB-TI', name: 'Hub de Tecnologia, P&D e Engenharia', timezone: 'America/Sao_Paulo', address: 'Campus Digital & Sustentação', isActive: true },
    { id: 'unit-remoto', code: 'REMOTO', name: 'Operação Remota & Trabalho Híbrido', timezone: 'America/Sao_Paulo', address: 'Ambiente Corporativo Distribuído', isActive: true },
  ];

  const departments: DemoDepartment[] = [
    { id: 'dept-ti', code: 'TI', name: 'Tecnologia da Informação & Suporte', unitId: 'unit-hq-sp' },
    { id: 'dept-infra', code: 'INFRA', name: 'Infraestrutura, Redes & Cloud', unitId: 'unit-dc-pri' },
    { id: 'dept-sec', code: 'SEC', name: 'Segurança da Informação (InfoSec / SOC)', unitId: 'unit-dc-pri' },
    { id: 'dept-eng', code: 'ENG', name: 'Engenharia de Sistemas & Aplicações', unitId: 'unit-lab-ti' },
    { id: 'dept-csc', code: 'CSC', name: 'Central de Serviços & Atendimento Interno', unitId: 'unit-hq-sp' },
    { id: 'dept-fac', code: 'FAC', name: 'Facilities & Infraestrutura Predial', unitId: 'unit-hq-sp' },
    { id: 'dept-rh', code: 'RH', name: 'Recursos Humanos & Gestão de Pessoas', unitId: 'unit-hq-sp' },
    { id: 'dept-fin', code: 'FIN', name: 'Financeiro, Fiscal & Controladoria', unitId: 'unit-hq-sp' },
    { id: 'dept-jur', code: 'JUR', name: 'Jurídico, Risco & Compliance (LGPD)', unitId: 'unit-hq-sp' },
    { id: 'dept-log', code: 'LOG', name: 'Logística & Patrimônio', unitId: 'unit-cd-ops' },
  ];

  const users: DemoUserRecord[] = [
    {
      id: 'user-admin-pro',
      email: 'admin.pro@civora.local',
      name: 'Administrador PRO',
      password: 'Civora@2026!',
      roleCode: 'OrganizationOwner',
      defaultUnitId: 'unit-hq-sp',
      departmentId: 'dept-ti',
      isActive: true,
      mfaEnabled: false,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
    },
    {
      id: 'user-agent-noc',
      email: 'noc.sre@civora.local',
      name: 'Marina Costa (NOC/SRE)',
      password: 'Civora@2026!',
      roleCode: 'Agent',
      defaultUnitId: 'unit-dc-pri',
      departmentId: 'dept-infra',
      isActive: true,
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
    },
    {
      id: 'user-supervisor-csc',
      email: 'supervisor@civora.local',
      name: 'Rafael Almeida',
      password: 'Civora@2026!',
      roleCode: 'Supervisor',
      defaultUnitId: 'unit-hq-sp',
      departmentId: 'dept-csc',
      isActive: true,
      mfaEnabled: false,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
    },
    {
      id: 'user-requester-fin',
      email: 'solicitante@civora.local',
      name: 'Camila Ferreira',
      password: 'Civora@2026!',
      roleCode: 'Requester',
      defaultUnitId: 'unit-hq-sp',
      departmentId: 'dept-fin',
      isActive: true,
      mfaEnabled: false,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
    },
  ];

  const teams: DemoTeam[] = [
    { id: 'team-csc-n1', name: 'Service Desk N1 — Triagem & Primeiro Atendimento', departmentId: 'dept-csc', supervisorId: 'user-supervisor-csc', memberIds: ['user-supervisor-csc'] },
    { id: 'team-infra-noc', name: 'Infraestrutura, Redes & Conectividade (NOC)', departmentId: 'dept-infra', supervisorId: 'user-agent-noc', memberIds: ['user-agent-noc', 'user-admin-pro'] },
    { id: 'team-sec-soc', name: 'SOC — Incidentes de Segurança & Resposta Cibernética', departmentId: 'dept-sec', supervisorId: 'user-admin-pro', memberIds: ['user-admin-pro'] },
    { id: 'team-eng-erp', name: 'Sustentação ERP, CRM & Sistemas Corporativos', departmentId: 'dept-eng', supervisorId: 'user-supervisor-csc', memberIds: ['user-agent-noc'] },
  ];

  const assets: AssetDto[] = [
    {
      id: 'asset-rtr-core',
      tenantId: DEMO_TENANT_ID,
      assetTag: 'RTR-CORE-01',
      name: 'Core Router Matriz BGP',
      assetType: 'ROUTER',
      status: 'ACTIVE',
      serialNumber: 'CSCO-9K-001',
      manufacturer: 'Cisco',
      model: 'ASR 9000',
      unit: { id: 'unit-dc-pri', name: 'Datacenter Principal & NOC' },
      department: { id: 'dept-infra', name: 'Infraestrutura, Redes & Cloud' },
      owner: { id: 'user-agent-noc', name: 'Marina Costa (NOC/SRE)' },
      layoutPosition: [-4.2, 1.4, -1.2],
      version: 1,
      updatedAt: hoursAgo(4),
    },
    {
      id: 'asset-sw-dist',
      tenantId: DEMO_TENANT_ID,
      assetTag: 'SW-DIST-DC1',
      name: 'Switch Core Spine DC1',
      assetType: 'SWITCH',
      status: 'ACTIVE',
      serialNumber: 'ARST-7280-04',
      manufacturer: 'Arista',
      model: '7280R3',
      unit: { id: 'unit-dc-pri', name: 'Datacenter Principal & NOC' },
      department: { id: 'dept-infra', name: 'Infraestrutura, Redes & Cloud' },
      owner: { id: 'user-agent-noc', name: 'Marina Costa (NOC/SRE)' },
      layoutPosition: [-1.4, 1.0, 1.6],
      version: 1,
      updatedAt: hoursAgo(6),
    },
    {
      id: 'asset-srv-k8s',
      tenantId: DEMO_TENANT_ID,
      assetTag: 'SRV-K8S-01',
      name: 'Cluster Kubernetes Produção',
      assetType: 'SERVER',
      status: 'ACTIVE',
      serialNumber: 'DELL-R760-12',
      manufacturer: 'Dell',
      model: 'PowerEdge R760',
      unit: { id: 'unit-dc-pri', name: 'Datacenter Principal & NOC' },
      department: { id: 'dept-infra', name: 'Infraestrutura, Redes & Cloud' },
      owner: { id: 'user-agent-noc', name: 'Marina Costa (NOC/SRE)' },
      layoutPosition: [1.5, 0.8, 0.2],
      version: 1,
      updatedAt: hoursAgo(3),
    },
    {
      id: 'asset-db-pg',
      tenantId: DEMO_TENANT_ID,
      assetTag: 'DB-PG-PROD',
      name: 'PostgreSQL Multi-Tenant Cluster',
      assetType: 'DATABASE',
      status: 'ACTIVE',
      serialNumber: 'PG16-HA-01',
      manufacturer: 'PostgreSQL',
      model: 'Cluster 16 HA',
      unit: { id: 'unit-dc-pri', name: 'Datacenter Principal & NOC' },
      department: { id: 'dept-eng', name: 'Engenharia de Sistemas & Aplicações' },
      owner: { id: 'user-admin-pro', name: 'Administrador PRO' },
      layoutPosition: [3.8, -0.6, -1.4],
      version: 1,
      updatedAt: hoursAgo(2),
    },
    {
      id: 'asset-app-erp',
      tenantId: DEMO_TENANT_ID,
      assetTag: 'APP-ERP-CORE',
      name: 'ERP Corporativo & Faturamento',
      assetType: 'APPLICATION',
      status: 'ACTIVE',
      serialNumber: 'APP-FIN-09',
      manufacturer: 'Interno',
      model: 'Service Mesh v4',
      unit: { id: 'unit-hq-sp', name: 'Matriz Corporativa — São Paulo' },
      department: { id: 'dept-eng', name: 'Engenharia de Sistemas & Aplicações' },
      owner: { id: 'user-admin-pro', name: 'Administrador PRO' },
      layoutPosition: [4.6, 1.5, 1.8],
      version: 1,
      updatedAt: hoursAgo(1),
    },
  ];

  const assetRelationships: AssetRelationshipRefDto[] = [
    { id: 'rel-1', sourceId: 'asset-sw-dist', targetId: 'asset-rtr-core', relationType: 'CONNECTS_TO' },
    { id: 'rel-2', sourceId: 'asset-srv-k8s', targetId: 'asset-sw-dist', relationType: 'DEPENDS_ON' },
    { id: 'rel-3', sourceId: 'asset-db-pg', targetId: 'asset-srv-k8s', relationType: 'HOSTED_ON' },
    { id: 'rel-4', sourceId: 'asset-app-erp', targetId: 'asset-db-pg', relationType: 'DEPENDS_ON' },
  ];

  const assetLayoutPositions: Record<string, readonly [number, number, number]> = {};
  for (const a of assets) {
    if (a.layoutPosition) assetLayoutPositions[a.id] = a.layoutPosition;
  }

  const approvalsDemo: ApprovalDto[] = [
    {
      id: 'apr-01',
      ticketId: 'demo-ticket-04',
      title: 'Aprovação de Acesso Privilegiado VPN Prod',
      status: 'PENDING',
      requestedBy: { id: 'user-requester-fin', name: 'Camila Ferreira' },
      steps: [
        {
          id: 'apr-step-1',
          stepOrder: 1,
          approver: {
            id: 'user-admin-pro',
            name: 'Administrador PRO',
            email: 'admin.pro@civora.local',
          },
          status: 'PENDING',
          decisionNote: null,
          decidedAt: null,
        },
      ],
      createdAt: hoursAgo(5),
    },
  ];

  const tickets: TicketDetailDto[] = [
    {
      id: 'demo-ticket-01',
      tenantId: DEMO_TENANT_ID,
      publicNumber: 'CIV-2026-000001',
      title: 'Latência intermitente no link MPLS do Datacenter DC-PRI',
      type: 'INCIDENT',
      channel: 'AGENT_CONSOLE',
      status: 'IN_PROGRESS',
      impact: 'HIGH',
      urgency: 'HIGH',
      priority: 'CRITICAL',
      priorityOverridden: false,
      tags: ['rede', 'bgp', 'dc-pri'],
      requester: { id: 'user-supervisor-csc', name: 'Rafael Almeida', email: 'supervisor@civora.local' },
      assignee: { id: 'user-agent-noc', name: 'Marina Costa (NOC/SRE)', email: 'noc.sre@civora.local' },
      unit: { id: 'unit-dc-pri', name: 'Datacenter Principal & NOC', code: 'DC-PRI' },
      department: { id: 'dept-infra', name: 'Infraestrutura, Redes & Cloud' },
      team: { id: 'team-infra-noc', name: 'Infraestrutura, Redes & Conectividade (NOC)' },
      category: { id: 'cat-infra', name: 'Infraestrutura & Redes' },
      service: null,
      sla: {
        state: 'WARNING',
        policyName: 'Política SLA Corporativa Padrão',
        firstResponseDueAt: hoursAgo(2),
        firstResponseMetAt: hoursAgo(2.2),
        resolutionDueAt: hoursAhead(1),
        resolutionMetAt: null,
        pausedAt: null,
        consumedPercent: 78,
        warningTriggered: true,
        breached: false,
      },
      dueAt: hoursAhead(1),
      firstResponseAt: hoursAgo(2.2),
      resolvedAt: null,
      closedAt: null,
      csatScore: null,
      version: 3,
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(0.5),
      descriptionHtml:
        '<p>Monitoramento Prometheus detectou perda de pacotes de 4,2% entre o core router RTR-CORE-01 e o switch spine SW-DIST-DC1.</p>',
      subcategory: 'Conectividade BGP',
      resolutionSummary: null,
      cancellationReason: null,
      priorityOverrideReason: null,
      csatComment: null,
      customFields: { ativo: 'RTR-CORE-01' },
      participants: [{ userId: 'user-admin-pro', name: 'Administrador PRO', email: 'admin.pro@civora.local', kind: 'WATCHER' }],
      comments: [
        {
          id: 'cmt-1',
          ticketId: 'demo-ticket-01',
          author: { id: 'user-agent-noc', name: 'Marina Costa (NOC/SRE)', email: 'noc.sre@civora.local' },
          bodyHtml: '<p>Tráfego desviado temporariamente para rota secundária enquanto analisamos interface óptica SFP+.</p>',
          isInternal: false,
          createdAt: hoursAgo(1.5),
        },
        {
          id: 'cmt-2',
          ticketId: 'demo-ticket-01',
          author: { id: 'user-admin-pro', name: 'Administrador PRO', email: 'admin.pro@civora.local' },
          bodyHtml: '<p>Nota interna: acompanhar janela de manutenção preventiva caso persista após troca do transceiver.</p>',
          isInternal: true,
          createdAt: hoursAgo(0.8),
        },
      ],
      attachments: [],
      approvals: [],
      slaClockEvents: [
        { id: 'sce-1', eventType: 'CLOCK_STARTED', occurredAt: hoursAgo(3), reason: 'Abertura automática de SLA', elapsedBusinessMinutes: 0 },
        { id: 'sce-2', eventType: 'FIRST_RESPONSE_MET', occurredAt: hoursAgo(2.2), reason: 'Primeira tratativa NOC', elapsedBusinessMinutes: 12 },
      ],
    },
    {
      id: 'demo-ticket-02',
      tenantId: DEMO_TENANT_ID,
      publicNumber: 'CIV-2026-000002',
      title: 'Lentidão na emissão de notas fiscais do ERP Corporativo',
      type: 'INCIDENT',
      channel: 'PORTAL',
      status: 'OPEN',
      impact: 'HIGH',
      urgency: 'MEDIUM',
      priority: 'HIGH',
      priorityOverridden: false,
      tags: ['erp', 'fiscal', 'postgresql'],
      requester: { id: 'user-requester-fin', name: 'Camila Ferreira', email: 'solicitante@civora.local' },
      assignee: { id: 'user-agent-noc', name: 'Marina Costa (NOC/SRE)', email: 'noc.sre@civora.local' },
      unit: { id: 'unit-hq-sp', name: 'Matriz Corporativa — São Paulo', code: 'HQ-SP' },
      department: { id: 'dept-fin', name: 'Financeiro, Fiscal & Controladoria' },
      team: { id: 'team-eng-erp', name: 'Sustentação ERP, CRM & Sistemas Corporativos' },
      category: { id: 'cat-sistemas', name: 'Sistemas & Aplicações' },
      service: null,
      sla: {
        state: 'ACTIVE',
        policyName: 'Política SLA Corporativa Padrão',
        firstResponseDueAt: hoursAgo(1),
        firstResponseMetAt: hoursAgo(1.5),
        resolutionDueAt: hoursAhead(3),
        resolutionMetAt: null,
        pausedAt: null,
        consumedPercent: 42,
        warningTriggered: false,
        breached: false,
      },
      dueAt: hoursAhead(3),
      firstResponseAt: hoursAgo(1.5),
      resolvedAt: null,
      closedAt: null,
      csatScore: null,
      version: 2,
      createdAt: hoursAgo(2.5),
      updatedAt: hoursAgo(1),
      descriptionHtml: '<p>Time fiscal reportou tempo de resposta superior a 12s ao transmitir lotes de NF-e no fechamento do mês.</p>',
      subcategory: 'Performance',
      resolutionSummary: null,
      cancellationReason: null,
      priorityOverrideReason: null,
      csatComment: null,
      customFields: {},
      participants: [],
      comments: [],
      attachments: [],
      approvals: [],
      slaClockEvents: [
        { id: 'sce-3', eventType: 'CLOCK_STARTED', occurredAt: hoursAgo(2.5), reason: 'Política SLA Corporativa Padrão', elapsedBusinessMinutes: 0 },
      ],
    },
    {
      id: 'demo-ticket-03',
      tenantId: DEMO_TENANT_ID,
      publicNumber: 'CIV-2026-000003',
      title: 'Provisionamento de notebook e acesso MFA para novo analista',
      type: 'SERVICE_REQUEST',
      channel: 'PORTAL',
      status: 'TRIAGE',
      impact: 'MEDIUM',
      urgency: 'MEDIUM',
      priority: 'MEDIUM',
      priorityOverridden: false,
      tags: ['onboarding', 'mfa', 'estacao'],
      requester: { id: 'user-requester-fin', name: 'Camila Ferreira', email: 'solicitante@civora.local' },
      assignee: null,
      unit: { id: 'unit-hq-sp', name: 'Matriz Corporativa — São Paulo', code: 'HQ-SP' },
      department: { id: 'dept-rh', name: 'Recursos Humanos & Gestão de Pessoas' },
      team: { id: 'team-csc-n1', name: 'Service Desk N1 — Triagem & Primeiro Atendimento' },
      category: { id: 'cat-acesso', name: 'Acessos & Estações' },
      service: { id: 'svc-onboarding', name: 'Kit Onboarding Corporativo' },
      sla: {
        state: 'ACTIVE',
        policyName: 'Política SLA Corporativa Padrão',
        firstResponseDueAt: hoursAhead(1.5),
        firstResponseMetAt: null,
        resolutionDueAt: hoursAhead(9),
        resolutionMetAt: null,
        pausedAt: null,
        consumedPercent: 24,
        warningTriggered: false,
        breached: false,
      },
      dueAt: hoursAhead(9),
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      csatScore: null,
      version: 1,
      createdAt: hoursAgo(1.2),
      updatedAt: hoursAgo(1.2),
      descriptionHtml: '<p>Solicitação de kit estação corporativa padrão e habilitação de conta com MFA TOTP obrigatório.</p>',
      subcategory: 'Onboarding',
      resolutionSummary: null,
      cancellationReason: null,
      priorityOverrideReason: null,
      csatComment: null,
      customFields: { centroCusto: 'CC-FIN-204' },
      participants: [],
      comments: [],
      attachments: [],
      approvals: [],
      slaClockEvents: [],
    },
    {
      id: 'demo-ticket-04',
      tenantId: DEMO_TENANT_ID,
      publicNumber: 'CIV-2026-000004',
      title: 'Solicitação de acesso temporário VPN ao ambiente de auditoria',
      type: 'ACCESS_REQUEST',
      channel: 'PORTAL',
      status: 'WAITING_APPROVAL',
      impact: 'MEDIUM',
      urgency: 'HIGH',
      priority: 'HIGH',
      priorityOverridden: false,
      tags: ['vpn', 'iam', 'aprovacao'],
      requester: { id: 'user-requester-fin', name: 'Camila Ferreira', email: 'solicitante@civora.local' },
      assignee: { id: 'user-supervisor-csc', name: 'Rafael Almeida', email: 'supervisor@civora.local' },
      unit: { id: 'unit-remoto', name: 'Operação Remota & Trabalho Híbrido', code: 'REMOTO' },
      department: { id: 'dept-sec', name: 'Segurança da Informação (InfoSec / SOC)' },
      team: { id: 'team-sec-soc', name: 'SOC — Incidentes de Segurança & Resposta Cibernética' },
      category: { id: 'cat-acesso', name: 'Acessos & Estações' },
      service: { id: 'svc-vpn', name: 'Acesso VPN & Zero Trust' },
      sla: {
        state: 'PAUSED',
        policyName: 'Política SLA Corporativa Padrão',
        firstResponseDueAt: hoursAgo(4),
        firstResponseMetAt: hoursAgo(4.5),
        resolutionDueAt: hoursAhead(6),
        resolutionMetAt: null,
        pausedAt: hoursAgo(4.5),
        consumedPercent: 31,
        warningTriggered: false,
        breached: false,
      },
      dueAt: hoursAhead(6),
      firstResponseAt: hoursAgo(4.5),
      resolvedAt: null,
      closedAt: null,
      csatScore: null,
      version: 2,
      createdAt: hoursAgo(5),
      updatedAt: hoursAgo(4.5),
      descriptionHtml: '<p>Necessário acesso VPN restrito por 72h para conferência contábil de fechamento trimestral.</p>',
      subcategory: 'Zero Trust',
      resolutionSummary: null,
      cancellationReason: null,
      priorityOverrideReason: null,
      csatComment: null,
      customFields: {},
      participants: [],
      comments: [],
      attachments: [],
      approvals: approvalsDemo,
      slaClockEvents: [
        { id: 'sce-4', eventType: 'CLOCK_PAUSED', occurredAt: hoursAgo(4.5), reason: 'Aguardando decisão do aprovador', elapsedBusinessMinutes: 18 },
      ],
    },
    {
      id: 'demo-ticket-05',
      tenantId: DEMO_TENANT_ID,
      publicNumber: 'CIV-2026-000005',
      title: 'Substituição de certificado TLS no gateway de homologação',
      type: 'CHANGE_REQUEST',
      channel: 'AGENT_CONSOLE',
      status: 'RESOLVED',
      impact: 'LOW',
      urgency: 'MEDIUM',
      priority: 'LOW',
      priorityOverridden: false,
      tags: ['tls', 'certificado', 'gateway'],
      requester: { id: 'user-supervisor-csc', name: 'Rafael Almeida', email: 'supervisor@civora.local' },
      assignee: { id: 'user-agent-noc', name: 'Marina Costa (NOC/SRE)', email: 'noc.sre@civora.local' },
      unit: { id: 'unit-lab-ti', name: 'Hub de Tecnologia, P&D e Engenharia', code: 'LAB-TI' },
      department: { id: 'dept-sec', name: 'Segurança da Informação (InfoSec / SOC)' },
      team: { id: 'team-sec-soc', name: 'SOC — Incidentes de Segurança & Resposta Cibernética' },
      category: { id: 'cat-infra', name: 'Infraestrutura & Redes' },
      service: null,
      sla: {
        state: 'MET',
        policyName: 'Política SLA Corporativa Padrão',
        firstResponseDueAt: hoursAgo(18),
        firstResponseMetAt: hoursAgo(20),
        resolutionDueAt: hoursAgo(4),
        resolutionMetAt: hoursAgo(8),
        pausedAt: null,
        consumedPercent: 48,
        warningTriggered: false,
        breached: false,
      },
      dueAt: hoursAgo(4),
      firstResponseAt: hoursAgo(20),
      resolvedAt: hoursAgo(8),
      closedAt: null,
      csatScore: 5,
      version: 3,
      createdAt: hoursAgo(22),
      updatedAt: hoursAgo(8),
      descriptionHtml: '<p>Renovação automatizada de certificado TLS wildcard com validação de cadeia completa.</p>',
      subcategory: 'Certificados',
      resolutionSummary: 'Certificado renovado e validado via probe HTTP/2 sem indisponibilidade.',
      cancellationReason: null,
      priorityOverrideReason: null,
      csatComment: 'Execução limpa dentro da janela.',
      customFields: {},
      participants: [],
      comments: [],
      attachments: [],
      approvals: [],
      slaClockEvents: [],
    },
    {
      id: 'demo-ticket-06',
      tenantId: DEMO_TENANT_ID,
      publicNumber: 'CIV-2026-000006',
      title: 'Dúvida sobre política de retenção LGPD em exportação de relatórios',
      type: 'QUESTION',
      channel: 'PORTAL',
      status: 'RESOLVED',
      impact: 'LOW',
      urgency: 'LOW',
      priority: 'LOW',
      priorityOverridden: false,
      tags: ['lgpd', 'compliance'],
      requester: { id: 'user-requester-fin', name: 'Camila Ferreira', email: 'solicitante@civora.local' },
      assignee: { id: 'user-admin-pro', name: 'Administrador PRO', email: 'admin.pro@civora.local' },
      unit: { id: 'unit-hq-sp', name: 'Matriz Corporativa — São Paulo', code: 'HQ-SP' },
      department: { id: 'dept-jur', name: 'Jurídico, Risco & Compliance (LGPD)' },
      team: { id: 'team-csc-n1', name: 'Service Desk N1 — Triagem & Primeiro Atendimento' },
      category: { id: 'cat-compliance', name: 'Compliance & LGPD' },
      service: null,
      sla: {
        state: 'MET',
        policyName: 'Política SLA Corporativa Padrão',
        firstResponseDueAt: hoursAgo(26),
        firstResponseMetAt: hoursAgo(28),
        resolutionDueAt: hoursAgo(10),
        resolutionMetAt: hoursAgo(14),
        pausedAt: null,
        consumedPercent: 35,
        warningTriggered: false,
        breached: false,
      },
      dueAt: hoursAgo(10),
      firstResponseAt: hoursAgo(28),
      resolvedAt: hoursAgo(14),
      closedAt: null,
      csatScore: null,
      version: 2,
      createdAt: hoursAgo(30),
      updatedAt: hoursAgo(14),
      descriptionHtml: '<p>Qual o prazo padrão de retenção de logs de auditoria configurado no tenant corporativo?</p>',
      subcategory: 'LGPD',
      resolutionSummary: 'Retenção padrão configurada em 1825 dias (5 anos), conforme política de compliance.',
      cancellationReason: null,
      priorityOverrideReason: null,
      csatComment: null,
      customFields: {},
      participants: [],
      comments: [],
      attachments: [],
      approvals: [],
      slaClockEvents: [],
    },
  ];

  const timelines: Record<string, TicketTimelineEventDto[]> = {};
  for (const t of tickets) {
    timelines[t.id] = [
      {
        id: `tl-${t.id}-1`,
        ticketId: t.id,
        eventType: 'TICKET_CREATED',
        actor: { id: t.requester.id, name: t.requester.name },
        payload: { publicNumber: t.publicNumber, priority: t.priority },
        correlationId: `corr-${t.id}`,
        createdAt: t.createdAt,
      },
    ];
  }

  const knowledge: KnowledgeArticleDto[] = [
    {
      id: 'kb-01',
      tenantId: DEMO_TENANT_ID,
      slug: 'runbook-failover-bgp-core-router',
      title: 'Runbook: Failover BGP e Diagnóstico de Perda de Pacotes DC-PRI',
      summary: 'Procedimento padrão do NOC para isolamento de enlace óptico e desvio controlado de rotas.',
      bodyMarkdown:
        '## Objetivo\nMitigar perda de pacotes no Core Router `RTR-CORE-01` sem derrubar sessões ativas.\n\n## Passos\n1. Verificar contadores CRC na interface `TenGigE0/0/0/1`.\n2. Ativar rota secundária via política BGP `LOCAL_PREF 200`.\n3. Validar latência ponto-a-ponto no Grafana (`civora-overview`).',
      status: 'PUBLISHED',
      visibility: 'INTERNAL',
      tags: ['bgp', 'noc', 'rede'],
      category: { id: 'cat-infra', name: 'Infraestrutura & Redes' },
      author: { id: 'user-agent-noc', name: 'Marina Costa (NOC/SRE)' },
      reviewer: { id: 'user-admin-pro', name: 'Administrador PRO' },
      currentVersion: 2,
      helpfulCount: 14,
      notHelpfulCount: 0,
      publishedAt: hoursAgo(48),
      updatedAt: hoursAgo(12),
    },
    {
      id: 'kb-02',
      tenantId: DEMO_TENANT_ID,
      slug: 'guia-configuracao-vpn-mfa-corporativo',
      title: 'Como configurar VPN Corporativa e Autenticação MFA TOTP',
      summary: 'Guia rápido para colaboradores remotos configurarem acesso seguro em menos de 3 minutos.',
      bodyMarkdown:
        '## Pré-requisitos\n- Conta corporativa ativa no Civora.\n- Aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou 1Password).\n\n## Passo a passo\n1. Acesse **Configurações -> Autenticação Multifator**.\n2. Gere a chave TOTP e escaneie no aplicativo.\n3. Valide o código de 6 dígitos.',
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      tags: ['vpn', 'mfa', 'onboarding'],
      category: { id: 'cat-acesso', name: 'Acessos & Estações' },
      author: { id: 'user-admin-pro', name: 'Administrador PRO' },
      reviewer: { id: 'user-supervisor-csc', name: 'Rafael Almeida' },
      currentVersion: 3,
      helpfulCount: 28,
      notHelpfulCount: 1,
      publishedAt: hoursAgo(96),
      updatedAt: hoursAgo(24),
    },
  ];

  const problems: ProblemDto[] = [
    {
      id: 'prob-01',
      tenantId: DEMO_TENANT_ID,
      code: 'PRB-2026-001',
      title: 'Degradação intermitente em transceivers SFP+ do rack DC-PRI',
      description: 'Oscilações térmicas pontuais geram erros CRC em picos noturnos de backup.',
      rootCause: 'Lote de módulos ópticos com firmware anterior à versão 4.12.',
      workaround: 'Ativar failover automático para link secundário quando CRC > 10/min.',
      status: 'KNOWN_ERROR',
      priority: 'HIGH',
      linkedTicketCount: 2,
      createdAt: hoursAgo(36),
      updatedAt: hoursAgo(4),
    },
  ];

  const changes: ChangeDto[] = [
    {
      id: 'chg-01',
      tenantId: DEMO_TENANT_ID,
      code: 'CHG-2026-004',
      title: 'Atualização programada de firmware nos transceivers DC-PRI',
      description: 'Substituição controlada em janela de baixa utilização com validação BGP.',
      risk: 'MEDIUM',
      status: 'SCHEDULED',
      implementationPlan: '1. Drenar tráfego BGP\n2. Atualizar firmware SFP+\n3. Revalidar métricas.',
      rollbackPlan: 'Reverter política BGP para rota secundária em < 60 segundos.',
      windowStartAt: hoursAhead(24),
      windowEndAt: hoursAhead(26),
      createdAt: hoursAgo(20),
      updatedAt: hoursAgo(5),
    },
  ];

  const automationRules: AutomationRuleDto[] = [
    {
      id: 'auto-01',
      tenantId: DEMO_TENANT_ID,
      name: 'Auto-triagem de Incidentes Críticos -> tag noc-escalado',
      description: 'Adiciona tag prioritária em chamados de prioridade Alta ou Crítica.',
      trigger: 'TICKET_CREATED',
      conditions: [{ field: 'ticket.priority', operator: 'in', value: ['HIGH', 'CRITICAL'] }],
      actions: [{ type: 'ADD_TAG', params: { tag: 'noc-escalado' } }],
      isActive: true,
      priorityOrder: 1,
      executionCount: 12,
      lastExecutedAt: hoursAgo(2.5),
    },
  ];

  const automationExecutions: DemoAutomationExecution[] = [
    {
      id: 'exec-01',
      status: 'SUCCEEDED',
      correlationId: 'corr-demo-exec-01',
      depth: 0,
      executedAt: hoursAgo(2.5),
      errorMessage: null,
      rule: { name: automationRules[0]?.name ?? 'Auto-triagem', trigger: 'TICKET_CREATED' },
    },
  ];

  const webhooks: DemoWebhook[] = [
    {
      id: 'wh-01',
      name: 'Observability Incident Bridge (Grafana OnCall)',
      url: 'https://hooks.civora.example/oncall/v1/events',
      events: ['ticket.created', 'sla.breached'],
      isActive: true,
      deliveries: [
        {
          id: 'del-01',
          eventType: 'ticket.created',
          status: 'DELIVERED',
          responseCode: 202,
          createdAt: hoursAgo(3),
        },
      ],
    },
  ];

  const notifications: NotificationDto[] = [
    {
      id: 'notif-01',
      title: 'Alerta preventivo de SLA (78% consumido)',
      message: 'CIV-2026-000001 atingiu limite de atenção na Política SLA Corporativa Padrão.',
      category: 'SLA_WARNING',
      ticketId: 'demo-ticket-01',
      readAt: null,
      createdAt: hoursAgo(0.5),
    },
    {
      id: 'notif-02',
      title: 'Aprovação pendente no Portal',
      message: 'CIV-2026-000004 aguarda sua decisão de aprovação VPN.',
      category: 'APPROVAL_PENDING',
      ticketId: 'demo-ticket-04',
      readAt: null,
      createdAt: hoursAgo(4.5),
    },
  ];

  const auditLogs: AuditLogDto[] = [
    {
      id: 'aud-01',
      tenantId: DEMO_TENANT_ID,
      actor: { id: 'user-admin-pro', name: 'Administrador PRO', email: 'admin.pro@civora.local' },
      action: 'BOOTSTRAP_ADMIN_PRO_CREATED',
      resourceType: 'Organization',
      resourceId: DEMO_TENANT_ID,
      beforeState: null,
      afterState: { organizationSlug: 'civora-corporativo', aiEnabled: true },
      ipAddress: '127.0.0.1',
      userAgent: 'Civora Bootstrap',
      correlationId: 'corr-bootstrap-01',
      origin: 'SYSTEM',
      createdAt: hoursAgo(96),
    },
    {
      id: 'aud-02',
      tenantId: DEMO_TENANT_ID,
      actor: { id: 'user-agent-noc', name: 'Marina Costa (NOC/SRE)', email: 'noc.sre@civora.local' },
      action: 'CMDB_RELATIONSHIP_VERIFIED',
      resourceType: 'Asset',
      resourceId: 'asset-rtr-core',
      beforeState: null,
      afterState: { tag: 'RTR-CORE-01', status: 'ACTIVE' },
      ipAddress: '10.10.0.14',
      userAgent: 'Civora Web Console',
      correlationId: 'corr-cmdb-02',
      origin: 'WEB',
      createdAt: hoursAgo(12),
    },
  ];

  const services: DemoServiceItem[] = [
    {
      id: 'svc-vpn',
      name: 'Acesso VPN & Zero Trust',
      slug: 'acesso-vpn-zero-trust',
      description: 'Liberação temporária ou permanente de acesso remoto com validação de aprovador.',
      defaultType: 'ACCESS_REQUEST',
      defaultImpact: 'MEDIUM',
      defaultUrgency: 'HIGH',
      requiresApproval: true,
      category: { id: 'cat-acesso', name: 'Acessos & Estações' },
      department: { id: 'dept-sec', name: 'Segurança da Informação (InfoSec / SOC)' },
      form: {
        fields: [
          {
            id: 'fld-1',
            key: 'ambienteDestino',
            label: 'Ambiente / Rede de Destino',
            fieldType: 'SELECT',
            required: true,
            placeholder: null,
            optionsJson: ['Homologação', 'Auditoria Somente Leitura', 'Operações Corporativas'],
          },
          {
            id: 'fld-2',
            key: 'justificativa',
            label: 'Justificativa Operacional',
            fieldType: 'TEXT',
            required: true,
            placeholder: 'Informe projeto ou demanda vinculada',
            optionsJson: null,
          },
        ],
      },
    },
    {
      id: 'svc-onboarding',
      name: 'Kit Onboarding Corporativo',
      slug: 'kit-onboarding-corporativo',
      description: 'Preparação completa de estação de trabalho, e-mail, MFA e acessos departamentais.',
      defaultType: 'SERVICE_REQUEST',
      defaultImpact: 'MEDIUM',
      defaultUrgency: 'MEDIUM',
      requiresApproval: false,
      category: { id: 'cat-acesso', name: 'Acessos & Estações' },
      department: { id: 'dept-ti', name: 'Tecnologia da Informação & Suporte' },
      form: {
        fields: [
          {
            id: 'fld-3',
            key: 'centroCusto',
            label: 'Centro de Custo',
            fieldType: 'TEXT',
            required: true,
            placeholder: 'Ex: CC-TI-102',
            optionsJson: null,
          },
        ],
      },
    },
    {
      id: 'svc-inc-infra',
      name: 'Reportar Indisponibilidade ou Falha Crítica',
      slug: 'reportar-indisponibilidade',
      description: 'Abertura imediata de incidente para atuação prioritária NOC / Sustentação.',
      defaultType: 'INCIDENT',
      defaultImpact: 'HIGH',
      defaultUrgency: 'HIGH',
      requiresApproval: false,
      category: { id: 'cat-infra', name: 'Infraestrutura & Redes' },
      department: { id: 'dept-infra', name: 'Infraestrutura, Redes & Cloud' },
      form: null,
    },
  ];

  const categories = [
    { id: 'cat-infra', name: 'Infraestrutura & Redes', slug: 'infraestrutura-redes' },
    { id: 'cat-sistemas', name: 'Sistemas & Aplicações', slug: 'sistemas-aplicacoes' },
    { id: 'cat-acesso', name: 'Acessos & Estações', slug: 'acessos-estacoes' },
    { id: 'cat-compliance', name: 'Compliance & LGPD', slug: 'compliance-lgpd' },
  ];

  return {
    version: 1,
    nextTicketSeq: 7,
    organization: {
      id: DEMO_TENANT_ID,
      name: 'Civora Corporativo',
      slug: 'civora-corporativo',
      aiEnabled: true,
      dataRetentionDays: 1825,
      defaultTimezone: 'America/Sao_Paulo',
      featureFlags: [
        { key: 'ai_copilot', enabled: true },
        { key: 'portal_public_incidents', enabled: true },
      ],
      subscription: { plan: 'ENTERPRISE', status: 'ACTIVE', maxAgents: 250, maxUnits: 50 },
    },
    users,
    units,
    departments,
    teams,
    tickets,
    timelines,
    attachmentContents: {},
    savedViews: [
      {
        id: 'view-criticos',
        name: 'Incidentes Críticos / Alta Prioridade',
        filtersJson: { priority: 'CRITICAL' },
      },
    ],
    knowledge,
    assets,
    assetRelationships,
    assetLayoutPositions,
    problems,
    changes,
    automationRules,
    automationExecutions,
    webhooks,
    notifications,
    auditLogs,
    services,
    categories,
  };
}

export function buildDemoRolesList() {
  return ROLE_CODES.map((code) => ({
    id: `role-${code}`,
    code,
    name: ROLE_METADATA[code].name,
    description: ROLE_METADATA[code].description,
    isSystem: true,
    permissionsCount: ROLE_PERMISSION_MATRIX[code].length,
  }));
}
