import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_PERMISSION_MATRIX } from '@civora/config';
import type { PermissionCode, RoleCode } from '@civora/types';
import type { Request } from 'express';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { getRequestContext } from '../../shared/infrastructure/correlation.middleware';
import {
  type AuthContext,
  IS_PUBLIC_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from './auth.decorators';
import { TokenService } from './token.service';

@Injectable()
export class AuthAndTenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<
      Request & { auth?: AuthContext; cookies?: Record<string, string> }
    >();

    const authHeader = request.header('authorization');
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const cookieToken = request.cookies?.['civora_access_token'] || null;
    const rawToken = bearer || cookieToken;

    if (!rawToken) {
      throw new UnauthorizedException('Authentication token is required.');
    }

    const claims = await this.tokenService.verifyAccessToken(rawToken);
    const requestedOrgId = request.header('x-organization-id')?.trim() || claims.orgId;
    const requestedUnitId = request.header('x-unit-id')?.trim() || claims.unitId;

    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: requestedOrgId,
          userId: claims.sub,
        },
      },
      select: {
        isActive: true,
        defaultUnitId: true,
        role: {
          select: {
            code: true,
            rolePermissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
        user: {
          select: { id: true, email: true, name: true, isPlatformAdmin: true, anonymizedAt: true },
        },
      },
    });

    if (!membership || !membership.isActive || membership.user.anonymizedAt) {
      throw new ForbiddenException(
        'User does not have an active membership in the requested organization.',
      );
    }

    const roleCode = membership.role.code as RoleCode;
    const dbPermissions = membership.role.rolePermissions.map(
      (rp) => rp.permission.code as PermissionCode,
    );
    const permissions =
      dbPermissions.length > 0 ? dbPermissions : ROLE_PERMISSION_MATRIX[roleCode] ?? [];

    const authContext: AuthContext = {
      userId: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      isPlatformAdmin: membership.user.isPlatformAdmin,
      organizationId: requestedOrgId,
      unitId: requestedUnitId || membership.defaultUnitId,
      roleCode,
      permissions,
    };

    request.auth = authContext;

    const reqCtx = getRequestContext();
    if (reqCtx) {
      reqCtx.tenantId = authContext.organizationId;
      reqCtx.actorId = authContext.userId;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<PermissionCode[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAll = requiredPermissions.every((p) => authContext.permissions.includes(p));
      if (!hasAll) {
        throw new ForbiddenException(
          `Missing required permission(s): ${requiredPermissions.join(', ')}`,
        );
      }
    }

    return true;
  }
}

