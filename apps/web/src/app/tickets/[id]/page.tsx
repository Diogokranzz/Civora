import * as React from 'react';
import { TableSkeleton } from '@civora/ui';
import TicketDetailPageClient from './ticket-detail-client';

export function generateStaticParams() {
  return [
    { id: 'CIV-2026-000001' },
    { id: 'CIV-2026-000002' },
    { id: 'CIV-2026-000003' },
    { id: 'CIV-2026-000004' },
    { id: 'CIV-2026-000005' },
    { id: 'CIV-2026-000006' },
    { id: 'demo-ticket-01' },
    { id: 'demo-ticket-02' },
    { id: 'demo-ticket-03' },
    { id: 'demo-ticket-04' },
    { id: 'demo-ticket-05' },
    { id: 'demo-ticket-06' },
    { id: 'default' },
  ];
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
