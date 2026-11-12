'use client';

import * as React from 'react';
import { cn } from '@civora/ui';
import {
  computeSlaClockState,
  getSlaClockServerSnapshot,
  getSlaClockSnapshot,
  type SlaClockUrgency,
  subscribeSlaClock,
} from '../../lib/sla-clock-store';

const URGENCY_CLASSES: Record<SlaClockUrgency, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300',
  breached:
    'border-red-200 bg-red-50 text-red-800 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300',
  paused:
    'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300',
  none: 'border-slate-200/80 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400',
};

export interface LiveSlaClockBadgeProps {
  dueAt?: string | null;
  pausedAt?: string | null;
  isBreached?: boolean;
  className?: string;
}

/**
 * Leaf subscriber to the isolated SLA clock store so live countdown ticks
 * never re-render parent rows, filters, or neighboring WebGL scenes.
 */
export const LiveSlaClockBadge = React.memo(function LiveSlaClockBadge({
  dueAt,
  pausedAt,
  isBreached,
  className,
}: LiveSlaClockBadgeProps) {
  const nowMs = React.useSyncExternalStore(
    subscribeSlaClock,
    getSlaClockSnapshot,
    getSlaClockServerSnapshot,
  );

  const snapshot = computeSlaClockState(dueAt, pausedAt, isBreached, nowMs);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums',
        URGENCY_CLASSES[snapshot.urgency],
        className,
      )}
      title={dueAt ? `Prazo SLA: ${new Date(dueAt).toLocaleString('pt-BR')}` : undefined}
    >
      {snapshot.label}
    </span>
  );
});

