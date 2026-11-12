import { Global, Module } from '@nestjs/common';
import { AuthAndTenantGuard } from './auth-tenant.guard';
import { CryptoService } from './crypto.service';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { TokenService } from './token.service';

@Global()
@Module({
  controllers: [IdentityController],
  providers: [CryptoService, TokenService, IdentityService, AuthAndTenantGuard],
  exports: [CryptoService, TokenService, IdentityService, AuthAndTenantGuard],
})
export class IdentityModule {}

