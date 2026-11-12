import * as React from 'react';
import { AlertTriangle, Inbox, Lock } from 'lucide-react';
import { Button } from './button';
import { cn } from './utils';

export interface EmptyStateProps {
  title: string;
  description: string;
  hint?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  description,
  hint,
  action,
  icon,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300/90 bg-slate-50/75 text-center transition-all duration-200 ease-in-out dark:border-slate-700/80 dark:bg-slate-900/60',
        compact ? 'px-5 py-7' : 'px-6 py-12',
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-300">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden="true" />}
      </div>
      <h3 className="text-sm font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100">
        {title}
      </h3>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:text-sm">
        {description}
      </p>
      {hint ? (
        <p className="mt-2 max-w-md rounded-md border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs leading-relaxed text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/60 dark:text-slate-300">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Falha ao carregar dados',
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/80 px-6 py-10 text-center transition-all duration-200 ease-in-out dark:border-red-900/80 dark:bg-red-950/30"
    >
      <AlertTriangle className="mb-3 h-9 w-9 text-red-600 dark:text-red-400" aria-hidden="true" />
      <h3 className="text-sm font-semibold tracking-tight text-red-900 dark:text-red-200">
        {title}
      </h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-red-800 dark:text-red-300">
        {description}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function ForbiddenState({
  title = 'Acesso não autorizado',
  description = 'Seu perfil atual nesta organização não possui permissão para visualizar ou executar esta operação.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/80 px-6 py-12 text-center transition-all duration-200 ease-in-out dark:border-amber-900/80 dark:bg-amber-950/30"
    >
      <Lock className="mb-3 h-9 w-9 text-amber-700 dark:text-amber-400" aria-hidden="true" />
      <h3 className="text-sm font-semibold tracking-tight text-amber-950 dark:text-amber-200">
        {title}
      </h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-amber-900 dark:text-amber-300">
        {description}
      </p>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando registros" className="space-y-2.5 p-4">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="h-10 w-full animate-pulse rounded-md bg-slate-200/70 motion-reduce:animate-none dark:bg-slate-800/70"
        />
      ))}
    </div>
  );
}
