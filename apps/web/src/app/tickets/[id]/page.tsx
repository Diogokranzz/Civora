import * as React from 'react';
import { TableSkeleton } from '@civora/ui';
import TicketDetailPageClient from './ticket-detail-client';

export function generateStaticParams() {
  const params: Array<{ id: string }> = [{ id: 'default' }];
  for (let i = 1; i <= 50; i++) {
    params.push({ id: `CIV-2026-${String(i).padStart(6, '0')}` });
  }
  return params;
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <React.Suspense fallback={<TableSkeleton rows={8} />}>
      <TicketDetailPageClient idOverride={id} />
    </React.Suspense>
  );
}
