import { Controller, Get, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { RequirePermissions } from '../identity/auth.decorators';

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@Controller('api/v1/roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('org:read')
  listRoles() {
    return this.prisma.role.findMany({
      include: {
        rolePermissions: { include: { permission: true } },
      },
      orderBy: { code: 'asc' },
    });
  }
}

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@Controller('api/v1/permissions')
export class PermissionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('org:read')
  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }
}

@Module({ controllers: [RolesController] })
export class RolesModule {}

@Module({ controllers: [PermissionsController] })
export class PermissionsModule {}

