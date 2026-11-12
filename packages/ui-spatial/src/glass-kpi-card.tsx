'use client';

import * as React from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { cn } from '@civora/ui';
import { staggerItemVariants } from './motion-primitives';
import { GlassSurfaceProfiler, type SurfaceRenderSample } from './webgl-runtime';

export type GlassKpiTone = 'blue' | 'crimson' | 'emerald' | 'amber' | 'violet';

interface TonePalette {
  topLine: string;
  specularRgba: string;
  valueClass: string;
  iconShellClass: string;
}

const TONE_MAP: Record<GlassKpiTone, TonePalette> = {
  blue: {
    topLine: 'via-blue-500/70',
    specularRgba: 'rgba(56, 189, 248, 0.12)',
    valueClass: 'text-slate-900 dark:text-slate-50',
    iconShellClass:
      'border-blue-300/60 bg-blue-500/10 text-blue-600 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-sky-300',
  },
  crimson: {
    topLine: 'via-rose-500/75',
    specularRgba: 'rgba(244, 63, 94, 0.12)',
    valueClass: 'text-red-700 dark:text-rose-300',
    iconShellClass:
      'border-rose-300/60 bg-rose-500/10 text-rose-600 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-300',
  },
  emerald: {
    topLine: 'via-emerald-400/75',
    specularRgba: 'rgba(52, 211, 153, 0.12)',
    valueClass: 'text-emerald-700 dark:text-emerald-300',
    iconShellClass:
      'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  amber: {
    topLine: 'via-amber-400/75',
    specularRgba: 'rgba(251, 191, 36, 0.11)',
    valueClass: 'text-amber-700 dark:text-amber-300',
    iconShellClass:
      'border-amber-300/60 bg-amber-500/10 text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300',
  },
  violet: {
    topLine: 'via-violet-500/75',
    specularRgba: 'rgba(167, 139, 250, 0.13)',
    valueClass: 'text-violet-700 dark:text-violet-200',
    iconShellClass:
      'border-violet-300/60 bg-violet-500/10 text-violet-700 dark:border-violet-500/35 dark:bg-violet-500/15 dark:text-violet-300',
  },
};

export interface GlassKpiCardProps {
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  icon: React.ReactNode;
  tone?: GlassKpiTone;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  surfaceId?: string;
  onSurfaceRender?: (sample: SurfaceRenderSample) => void;
}

export function GlassKpiCard({
  label,
  value,
  subtitle,
  icon,
  tone = 'blue',
  active = false,
  onClick,
  className,
  surfaceId,
  onSurfaceRender,
}: GlassKpiCardProps) {
  const palette = TONE_MAP[tone];
  const mouseX = useMotionValue(120);
  const mouseY = useMotionValue(60);
  const specularBackground = useMotionTemplate`radial-gradient(220px circle at ${mouseX}px ${mouseY}px, ${palette.specularRgba}, transparent 75%)`;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  const interactiveProps = onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};

  return (
    <GlassSurfaceProfiler surfaceId={surfaceId} onSurfaceRender={onSurfaceRender}>
      <motion.div
        variants={staggerItemVariants}
        whileHover={{ y: -2 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onPointerMove={handlePointerMove}
        {...interactiveProps}
        className={cn(
          'group relative overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 p-3.5 shadow-sm transition-colors duration-200 dark:border-white/[0.08] dark:bg-[#0F172A] dark:shadow-none sm:p-4',
          onClick
            ? 'cursor-pointer hover:border-blue-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:hover:border-sky-500/45'
            : 'hover:border-slate-300 dark:hover:border-white/[0.14]',
          active ? 'border-blue-500/70 ring-1 ring-blue-500/40 dark:border-sky-400/60 dark:ring-sky-400/35' : '',
          className,
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-40 transition-opacity duration-200 group-hover:opacity-100',
            active ? 'opacity-100' : '',
            palette.topLine,
          )}
        />

        <motion.div
          aria-hidden="true"
          style={{ background: specularBackground }}
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />

        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-300">
              {label}
            </p>
            <p className={cn('text-xl font-bold tabular-nums tracking-tight sm:text-2xl', palette.valueClass)}>
              {value}
            </p>
            {subtitle ? (
              <p className="text-xs leading-snug text-slate-600 dark:text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>

          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-xs transition-transform duration-200 group-hover:scale-105',
              palette.iconShellClass,
            )}
          >
            {icon}
          </div>
        </div>
      </motion.div>
    </GlassSurfaceProfiler>
  );
}

