'use client';

import { useCivoraStore } from '../../lib/store';

export function AmbientBackdrop() {
  const theme = useCivoraStore((s) => s.theme);

  if (theme !== 'dark') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_rgba(37,99,235,0.06),_transparent_55%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,0.05),_transparent_50%)]"
      />
    );
  }

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-15%,_rgba(37,99,235,0.16),_transparent_70%),radial-gradient(ellipse_55%_45%_at_100%_100%,_rgba(14,165,233,0.08),_transparent_65%)]" />
    </div>
  );
}
