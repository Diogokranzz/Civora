import { Body, ConflictException, Controller, Get, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ROLE_CODES } from '@civora/types';
import { z } from 'zod';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';
import { CryptoService } from '../identity/crypto.service';

const createMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(160),
  password: z.string().min(8).max(128).optional(),
  roleCode: z.enum(ROLE_CODES),
  defaultUnitId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

const updateMemberSchema = z.object({
  roleCode: z.enum(ROLE_CODES).optional(),
  defaultUnitId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

@ApiTags('Users & Memberships')
@ApiBearerAuth()
@Controller('api/v1/users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('users:read')
  async listMembers(@CurrentAuth() auth: AuthContext) {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId: auth.organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            mfaEnabled: true,
            createdAt: true,
          },
        },
        role: { select: { id: true, code: true, name: true } },
        defaultUnit: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { user: { name: 'asc' } },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      mfaEnabled: m.user.mfaEnabled,
      role: m.role,
      defaultUnit: m.defaultUnit,
      department: m.department,
      isActive: m.isActive,
    }));
  }

  @Post()
  @RequirePermissions('users:manage')
  async createOrInviteMember(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createMemberSchema)) body: z.infer<typeof createMemberSchema>,
  ) {
    const email = body.email.trim().toLowerCase();
    const role = await this.prisma.role.findUnique({ where: { code: body.roleCode } });
    if (!role) throw new NotFoundException('Role not found.');

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const existingMembership = await this.prisma.membership.findUnique({
        where: {
          organizationId_userId: { organizationId: auth.organizationId, userId: user.id },
        },
      });
      if (existingMembership) {
        throw new ConflictException('User is already a member of this organization.');
      }
    } else {
      const passwordHash = await this.crypto.hashPassword(
        body.password || 'CivoraTemp!2026',
      );
      user = await this.prisma.user.create({
        data: {
          email,
          name: body.name.trim(),
          passwordHash,
        },
      });
    }

    const membership = await this.prisma.membership.create({
      data: {
        organizationId: auth.organizationId,
        userId: user.id,
        roleId: role.id,
        defaultUnitId: body.defaultUnitId ?? null,
        departmentId: body.departmentId ?? null,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        role: { select: { code: true, name: true } },
      },
    });

    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'USER_MEMBERSHIP_ADDED',
      resourceType: 'Membership',
      resourceId: membership.id,
      afterState: { email: user.email, roleCode: role.code },
    });

    return membership;
  }

  @Patch(':userId')
  @RequirePermissions('users:manage')
  async updateMembership(
    @CurrentAuth() auth: AuthContext,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: z.infer<typeof updateMemberSchema>,
  ) {
    const existing = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: { organizationId: auth.organizationId, userId },
      },
      include: { role: true },
    });
    if (!existing) throw new NotFoundException('Membership not found.');

    let roleId = existing.roleId;
    if (body.roleCode) {
      const role = await this.prisma.role.findUnique({ where: { code: body.roleCode } });
      if (!role) throw new NotFoundException('Role not found.');
      roleId = role.id;
    }

    const updated = await this.prisma.membership.update({
      where: { id: existing.id },
      data: {
        roleId,
        ...(body.defaultUnitId !== undefined ? { defaultUnitId: body.defaultUnitId } : {}),
        ...(body.departmentId !== undefined ? { departmentId: body.departmentId } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include: { role: { select: { code: true, name: true } } },
    });

    await this.audit.record({
      tenantId: auth.organizationId,
      actorId: auth.userId,
      action: 'USER_MEMBERSHIP_UPDATED',
      resourceType: 'Membership',
      resourceId: existing.id,
      beforeState: { role: existing.role.code, isActive: existing.isActive },
      afterState: { role: updated.role.code, isActive: updated.isActive },
    });

    return updated;
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}

