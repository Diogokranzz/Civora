'use client';

import type { AuthenticatedUser } from '@civora/types';
import { create } from 'zustand';

interface CivoraUiState {
  user: AuthenticatedUser | null;
  accessToken: string | null;
  activeOrganizationId: string | null;
  activeUnitId: string | null;
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  pageBreadcrumb: string | null;
  realtimePulseCount: number;
  lastRealtimeEvent: { type: string; at: number } | null;
  setSession: (user: AuthenticatedUser, accessToken: string) => void;
  clearSession: () => void;
  setActiveUnitId: (unitId: string | null) => void;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setPageBreadcrumb: (breadcrumb: string | null) => void;
  triggerRealtimePulse: (type?: string) => void;
}

export const useCivoraStore = create<CivoraUiState>((set) => ({
  user: null,
  accessToken: null,
  activeOrganizationId: null,
  activeUnitId: null,
  theme: 'dark',
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  pageBreadcrumb: null,
  realtimePulseCount: 0,
  lastRealtimeEvent: null,
  setSession: (user, accessToken) =>
    set({
      user,
      accessToken,
      activeOrganizationId: user.activeOrganizationId,
      activeUnitId: user.activeUnitId,
    }),
  clearSession: () =>
    set({
      user: null,
      accessToken: null,
      activeOrganizationId: null,
      activeUnitId: null,
    }),
  setActiveUnitId: (unitId) => set({ activeUnitId: unitId }),
  toggleTheme: () =>
    set((s) => ({
      theme: s.theme === 'light' ? 'dark' : 'light',
    })),
  setTheme: (theme) => set({ theme }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setPageBreadcrumb: (pageBreadcrumb) => set({ pageBreadcrumb }),
  triggerRealtimePulse: (type = 'REALTIME_SYNC') =>
    set((s) => ({
      realtimePulseCount: s.realtimePulseCount + 1,
      lastRealtimeEvent: { type, at: Date.now() },
    })),
}));
