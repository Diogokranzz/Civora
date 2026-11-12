import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ROLE_PERMISSION_MATRIX } from '@civora/config';
import type { AuthenticatedUser, PermissionCode, RoleCode } from '@civora/types';
import * as OTPAuth from 'otpauth';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { RedisService } from '../../shared/infrastructure/redis.service';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from './crypto.service';
import { TokenService } from './token.service';

const MAX_LOGIN_ATTEMPTS = 10;
const LOCK_WINDOW_SECONDS = 900;

export const SELF_REGISTER_ROLES = [
  'Requester',
  'Agent',
  'Supervisor',
  'Approver',
  'ServiceManager',
  'Auditor',
] as const;

export type SelfRegisterRoleCode = (typeof SELF_REGISTER_ROLES)[number];
const SELF_REGISTER_ROLE_SET = new Set<string>(SELF_REGISTER_ROLES);

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async login(params: {
    email: string;
    password: string;
    mfaCode?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    user: AuthenticatedUser;
    accessToken: string;
    refreshToken: string;
  }> {
    const email = params.email.trim().toLowerCase();
    const attemptKey = `auth:fail:${email}`;

    try {
      const currentAttempts = Number((await this.redis.client.get(attemptKey)) || 0);
      if (currentAttempts >= MAX_LOGIN_ATTEMPTS) {
        throw new UnauthorizedException(
          'Account temporarily locked due to repeated failed login attempts. Try again later.',
        );
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          where: { isActive: true },
          include: {
            organization: true,
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user || user.anonymizedAt) {
      await this.recordFailedAttempt(attemptKey);
      throw new UnauthorizedException('Invalid email or password.');
    }

    const validPassword = await this.crypto.verifyPassword(params.password, user.passwordHash);
    if (!validPassword) {
      await this.recordFailedAttempt(attemptKey);
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.mfaEnabled && user.mfaSecretEncrypted) {
      if (!params.mfaCode) {
        throw new UnauthorizedException('MFA verification code is required.');
      }
      const secret = this.crypto.decryptSecret(user.mfaSecretEncrypted);
      const totp = new OTPAuth.TOTP({
        issuer: 'Civora',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const delta = totp.validate({ token: params.mfaCode.trim(), window: 1 });
      if (delta === null) {
        await this.recordFailedAttempt(attemptKey);
        throw new UnauthorizedException('Invalid MFA code.');
      }
    }

    if (user.memberships.length === 0) {
      throw new ForbiddenException('User has no active organization membership.');
    }

    try {
      await this.redis.client.del(attemptKey);
    } catch {
      // ignore if redis unavailable
    }

    const activeMembership = user.memberships[0]!;
    return this.issueSessionTokens({
      user,
      activeMembership,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      auditAction: 'AUTH_LOGIN_SUCCEEDED',
    });
  }

  async register(params: {
    name: string;
    email: string;
    password: string;
    roleCode: SelfRegisterRoleCode;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    user: AuthenticatedUser;
    accessToken: string;
    refreshToken: string;
  }> {
    if (!SELF_REGISTER_ROLE_SET.has(params.roleCode)) {
      throw new ForbiddenException(
        'Auto-cadastro permitido apenas para funções não-administrativas.',
      );
    }

    const email = params.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Já existe uma conta cadastrada com este e-mail.');
    }

    const preferredSlug = (process.env.CIVORA_ROOT_ORG_SLUG || 'civora-corporativo')
      .trim()
      .toLowerCase();
    const organization =
      (await this.prisma.organization.findFirst({ where: { slug: preferredSlug } })) ??
      (await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } }));
    if (!organization) {
      throw new BadRequestException('Nenhuma organização ativa disponível para cadastro.');
    }

    const role = await this.prisma.role.findUnique({ where: { code: params.roleCode } });
    if (!role) {
      throw new BadRequestException('Perfil funcional selecionado não foi encontrado.');
    }

    const passwordHash = await this.crypto.hashPassword(params.password);
    const createdUser = await this.prisma.user.create({
      data: {
        name: params.name.trim(),
        email,
        passwordHash,
        isPlatformAdmin: false,
        memberships: {
          create: {
            organizationId: organization.id,
            roleId: role.id,
            isActive: true,
          },
        },
      },
      include: {
        memberships: {
          where: { isActive: true },
          include: {
            organization: true,
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const activeMembership = createdUser.memberships[0]!;
    return this.issueSessionTokens({
      user: createdUser,
      activeMembership,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      auditAction: 'AUTH_SELF_REGISTERED',
    });
  }

  private async issueSessionTokens(params: {
    user: {
      id: string;
      email: string;
      name: string;
      avatarUrl: string | null;
      mfaEnabled: boolean;
      isPlatformAdmin: boolean;
      memberships: Array<{
        organizationId: string;
        defaultUnitId: string | null;
        organization: { name: string; slug: string };
        role: {
          code: string;
          rolePermissions: Array<{ permission: { code: string } }>;
        };
      }>;
    };
    activeMembership: {
      organizationId: string;
      defaultUnitId: string | null;
      role: { code: string };
    };
    ipAddress?: string;
    userAgent?: string;
    auditAction: 'AUTH_LOGIN_SUCCEEDED' | 'AUTH_SELF_REGISTERED';
  }): Promise<{
    user: AuthenticatedUser;
    accessToken: string;
    refreshToken: string;
  }> {
    const { user, activeMembership } = params;
    const authUser = this.mapAuthenticatedUser(
      user,
      activeMembership.organizationId,
      activeMembership.defaultUnitId,
    );

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      orgId: activeMembership.organizationId,
      unitId: activeMembership.defaultUnitId,
      role: activeMembership.role.code as RoleCode,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    const rawRefresh = this.tokens.generateRefreshToken();
    const familyId = randomUUID();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.crypto.hashToken(rawRefresh),
        familyId,
        expiresAt: new Date(Date.now() + this.tokens.getRefreshTtlSeconds() * 1000),
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });

    await this.audit.record({
      tenantId: activeMembership.organizationId,
      actorId: user.id,
      action: params.auditAction,
      resourceType: 'Session',
      resourceId: familyId,
      afterState: { email: user.email, role: activeMembership.role.code },
    });

    return { user: authUser, accessToken, refreshToken: rawRefresh };
  }

  async refresh(params: {
    rawRefreshToken: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    user: AuthenticatedUser;
    accessToken: string;
    refreshToken: string;
  }> {
    const tokenHash = this.crypto.hashToken(params.rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            memberships: {
              where: { isActive: true },
              include: {
                organization: true,
                role: { include: { rolePermissions: { include: { permission: true } } } },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (existing.revokedAt) {
      // Token reuse detected -> revoke entire token family
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const firstOrg = existing.user.memberships[0]?.organizationId;
      if (firstOrg) {
        await this.audit.record({
          tenantId: firstOrg,
          actorId: existing.userId,
          action: 'AUTH_REFRESH_REUSE_DETECTED',
          resourceType: 'Session',
          resourceId: existing.familyId,
          afterState: { compromisedTokenId: existing.id },
        });
      }
      throw new UnauthorizedException('Refresh token reuse detected. Session family revoked.');
    }

    if (existing.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token expired.');
    }

    const activeMembership = existing.user.memberships[0];
    if (!activeMembership || existing.user.anonymizedAt) {
      throw new ForbiddenException('No active membership available.');
    }

    const newRawRefresh = this.tokens.generateRefreshToken();
    const newHash = this.crypto.hashToken(newRawRefresh);
    const newId = randomUUID();

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedByTokenId: newId },
      }),
      this.prisma.refreshToken.create({
        data: {
          id: newId,
          userId: existing.userId,
          tokenHash: newHash,
          familyId: existing.familyId,
          expiresAt: new Date(Date.now() + this.tokens.getRefreshTtlSeconds() * 1000),
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
        },
      }),
    ]);

    const accessToken = await this.tokens.signAccessToken({
      sub: existing.user.id,
      email: existing.user.email,
      name: existing.user.name,
      orgId: activeMembership.organizationId,
      unitId: activeMembership.defaultUnitId,
      role: activeMembership.role.code as RoleCode,
      isPlatformAdmin: existing.user.isPlatformAdmin,
    });

    const user = this.mapAuthenticatedUser(
      existing.user,
      activeMembership.organizationId,
      activeMembership.defaultUnitId,
    );

    return { user, accessToken, refreshToken: newRawRefresh };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = this.crypto.hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (existing) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async getMe(userId: string, activeOrganizationId: string, activeUnitId: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { isActive: true },
          include: {
            organization: true,
            role: { include: { rolePermissions: { include: { permission: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) throw new UnauthorizedException('User not found.');
    return this.mapAuthenticatedUser(user, activeOrganizationId, activeUnitId);
  }

  async switchOrganization(
    userId: string,
    targetOrganizationId: string,
    targetUnitId?: string | null,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { isActive: true },
          include: {
            organization: true,
            role: { include: { rolePermissions: { include: { permission: true } } } },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException('User not found.');

    const target = user.memberships.find((m) => m.organizationId === targetOrganizationId);
    if (!target) {
      throw new ForbiddenException('You do not belong to the requested organization.');
    }

    const effectiveUnitId = targetUnitId ?? target.defaultUnitId;
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      orgId: target.organizationId,
      unitId: effectiveUnitId,
      role: target.role.code as RoleCode,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    return {
      user: this.mapAuthenticatedUser(user, target.organizationId, effectiveUnitId),
      accessToken,
    };
  }

  async setupMfa(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found.');

    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'Civora',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEncrypted: this.crypto.encryptSecret(secret.base32) },
    });

    return {
      otpauthUrl: totp.toString(),
      secretBase32: secret.base32,
    };
  }

  async enableMfa(userId: string, organizationId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecretEncrypted) {
      throw new BadRequestException('MFA setup must be initiated first.');
    }
    const secret = this.crypto.decryptSecret(user.mfaSecretEncrypted);
    const totp = new OTPAuth.TOTP({
      issuer: 'Civora',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    if (totp.validate({ token: code.trim(), window: 1 }) === null) {
      throw new BadRequestException('Invalid verification code.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    await this.audit.record({
      tenantId: organizationId,
      actorId: userId,
      action: 'AUTH_MFA_ENABLED',
      resourceType: 'User',
      resourceId: userId,
    });

    return { mfaEnabled: true };
  }

  private async recordFailedAttempt(attemptKey: string): Promise<void> {
    try {
      const count = await this.redis.client.incr(attemptKey);
      if (count === 1) {
        await this.redis.client.expire(attemptKey, LOCK_WINDOW_SECONDS);
      }
    } catch {
      // Do not fail auth flow if Redis is down
    }
  }

  private mapAuthenticatedUser(
    user: {
      id: string;
      email: string;
      name: string;
      avatarUrl: string | null;
      mfaEnabled: boolean;
      memberships: Array<{
        organizationId: string;
        defaultUnitId: string | null;
        organization: { name: string; slug: string };
        role: {
          code: string;
          rolePermissions: Array<{ permission: { code: string } }>;
        };
      }>;
    },
    activeOrganizationId: string,
    activeUnitId: string | null,
  ): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      mfaEnabled: user.mfaEnabled,
      activeOrganizationId,
      activeUnitId,
      memberships: user.memberships.map((m) => {
        const roleCode = m.role.code as RoleCode;
        const dbPerms = m.role.rolePermissions.map((rp) => rp.permission.code as PermissionCode);
        return {
          organizationId: m.organizationId,
          organizationName: m.organization.name,
          organizationSlug: m.organization.slug,
          roleCode,
          permissions: dbPerms.length > 0 ? dbPerms : [...(ROLE_PERMISSION_MATRIX[roleCode] ?? [])],
          defaultUnitId: m.defaultUnitId,
        };
      }),
    };
  }
}

