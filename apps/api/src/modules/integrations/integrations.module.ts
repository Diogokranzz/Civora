import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';
import { CryptoService } from '../identity/crypto.service';
import { HybridStorageService } from './storage.service';

const createWebhookSchema = z.object({
  name: z.string().min(2).max(140),
  url: z.string().url().max(512),
  secret: z.string().min(16).max(128),
  events: z.array(z.string().min(2)).min(1),
});

@ApiTags('Integrations & Webhooks')
@ApiBearerAuth()
@Controller('api/v1/integrations')
export class IntegrationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  @Get('webhooks')
  @RequirePermissions('webhooks:manage')
  async listWebhooks(@CurrentAuth() auth: AuthContext) {
    const hooks = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId: auth.organizationId },
      include: {
        deliveries: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: { createdAt: 'desc' },
    });
    return hooks.map((h) => ({
      id: h.id,
      name: h.name,
      url: h.url,
      events: h.events,
      isActive: h.isActive,
      createdAt: h.createdAt,
      deliveries: h.deliveries,
    }));
  }

  @Post('webhooks')
  @RequirePermissions('webhooks:manage')
  async createWebhook(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createWebhookSchema)) body: z.infer<typeof createWebhookSchema>,
  ) {
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        tenantId: auth.organizationId,
        name: body.name.trim(),
        url: body.url,
        secretEncrypted: this.crypto.encryptSecret(body.secret),
        events: body.events,
      },
    });
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'WEBHOOK_ENDPOINT_CREATED',
      resourceType: 'WebhookEndpoint',
      resourceId: endpoint.id,
      afterState: { name: endpoint.name, url: endpoint.url, events: endpoint.events },
    });
    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.events,
      isActive: endpoint.isActive,
      createdAt: endpoint.createdAt,
    };
  }

  @Delete('webhooks/:id')
  @RequirePermissions('webhooks:manage')
  async deleteWebhook(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId: auth.organizationId },
    });
    if (!existing) throw new NotFoundException('Webhook endpoint not found.');
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { deleted: true };
  }

  @Get('adapters')
  @RequirePermissions('org:read')
  listAdapterStatus() {
    return {
      storage: { provider: process.env.STORAGE_PROVIDER || 'local' },
      email: { provider: process.env.EMAIL_PROVIDER || 'console' },
      oidc: { enabled: process.env.OIDC_ENABLED === 'true' },
      slack: { configured: Boolean(process.env.SLACK_WEBHOOK_URL) },
      teams: { configured: Boolean(process.env.TEAMS_WEBHOOK_URL) },
      ldap: { status: 'INTERFACE_READY' },
    };
  }
}

@Module({
  controllers: [IntegrationsController],
  providers: [HybridStorageService],
  exports: [HybridStorageService],
})
export class IntegrationsModule {}

