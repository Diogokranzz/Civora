import { randomBytes, scrypt } from 'node:crypto';
import { ROLE_PERMISSION_MATRIX } from '@civora/config';
import { PERMISSION_CODES, ROLE_CODES } from '@civora/types';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_UNITS = [
  {
    code: 'HQ-SP',
    name: 'Matriz Corporativa — São Paulo',
    timezone: 'America/Sao_Paulo',
    address: 'Sede Administrativa Principal — SP',
  },
  {
    code: 'FIL-RJ',
    name: 'Filial Executiva — Rio de Janeiro',
    timezone: 'America/Sao_Paulo',
    address: 'Centro Empresarial — RJ',
  },
  {
    code: 'FIL-MG',
    name: 'Unidade Regional — Belo Horizonte',
    timezone: 'America/Sao_Paulo',
    address: 'Escritório Regional Sudeste — MG',
  },
  {
    code: 'FIL-PR',
    name: 'Unidade Sul — Curitiba',
    timezone: 'America/Sao_Paulo',
    address: 'Polo Operacional Sul — PR',
  },
  {
    code: 'FIL-PE',
    name: 'Unidade Nordeste — Recife',
    timezone: 'America/Fortaleza',
    address: 'Polo Regional Nordeste — PE',
  },
  {
    code: 'FIL-AM',
    name: 'Unidade Norte — Manaus',
    timezone: 'America/Manaus',
    address: 'Centro Operacional Norte — AM',
  },
  {
    code: 'CD-OPS',
    name: 'Centro de Distribuição & Logística',
    timezone: 'America/Sao_Paulo',
    address: 'Complexo Logístico Integrado',
  },
  {
    code: 'DC-PRI',
    name: 'Datacenter Principal & NOC',
    timezone: 'America/Sao_Paulo',
    address: 'Infraestrutura Crítica & Operações 24x7',
  },
  {
    code: 'LAB-TI',
    name: 'Hub de Tecnologia, P&D e Engenharia',
    timezone: 'America/Sao_Paulo',
    address: 'Campus Digital & Sustentação',
  },
  {
    code: 'REMOTO',
    name: 'Operação Remota & Trabalho Híbrido',
    timezone: 'America/Sao_Paulo',
    address: 'Ambiente Corporativo Distribuído',
  },
] as const;

const DEFAULT_DEPARTMENTS = [
  { code: 'TI', name: 'Tecnologia da Informação & Suporte', unitCode: 'HQ-SP' },
  { code: 'INFRA', name: 'Infraestrutura, Redes & Cloud', unitCode: 'DC-PRI' },
  { code: 'SEC', name: 'Segurança da Informação (InfoSec / SOC)', unitCode: 'DC-PRI' },
  { code: 'ENG', name: 'Engenharia de Sistemas & Aplicações', unitCode: 'LAB-TI' },
  { code: 'DADOS', name: 'Dados, BI & Inteligência Operacional', unitCode: 'LAB-TI' },
  { code: 'CSC', name: 'Central de Serviços & Atendimento Interno', unitCode: 'HQ-SP' },
  { code: 'FAC', name: 'Facilities & Infraestrutura Predial', unitCode: 'HQ-SP' },
  { code: 'MAN', name: 'Manutenção & Engenharia Predial', unitCode: 'CD-OPS' },
  { code: 'RH', name: 'Recursos Humanos & Gestão de Pessoas', unitCode: 'HQ-SP' },
  { code: 'FIN', name: 'Financeiro, Fiscal & Controladoria', unitCode: 'HQ-SP' },
  { code: 'COM', name: 'Compras, Suprimentos & Contratos', unitCode: 'HQ-SP' },
  { code: 'ADM', name: 'Operações Administrativas & Backoffice', unitCode: 'FIL-RJ' },
  { code: 'JUR', name: 'Jurídico, Risco & Compliance (LGPD)', unitCode: 'HQ-SP' },
  { code: 'LOG', name: 'Logística & Patrimônio', unitCode: 'CD-OPS' },
] as const;

const DEFAULT_TEAMS = [
  { name: 'Service Desk N1 — Triagem & Primeiro Atendimento', departmentCode: 'CSC' },
  { name: 'Atendimento Corporativo Multicanal', departmentCode: 'CSC' },
  { name: 'Suporte Técnico N2 — Estações, Periféricos & Acessos', departmentCode: 'TI' },
  { name: 'Service Desk Executivo & Liderança', departmentCode: 'TI' },
  { name: 'Infraestrutura, Redes & Conectividade (NOC)', departmentCode: 'INFRA' },
  { name: 'Cloud, Servidores & Bancos de Dados (SRE/DBA)', departmentCode: 'INFRA' },
  { name: 'SOC — Incidentes de Segurança & Resposta Cibernética', departmentCode: 'SEC' },
  { name: 'IAM — Gestão de Identidade, Acessos & MFA', departmentCode: 'SEC' },
  { name: 'Sustentação ERP, CRM & Sistemas Corporativos', departmentCode: 'ENG' },
  { name: 'Integração, APIs & Automações', departmentCode: 'ENG' },
  { name: 'Engenharia de Dados & Analytics', departmentCode: 'DADOS' },
  { name: 'Facilities, Portaria & Espaços Corporativos', departmentCode: 'FAC' },
  { name: 'Manutenção Elétrica, Climatização & Predial', departmentCode: 'MAN' },
  { name: 'Administração de Pessoal, Folha & Benefícios', departmentCode: 'RH' },
  { name: 'Onboarding, Offboarding & Movimentações', departmentCode: 'RH' },
  { name: 'Contas a Pagar, Reembolsos & Tesouraria', departmentCode: 'FIN' },
  { name: 'Compras, Fornecedores & Gestão de Ativos', departmentCode: 'COM' },
  { name: 'Backoffice & Apoio Administrativo', departmentCode: 'ADM' },
  { name: 'Compliance, LGPD & Contratos', departmentCode: 'JUR' },
  { name: 'Logística Interna, Estoque & Expedição', departmentCode: 'LOG' },
] as const;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function seedRbacCatalog(): Promise<Map<string, string>> {
  const permIdByCode = new Map<string, string>();
  for (const code of PERMISSION_CODES) {
    const perm = await prisma.permission.upsert({
      where: { code },
      create: { code, description: `Permission for ${code}` },
      update: {},
    });
    permIdByCode.set(code, perm.id);
  }

  const roleIdByCode = new Map<string, string>();
  for (const roleCode of ROLE_CODES) {
    const role = await prisma.role.upsert({
      where: { code: roleCode },
      create: {
        code: roleCode,
        name: roleCode,
        description: `Civora system role ${roleCode}`,
        isSystem: true,
      },
      update: {},
    });
    roleIdByCode.set(roleCode, role.id);

    const perms = ROLE_PERMISSION_MATRIX[roleCode];
    for (const permCode of perms) {
      const permId = permIdByCode.get(permCode)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permId } },
        create: { roleId: role.id, permissionId: permId },
        update: {},
      });
    }
  }

  return roleIdByCode;
}

async function seedOrganizationStructure(tenantId: string): Promise<void> {
  const unitIdByCode = new Map<string, string>();
  for (const unit of DEFAULT_UNITS) {
    const row = await prisma.unit.upsert({
      where: { tenantId_code: { tenantId, code: unit.code } },
      create: {
        tenantId,
        code: unit.code,
        name: unit.name,
        timezone: unit.timezone,
        address: unit.address,
        isActive: true,
      },
      update: {},
    });
    unitIdByCode.set(unit.code, row.id);
  }

  const departmentIdByCode = new Map<string, string>();
  for (const dept of DEFAULT_DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { tenantId_code: { tenantId, code: dept.code } },
      create: {
        tenantId,
        code: dept.code,
        name: dept.name,
        unitId: unitIdByCode.get(dept.unitCode) ?? null,
      },
      update: {},
    });
    departmentIdByCode.set(dept.code, row.id);
  }

  for (const team of DEFAULT_TEAMS) {
    await prisma.team.upsert({
      where: { tenantId_name: { tenantId, name: team.name } },
      create: {
        tenantId,
        name: team.name,
        departmentId: departmentIdByCode.get(team.departmentCode) ?? null,
      },
      update: {},
    });
  }

  const existingCalendar = await prisma.businessCalendar.findFirst({
    where: { tenantId, isDefault: true },
  });

  const calendar =
    existingCalendar ??
    (await prisma.businessCalendar.create({
      data: {
        tenantId,
        name: 'Horário Comercial Corporativo (Seg–Sex 08h–18h)',
        timezone: 'America/Sao_Paulo',
        isDefault: true,
        businessHours: {
          create: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
            dayOfWeek,
            startTime: '08:00',
            endTime: '18:00',
          })),
        },
      },
    }));

  const existingPolicy = await prisma.slaPolicy.findFirst({
    where: { tenantId, isActive: true },
  });

  if (!existingPolicy) {
    await prisma.slaPolicy.create({
      data: {
        tenantId,
        calendarId: calendar.id,
        name: 'Política SLA Corporativa Padrão',
        contractCode: 'SLA-ENTERPRISE-BASE',
        matchOrder: 100,
        isActive: true,
        targets: {
          create: [
            {
              priority: 'CRITICAL',
              firstResponseMinutes: 15,
              updateMinutes: 30,
              resolutionMinutes: 120,
              warningThresholdPct: 75,
              escalationThresholdPct: 90,
            },
            {
              priority: 'HIGH',
              firstResponseMinutes: 30,
              updateMinutes: 60,
              resolutionMinutes: 240,
              warningThresholdPct: 80,
              escalationThresholdPct: 95,
            },
            {
              priority: 'MEDIUM',
              firstResponseMinutes: 120,
              updateMinutes: 240,
              resolutionMinutes: 720,
              warningThresholdPct: 80,
              escalationThresholdPct: 95,
            },
            {
              priority: 'LOW',
              firstResponseMinutes: 240,
              updateMinutes: 480,
              resolutionMinutes: 1440,
              warningThresholdPct: 85,
              escalationThresholdPct: 95,
            },
          ],
        },
      },
    });
  }
}

async function main(): Promise<void> {
  const roleIdByCode = await seedRbacCatalog();
  const ownerRoleId = roleIdByCode.get('OrganizationOwner');
  if (!ownerRoleId) {
    throw new Error('Required role OrganizationOwner missing from RBAC seed.');
  }

  const adminEmail = (process.env.CIVORA_ADMIN_EMAIL || 'admin.pro@civora.local').trim().toLowerCase();
  const adminName = (process.env.CIVORA_ADMIN_NAME || 'Administrador PRO').trim();
  const adminPassword = process.env.CIVORA_ADMIN_PASSWORD || 'Civora@2026!';
  const orgSlug = (process.env.CIVORA_ROOT_ORG_SLUG || 'civora-corporativo').trim().toLowerCase();
  const orgName = (process.env.CIVORA_ROOT_ORG_NAME || 'Civora Corporativo').trim();

  const existingOrg = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  const organization =
    existingOrg ??
    (await prisma.organization.create({
      data: {
        name: orgName,
        slug: orgSlug,
        defaultTimezone: 'America/Sao_Paulo',
        aiEnabled: true,
        dataRetentionDays: 1825,
        subscription: {
          create: { plan: 'ENTERPRISE', status: 'ACTIVE', maxAgents: 250, maxUnits: 50 },
        },
        featureFlags: {
          create: [
            { key: 'ai_copilot', enabled: true },
            { key: 'portal_public_incidents', enabled: true },
          ],
        },
      },
    }));

  const passwordHash = existingAdmin ? null : await hashPassword(adminPassword);
  const adminUser =
    existingAdmin ??
    (await prisma.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        passwordHash: passwordHash!,
        isPlatformAdmin: true,
      },
    }));

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: adminUser.id,
      },
    },
    create: {
      organizationId: organization.id,
      userId: adminUser.id,
      roleId: ownerRoleId,
      isActive: true,
    },
    update: {
      roleId: ownerRoleId,
      isActive: true,
    },
  });

  await seedOrganizationStructure(organization.id);

  if (!existingOrg) {
    await prisma.auditLog.create({
      data: {
        tenantId: organization.id,
        actorId: adminUser.id,
        action: 'BOOTSTRAP_ADMIN_PRO_CREATED',
        resourceType: 'Organization',
        resourceId: organization.id,
        origin: 'SYSTEM',
        afterState: {
          organizationSlug: organization.slug,
          adminEmail: adminUser.email,
        },
      },
    });
  }

  console.warn(
    `Civora bootstrap verified: 1 Administrador PRO (${adminUser.email}), ${DEFAULT_UNITS.length} units, ${DEFAULT_DEPARTMENTS.length} departments, ${DEFAULT_TEAMS.length} teams, 0 fake tickets.`,
  );
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
