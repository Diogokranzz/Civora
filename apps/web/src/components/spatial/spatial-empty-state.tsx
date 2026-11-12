'use client';

import {
  SpatialEmptyState as CoreEmptyState,
  type EmptyEmblemType,
  type SpatialEmptyStateProps,
} from '@civora/ui-spatial/empty';
import { reportRenderMetric } from '../../lib/telemetry';

export type { EmptyEmblemType, SpatialEmptyStateProps };

export function SpatialEmptyState(props: SpatialEmptyStateProps) {
  return <CoreEmptyState onSurfaceRender={reportRenderMetric} {...props} />;
}

export const EnterpriseEmptyState = SpatialEmptyState;
