import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';
import { OrganizationsService } from './organizations.service';

const createOrgSchema = z.object({
  name: z.string().min(3).max(180),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  defaultTimezone: z.string().min(3).max(64).optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(3).max(180).optional(),
  defaultTimezone: z.string().min(3).max(64).optional(),
  aiEnabled: z.boolean().optional(),
  dataRetentionDays: z.number().int().min(30).max(3650).optional(),
});

const flagSchema = z.object({
  enabled: z.boolean(),
});

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('api/v1/organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get()
  listMine(@CurrentAuth() auth: AuthContext) {
    return this.service.listForUser(auth.userId);
  }

  @Get('current')
  @RequirePermissions('org:read')
  getCurrent(@CurrentAuth() auth: AuthContext) {
    return this.service.getCurrent(auth.organizationId);
  }

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createOrgSchema)) body: z.infer<typeof createOrgSchema>,
  ) {
    return this.service.createOrganization({
      actorId: auth.userId,
      isPlatformAdmin: auth.isPlatformAdmin,
      ...body,
    });
  }

  @Patch('current')
  @RequirePermissions('org:manage')
  updateCurrent(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateOrgSchema)) body: z.infer<typeof updateOrgSchema>,
  ) {
    return this.service.updateSettings(auth.organizationId, auth.userId, body);
  }

  @Put('current/feature-flags/:key')
  @RequirePermissions('org:manage')
  setFlag(
    @CurrentAuth() auth: AuthContext,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(flagSchema)) body: z.infer<typeof flagSchema>,
  ) {
    return this.service.upsertFeatureFlag(auth.organizationId, auth.userId, key, body.enabled);
  }
}

