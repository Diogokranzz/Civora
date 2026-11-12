import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { DashboardMetricsDto, PriorityLevel, TicketStatus } from '@civora/types';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../identity/auth.decorators';

@ApiTags('Reports & Analytics')
@ApiBearerAuth()
@Controller('api/v1/reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('dashboard')
  @RequirePermissions('reports:read')
  async getDashboard(
    @CurrentAuth() auth: AuthContext,
    @Query('unitId') unitId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('days') daysParam?: string,
  ): Promise<DashboardMetricsDto> {
    const days = Math.min(90, Math.max(7, Number(daysParam) || 14));
    const sinceDate = new Date(Date.now() - days * 86_400_000);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const baseWhere = {
      tenantId: auth.organizationId,
      ...(unitId ? { unitId } : {}),
      ...(departmentId ? { departmentId } : {}),
    };

    const tickets = await this.prisma.ticket.findMany({
      where: baseWhere,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        unit: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true } },
        assignedTeam: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
        slaInstances: {
          include: { policy: { include: { targets: true } } },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
        statusHistory: { where: { toStatus: 'REOPENED' }, select: { id: true } },
      },
    });

    const totalTickets = tickets.length;
    const criticalTickets = tickets.filter(
      (t) =>
        t.priority === 'CRITICAL' &&
        !['RESOLVED', 'CLOSED', 'CANCELED'].includes(t.status),
    ).length;
    const inProgressTickets = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
    const resolvedToday = tickets.filter(
      (t) => t.resolvedAt && t.resolvedAt >= todayStart,
    ).length;
    const backlogTickets = tickets.filter(
      (t) => !['RESOLVED', 'CLOSED', 'CANCELED'].includes(t.status),
    ).length;

    const firstRespSamples = tickets
      .filter((t) => t.firstResponseAt)
      .map((t) => (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 60_000);
    const mttaMinutes =
      firstRespSamples.length > 0
        ? Math.round(firstRespSamples.reduce((a, b) => a + b, 0) / firstRespSamples.length)
        : 0;

    const resolutionSamples = tickets
      .filter((t) => t.resolvedAt)
      .map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60_000);
    const mttrMinutes =
      resolutionSamples.length > 0
        ? Math.round(resolutionSamples.reduce((a, b) => a + b, 0) / resolutionSamples.length)
        : 0;

    const slaTracked = tickets.filter((t) => t.slaInstances[0]);
    const slaCompliant = slaTracked.filter((t) => !t.slaInstances[0]?.breachedAt).length;
    const slaComplianceRate =
      slaTracked.length > 0 ? Math.round((slaCompliant / slaTracked.length) * 1000) / 10 : 100;

    const reopenedCount = tickets.filter((t) => t.statusHistory.length > 0).length;
    const reopenRate =
      totalTickets > 0 ? Math.round((reopenedCount / totalTickets) * 1000) / 10 : 0;

    const csatValues = tickets
      .map((t) => t.csatScore)
      .filter((s): s is number => typeof s === 'number');
    const avgCsat =
      csatValues.length > 0
        ? Math.round((csatValues.reduce((a, b) => a + b, 0) / csatValues.length) * 100) / 100
        : null;

    const priorityMap = new Map<PriorityLevel, number>();
    const statusMap = new Map<TicketStatus, number>();
    for (const t of tickets) {
      priorityMap.set(t.priority, (priorityMap.get(t.priority) ?? 0) + 1);
      statusMap.set(t.status, (statusMap.get(t.status) ?? 0) + 1);
    }

    const volumeMap = new Map<string, { created: number; resolved: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      volumeMap.set(key, { created: 0, resolved: 0 });
    }
    for (const t of tickets) {
      if (t.createdAt >= sinceDate) {
        const k = t.createdAt.toISOString().slice(0, 10);
        const entry = volumeMap.get(k);
        if (entry) entry.created += 1;
      }
      if (t.resolvedAt && t.resolvedAt >= sinceDate) {
        const k = t.resolvedAt.toISOString().slice(0, 10);
        const entry = volumeMap.get(k);
        if (entry) entry.resolved += 1;
      }
    }

    const teamPerfMap = new Map<
      string,
      {
        teamName: string;
        openCount: number;
        resolvedCount: number;
        slaOk: number;
        slaTotal: number;
        resMins: number[];
      }
    >();
    for (const t of tickets) {
      if (!t.assignedTeam) continue;
      const entry = teamPerfMap.get(t.assignedTeam.id) ?? {
        teamName: t.assignedTeam.name,
        openCount: 0,
        resolvedCount: 0,
        slaOk: 0,
        slaTotal: 0,
        resMins: [],
      };
      if (['RESOLVED', 'CLOSED'].includes(t.status)) {
        entry.resolvedCount += 1;
        if (t.resolvedAt) {
          entry.resMins.push((t.resolvedAt.getTime() - t.createdAt.getTime()) / 60_000);
        }
      } else if (t.status !== 'CANCELED') {
        entry.openCount += 1;
      }
      if (t.slaInstances[0]) {
        entry.slaTotal += 1;
        if (!t.slaInstances[0].breachedAt) entry.slaOk += 1;
      }
      teamPerfMap.set(t.assignedTeam.id, entry);
    }

    const slaAtRiskTickets = tickets
      .filter(
        (t) =>
          !['RESOLVED', 'CLOSED', 'CANCELED'].includes(t.status) &&
          (t.slaInstances[0]?.state === 'WARNING' || t.slaInstances[0]?.state === 'BREACHED'),
      )
      .slice(0, 8)
      .map((row) => {
        const sla = row.slaInstances[0];
        const target = sla?.policy.targets.find((tg) => tg.priority === sla.priority);
        const consumedPercent =
          sla && target && target.resolutionMinutes > 0
            ? Math.min(100, Math.round((sla.elapsedBusinessMin / target.resolutionMinutes) * 100))
            : 0;
        return {
          id: row.id,
          tenantId: row.tenantId,
          publicNumber: row.publicNumber,
          title: row.title,
          type: row.type,
          channel: row.channel,
          status: row.status,
          impact: row.impact,
          urgency: row.urgency,
          priority: row.priority,
          priorityOverridden: row.priorityOverridden,
          tags: row.tags,
          requester: row.requester,
          assignee: row.assignee,
          unit: row.unit,
          department: row.department,
          team: row.assignedTeam,
          category: row.category,
          service: row.service,
          sla: sla
            ? {
                state: sla.state,
                policyName: sla.policy.name,
                firstResponseDueAt: sla.firstResponseDueAt.toISOString(),
                firstResponseMetAt: sla.firstResponseMetAt?.toISOString() ?? null,
                resolutionDueAt: sla.resolutionDueAt.toISOString(),
                resolutionMetAt: sla.resolutionMetAt?.toISOString() ?? null,
                pausedAt: sla.pausedAt?.toISOString() ?? null,
                consumedPercent,
                warningTriggered: Boolean(sla.warningTriggeredAt),
                breached: Boolean(sla.breachedAt),
              }
            : null,
          dueAt: row.dueAt?.toISOString() ?? null,
          firstResponseAt: row.firstResponseAt?.toISOString() ?? null,
          resolvedAt: row.resolvedAt?.toISOString() ?? null,
          closedAt: row.closedAt?.toISOString() ?? null,
          csatScore: row.csatScore,
          version: row.version,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      });

    return {
      totalTickets,
      criticalTickets,
      inProgressTickets,
      resolvedToday,
      backlogTickets,
      mttaMinutes,
      mttrMinutes,
      slaComplianceRate,
      reopenRate,
      avgCsat,
      byPriority: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as PriorityLevel[]).map((priority) => ({
        priority,
        count: priorityMap.get(priority) ?? 0,
      })),
      byStatus: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })),
      volumeOverTime: Array.from(volumeMap.entries()).map(([date, val]) => ({
        date,
        created: val.created,
        resolved: val.resolved,
      })),
      teamPerformance: Array.from(teamPerfMap.entries()).map(([teamId, val]) => ({
        teamId,
        teamName: val.teamName,
        openCount: val.openCount,
        resolvedCount: val.resolvedCount,
        slaComplianceRate:
          val.slaTotal > 0 ? Math.round((val.slaOk / val.slaTotal) * 1000) / 10 : 100,
        avgResolutionMinutes:
          val.resMins.length > 0
            ? Math.round(val.resMins.reduce((a, b) => a + b, 0) / val.resMins.length)
            : 0,
      })),
      slaAtRiskTickets,
    };
  }
}

@Module({ controllers: [ReportsController] })
export class ReportsModule {}

