import type { PriorityLevel, SlaInstanceState, TicketStatus } from '@civora/types';
import { Badge } from './badge';

const STATUS_META: Record<
  TicketStatus,
  { label: string; variant: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple' }
> = {
  NEW: { label: 'Novo', variant: 'info' },
  TRIAGE: { label: 'Triagem', variant: 'purple' },
  OPEN: { label: 'Aberto', variant: 'info' },
  IN_PROGRESS: { label: 'Em Andamento', variant: 'info' },
  WAITING_CUSTOMER: { label: 'Aguardando Solicitante', variant: 'warning' },
  WAITING_THIRD_PARTY: { label: 'Aguardando Terceiro', variant: 'warning' },
  WAITING_APPROVAL: { label: 'Aguardando Aprovação', variant: 'purple' },
  RESOLVED: { label: 'Resolvido', variant: 'success' },
  CLOSED: { label: 'Fechado', variant: 'neutral' },
  CANCELED: { label: 'Cancelado', variant: 'neutral' },
  REOPENED: { label: 'Reaberto', variant: 'danger' },
};

const PRIORITY_META: Record<
  PriorityLevel,
  { label: string; variant: 'neutral' | 'info' | 'warning' | 'danger' }
> = {
  LOW: { label: 'Baixa', variant: 'neutral' },
  MEDIUM: { label: 'Média', variant: 'info' },
  HIGH: { label: 'Alta', variant: 'warning' },
  CRITICAL: { label: 'Crítica', variant: 'danger' },
};

const SLA_META: Record<
  SlaInstanceState,
  { label: string; variant: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }
> = {
  ACTIVE: { label: 'No Prazo', variant: 'success' },
  PAUSED: { label: 'Pausado', variant: 'neutral' },
  WARNING: { label: 'Em Risco', variant: 'warning' },
  BREACHED: { label: 'Violado', variant: 'danger' },
  MET: { label: 'Cumprido', variant: 'success' },
  CANCELED: { label: 'Cancelado', variant: 'neutral' },
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: PriorityLevel }) {
  const meta = PRIORITY_META[priority];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function SlaBadge({
  state,
  consumedPercent,
}: {
  state: SlaInstanceState;
  consumedPercent?: number;
}) {
  const meta = SLA_META[state];
  return (
    <Badge variant={meta.variant}>
      <span>{meta.label}</span>
      {consumedPercent !== undefined ? (
        <span className="tabular-nums opacity-80">({Math.round(consumedPercent)}%)</span>
      ) : null}
    </Badge>
  );
}

