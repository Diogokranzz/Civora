'use client';

import { Layers3, MapPin, ShieldCheck, Users } from 'lucide-react';
import { GlassKpiCard, StaggerSection } from '../spatial';

export function OrganizationSummary({
  unitsCount,
  departmentsCount,
  teamsCount,
  activeMembersCount,
  totalMembersCount,
  canManage,
}: {
  unitsCount: number;
  departmentsCount: number;
  teamsCount: number;
  activeMembersCount: number;
  totalMembersCount: number;
  canManage: boolean;
}) {
  return (
    <StaggerSection
      aria-label="Resumo da estrutura organizacional"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <GlassKpiCard
        label="Unidades"
        value={unitsCount}
        subtitle={unitsCount === 0 ? 'Aguardando primeiro cadastro' : 'Locais operacionais ativos'}
        tone="blue"
        icon={<MapPin className="h-5 w-5" aria-hidden="true" />}
      />

      <GlassKpiCard
        label="Departamentos"
        value={departmentsCount}
        subtitle={departmentsCount === 0 ? 'Sem centros de atendimento' : 'Áreas configuradas'}
        tone="amber"
        icon={<Layers3 className="h-5 w-5" aria-hidden="true" />}
      />

      <GlassKpiCard
        label="Equipes de Atendimento"
        value={teamsCount}
        subtitle={teamsCount === 0 ? 'Pronto para estruturação' : 'Filas especializadas'}
        tone="violet"
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
      />

      <GlassKpiCard
        label="Membros Ativos"
        value={activeMembersCount}
        subtitle={`${totalMembersCount} vínculo(s) na organização`}
        tone="emerald"
        icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
      />

      {!canManage ? (
        <p className="sm:col-span-2 xl:col-span-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          Modo de leitura ativo: seu perfil atual visualiza a estrutura sem permissão para alterações administrativas.
        </p>
      ) : null}
    </StaggerSection>
  );
}
