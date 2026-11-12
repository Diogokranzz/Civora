import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium leading-tight tracking-wide transition-all duration-200 ease-in-out',
  {
    variants: {
      variant: {
        neutral:
          'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100',
        info:
          'border-blue-300/80 bg-blue-50 text-blue-900 dark:border-blue-700/70 dark:bg-blue-950/80 dark:text-blue-200',
        success:
          'border-emerald-300/80 bg-emerald-50 text-emerald-900 dark:border-emerald-700/70 dark:bg-emerald-950/80 dark:text-emerald-200',
        warning:
          'border-amber-300/80 bg-amber-50 text-amber-950 dark:border-amber-700/70 dark:bg-amber-950/80 dark:text-amber-200',
        danger:
          'border-red-300/80 bg-red-50 text-red-900 dark:border-red-700/70 dark:bg-red-950/80 dark:text-red-200',
        purple:
          'border-violet-300/80 bg-violet-50 text-violet-900 dark:border-violet-700/70 dark:bg-violet-950/80 dark:text-violet-200',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
