'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { SOCKET_EVENTS } from '@civora/types';
import { usePathname } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { civoraApi } from '../lib/api';
import { isDemoMode } from '../lib/demo-client';
import { RealtimeEventBatcher } from '../lib/realtime-batcher';
import { useCivoraStore } from '../lib/store';
import { initClientTelemetry, reportBackpressureBatch } from '../lib/telemetry';
import { isWorkspaceRoute, WorkspaceShellFrame } from './app-shell';
import { SpatialMotionConfig } from './spatial';

function ThemeAndRealtimeSync() {
  const theme = useCivoraStore((s) => s.theme);
  const accessToken = useCivoraStore((s) => s.accessToken);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);
  const setSession = useCivoraStore((s) => s.setSession);
  const triggerRealtimePulse = useCivoraStore((s) => s.triggerRealtimePulse);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    initClientTelemetry();
    const saved = window.localStorage.getItem('civora-theme');
    if (saved === 'dark' || saved === 'light') {
      useCivoraStore.getState().setTheme(saved);
    }
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    window.localStorage.setItem('civora-theme', theme);
  }, [theme]);

  React.useEffect(() => {
    if (useCivoraStore.getState().user) return;
    civoraApi
      .refresh()
      .then((res) => {
        setSession(res.user, res.accessToken);
      })
      .catch(() => {
        // Session remains unauthenticated until user signs in
      });
  }, [setSession]);

  React.useEffect(() => {
    if (!accessToken || !activeOrganizationId) return;

    if (isDemoMode()) {
      const timer = setInterval(() => {
        triggerRealtimePulse('DEMO_SYNC');
      }, 30_000);
      return () => clearInterval(timer);
    }

    const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || civoraApi.getApiBaseUrl()).replace(/\/+$/, '');
    const socket: Socket = io(`${wsUrl}/realtime`, {
      auth: { token: accessToken, organizationId: activeOrganizationId },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    let lastPulseAt = 0;
    const batcher = new RealtimeEventBatcher({
      debounceMs: 250,
      maxWaitMs: 1200,
      maxQueueDepth: 500,
      onFlush: (batch) => {
        reportBackpressureBatch(batch.coalescedCount, batch.droppedCount);
        const now = Date.now();
        React.startTransition(() => {
          if (now - lastPulseAt >= 2000) {
            lastPulseAt = now;
            triggerRealtimePulse(
              batch.coalescedCount > 1 ? `batch:${batch.coalescedCount}` : SOCKET_EVENTS.TICKET_UPDATED,
            );
          }
          if (batch.topics.has('tickets')) {
            void queryClient.invalidateQueries({ queryKey: ['tickets'] });
          }
          if (batch.topics.has('metrics')) {
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }
          if (batch.topics.has('notifications')) {
            void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          }
          if (batch.topics.has('assets')) {
            void queryClient.invalidateQueries({ queryKey: ['assets'] });
          }
          for (const ticketId of batch.ticketIds) {
            void queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
          }
        });
      },
    });

    socket.on(SOCKET_EVENTS.TICKET_CREATED, (payload: { ticketId?: string }) =>
      batcher.enqueue(['tickets', 'metrics'], payload?.ticketId),
    );
    socket.on(
      SOCKET_EVENTS.TICKET_UPDATED,
      (payload: { ticketId?: string; kind?: string }) =>
        batcher.enqueue(
          payload?.kind === 'CMDB_CASCADE' ? ['assets', 'metrics'] : ['tickets', 'metrics'],
          payload?.ticketId,
        ),
    );
    socket.on(SOCKET_EVENTS.SLA_UPDATED, (payload: { ticketId?: string }) =>
      batcher.enqueue(['tickets', 'metrics'], payload?.ticketId),
    );
    socket.on(SOCKET_EVENTS.DASHBOARD_REFRESH, () => batcher.enqueue(['metrics']));
    socket.on(SOCKET_EVENTS.TICKET_COMMENT_ADDED, (payload: { ticketId?: string }) =>
      batcher.enqueue(['tickets'], payload?.ticketId),
    );
    socket.on(SOCKET_EVENTS.NOTIFICATION_CREATED, () =>
      batcher.enqueue(['notifications']),
    );

    return () => {
      batcher.dispose();
      socket.disconnect();
    };
  }, [accessToken, activeOrganizationId, queryClient, triggerRealtimePulse]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
          },
        },
      }),
  );

  const wrappedChildren = isWorkspaceRoute(pathname) ? (
    <WorkspaceShellFrame>{children}</WorkspaceShellFrame>
  ) : (
    children
  );

  return (
    <SpatialMotionConfig>
      <QueryClientProvider client={queryClient}>
        <ThemeAndRealtimeSync />
        {wrappedChildren}
      </QueryClientProvider>
    </SpatialMotionConfig>
  );
}
