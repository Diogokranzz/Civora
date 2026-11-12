import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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

const createTeamSchema = z.object({
  name: z.string().min(2).max(140),
  departmentId: z.string().uuid().nullable().optional(),
  supervisorId: z.string().uuid().nullable().optional(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
});

@ApiTags('Teams')
@ApiBearerAuth()
@Controller('api/v1/teams')
export class TeamsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('org:read')
  list(@CurrentAuth() auth: AuthContext) {
    return this.prisma.team.findMany({
      where: { tenantId: auth.organizationId },
      include: {
        department: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true, email: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  @RequirePermissions('org:manage')
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createTeamSchema)) body: z.infer<typeof createTeamSchema>,
  ) {
    if (body.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: body.departmentId, tenantId: auth.organizationId },
      });
      if (!dept) throw new NotFoundException('Department not found in organization.');
    }
    if (body.supervisorId) {
      const supMember = await this.prisma.membership.findUnique({
        where: {
          organizationId_userId: { organizationId: auth.organizationId, userId: body.supervisorId },
        },
      });
      if (!supMember) throw new ForbiddenException('Supervisor does not belong to organization.');
    }

    const team = await this.prisma.team.create({
      data: {
        tenantId: auth.organizationId,
        name: body.name.trim(),
        departmentId: body.departmentId ?? null,
        supervisorId: body.supervisorId ?? null,
      },
    });
    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'TEAM_CREATED',
      resourceType: 'Team',
      resourceId: team.id,
      afterState: { name: team.name },
    });
    return team;
  }

  @Post(':teamId/members')
  @RequirePermissions('org:manage')
  async addMember(
    @CurrentAuth() auth: AuthContext,
    @Param('teamId') teamId: string,
    @Body(new ZodValidationPipe(addMemberSchema)) body: z.infer<typeof addMemberSchema>,
  ) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, tenantId: auth.organizationId },
    });
    if (!team) throw new NotFoundException('Team not found.');

    const member = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: { organizationId: auth.organizationId, userId: body.userId },
      },
    });
    if (!member || !member.isActive) {
      throw new ForbiddenException('User is not an active member of this organization.');
    }

    return this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: body.userId } },
      create: { tenantId: auth.organizationId, teamId, userId: body.userId },
      update: {},
    });
  }

  @Delete(':teamId/members/:userId')
  @RequirePermissions('org:manage')
  async removeMember(
    @CurrentAuth() auth: AuthContext,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
  ) {
    await this.prisma.teamMember.deleteMany({
      where: { tenantId: auth.organizationId, teamId, userId },
    });
    return { removed: true };
  }
}

@Module({ controllers: [TeamsController] })
export class TeamsModule {}

