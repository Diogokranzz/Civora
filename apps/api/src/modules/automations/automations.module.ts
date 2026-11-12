import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGERS,
  CONDITION_OPERATORS,
} from '@civora/types';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';

const conditionSchema = z.object({
  field: z.string().min(1).max(80),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
});

const actionSchema = z.object({
  type: z.enum(AUTOMATION_ACTION_TYPES),
  params: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
});

const createRuleSchema = z.object({
  name: z.string().min(3).max(160),
  description: z.string().max(500).optional(),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  conditions: z.array(conditionSchema),
  actions: z.array(actionSchema).min(1),
  isActive: z.boolean().default(true),
  priorityOrder: z.number().int().default(100),
});

@ApiTags('Automations')
@ApiBearerAuth()
@Controller('api/v1/automations')
export class AutomationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('rules')
  @RequirePermissions('automations:read')
  listRules(@CurrentAuth() auth: AuthContext) {
    return this.prisma.automationRule.findMany({
      where: { tenantId: auth.organizationId },
      orderBy: [{ priorityOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  @Post('rules')
  @RequirePermissions('automations:manage')
  async createRule(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createRuleSchema)) body: z.infer<typeof createRuleSchema>,
  ) {
    const rule = await this.prisma.automationRule.create({
      data: {
        tenantId: auth.organizationId,
        name: body.name.trim(),
        description: body.description ?? null,
        trigger: body.trigger,
        conditionsJson: body.conditions as Prisma.InputJsonValue,
        actionsJson: body.actions as Prisma.InputJsonValue,
        isActive: body.isActive,
        priorityOrder: body.priorityOrder,
      },
    });
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'AUTOMATION_RULE_CREATED',
      resourceType: 'AutomationRule',
      resourceId: rule.id,
      afterState: { name: rule.name, trigger: rule.trigger },
    });
    return rule;
  }

  @Patch('rules/:id')
  @RequirePermissions('automations:manage')
  async toggleRule(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createRuleSchema.partial()))
    body: Partial<z.infer<typeof createRuleSchema>>,
  ) {
    const existing = await this.prisma.automationRule.findFirst({
      where: { id, tenantId: auth.organizationId },
    });
    if (!existing) throw new NotFoundException('Automation rule not found.');

    return this.prisma.automationRule.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.trigger !== undefined ? { trigger: body.trigger } : {}),
        ...(body.conditions !== undefined
          ? { conditionsJson: body.conditions as Prisma.InputJsonValue }
          : {}),
        ...(body.actions !== undefined
          ? { actionsJson: body.actions as Prisma.InputJsonValue }
          : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.priorityOrder !== undefined ? { priorityOrder: body.priorityOrder } : {}),
        version: { increment: 1 },
      },
    });
  }

  @Delete('rules/:id')
  @RequirePermissions('automations:manage')
  async deleteRule(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    const existing = await this.prisma.automationRule.findFirst({
      where: { id, tenantId: auth.organizationId },
    });
    if (!existing) throw new NotFoundException('Automation rule not found.');
    await this.prisma.automationRule.delete({ where: { id } });
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'AUTOMATION_RULE_DELETED',
      resourceType: 'AutomationRule',
      resourceId: id,
      beforeState: { name: existing.name, trigger: existing.trigger },
    });
    return { deleted: true };
  }

  @Get('executions')
  @RequirePermissions('automations:read')
  listExecutions(@CurrentAuth() auth: AuthContext) {
    return this.prisma.automationExecution.findMany({
      where: { tenantId: auth.organizationId },
      include: { rule: { select: { id: true, name: true, trigger: true } } },
      orderBy: { executedAt: 'desc' },
      take: 100,
    });
  }
}

@Module({ controllers: [AutomationsController] })
export class AutomationsModule {}

