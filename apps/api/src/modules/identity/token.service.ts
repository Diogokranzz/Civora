import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import type { RoleCode } from '@civora/types';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  name: string;
  orgId: string;
  unitId: string | null;
  role: RoleCode;
  isPlatformAdmin: boolean;
}

@Injectable()
export class TokenService {
  private getAccessSecret(): Uint8Array {
    return new TextEncoder().encode(
      process.env.JWT_ACCESS_SECRET || 'civora-dev-access-secret-change-in-production-32chars-min',
    );
  }

  getAccessTtlSeconds(): number {
    return Number(process.env.JWT_ACCESS_TTL_SECONDS || 900);
  }

  getRefreshTtlSeconds(): number {
    return Number(process.env.JWT_REFRESH_TTL_SECONDS || 604800);
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({
      email: claims.email,
      name: claims.name,
      orgId: claims.orgId,
      unitId: claims.unitId,
      role: claims.role,
      isPlatformAdmin: claims.isPlatformAdmin,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuer('civora-api')
      .setAudience('civora-clients')
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${this.getAccessTtlSeconds()}s`)
      .sign(this.getAccessSecret());
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.getAccessSecret(), {
        issuer: 'civora-api',
        audience: 'civora-clients',
      });
      if (!payload.sub || typeof payload.orgId !== 'string') {
        throw new UnauthorizedException('Invalid token claims');
      }
      return {
        sub: payload.sub,
        email: String(payload.email ?? ''),
        name: String(payload.name ?? ''),
        orgId: payload.orgId,
        unitId: typeof payload.unitId === 'string' ? payload.unitId : null,
        role: (payload.role as RoleCode) ?? 'Requester',
        isPlatformAdmin: Boolean(payload.isPlatformAdmin),
      };
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired.');
    }
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }
}

