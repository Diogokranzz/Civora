import { Body, Controller, Get, Global, Module, Param, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SOCKET_EVENTS } from '@civora/types';
import { z } from 'zod';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { type AuthContext, CurrentAuth } from '../identity/auth.decorators';
import { RealtimeGateway } from './realtime.gateway';

const prefSchema = z.object({
  channel: z.enum(['IN_APP', 'EMAIL', 'SLACK', 'TEAMS']),
  eventType: z.string().min(2).max(60),
  enabled: z.boolean(),
});

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RealtimeGateway,
  ) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.prisma.notification.findMany({
      where: { tenantId: auth.organizationId, userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
  }

  @Patch(':id/read')
  async markRead(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    await this.prisma.notification.updateMany({
      where: { id, tenantId: auth.organizationId, userId: auth.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: true };
  }

  @Patch('read-all')
  async markAllRead(@CurrentAuth() auth: AuthContext) {
    await this.prisma.notification.updateMany({
      where: { tenantId: auth.organizationId, userId: auth.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { readAll: true };
  }

  @Get('preferences')
  getPreferences(@CurrentAuth() auth: AuthContext) {
    return this.prisma.notificationPreference.findMany({
      where: { tenantId: auth.organizationId, userId: auth.userId },
    });
  }

  @Put('preferences')
  upsertPreference(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(prefSchema)) body: z.infer<typeof prefSchema>,
  ) {
    return this.prisma.notificationPreference.upsert({
      where: {
        tenantId_userId_channel_eventType: {
          tenantId: auth.organizationId,
          userId: auth.userId,
          channel: body.channel,
          eventType: body.eventType,
        },
      },
      create: {
        tenantId: auth.organizationId,
        userId: auth.userId,
        channel: body.channel,
        eventType: body.eventType,
        enabled: body.enabled,
      },
      update: { enabled: body.enabled },
    });
  }

  async createInAppNotification(params: {
    tenantId: string;
    userId: string;
    title: string;
    message: string;
    category: string;
    ticketId?: string | null;
  }) {
    const created = await this.prisma.notification.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        title: params.title,
        message: params.message,
        category: params.category,
        ticketId: params.ticketId ?? null,
      },
    });
    this.gateway.emitToUser(params.userId, SOCKET_EVENTS.NOTIFICATION_CREATED, created);
    return created;
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class NotificationsModule {}

