import { Body, Controller, Delete, Get, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';

const createDeptSchema = z.object({
  name: z.string().min(2).max(140),
  code: z.string().min(2).max(32).toUpperCase(),
  unitId: z.string().uuid().nullable().optional(),
});

@ApiTags('Departments')
@ApiBearerAuth()
@Controller('api/v1/departments')
export class DepartmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('org:read')
  list(@CurrentAuth() auth: AuthContext) {
    return this.prisma.department.findMany({
      where: { tenantId: auth.organizationId },
      include: { unit: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  @RequirePermissions('org:manage')
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createDeptSchema)) body: z.infer<typeof createDeptSchema>,
  ) {
    if (body.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: body.unitId, tenantId: auth.organizationId },
      });
      if (!unit) throw new NotFoundException('Unit not found in organization.');
    }
    const dept = await this.prisma.department.create({
      data: {
        tenantId: auth.organizationId,
        name: body.name.trim(),
        code: body.code.trim(),
        unitId: body.unitId ?? null,
      },
    });
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'DEPARTMENT_CREATED',
      resourceType: 'Department',
      resourceId: dept.id,
      afterState: { name: dept.name, code: dept.code },
    });
    return dept;
  }

  @Patch(':id')
  @RequirePermissions('org:manage')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createDeptSchema.partial()))
    body: Partial<z.infer<typeof createDeptSchema>>,
  ) {
    const existing = await this.prisma.department.findFirst({
      where: { id, tenantId: auth.organizationId },
    });
    if (!existing) throw new NotFoundException('Department not found.');
    return this.prisma.department.update({ where: { id }, data: body });
  }

  @Delete(':id')
  @RequirePermissions('org:manage')
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    const existing = await this.prisma.department.findFirst({
      where: { id, tenantId: auth.organizationId },
    });
    if (!existing) throw new NotFoundException('Department not found.');
    await this.prisma.department.delete({ where: { id } });
    return { deleted: true, id };
  }
}

@Module({ controllers: [DepartmentsController] })
export class DepartmentsModule {}

