import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionCode, RoleCode } from '@civora/types';

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  organizationId: string;
  unitId: string | null;
  roleCode: RoleCode;
  permissions: readonly PermissionCode[];
}

export const IS_PUBLIC_KEY = 'civora:is_public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const REQUIRED_PERMISSIONS_KEY = 'civora:required_permissions';
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<{ auth: AuthContext }>();
    return request.auth;
  },
);

