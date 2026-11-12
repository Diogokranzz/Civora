import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getRequestContext } from '../../shared/infrastructure/correlation.middleware';
import { OutboxService } from '../../shared/infrastructure/outbox.service';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';
import { SlaService } from '../sla/sla.service';

const createApprovalSchema = z.object({
  ticketId: z.string().uuid(),
  title: z.string().min(3).max(200),
  approverIds: z.array(z.string().uuid()).min(1).max(10),
});

const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(500).optional(),
});

@ApiTags('Approvals')
@ApiBearerAuth()
@Controller('api/v1/approvals')
export class ApprovalsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly sla: SlaService,
  ) {}

  @Get()
  @RequirePermissions('approvals:read')
  list(@CurrentAuth() auth: AuthContext) {
    const canSeeAll =
      auth.permissions.includes('tickets:read_all') || auth.roleCode === 'ServiceManager';
    return this.prisma.approval.findMany({
      where: {
        tenantId: auth.organizationId,
        ...(canSeeAll ? {} : { steps: { some: { approverId: auth.userId } } }),
      },
      include: {
        ticket: { select: { id: true, publicNumber: true, title: true, priority: true } },
        requestedBy: { select: { id: true, name: true } },
        steps: {
          include: { approver: { select: { id: true, name: true, email: true } } },
          orderBy: { stepOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post()
  @RequirePermissions('tickets:update')
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createApprovalSchema)) body: z.infer<typeof createApprovalSchema>,
  ) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: body.ticketId, tenantId: auth.organizationId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    const members = await this.prisma.membership.findMany({
      where: {
        organizationId: auth.organizationId,
        userId: { in: body.approverIds },
        isActive: true,
      },
    });
    if (members.length !== body.approverIds.length) {
      throw new ForbiddenException('All approvers must belong to this organization.');
    }

    const correlationId = getRequestContext()?.correlationId ?? randomUUID();
    const now = new Date();

    const approval = await this.prisma.$transaction(async (tx) => {
      const created = await tx.approval.create({
        data: {
          tenantId: auth.organizationId,
          ticketId: ticket.id,
          requestedById: auth.userId,
          title: body.title.trim(),
          status: 'PENDING',
          steps: {
            create: body.approverIds.map((approverId, idx) => ({
              stepOrder: idx + 1,
              approverId,
              status: 'PENDING',
            })),
          },
        },
        include: {
          steps: { include: { approver: { select: { id: true, name: true, email: true } } } },
        },
      });

      if (ticket.status !== 'WAITING_APPROVAL') {
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { status: 'WAITING_APPROVAL', version: { increment: 1 } },
        });
        await tx.ticketStatusHistory.create({
          data: {
            tenantId: auth.organizationId,
            ticketId: ticket.id,
            actorId: auth.userId,
            fromStatus: ticket.status,
            toStatus: 'WAITING_APPROVAL',
            reason: `Aprovação solicitada: ${body.title}`,
          },
        });
        await this.sla.syncOnTicketStatusChange(tx, {
          tenantId: auth.organizationId,
          ticketId: ticket.id,
          fromStatus: ticket.status,
          toStatus: 'WAITING_APPROVAL',
          now,
          correlationId,
        });
      }

      await this.audit.record(
        {
          tenantId: auth.organizationId,
          actorId: auth.userId,
          action: 'APPROVAL_REQUESTED',
          resourceType: 'Approval',
          resourceId: created.id,
          afterState: { ticketId: ticket.id, title: created.title },
        },
        tx,
      );

      return created;
    });

    return approval;
  }

  @Post(':approvalId/decide')
  @RequirePermissions('approvals:decide')
  async decide(
    @CurrentAuth() auth: AuthContext,
    @Param('approvalId') approvalId: string,
    @Body(new ZodValidationPipe(decideSchema)) body: z.infer<typeof decideSchema>,
  ) {
    const correlationId = getRequestContext()?.correlationId ?? randomUUID();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.approval.findFirst({
        where: { id: approvalId, tenantId: auth.organizationId },
        include: { steps: { orderBy: { stepOrder: 'asc' } }, ticket: true },
      });
      if (!approval) throw new NotFoundException('Approval not found.');
      if (approval.status !== 'PENDING') {
        throw new ForbiddenException('Approval has already been finalized.');
      }

      const pendingStep = approval.steps.find((s) => s.status === 'PENDING');
      if (!pendingStep) throw new ForbiddenException('No pending approval step.');
      if (
        pendingStep.approverId !== auth.userId &&
        auth.roleCode !== 'OrganizationOwner' &&
        auth.roleCode !== 'Administrator'
      ) {
        throw new ForbiddenException('You are not the designated approver for the current step.');
      }

      await tx.approvalStep.update({
        where: { id: pendingStep.id },
        data: {
          status: body.decision,
          decisionNote: body.note ?? null,
          decidedAt: now,
        },
      });

      const remainingPending = approval.steps.filter(
        (s) => s.id !== pendingStep.id && s.status === 'PENDING',
      );
      const finalStatus =
        body.decision === 'REJECTED'
          ? 'REJECTED'
          : remainingPending.length === 0
            ? 'APPROVED'
            : 'PENDING';

      const updatedApproval = await tx.approval.update({
        where: { id: approval.id },
        data: { status: finalStatus, version: { increment: 1 } },
        include: { steps: true },
      });

      if (finalStatus !== 'PENDING' && approval.ticket.status === 'WAITING_APPROVAL') {
        const nextTicketStatus = finalStatus === 'APPROVED' ? 'OPEN' : 'CANCELED';
        await tx.ticket.update({
          where: { id: approval.ticketId },
          data: {
            status: nextTicketStatus,
            ...(nextTicketStatus === 'CANCELED'
              ? {
                  canceledAt: now,
                  cancellationReason: body.note || 'Solicitação rejeitada no fluxo de aprovação',
                }
              : {}),
            version: { increment: 1 },
          },
        });
        await tx.ticketStatusHistory.create({
          data: {
            tenantId: auth.organizationId,
            ticketId: approval.ticketId,
            actorId: auth.userId,
            fromStatus: 'WAITING_APPROVAL',
            toStatus: nextTicketStatus,
            reason: `Aprovação ${finalStatus}: ${body.note ?? ''}`.trim(),
          },
        });
        await this.sla.syncOnTicketStatusChange(tx, {
          tenantId: auth.organizationId,
          ticketId: approval.ticketId,
          fromStatus: 'WAITING_APPROVAL',
          toStatus: nextTicketStatus,
          now,
          correlationId,
        });
      }

      await this.outbox.persistEvents(tx, [
        {
          eventId: randomUUID(),
          eventType: 'ApprovalResponded',
          eventVersion: 1,
          aggregateType: 'Approval',
          aggregateId: approval.id,
          tenantId: auth.organizationId,
          occurredAt: now,
          correlationId,
          causationId: null,
          payload: {
            approvalId: approval.id,
            ticketId: approval.ticketId,
            decision: body.decision,
            finalStatus,
          } as Prisma.InputJsonValue as Record<string, unknown>,
        },
      ]);

      await this.audit.record(
        {
          tenantId: auth.organizationId,
          actorId: auth.userId,
          action: `APPROVAL_${body.decision}`,
          resourceType: 'Approval',
          resourceId: approval.id,
          afterState: { finalStatus, note: body.note ?? null },
        },
        tx,
      );

      return updatedApproval;
    });
  }
}

@Module({ controllers: [ApprovalsController] })
export class ApprovalsModule {}

