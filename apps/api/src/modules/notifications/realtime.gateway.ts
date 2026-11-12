import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import { SOCKET_EVENTS } from '@civora/types';
import type { Server, Socket } from 'socket.io';
import { MetricsService } from '../../shared/infrastructure/metrics.service';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { TokenService } from '../identity/token.service';

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const authToken =
        (client.handshake.auth?.token as string | undefined) ||
        this.extractCookie(client.handshake.headers.cookie, 'civora_access_token');

      if (!authToken) {
        client.disconnect(true);
        return;
      }

      const claims = await this.tokenService.verifyAccessToken(authToken);
      const requestedOrg =
        (client.handshake.auth?.organizationId as string | undefined) || claims.orgId;

      const membership = await this.prisma.membership.findUnique({
        where: {
          organizationId_userId: { organizationId: requestedOrg, userId: claims.sub },
        },
      });
      if (!membership || !membership.isActive) {
        client.disconnect(true);
        return;
      }

      client.data.userId = claims.sub;
      client.data.organizationId = requestedOrg;
      client.data.userName = claims.name;

      await client.join(`tenant:${requestedOrg}`);
      await client.join(`user:${claims.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('ticket.join')
  async handleJoinTicket(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { ticketId?: string },
  ) {
    const orgId = client.data.organizationId as string | undefined;
    if (!orgId || !payload?.ticketId) return;

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: payload.ticketId, tenantId: orgId },
      select: { id: true },
    });
    if (!ticket) return;

    await client.join(`ticket:${ticket.id}`);
    this.server.to(`ticket:${ticket.id}`).emit(SOCKET_EVENTS.PRESENCE_VIEWING, {
      ticketId: ticket.id,
      userId: client.data.userId,
      name: client.data.userName,
    });
  }

  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    this.metrics.realtimeEventsEmittedTotal.inc({ tenant_id: tenantId, event });
    if (!this.server) return;
    this.server.to(`tenant:${tenantId}`).emit(event, payload);
  }

  emitToTicket(ticketId: string, event: string, payload: unknown): void {
    this.metrics.realtimeEventsEmittedTotal.inc({ tenant_id: 'ticket-room', event });
    if (!this.server) return;
    this.server.to(`ticket:${ticketId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.metrics.realtimeEventsEmittedTotal.inc({ tenant_id: 'user-room', event });
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  private extractCookie(cookieHeader: string | undefined, name: string): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
  }
}

