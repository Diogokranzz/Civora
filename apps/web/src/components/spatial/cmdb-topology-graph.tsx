'use client';

import dynamic from 'next/dynamic';
import type { CmdbTopologyGraph3DProps } from '@civora/ui-spatial/cmdb';
import { reportFpsDrop, reportRenderMetric } from '../../lib/telemetry';

const DynamicCmdbTopologyGraph3D = dynamic(
  () => import('@civora/ui-spatial/cmdb').then((mod) => mod.CmdbTopologyGraph3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[480px] w-full items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-950/90 text-xs text-slate-400 dark:border-white/[0.08]">
        Inicializando motor espacial de topologia CMDB...
      </div>
    ),
  },
);

export function CmdbTopologyGraph3D(props: CmdbTopologyGraph3DProps) {
  return (
    <DynamicCmdbTopologyGraph3D
      onFpsDrop={reportFpsDrop}
      onSurfaceRender={reportRenderMetric}
      {...props}
    />
  );
}

