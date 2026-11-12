'use client';

import * as React from 'react';
import { cn } from '@civora/ui';
import { useCivoraStore } from '../../lib/store';

export function CivoraLogo({
  size = 38,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const pulseCount = useCivoraStore((s) => s.realtimePulseCount);
  const [isPulsing, setIsPulsing] = React.useState(false);
  const gradId = React.useId();

  React.useEffect(() => {
    if (pulseCount === 0) return undefined;
    setIsPulsing(true);
    const timer = setTimeout(() => setIsPulsing(false), 1000);
    return () => clearTimeout(timer);
  }, [pulseCount]);

  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-xl border border-slate-300/80 bg-gradient-to-br from-slate-900 via-[#0F172A] to-blue-950 shadow-sm transition-all duration-300 dark:border-sky-500/30 dark:shadow-[0_4px_16px_-4px_rgba(37,99,235,0.45)]',
        isPulsing
          ? 'border-sky-400/80 ring-2 ring-sky-400/35 shadow-[0_0_20px_-2px_rgba(56,189,248,0.65)]'
          : '',
        className,
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 36 36"
        fill="none"
        className="h-[64%] w-[64%]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={gradId} x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="55%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <path
          d="M18 3L30.5 10.2V25.8L18 33L5.5 25.8V10.2L18 3Z"
          stroke={`url(#${gradId})`}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M23.5 13.5C22.1 11.9 20.1 11 17.8 11C13.6 11 10.5 14.1 10.5 18C10.5 21.9 13.6 25 17.8 25C20.1 25 22.1 24.1 23.5 22.5"
          stroke="#F8FAFC"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="24.5" cy="18" r="2.2" fill="#38BDF8" />
      </svg>
    </div>
  );
}
