'use client';

import * as React from 'react';
import { cn } from '@civora/ui';

export type KpiEmblemKind = 'total' | 'critical' | 'in_progress' | 'resolved' | 'mttr';

export type SectorCategoryKey =
  | 'TI'
  | 'INFRA'
  | 'SEC'
  | 'ENG'
  | 'DADOS'
  | 'CSC'
  | 'FAC'
  | 'MAN'
  | 'RH'
  | 'FIN'
  | 'COM'
  | 'ADM'
  | 'JUR'
  | 'LOG'
  | 'DEFAULT';

interface PaletteSpec {
  top: string;
  bottom: string;
  accent: string;
  shell: string;
  label: string;
}

const SECTOR_PALETTES: Record<SectorCategoryKey, PaletteSpec> = {
  TI: {
    top: '#3B82F6',
    bottom: '#1D4ED8',
    accent: '#93C5FD',
    shell: 'border-blue-200/90 bg-blue-50/90 dark:border-blue-500/30 dark:bg-blue-950/60',
    label: 'Tecnologia da Informação',
  },
  INFRA: {
    top: '#0EA5E9',
    bottom: '#0369A1',
    accent: '#7DD3FC',
    shell: 'border-sky-200/90 bg-sky-50/90 dark:border-sky-500/30 dark:bg-sky-950/60',
    label: 'Infraestrutura & Redes',
  },
  SEC: {
    top: '#F43F5E',
    bottom: '#BE123C',
    accent: '#FDA4AF',
    shell: 'border-rose-200/90 bg-rose-50/90 dark:border-rose-500/30 dark:bg-rose-950/60',
    label: 'Segurança da Informação',
  },
  ENG: {
    top: '#6366F1',
    bottom: '#4338CA',
    accent: '#A5B4FC',
    shell: 'border-indigo-200/90 bg-indigo-50/90 dark:border-indigo-500/30 dark:bg-indigo-950/60',
    label: 'Engenharia de Sistemas',
  },
  DADOS: {
    top: '#8B5CF6',
    bottom: '#6D28D9',
    accent: '#C4B5FD',
    shell: 'border-violet-200/90 bg-violet-50/90 dark:border-violet-500/30 dark:bg-violet-950/60',
    label: 'Dados & Inteligência',
  },
  CSC: {
    top: '#06B6D4',
    bottom: '#0E7490',
    accent: '#67E8F9',
    shell: 'border-cyan-200/90 bg-cyan-50/90 dark:border-cyan-500/30 dark:bg-cyan-950/60',
    label: 'Central de Serviços',
  },
  FAC: {
    top: '#14B8A6',
    bottom: '#0F766E',
    accent: '#5EEAD4',
    shell: 'border-teal-200/90 bg-teal-50/90 dark:border-teal-500/30 dark:bg-teal-950/60',
    label: 'Facilities & Predial',
  },
  MAN: {
    top: '#F59E0B',
    bottom: '#B45309',
    accent: '#FDE68A',
    shell: 'border-amber-200/90 bg-amber-50/90 dark:border-amber-500/30 dark:bg-amber-950/60',
    label: 'Manutenção Predial',
  },
  RH: {
    top: '#EC4899',
    bottom: '#BE185D',
    accent: '#F9A8D4',
    shell: 'border-pink-200/90 bg-pink-50/90 dark:border-pink-500/30 dark:bg-pink-950/60',
    label: 'Recursos Humanos',
  },
  FIN: {
    top: '#10B981',
    bottom: '#047857',
    accent: '#6EE7B7',
    shell: 'border-emerald-200/90 bg-emerald-50/90 dark:border-emerald-500/30 dark:bg-emerald-950/60',
    label: 'Financeiro & Controladoria',
  },
  COM: {
    top: '#F97316',
    bottom: '#C2410C',
    accent: '#FDBA74',
    shell: 'border-orange-200/90 bg-orange-50/90 dark:border-orange-500/30 dark:bg-orange-950/60',
    label: 'Compras & Suprimentos',
  },
  ADM: {
    top: '#64748B',
    bottom: '#334155',
    accent: '#CBD5E1',
    shell: 'border-slate-200/90 bg-slate-100/90 dark:border-slate-600/40 dark:bg-slate-900/70',
    label: 'Operações Administrativas',
  },
  JUR: {
    top: '#7C3AED',
    bottom: '#4C1D95',
    accent: '#DDD6FE',
    shell: 'border-purple-200/90 bg-purple-50/90 dark:border-purple-500/30 dark:bg-purple-950/60',
    label: 'Jurídico & Compliance',
  },
  LOG: {
    top: '#0284C7',
    bottom: '#1E3A8A',
    accent: '#BAE6FD',
    shell: 'border-blue-200/90 bg-blue-50/90 dark:border-blue-500/30 dark:bg-blue-950/60',
    label: 'Logística & Patrimônio',
  },
  DEFAULT: {
    top: '#475569',
    bottom: '#1E293B',
    accent: '#94A3B8',
    shell: 'border-slate-200/90 bg-slate-100/90 dark:border-slate-700/60 dark:bg-slate-900/70',
    label: 'Setor Corporativo',
  },
};

export function resolveSectorKey(code?: string | null, name?: string | null): SectorCategoryKey {
  const normalizedCode = (code ?? '').trim().toUpperCase();
  if (normalizedCode in SECTOR_PALETTES) {
    return normalizedCode as SectorCategoryKey;
  }

  const normalizedName = (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (normalizedName.includes('SEGUR') || normalizedName.includes('SOC') || normalizedName.includes('INFOSEC')) {
    return 'SEC';
  }
  if (normalizedName.includes('INFRA') || normalizedName.includes('REDE') || normalizedName.includes('CLOUD')) {
    return 'INFRA';
  }
  if (normalizedName.includes('ENGENHARIA DE SIST') || normalizedName.includes('APLICAC')) {
    return 'ENG';
  }
  if (normalizedName.includes('DADO') || normalizedName.includes('INTELIG') || normalizedName.includes('BI')) {
    return 'DADOS';
  }
  if (normalizedName.includes('FACILIT')) {
    return 'FAC';
  }
  if (normalizedName.includes('MANUTEN')) {
    return 'MAN';
  }
  if (normalizedName.includes('RECURSOS HUMAN') || normalizedName.includes('PESSOAS') || normalizedName.includes('RH')) {
    return 'RH';
  }
  if (normalizedName.includes('FINANC') || normalizedName.includes('CONTROLAD') || normalizedName.includes('FISCAL')) {
    return 'FIN';
  }
  if (normalizedName.includes('COMPR') || normalizedName.includes('SUPRIMENT') || normalizedName.includes('CONTRAT')) {
    return 'COM';
  }
  if (normalizedName.includes('JURID') || normalizedName.includes('COMPLIANCE') || normalizedName.includes('LGPD')) {
    return 'JUR';
  }
  if (normalizedName.includes('LOGIST') || normalizedName.includes('PATRIM')) {
    return 'LOG';
  }
  if (normalizedName.includes('CENTRAL DE SERV') || normalizedName.includes('ATENDIMENTO INTERNO')) {
    return 'CSC';
  }
  if (normalizedName.includes('TECNOLOGIA') || normalizedName.includes('SUPORTE')) {
    return 'TI';
  }
  if (normalizedName.includes('ADMINIST') || normalizedName.includes('BACKOFFICE')) {
    return 'ADM';
  }
  return 'DEFAULT';
}

function SectorGlyph({ sector, gradId }: { sector: SectorCategoryKey; gradId: string }) {
  switch (sector) {
    case 'TI':
      return (
        <>
          <rect x="3" y="4.5" width="18" height="12.5" rx="2.5" fill={`url(#${gradId})`} />
          <rect x="5" y="6.5" width="14" height="8.5" rx="1.2" fill="#0F172A" fillOpacity="0.28" />
          <path d="M8.5 9.5L10.7 11L8.5 12.5" stroke="#F8FAFC" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12.2 12.5H15.5" stroke="#93C5FD" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M9.5 19.5H14.5M12 17V19.5" stroke={`url(#${gradId})`} strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
    case 'INFRA':
      return (
        <>
          <rect x="3.5" y="4" width="17" height="5.2" rx="1.5" fill={`url(#${gradId})`} />
          <rect x="3.5" y="10.2" width="17" height="5.2" rx="1.5" fill={`url(#${gradId})`} fillOpacity="0.88" />
          <circle cx="6.8" cy="6.6" r="1" fill="#E0F2FE" />
          <circle cx="6.8" cy="12.8" r="1" fill="#38BDF8" />
          <path d="M10.5 6.6H17.2M10.5 12.8H17.2" stroke="#E0F2FE" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M12 15.4V18.8M7.5 18.8H16.5" stroke={`url(#${gradId})`} strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="12" cy="18.8" r="1.4" fill="#38BDF8" />
        </>
      );
    case 'SEC':
      return (
        <>
          <path
            d="M12 2.8L19.5 5.8V11.8C19.5 16.4 16.3 19.8 12 21.4C7.7 19.8 4.5 16.4 4.5 11.8V5.8L12 2.8Z"
            fill={`url(#${gradId})`}
          />
          <rect x="9.2" y="10.5" width="5.6" height="4.8" rx="1.2" fill="#FFF1F2" />
          <path
            d="M10.4 10.5V9.1C10.4 8.1 11.1 7.4 12 7.4C12.9 7.4 13.6 8.1 13.6 9.1V10.5"
            stroke="#FFF1F2"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      );
    case 'ENG':
      return (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill={`url(#${gradId})`} />
          <circle cx="12" cy="12" r="3.2" stroke="#EEF2FF" strokeWidth="1.8" />
          <path
            d="M12 6.8V8.4M12 15.6V17.2M6.8 12H8.4M15.6 12H17.2M8.4 8.4L9.6 9.6M14.4 14.4L15.6 15.6M15.6 8.4L14.4 9.6M9.6 14.4L8.4 15.6"
            stroke="#C7D2FE"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      );
    case 'DADOS':
      return (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill={`url(#${gradId})`} fillOpacity="0.16" stroke={`url(#${gradId})`} strokeWidth="1.4" />
          <rect x="6.5" y="12" width="2.8" height="5.5" rx="1" fill={`url(#${gradId})`} />
          <rect x="10.6" y="8.8" width="2.8" height="8.7" rx="1" fill={`url(#${gradId})`} />
          <rect x="14.7" y="6.2" width="2.8" height="11.3" rx="1" fill={`url(#${gradId})`} />
        </>
      );
    case 'CSC':
      return (
        <>
          <circle cx="12" cy="12" r="8.8" fill={`url(#${gradId})`} />
          <path
            d="M7.5 13V11.4C7.5 8.9 9.5 7 12 7C14.5 7 16.5 8.9 16.5 11.4V13"
            stroke="#ECFEFF"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <rect x="6.2" y="11.5" width="2.4" height="4" rx="1.1" fill="#ECFEFF" />
          <rect x="15.4" y="11.5" width="2.4" height="4" rx="1.1" fill="#ECFEFF" />
          <path d="M16.5 15.2C16.5 16.7 15 17.6 13.2 17.6" stroke="#A5F3FC" strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
    case 'FAC':
      return (
        <>
          <path d="M5 20V5.5C5 4.7 5.7 4 6.5 4H14.5C15.3 4 16 4.7 16 5.5V20H5Z" fill={`url(#${gradId})`} />
          <path d="M16 9.5H18.5C19.1 9.5 19.5 9.9 19.5 10.5V20H16V9.5Z" fill={`url(#${gradId})`} fillOpacity="0.72" />
          <path d="M8 7.8H10M11.8 7.8H13.5M8 11H10M11.8 11H13.5M8 14.2H10M11.8 14.2H13.5" stroke="#CCFBF1" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="9.5" y="16.8" width="2.6" height="3.2" rx="0.5" fill="#CCFBF1" />
        </>
      );
    case 'MAN':
      return (
        <>
          <circle cx="12" cy="12" r="8.8" fill={`url(#${gradId})`} fillOpacity="0.18" stroke={`url(#${gradId})`} strokeWidth="1.5" />
          <path
            d="M14.7 6.8C13.3 7.1 12.4 8.4 12.7 9.8L8.1 14.4C7.5 15 7.5 15.9 8.1 16.5C8.7 17.1 9.6 17.1 10.2 16.5L14.8 11.9C16.2 12.2 17.5 11.3 17.8 9.9L15.9 10.4L14.2 8.7L14.7 6.8Z"
            fill={`url(#${gradId})`}
          />
        </>
      );
    case 'RH':
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="3" fill={`url(#${gradId})`} />
          <circle cx="10" cy="10.2" r="2.2" fill="#FDF2F8" />
          <path d="M6.8 16C7.3 14.1 8.5 13.2 10 13.2C11.5 13.2 12.7 14.1 13.2 16" stroke="#FDF2F8" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M14.8 10.2H17.5M14.8 13.2H17.5" stroke="#FBCFE8" strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
    case 'FIN':
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="3.2" fill={`url(#${gradId})`} />
          <path
            d="M12 7.5V16.5M14.2 9.6C14.2 8.8 13.3 8.3 12 8.3C10.7 8.3 9.8 8.9 9.8 9.7C9.8 10.6 10.6 11 12 11.3C13.4 11.6 14.3 12 14.3 13C14.3 13.9 13.3 14.6 12 14.6C10.6 14.6 9.7 14 9.6 13.1"
            stroke="#ECFDF5"
            strokeWidth="1.55"
            strokeLinecap="round"
          />
        </>
      );
    case 'COM':
      return (
        <>
          <path d="M4.5 8.2L12 4.2L19.5 8.2V16.2L12 20.2L4.5 16.2V8.2Z" fill={`url(#${gradId})`} />
          <path d="M4.5 8.2L12 12.2L19.5 8.2M12 12.2V20.2" stroke="#FFF7ED" strokeWidth="1.5" strokeLinejoin="round" />
        </>
      );
    case 'ADM':
      return (
        <>
          <path d="M4 6.5C4 5.4 4.9 4.5 6 4.5H10.2L11.8 6.5H18C19.1 6.5 20 7.4 20 8.5V17.5C20 18.6 19.1 19.5 18 19.5H6C4.9 19.5 4 18.6 4 17.5V6.5Z" fill={`url(#${gradId})`} />
          <path d="M8 11.5H16M8 14.8H13.5" stroke="#F8FAFC" strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    case 'JUR':
      return (
        <>
          <circle cx="12" cy="12" r="9" fill={`url(#${gradId})`} />
          <path d="M12 6.8V16.8M8.2 16.8H15.8M7.5 9.6H16.5" stroke="#F5F3FF" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M7.5 9.6L6.2 13.2H8.8L7.5 9.6ZM16.5 9.6L15.2 13.2H17.8L16.5 9.6Z" fill="#DDD6FE" />
        </>
      );
    case 'LOG':
      return (
        <>
          <rect x="3.2" y="7" width="11" height="9.2" rx="1.6" fill={`url(#${gradId})`} />
          <path d="M14.2 9.5H18.2L20.8 12.5V16.2H14.2V9.5Z" fill={`url(#${gradId})`} fillOpacity="0.82" />
          <circle cx="7.5" cy="17.6" r="1.8" fill="#0F172A" stroke="#BAE6FD" strokeWidth="1.2" />
          <circle cx="17.2" cy="17.6" r="1.8" fill="#0F172A" stroke="#BAE6FD" strokeWidth="1.2" />
        </>
      );
    default:
      return (
        <>
          <path d="M12 3.2L19.2 7.3V15.7L12 19.8L4.8 15.7V7.3L12 3.2Z" fill={`url(#${gradId})`} />
          <circle cx="12" cy="11.5" r="2.6" fill="#F8FAFC" />
        </>
      );
  }
}

export function SectorEmblem({
  code,
  name,
  size = 28,
  className,
}: {
  code?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const sector = resolveSectorKey(code, name);
  const palette = SECTOR_PALETTES[sector];
  const gradId = React.useId();

  return (
    <span
      style={{ width: size, height: size }}
      title={name ?? palette.label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg border shadow-xs',
        palette.shell,
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[68%] w-[68%]" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={palette.top} />
            <stop offset="100%" stopColor={palette.bottom} />
          </linearGradient>
        </defs>
        <SectorGlyph sector={sector} gradId={gradId} />
      </svg>
    </span>
  );
}

const TICKET_TYPE_SPECS: Record<
  string,
  { label: string; top: string; bottom: string; shell: string }
> = {
  INCIDENT: {
    label: 'Incidente Operacional',
    top: '#F43F5E',
    bottom: '#BE123C',
    shell: 'border-rose-200/90 bg-rose-50/90 dark:border-rose-500/35 dark:bg-rose-950/60',
  },
  SERVICE_REQUEST: {
    label: 'Requisição de Serviço',
    top: '#3B82F6',
    bottom: '#1D4ED8',
    shell: 'border-blue-200/90 bg-blue-50/90 dark:border-blue-500/35 dark:bg-blue-950/60',
  },
  ACCESS_REQUEST: {
    label: 'Solicitação de Acesso',
    top: '#8B5CF6',
    bottom: '#5B21B6',
    shell: 'border-violet-200/90 bg-violet-50/90 dark:border-violet-500/35 dark:bg-violet-950/60',
  },
  CHANGE_REQUEST: {
    label: 'Mudança (GMUD)',
    top: '#0EA5E9',
    bottom: '#0369A1',
    shell: 'border-sky-200/90 bg-sky-50/90 dark:border-sky-500/35 dark:bg-sky-950/60',
  },
  QUESTION: {
    label: 'Dúvida / Orientação',
    top: '#F59E0B',
    bottom: '#B45309',
    shell: 'border-amber-200/90 bg-amber-50/90 dark:border-amber-500/35 dark:bg-amber-950/60',
  },
};

export function TicketTypeEmblem({
  type,
  size = 26,
  className,
}: {
  type?: string | null;
  size?: number;
  className?: string;
}) {
  const key = (type ?? 'SERVICE_REQUEST').toUpperCase();
  const spec = TICKET_TYPE_SPECS[key] ?? TICKET_TYPE_SPECS.SERVICE_REQUEST!;
  const gradId = React.useId();

  return (
    <span
      style={{ width: size, height: size }}
      title={spec.label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg border shadow-xs',
        spec.shell,
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[68%] w-[68%]" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={spec.top} />
            <stop offset="100%" stopColor={spec.bottom} />
          </linearGradient>
        </defs>
        {key === 'INCIDENT' ? (
          <>
            <path
              d="M12 3.2L20.5 18.2C20.9 18.9 20.4 19.8 19.6 19.8H4.4C3.6 19.8 3.1 18.9 3.5 18.2L12 3.2Z"
              fill={`url(#${gradId})`}
            />
            <path d="M12 9V13.4" stroke="#FFF1F2" strokeWidth="1.9" strokeLinecap="round" />
            <circle cx="12" cy="16.2" r="1.1" fill="#FFF1F2" />
          </>
        ) : key === 'ACCESS_REQUEST' ? (
          <>
            <rect x="4" y="4" width="16" height="16" rx="4" fill={`url(#${gradId})`} />
            <circle cx="10.2" cy="11.2" r="2.4" stroke="#F5F3FF" strokeWidth="1.7" />
            <path d="M12.6 11.2H17M15.4 11.2V13.4" stroke="#F5F3FF" strokeWidth="1.7" strokeLinecap="round" />
          </>
        ) : key === 'CHANGE_REQUEST' ? (
          <>
            <rect x="3.5" y="4.5" width="17" height="15" rx="3.5" fill={`url(#${gradId})`} />
            <path
              d="M7.5 10.2H15.8M13.6 8L16.2 10.2L13.6 12.4M16.5 14.2H8.2M10.4 12L7.8 14.2L10.4 16.4"
              stroke="#F0F9FF"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : key === 'QUESTION' ? (
          <>
            <circle cx="12" cy="12" r="8.8" fill={`url(#${gradId})`} />
            <path
              d="M9.8 9.6C9.8 8.3 10.8 7.5 12 7.5C13.3 7.5 14.2 8.3 14.2 9.4C14.2 10.4 13.4 11 12.5 11.5C12.1 11.7 12 12 12 12.6V13.2"
              stroke="#FFFBEB"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <circle cx="12" cy="15.8" r="1.05" fill="#FFFBEB" />
          </>
        ) : (
          <>
            <rect x="4" y="5.2" width="16" height="13.6" rx="2.8" fill={`url(#${gradId})`} />
            <path d="M7.5 9.5H16.5M7.5 12.8H14M7.5 15.8H11.5" stroke="#EFF6FF" strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}
      </svg>
    </span>
  );
}

export function KpiEmblem({ kind }: { kind: KpiEmblemKind }) {
  const idA = React.useId();
  const idB = React.useId();

  return (
    <svg viewBox="0 0 28 28" fill="none" className="h-6 w-6" aria-hidden="true">
      {kind === 'total' ? (
        <>
          <defs>
            <linearGradient id={idA} x1="4" y1="6" x2="24" y2="23" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="100%" stopColor="#1D4ED8" />
            </linearGradient>
            <linearGradient id={idB} x1="6" y1="3" x2="22" y2="18" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <rect x="6" y="4" width="17" height="13" rx="3" fill={`url(#${idB})`} />
          <path
            d="M4 10.5C4 9.1 5.1 8 6.5 8H21.5C22.9 8 24 9.1 24 10.5V12.2C22.9 12.2 22 13.1 22 14.2C22 15.3 22.9 16.2 24 16.2V19.5C24 20.9 22.9 22 21.5 22H6.5C5.1 22 4 20.9 4 19.5V16.2C5.1 16.2 6 15.3 6 14.2C6 13.1 5.1 12.2 4 12.2V10.5Z"
            fill={`url(#${idA})`}
          />
          <path d="M9 12.5H19M9 16H15.5" stroke="#EFF6FF" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="19" cy="16" r="1.4" fill="#BAE6FD" />
        </>
      ) : null}

      {kind === 'critical' ? (
        <>
          <defs>
            <linearGradient id={idA} x1="4" y1="3" x2="24" y2="25" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FB7185" />
              <stop offset="55%" stopColor="#E11D48" />
              <stop offset="100%" stopColor="#9F1239" />
            </linearGradient>
          </defs>
          <path
            d="M14 2.8L23.5 7.5V14.8C23.5 20 19.4 23.8 14 25.4C8.6 23.8 4.5 20 4.5 14.8V7.5L14 2.8Z"
            fill={`url(#${idA})`}
          />
          <path d="M14 8.2V15.2" stroke="#FFF1F2" strokeWidth="2.3" strokeLinecap="round" />
          <circle cx="14" cy="18.8" r="1.35" fill="#FFF1F2" />
        </>
      ) : null}

      {kind === 'in_progress' ? (
        <>
          <defs>
            <linearGradient id={idA} x1="4" y1="4" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>
          <circle cx="14" cy="14" r="10" fill={`url(#${idA})`} fillOpacity="0.14" stroke="#93C5FD" strokeOpacity="0.45" strokeWidth="1.4" />
          <path
            d="M14 4.5C19.2 4.5 23.5 8.8 23.5 14C23.5 17.5 21.6 20.6 18.8 22.2"
            stroke={`url(#${idA})`}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M14.8 8.6L11.2 14.2H14.4L13.1 19.4L17.4 13.2H14.2L14.8 8.6Z"
            fill={`url(#${idA})`}
          />
        </>
      ) : null}

      {kind === 'resolved' ? (
        <>
          <defs>
            <linearGradient id={idA} x1="4" y1="3" x2="24" y2="25" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
          </defs>
          <circle cx="14" cy="14" r="10.2" fill={`url(#${idA})`} />
          <circle cx="14" cy="14" r="7.8" stroke="#A7F3D0" strokeOpacity="0.45" strokeWidth="1" />
          <path
            d="M9.6 14.3L12.6 17.2L18.6 11"
            stroke="#ECFDF5"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}

      {kind === 'mttr' ? (
        <>
          <defs>
            <linearGradient id={idA} x1="4" y1="4" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#A78BFA" />
              <stop offset="100%" stopColor="#6D28D9" />
            </linearGradient>
          </defs>
          <path d="M11.5 3.2H16.5M14 3.2V5.4" stroke={`url(#${idA})`} strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="14" cy="14.8" r="9.4" fill={`url(#${idA})`} />
          <circle cx="14" cy="14.8" r="7.2" fill="#0F172A" fillOpacity="0.22" />
          <path d="M14 10.6V15L17.4 16.8" stroke="#F5F3FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
    </svg>
  );
}

