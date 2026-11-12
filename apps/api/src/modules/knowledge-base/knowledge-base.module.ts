import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KNOWLEDGE_STATUSES, KNOWLEDGE_VISIBILITIES } from '@civora/types';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';

export interface KnowledgeSearchPort {
  searchArticleIds(params: {
    tenantId: string;
    query: string;
    publicOnly: boolean;
    limit: number;
  }): Promise<string[]>;
}

@Injectable()
export class PostgresFullTextSearchAdapter implements KnowledgeSearchPort {
  constructor(private readonly prisma: PrismaService) {}

  async searchArticleIds(params: {
    tenantId: string;
    query: string;
    publicOnly: boolean;
    limit: number;
  }): Promise<string[]> {
    const clean = params.query.trim();
    if (!clean) return [];

    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT id
          FROM knowledge_articles
          WHERE tenant_id = ${params.tenantId}::uuid
            AND deleted_at IS NULL
            AND (${params.publicOnly} = false OR (status = 'PUBLISHED' AND visibility = 'PUBLIC'))
            AND (
              to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(body_markdown, ''))
              @@ plainto_tsquery('portuguese', ${clean})
              OR title ILIKE ${'%' + clean + '%'}
              OR summary ILIKE ${'%' + clean + '%'}
            )
          ORDER BY ts_rank(
            to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(body_markdown, '')),
            plainto_tsquery('portuguese', ${clean})
          ) DESC
          LIMIT ${params.limit}
        `,
      );
      return rows.map((r) => r.id);
    } catch {
      const fallback = await this.prisma.knowledgeArticle.findMany({
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          ...(params.publicOnly ? { status: 'PUBLISHED', visibility: 'PUBLIC' } : {}),
          OR: [
            { title: { contains: clean, mode: 'insensitive' } },
            { summary: { contains: clean, mode: 'insensitive' } },
            { bodyMarkdown: { contains: clean, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: params.limit,
      });
      return fallback.map((f) => f.id);
    }
  }
}

const createArticleSchema = z.object({
  title: z.string().min(4).max(220),
  slug: z
    .string()
    .min(3)
    .max(180)
    .regex(/^[a-z0-9-]+$/),
  summary: z.string().min(10).max(500),
  bodyMarkdown: z.string().min(10),
  categoryId: z.string().uuid().nullable().optional(),
  visibility: z.enum(KNOWLEDGE_VISIBILITIES).default('INTERNAL'),
  tags: z.array(z.string().max(40)).default([]),
});

const updateArticleSchema = createArticleSchema.partial().extend({
  status: z.enum(KNOWLEDGE_STATUSES).optional(),
  changeNote: z.string().max(300).optional(),
});

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@Controller('api/v1/knowledge/articles')
export class KnowledgeBaseController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchAdapter: PostgresFullTextSearchAdapter,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('kb:read')
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
  ) {
    const publicOnly = auth.roleCode === 'Requester';
    const page = Math.max(1, Number(pageParam) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(pageSizeParam) || 20));

    let idsFilter: string[] | undefined;
    if (q && q.trim().length > 0) {
      idsFilter = await this.searchAdapter.searchArticleIds({
        tenantId: auth.organizationId,
        query: q,
        publicOnly,
        limit: 50,
      });
    }

    const where: Prisma.KnowledgeArticleWhereInput = {
      tenantId: auth.organizationId,
      deletedAt: null,
      ...(publicOnly ? { status: 'PUBLISHED', visibility: 'PUBLIC' } : {}),
      ...(status && !publicOnly ? { status: status as Prisma.EnumKnowledgeStatusFilter['equals'] } : {}),
      ...(idsFilter !== undefined ? { id: { in: idsFilter } } : {}),
    };

    const [totalItems, rows] = await Promise.all([
      this.prisma.knowledgeArticle.count({ where }),
      this.prisma.knowledgeArticle.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          author: { select: { id: true, name: true } },
          reviewer: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      data: rows,
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  @Get(':id')
  @RequirePermissions('kb:read')
  async getDetail(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    const publicOnly = auth.roleCode === 'Requester';
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: {
        id,
        tenantId: auth.organizationId,
        deletedAt: null,
        ...(publicOnly ? { status: 'PUBLISHED', visibility: 'PUBLIC' } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        author: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        versions: {
          include: { editor: { select: { id: true, name: true } } },
          orderBy: { versionNo: 'desc' },
        },
      },
    });
    if (!article) throw new NotFoundException('Article not found.');
    return article;
  }

  @Post()
  @RequirePermissions('kb:write')
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createArticleSchema)) body: z.infer<typeof createArticleSchema>,
  ) {
    const article = await this.prisma.$transaction(async (tx) => {
      const created = await tx.knowledgeArticle.create({
        data: {
          tenantId: auth.organizationId,
          categoryId: body.categoryId ?? null,
          authorId: auth.userId,
          slug: body.slug,
          title: body.title.trim(),
          summary: body.summary.trim(),
          bodyMarkdown: body.bodyMarkdown,
          visibility: body.visibility,
          tags: body.tags,
          status: 'DRAFT',
          currentVersion: 1,
          versions: {
            create: {
              versionNo: 1,
              title: body.title.trim(),
              bodyMarkdown: body.bodyMarkdown,
              editorId: auth.userId,
              changeNote: 'Versão inicial',
            },
          },
        },
      });
      await this.audit.record(
        {
          tenantId: auth.organizationId,
          actorId: auth.userId,
          action: 'KB_ARTICLE_CREATED',
          resourceType: 'KnowledgeArticle',
          resourceId: created.id,
          afterState: { title: created.title, slug: created.slug },
        },
        tx,
      );
      return created;
    });
    return article;
  }

  @Patch(':id')
  @RequirePermissions('kb:write')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateArticleSchema)) body: z.infer<typeof updateArticleSchema>,
  ) {
    const existing = await this.prisma.knowledgeArticle.findFirst({
      where: { id, tenantId: auth.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Article not found.');

    const nextVersion =
      body.bodyMarkdown || body.title ? existing.currentVersion + 1 : existing.currentVersion;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.knowledgeArticle.update({
        where: { id },
        data: {
          ...(body.title ? { title: body.title.trim() } : {}),
          ...(body.summary ? { summary: body.summary.trim() } : {}),
          ...(body.bodyMarkdown ? { bodyMarkdown: body.bodyMarkdown } : {}),
          ...(body.visibility ? { visibility: body.visibility } : {}),
          ...(body.tags ? { tags: body.tags } : {}),
          ...(body.status ? { status: body.status } : {}),
          ...(body.status === 'PUBLISHED' && !existing.publishedAt
            ? { publishedAt: new Date(), reviewerId: auth.userId }
            : {}),
          currentVersion: nextVersion,
          version: { increment: 1 },
        },
      });

      if (nextVersion > existing.currentVersion) {
        await tx.knowledgeArticleVersion.create({
          data: {
            articleId: id,
            versionNo: nextVersion,
            title: updated.title,
            bodyMarkdown: updated.bodyMarkdown,
            editorId: auth.userId,
            changeNote: body.changeNote ?? 'Atualização de conteúdo',
          },
        });
      }

      return updated;
    });
  }

  @Post(':id/feedback')
  @RequirePermissions('kb:read')
  async feedback(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ helpful: z.boolean() }))) body: { helpful: boolean },
  ) {
    const existing = await this.prisma.knowledgeArticle.findFirst({
      where: { id, tenantId: auth.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Article not found.');
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: body.helpful
        ? { helpfulCount: { increment: 1 } }
        : { notHelpfulCount: { increment: 1 } },
      select: { id: true, helpfulCount: true, notHelpfulCount: true },
    });
  }
}

@Module({
  controllers: [KnowledgeBaseController],
  providers: [PostgresFullTextSearchAdapter],
  exports: [PostgresFullTextSearchAdapter],
})
export class KnowledgeBaseModule {}

