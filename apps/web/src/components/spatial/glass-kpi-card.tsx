'use client';

import {
  GlassKpiCard as SpatialGlassKpiCard,
  type GlassKpiCardProps,
  type GlassKpiTone,
} from '@civora/ui-spatial/kpi';
import { reportRenderMetric } from '../../lib/telemetry';

export type { GlassKpiCardProps, GlassKpiTone };

export function GlassKpiCard(props: GlassKpiCardProps) {
  return (
    <SpatialGlassKpiCard
      surfaceId={props.surfaceId ?? `kpi-card:${props.label}`}
      onSurfaceRender={reportRenderMetric}
      {...props}
    />
  );
}
