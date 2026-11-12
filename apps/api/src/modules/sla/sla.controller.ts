import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PRIORITY_LEVELS } from '@civora/types';
import { z } from 'zod';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';

const createCalendarSchema = z.object({
  name: z.string().min(2).max(140),
  timezone: z.string().min(3).max(64).default('America/Sao_Paulo'),
  isDefault: z.boolean().default(false),
  shifts: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .min(1),
  holidays: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        name: z.string().min(2).max(140),
      }),
    )
    .optional(),
});

const createPolicySchema = z.object({
  name: z.string().min(2).max(160),
  calendarId: z.string().uuid(),
  contractCode: z.string().max(60).optional(),
  unitId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  matchOrder: z.number().int().default(100),
  targets: z
    .array(
      z.object({
        priority: z.enum(PRIORITY_LEVELS),
        firstResponseMinutes: z.number().int().positive(),
        updateMinutes: z.number().int().positive(),
        resolutionMinutes: z.number().int().positive(),
        warningThresholdPct: z.number().int().min(10).max(99).default(80),
        escalationThresholdPct: z.number().int().min(10).max(99).default(90),
      }),
    )
    .min(1),
});

@ApiTags('SLA & Business Calendars')
@ApiBearerAuth()
@Controller('api/v1/sla')
export class SlaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('calendars')
  @RequirePermissions('sla:read')
  listCalendars(@CurrentAuth() auth: AuthContext) {
    return this.prisma.businessCalendar.findMany({
      where: { tenantId: auth.organizationId },
      include: {
        businessHours: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        holidays: { orderBy: { date: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
  }

  @Post('calendars')
  @RequirePermissions('sla:manage')
  async createCalendar(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createCalendarSchema)) body: z.infer<typeof createCalendarSchema>,
  ) {
    const calendar = await this.prisma.businessCalendar.create({
      data: {
        tenantId: auth.organizationId,
        name: body.name.trim(),
        timezone: body.timezone,
        isDefault: body.isDefault,
        businessHours: {
          create: body.shifts,
        },
        holidays: body.holidays
          ? {
              create: body.holidays.map((h) => ({
                date: new Date(`${h.date}T00:00:00.000Z`),
                name: h.name,
              })),
            }
          : undefined,
      },
      include: { businessHours: true, holidays: true },
    });

    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'BUSINESS_CALENDAR_CREATED',
      resourceType: 'BusinessCalendar',
      resourceId: calendar.id,
      afterState: { name: calendar.name, timezone: calendar.timezone },
    });

    return calendar;
  }

  @Post('calendars/:id/holidays')
  @RequirePermissions('sla:manage')
  async addHoliday(
    @CurrentAuth() auth: AuthContext,
    @Param('id') calendarId: string,
    @Body(
      new ZodValidationPipe(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          name: z.string().min(2).max(140),
        }),
      ),
    )
    body: { date: string; name: string },
  ) {
    const calendar = await this.prisma.businessCalendar.findFirst({
      where: { id: calendarId, tenantId: auth.organizationId },
    });
    if (!calendar) throw new NotFoundException('Calendar not found.');

    return this.prisma.holiday.create({
      data: {
        calendarId,
        date: new Date(`${body.date}T00:00:00.000Z`),
        name: body.name.trim(),
      },
    });
  }

  @Get('policies')
  @RequirePermissions('sla:read')
  listPolicies(@CurrentAuth() auth: AuthContext) {
    return this.prisma.slaPolicy.findMany({
      where: { tenantId: auth.organizationId },
      include: {
        calendar: { select: { id: true, name: true, timezone: true } },
        unit: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
        targets: true,
      },
      orderBy: { matchOrder: 'asc' },
    });
  }

  @Post('policies')
  @RequirePermissions('sla:manage')
  async createPolicy(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createPolicySchema)) body: z.infer<typeof createPolicySchema>,
  ) {
    const calendar = await this.prisma.businessCalendar.findFirst({
      where: { id: body.calendarId, tenantId: auth.organizationId },
    });
    if (!calendar) throw new NotFoundException('Business calendar not found in organization.');

    const policy = await this.prisma.slaPolicy.create({
      data: {
        tenantId: auth.organizationId,
        calendarId: body.calendarId,
        name: body.name.trim(),
        contractCode: body.contractCode ?? null,
        unitId: body.unitId ?? null,
        departmentId: body.departmentId ?? null,
        categoryId: body.categoryId ?? null,
        serviceId: body.serviceId ?? null,
        matchOrder: body.matchOrder,
        targets: {
          create: body.targets,
        },
      },
      include: { targets: true },
    });

    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'SLA_POLICY_CREATED',
      resourceType: 'SlaPolicy',
      resourceId: policy.id,
      afterState: { name: policy.name },
    });

    return policy;
  }
}

