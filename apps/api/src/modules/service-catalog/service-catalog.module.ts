import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { IMPACT_URGENCY_LEVELS, TICKET_TYPES } from '@civora/types';
import { z } from 'zod';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';

const createCategorySchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  parentId: z.string().uuid().nullable().optional(),
});

const formFieldSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Z0-9_]+$/),
  label: z.string().min(2).max(140),
  fieldType: z.enum(['text', 'textarea', 'select', 'number', 'date', 'boolean']),
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional(),
  options: z.array(z.string()).optional(),
  sortOrder: z.number().int().default(0),
});

const createServiceSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().min(5).max(2000),
  categoryId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  defaultTeamId: z.string().uuid().nullable().optional(),
  defaultType: z.enum(TICKET_TYPES).default('SERVICE_REQUEST'),
  defaultImpact: z.enum(IMPACT_URGENCY_LEVELS).default('MEDIUM'),
  defaultUrgency: z.enum(IMPACT_URGENCY_LEVELS).default('MEDIUM'),
  requiresApproval: z.boolean().default(false),
  isPublished: z.boolean().default(true),
  formFields: z.array(formFieldSchema).optional(),
});

@ApiTags('Service Catalog')
@ApiBearerAuth()
@Controller('api/v1/catalog')
export class ServiceCatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('categories')
  @RequirePermissions('catalog:read')
  listCategories(@CurrentAuth() auth: AuthContext) {
    return this.prisma.category.findMany({
      where: { tenantId: auth.organizationId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  @Post('categories')
  @RequirePermissions('catalog:manage')
  async createCategory(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createCategorySchema)) body: z.infer<typeof createCategorySchema>,
  ) {
    const created = await this.prisma.category.create({
      data: {
        tenantId: auth.organizationId,
        name: body.name.trim(),
        slug: body.slug,
        parentId: body.parentId ?? null,
      },
    });
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'CATEGORY_CREATED',
      resourceType: 'Category',
      resourceId: created.id,
      afterState: { name: created.name, slug: created.slug },
    });
    return created;
  }

  @Delete('categories/:id')
  @RequirePermissions('catalog:manage')
  async softDeleteCategory(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    const existing = await this.prisma.category.findFirst({
      where: { id, tenantId: auth.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Category not found.');
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }

  @Get('services')
  @RequirePermissions('catalog:read')
  listServices(@CurrentAuth() auth: AuthContext, @Query('q') q?: string) {
    return this.prisma.service.findMany({
      where: {
        tenantId: auth.organizationId,
        deletedAt: null,
        ...(auth.roleCode === 'Requester' ? { isPublished: true } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        defaultTeam: { select: { id: true, name: true } },
        form: {
          include: {
            fields: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  @Post('services')
  @RequirePermissions('catalog:manage')
  async createService(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createServiceSchema)) body: z.infer<typeof createServiceSchema>,
  ) {
    const created = await this.prisma.$transaction(async (tx) => {
      const svc = await tx.service.create({
        data: {
          tenantId: auth.organizationId,
          name: body.name.trim(),
          slug: body.slug,
          description: body.description.trim(),
          categoryId: body.categoryId ?? null,
          departmentId: body.departmentId ?? null,
          defaultTeamId: body.defaultTeamId ?? null,
          defaultType: body.defaultType,
          defaultImpact: body.defaultImpact,
          defaultUrgency: body.defaultUrgency,
          requiresApproval: body.requiresApproval,
          isPublished: body.isPublished,
        },
      });

      if (body.formFields && body.formFields.length > 0) {
        await tx.serviceForm.create({
          data: {
            tenantId: auth.organizationId,
            serviceId: svc.id,
            fields: {
              create: body.formFields.map((f, index) => ({
                key: f.key,
                label: f.label,
                fieldType: f.fieldType,
                required: f.required,
                placeholder: f.placeholder ?? null,
                optionsJson: (f.options ?? []) as Prisma.InputJsonValue,
                sortOrder: f.sortOrder ?? index,
              })),
            },
          },
        });
      }

      return tx.service.findUnique({
        where: { id: svc.id },
        include: { form: { include: { fields: { orderBy: { sortOrder: 'asc' } } } } },
      });
    });

    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'SERVICE_CREATED',
      resourceType: 'Service',
      resourceId: created!.id,
      afterState: { name: created!.name, slug: created!.slug },
    });

    return created;
  }

  @Put('services/:id/form')
  @RequirePermissions('catalog:manage')
  async upsertForm(
    @CurrentAuth() auth: AuthContext,
    @Param('id') serviceId: string,
    @Body(new ZodValidationPipe(z.object({ fields: z.array(formFieldSchema) })))
    body: { fields: Array<z.infer<typeof formFieldSchema>> },
  ) {
    const svc = await this.prisma.service.findFirst({
      where: { id: serviceId, tenantId: auth.organizationId, deletedAt: null },
    });
    if (!svc) throw new NotFoundException('Service not found.');

    return this.prisma.$transaction(async (tx) => {
      const form = await tx.serviceForm.upsert({
        where: { serviceId },
        create: { tenantId: auth.organizationId, serviceId },
        update: { version: { increment: 1 } },
      });

      await tx.serviceFormField.deleteMany({ where: { formId: form.id } });
      if (body.fields.length > 0) {
        await tx.serviceFormField.createMany({
          data: body.fields.map((f, index) => ({
            formId: form.id,
            key: f.key,
            label: f.label,
            fieldType: f.fieldType,
            required: f.required,
            placeholder: f.placeholder ?? null,
            optionsJson: (f.options ?? []) as Prisma.InputJsonValue,
            sortOrder: f.sortOrder ?? index,
          })),
        });
      }

      return tx.serviceForm.findUnique({
        where: { id: form.id },
        include: { fields: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }
}

export async function validateServiceCustomFields(
  prisma: PrismaService,
  serviceId: string | null | undefined,
  tenantId: string,
  customFields: Record<string, unknown>,
): Promise<void> {
  if (!serviceId) return;
  const service = await prisma.service.findFirst({
    where: { id: serviceId, tenantId, deletedAt: null },
    include: { form: { include: { fields: true } } },
  });
  if (!service) {
    throw new NotFoundException('Referenced service does not exist in this organization.');
  }
  const fields = service.form?.fields ?? [];
  for (const field of fields) {
    const val = customFields[field.key];
    if (field.required && (val === undefined || val === null || String(val).trim() === '')) {
      throw new BadRequestException(`Required service form field "${field.label}" is missing.`);
    }
  }
}

@Module({ controllers: [ServiceCatalogController] })
export class ServiceCatalogModule {}

