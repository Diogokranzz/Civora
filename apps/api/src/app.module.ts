import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AiModule } from './modules/ai/ai.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AuditModule } from './modules/audit/audit.module';
import { AutomationsModule } from './modules/automations/automations.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { HealthModule } from './modules/health/health.module';
import { AuthAndTenantGuard } from './modules/identity/auth-tenant.guard';
import { IdentityModule } from './modules/identity/identity.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ItsmModule } from './modules/itsm/itsm.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PermissionsModule, RolesModule } from './modules/roles/roles.module';
import { ServiceCatalogModule } from './modules/service-catalog/service-catalog.module';
import { SlaModule } from './modules/sla/sla.module';
import { TeamsModule } from './modules/teams/teams.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { UnitsModule } from './modules/units/units.module';
import { UsersModule } from './modules/users/users.module';
import {
  CorrelationMiddleware,
  getRequestContext,
} from './shared/infrastructure/correlation.middleware';
import { HttpMetricsInterceptor } from './shared/infrastructure/http-metrics.interceptor';
import { ProblemDetailsExceptionFilter } from './shared/infrastructure/problem-details.filter';
import { SharedInfrastructureModule } from './shared/infrastructure/shared.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.mfaCode',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
        customProps: () => ({
          correlationId: getRequestContext()?.correlationId,
          tenantId: getRequestContext()?.tenantId,
        }),
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 240,
      },
    ]),
    SharedInfrastructureModule,
    HealthModule,
    AuditModule,
    IdentityModule,
    OrganizationsModule,
    UnitsModule,
    DepartmentsModule,
    TeamsModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    ServiceCatalogModule,
    SlaModule,
    NotificationsModule,
    IntegrationsModule,
    TicketsModule,
    ApprovalsModule,
    AutomationsModule,
    KnowledgeBaseModule,
    AssetsModule,
    ItsmModule,
    ReportsModule,
    AiModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthAndTenantGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
