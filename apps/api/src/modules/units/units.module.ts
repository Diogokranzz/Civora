import { Body, Controller, Delete, Get, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';

const createUnitSchema = z.object({
  name: z.string().min(2).max(140),
  code: z.string().min(2).max(32).toUpperCase(),
  timezone: z.string().min(3).max(64).default('America/Sao_Paulo'),
  address: z.string().max(255).optional(),
});

const updateUnitSchema = createUnitSchema.partial().extend({
  isActive: z.boolean().optional(),
});

@ApiTags('Units')
@ApiBearerAuth()
@Controller('api/v1/units')
export class UnitsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('org:read')
  list(@CurrentAuth() auth: AuthContext) {
    return this.prisma.unit.findMany({
      where: { tenantId: auth.organizationId },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  @RequirePermissions('org:manage')
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createUnitSchema)) body: z.infer<typeof createUnitSchema>,
  ) {
    const unit = await this.prisma.unit.create({
      data: {
        tenantId: auth.organizationId,
        name: body.name.trim(),
        code: body.code.trim(),
        timezone: body.timezone,
        address: body.address?.trim() ?? null,
      },
    });
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'UNIT_CREATED',
      resourceType: 'Unit',
      resourceId: unit.id,
      afterState: { name: unit.name, code: unit.code },
    });
    return unit;
  }

  @Patch(':id')
  @RequirePermissions('org:manage')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUnitSchema)) body: z.infer<typeof updateUnitSchema>,
  ) {
    const existing = await this.prisma.unit.findFirst({
      where: { id, tenantId: auth.organizationId },
    });
    if (!existing) throw new NotFoundException('Unit not found.');
    const updated = await this.prisma.unit.update({
      where: { id },
      data: body,
    });
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'UNIT_UPDATED',
      resourceType: 'Unit',
      resourceId: id,
      beforeState: { name: existing.name, isActive: existing.isActive },
      afterState: { name: updated.name, isActive: updated.isActive },
    });
    return updated;
  }

  @Delete(':id')
  @RequirePermissions('org:manage')
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    const existing = await this.prisma.unit.findFirst({
      where: { id, tenantId: auth.organizationId },
    });
    if (!existing) throw new NotFoundException('Unit not found.');
    await this.prisma.unit.delete({ where: { id } });
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'UNIT_DELETED',
      resourceType: 'Unit',
      resourceId: id,
      beforeState: { name: existing.name, code: existing.code },
    });
    return { deleted: true, id };
  }
}

@Module({ controllers: [UnitsController] })
export class UnitsModule {}

