import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../shared/infrastructure/zod-validation.pipe';
import { type AuthContext, CurrentAuth, Public } from './auth.decorators';
import { IdentityService, SELF_REGISTER_ROLES } from './identity.service';
import { TokenService } from './token.service';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  mfaCode: z.string().optional(),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome completo').max(160),
  email: z.string().trim().email('E-mail inválido').max(200),
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres').max(128),
  roleCode: z.enum(SELF_REGISTER_ROLES).default('Requester'),
});

const switchOrgSchema = z.object({
  organizationId: z.string().uuid(),
  unitId: z.string().uuid().nullable().optional(),
});

const mfaCodeSchema = z.object({
  code: z.string().length(6),
});

@ApiTags('Authentication & Identity')
@Controller('api/v1/auth')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly tokenService: TokenService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.identityService.login({
      email: body.email,
      password: body.password,
      mfaCode: body.mfaCode,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    });

    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: z.infer<typeof registerSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.identityService.register({
      name: body.name,
      email: body.email,
      password: body.password,
      roleCode: body.roleCode,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    });

    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefresh = req.cookies?.['civora_refresh_token'];
    if (!rawRefresh) {
      throw new UnauthorizedException('Refresh cookie is missing.');
    }

    const result = await this.identityService.refresh({
      rawRefreshToken: rawRefresh,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    });

    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.identityService.logout(req.cookies?.['civora_refresh_token']);
    res.clearCookie('civora_access_token', { path: '/' });
    res.clearCookie('civora_refresh_token', { path: '/api/v1/auth' });
  }

  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentAuth() auth: AuthContext) {
    return this.identityService.getMe(auth.userId, auth.organizationId, auth.unitId);
  }

  @ApiBearerAuth()
  @Post('switch-organization')
  @HttpCode(HttpStatus.OK)
  async switchOrganization(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(switchOrgSchema)) body: z.infer<typeof switchOrgSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.identityService.switchOrganization(
      auth.userId,
      body.organizationId,
      body.unitId,
    );
    const secure = process.env.COOKIE_SECURE === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE as 'strict' | 'lax' | 'none') || 'lax';
    res.cookie('civora_access_token', result.accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: this.tokenService.getAccessTtlSeconds() * 1000,
    });
    return result;
  }

  @ApiBearerAuth()
  @Post('mfa/setup')
  async setupMfa(@CurrentAuth() auth: AuthContext) {
    return this.identityService.setupMfa(auth.userId);
  }

  @ApiBearerAuth()
  @Post('mfa/enable')
  async enableMfa(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(mfaCodeSchema)) body: z.infer<typeof mfaCodeSchema>,
  ) {
    return this.identityService.enableMfa(auth.userId, auth.organizationId, body.code);
  }

  @Public()
  @Get('oidc/config')
  oidcStatus() {
    const enabled = process.env.OIDC_ENABLED === 'true';
    return {
      enabled,
      issuerUrl: enabled ? process.env.OIDC_ISSUER_URL : null,
      clientId: enabled ? process.env.OIDC_CLIENT_ID : null,
      authorizationEndpoint: enabled
        ? `${process.env.OIDC_ISSUER_URL}/protocol/openid-connect/auth`
        : null,
    };
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const secure = process.env.COOKIE_SECURE === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE as 'strict' | 'lax' | 'none') || 'lax';

    res.cookie('civora_access_token', accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: this.tokenService.getAccessTtlSeconds() * 1000,
    });
    res.cookie('civora_refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/api/v1/auth',
      maxAge: this.tokenService.getRefreshTtlSeconds() * 1000,
    });
  }
}

