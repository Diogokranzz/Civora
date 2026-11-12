import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  IMPACT_URGENCY_LEVELS,
  PRIORITY_LEVELS,
  TICKET_CHANNELS,
  TICKET_STATUSES,
  TICKET_TYPES,
} from '@civora/types';
import type { Response } from 'express';
import { z } from 'zod';
import { IdempotencyService } from '../../shared/infrastructure/idempotency.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';
import { TicketsService } from './tickets.service';

const createTicketSchema = z.object({
  title: z.string().min(3).max(240),
  description: z.string().min(3).max(25000),
  type: z.enum(TICKET_TYPES).optional(),
  channel: z.enum(TICKET_CHANNELS).optional(),
  impact: z.enum(IMPACT_URGENCY_LEVELS).optional(),
  urgency: z.enum(IMPACT_URGENCY_LEVELS).optional(),
  unitId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  assignedTeamId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  subcategory: z.string().max(120).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  customFields: z.record(z.unknown()).optional(),
  isMajorIncident: z.boolean().optional(),
  assetIds: z.array(z.string().uuid()).optional(),
});

const transitionSchema = z.object({
  targetStatus: z.enum(TICKET_STATUSES),
  version: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
  resolutionSummary: z.string().max(4000).optional(),
  cancellationReason: z.string().max(500).optional(),
});

const assignSchema = z.object({
  assigneeId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive().optional(),
});

const overridePrioritySchema = z.object({
  priority: z.enum(PRIORITY_LEVELS),
  reason: z.string().min(5).max(500),
  version: z.number().int().positive().optional(),
});

const commentSchema = z.object({
  body: z.string().min(1).max(20000),
  isInternal: z.boolean().default(false),
});

const csatSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

const bulkSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(50),
  assigneeId: z.string().uuid().nullable().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  reason: z.string().max(500).optional(),
});

const bulkDeleteSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(50),
  reason: z.string().max(500).optional(),
});

const savedViewSchema = z.object({
  name: z.string().min(2).max(120),
  filters: z.record(z.unknown()),
  isShared: z.boolean().optional(),
});

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('api/v1/tickets')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @RequirePermissions('tickets:read')
  list(
    @CurrentAuth() auth: AuthContext,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
    @Query('priority') priority?: string,
    @Query('departmentId') departmentId?: string,
    @Query('unitId') unitId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('assignedTeamId') assignedTeamId?: string,
    @Query('slaState') slaState?: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.ticketsService.listTickets(auth, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      statuses,
      priority,
      departmentId,
      unitId,
      assigneeId,
      assignedTeamId,
      slaState,
      search,
      fromDate,
      toDate,
      sortBy,
      sortOrder,
    });
  }

  @Get('export/csv')
  @RequirePermissions('tickets:export')
  async exportCsv(
    @CurrentAuth() auth: AuthContext,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('departmentId') departmentId?: string,
    @Query('unitId') unitId?: string,
    @Query('search') search?: string,
  ) {
    const csv = await this.ticketsService.exportCsv(auth, {
      status,
      priority,
      departmentId,
      unitId,
      search,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="civora-chamados.csv"');
    res.send(csv);
  }

  @Get('views')
  @RequirePermissions('tickets:read')
  listViews(@CurrentAuth() auth: AuthContext) {
    return this.ticketsService.listSavedViews(auth);
  }

  @Post('views')
  @RequirePermissions('tickets:read')
  createView(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(savedViewSchema)) body: z.infer<typeof savedViewSchema>,
  ) {
    return this.ticketsService.createSavedView(auth, body);
  }

  @Post('bulk')
  @RequirePermissions('tickets:bulk_update')
  bulkUpdate(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(bulkSchema)) body: z.infer<typeof bulkSchema>,
  ) {
    return this.ticketsService.bulkAction(auth, body);
  }

  @Post('bulk-delete')
  @RequirePermissions('tickets:bulk_update')
  bulkDelete(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(bulkDeleteSchema)) body: z.infer<typeof bulkDeleteSchema>,
  ) {
    return this.ticketsService.bulkDelete(auth, body);
  }

  @Delete(':id')
  @RequirePermissions('tickets:update')
  deleteTicket(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.ticketsService.deleteTicket(auth, id);
  }

  @Post()
  @RequirePermissions('tickets:create')
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createTicketSchema)) body: z.infer<typeof createTicketSchema>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const result = await this.idempotency.execute({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      idempotencyKey,
      method: 'POST',
      path: '/api/v1/tickets',
      payload: body,
      status: 201,
      handler: () => this.ticketsService.createTicket(auth, body),
    });
    return result.body;
  }

  @Get(':id')
  @RequirePermissions('tickets:read')
  getDetail(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.ticketsService.getTicketDetail(auth, id);
  }

  @Get(':id/timeline')
  @RequirePermissions('tickets:read')
  getTimeline(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ticketsService.getTimeline(auth, id, cursor, limit ? Number(limit) : 30);
  }

  @Post(':id/transition')
  @RequirePermissions('tickets:transition')
  transition(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transitionSchema)) body: z.infer<typeof transitionSchema>,
  ) {
    return this.ticketsService.transitionStatus(auth, id, body);
  }

  @Post(':id/assign')
  @RequirePermissions('tickets:assign')
  assign(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignSchema)) body: z.infer<typeof assignSchema>,
  ) {
    return this.ticketsService.assignTicket(auth, id, body);
  }

  @Post(':id/priority-override')
  @RequirePermissions('tickets:override_priority')
  overridePriority(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(overridePrioritySchema))
    body: z.infer<typeof overridePrioritySchema>,
  ) {
    return this.ticketsService.overridePriority(auth, id, body);
  }

  @Post(':id/comments')
  @RequirePermissions('tickets:comment_public')
  addComment(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(commentSchema)) body: z.infer<typeof commentSchema>,
  ) {
    return this.ticketsService.addComment(auth, id, body);
  }

  @Post(':id/csat')
  @RequirePermissions('tickets:read')
  rate(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(csatSchema)) body: z.infer<typeof csatSchema>,
  ) {
    return this.ticketsService.rateSatisfaction(auth, id, body);
  }

  @Post(':id/attachments')
  @RequirePermissions('tickets:comment_public')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadAttachment(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('File upload is required.');
    }
    return this.ticketsService.uploadAttachment(auth, id, file);
  }

  @Get(':id/attachments/:attachmentId/download')
  @RequirePermissions('tickets:read')
  async downloadAttachment(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const result = await this.ticketsService.getAttachmentDownload(auth, id, attachmentId);
    if (result.mode === 'redirect') {
      res.redirect(302, result.signedUrl);
      return;
    }
    res.setHeader('Content-Type', result.attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.attachment.fileName)}"`,
    );
    result.stream.pipe(res);
  }
}

