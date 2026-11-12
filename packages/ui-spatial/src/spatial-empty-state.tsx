'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Cpu, Layers3, Network, ShieldCheck } from 'lucide-react';
import { cn } from '@civora/ui';
import { GlassSurfaceProfiler, type SurfaceRenderSample } from './webgl-runtime';

export type EmptyEmblemType = 'tickets' | 'organization' | 'security' | 'cmdb';

function ArchitecturalEmblem({ emblem }: { emblem: EmptyEmblemType }) {
  const Icon =
    emblem === 'organization'
      ? Network
      : emblem === 'security'
        ? ShieldCheck
        : emblem === 'cmdb'
          ? Cpu
          : Layers3;

  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <div className="absolute inset-0 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-600/10 via-slate-900/40 to-sky-500/10" />
      <div className="absolute inset-2 rounded-xl border border-dashed border-sky-400/30" />
      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/40 bg-slate-900/90 text-sky-400 shadow-[0_0_24px_-4px_rgba(56,189,248,0.45)]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
    </div>
  );
}

export interface SpatialEmptyStateProps {
  title: string;
  description: string;
  eyebrow?: string;
  hint?: string;
  emblem?: EmptyEmblemType;
  mode?: 'hero' | 'compact';
  action?: React.ReactNode;
  className?: string;
  onSurfaceRender?: (sample: SurfaceRenderSample) => void;
}

export function SpatialEmptyState({
  title,
  description,
  eyebrow = 'Operação Pronta para Inicialização',
  hint,
  emblem = 'tickets',
  mode = 'hero',
  action,
  className,
  onSurfaceRender,
}: SpatialEmptyStateProps) {
  if (mode === 'compact') {
    return (
      <GlassSurfaceProfiler surfaceId={`empty-compact:${emblem}`} onSurfaceRender={onSurfaceRender}>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          role="status"
          className={cn(
            'relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 text-center dark:border-white/[0.08] dark:bg-slate-950/90',
            className,
          )}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent"
          />
          <div className="mx-auto mb-3 flex justify-center">
            <ArchitecturalEmblem emblem={emblem} />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600 dark:text-sky-400">
            {eyebrow}
          </p>
          <h3 className="mt-1.5 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {description}
          </p>
          {hint ? (
            <p className="mx-auto mt-2.5 max-w-md rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-[11px] leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              {hint}
            </p>
          ) : null}
          {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
        </motion.div>
      </GlassSurfaceProfiler>
    );
  }

  return (
    <GlassSurfaceProfiler surfaceId={`empty-hero:${emblem}`} onSurfaceRender={onSurfaceRender}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        role="status"
        className={cn(
          'relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5 dark:border-white/[0.08] dark:bg-[#0F172A] dark:shadow-none',
          className,
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.12)_0%,transparent_70%)] dark:bg-[radial-gradient(circle,rgba(14,165,233,0.14)_0%,transparent_70%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/60 to-transparent"
        />

        <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="shrink-0">
              <ArchitecturalEmblem emblem={emblem} />
            </div>

            <div className="space-y-2 text-left">
              <span className="inline-flex items-center rounded-full border border-blue-300/70 bg-blue-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-800 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-300">
                {eyebrow}
              </span>
              <h3 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl dark:text-slate-50">
                {title}
              </h3>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {description}
              </p>
              {hint ? (
                <p className="max-w-2xl rounded-xl border border-slate-200/80 bg-slate-50/85 px-4 py-2 text-xs leading-relaxed text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/70 dark:text-slate-300">
                  {hint}
                </p>
              ) : null}
            </div>
          </div>

          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </motion.div>
    </GlassSurfaceProfiler>
  );
}

export const EnterpriseEmptyState = SpatialEmptyState;
