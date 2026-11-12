'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@civora/ui';

export interface ActionButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'
  > {
  variant?: 'primary' | 'outline' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
}

const VARIANT_CLASSES: Record<NonNullable<ActionButtonProps['variant']>, string> = {
  primary:
    'border border-blue-500/60 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_6px_22px_-6px_rgba(37,99,235,0.6)] hover:from-blue-500 hover:to-indigo-500 hover:shadow-[0_10px_28px_-6px_rgba(56,189,248,0.55)]',
  outline:
    'border border-slate-300/90 bg-white text-slate-900 hover:border-blue-400/70 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-sky-500/60 dark:hover:bg-slate-800',
  subtle:
    'border border-slate-200/80 bg-slate-100 text-slate-800 hover:bg-slate-200/80 dark:border-slate-800 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:bg-slate-800',
};

const SIZE_CLASSES: Record<NonNullable<ActionButtonProps['size']>, string> = {
  sm: 'h-8 px-3.5 text-xs rounded-lg',
  md: 'h-10 px-5 text-sm rounded-xl',
  lg: 'h-11 px-6 text-sm rounded-xl',
};

export const MagneticButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', disabled, children, ...props }, ref) => (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className={cn(
        'group relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap font-semibold tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-500 ease-out group-hover:translate-x-full"
      />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </motion.button>
  ),
);
MagneticButton.displayName = 'MagneticButton';

