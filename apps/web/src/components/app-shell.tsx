'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BookOpen,
  Building2,
  ChevronRight,
  Clock,
  FileBarChart2,
  HardDrive,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Ticket,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button, cn } from '@civora/ui';
import { civoraApi } from '../lib/api';
import { useCivoraStore } from '../lib/store';
import { CommandPalette } from './command-palette';
import { AmbientBackdrop, CivoraLogo } from './spatial';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: string;
}

const SIDEBAR_ITEMS: NavItem[] = [
  { href: '/tickets', label: 'Chamados', icon: Ticket },
  { href: '/sla', label: 'Painel de SLA', icon: Clock, requiredPermission: 'sla:read' },
  { href: '/knowledge', label: 'Base de Conhecimento', icon: BookOpen, requiredPermission: 'kb:read' },
  { href: '/reports', label: 'Relatórios', icon: FileBarChart2, requiredPermission: 'reports:read' },
  { href: '/organization', label: 'Departamentos', icon: Building2, requiredPermission: 'org:read' },
  { href: '/itsm', label: 'Ativos & ITSM', icon: HardDrive, requiredPermission: 'assets:read' },
  { href: '/automations', label: 'Automações', icon: Workflow, requiredPermission: 'automations:read' },
  { href: '/audit', label: 'Auditoria & LGPD', icon: ShieldCheck, requiredPermission: 'audit:read' },
  { href: '/portal', label: 'Portal do Solicitante', icon: LifeBuoy },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

const WORKSPACE_ROUTE_PREFIXES = SIDEBAR_ITEMS.map((item) => item.href);

const DEFAULT_BREADCRUMBS: Record<string, string> = {
  '/tickets': 'Chamados',
  '/sla': 'Painel de SLA',
  '/knowledge': 'Base de Conhecimento',
  '/reports': 'Relatórios',
  '/organization': 'Departamentos & Equipes',
  '/itsm': 'Ativos & ITSM',
  '/automations': 'Automações & Webhooks',
  '/audit': 'Auditoria & LGPD',
  '/portal': 'Portal do Solicitante',
  '/settings': 'Configurações',
};

export function isWorkspaceRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return WORKSPACE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function resolveDefaultBreadcrumb(pathname: string | null): string {
  if (!pathname) return 'Civora';
  if (pathname.startsWith('/tickets/')) return 'Chamado';
  return DEFAULT_BREADCRUMBS[pathname] ?? 'Operações';
}

export function WorkspaceShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);
  const activeUnitId = useCivoraStore((s) => s.activeUnitId);
  const pageBreadcrumb = useCivoraStore((s) => s.pageBreadcrumb);
  const setSession = useCivoraStore((s) => s.setSession);
  const clearSession = useCivoraStore((s) => s.clearSession);
  const setActiveUnitId = useCivoraStore((s) => s.setActiveUnitId);
  const theme = useCivoraStore((s) => s.theme);
  const toggleTheme = useCivoraStore((s) => s.toggleTheme);
  const collapsed = useCivoraStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useCivoraStore((s) => s.toggleSidebar);
  const setCommandPaletteOpen = useCivoraStore((s) => s.setCommandPaletteOpen);

  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);

  const activeMembership = React.useMemo(
    () => user?.memberships.find((m) => m.organizationId === activeOrganizationId),
    [user, activeOrganizationId],
  );

  const { data: units } = useQuery({
    queryKey: ['units', activeOrganizationId],
    queryFn: () => civoraApi.listUnits(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications', activeOrganizationId],
    queryFn: () => civoraApi.listNotifications(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const unreadCount = (notifications ?? []).filter((n) => !n.readAt).length;

  React.useEffect(() => {
    if (!user) {
      const timer = setTimeout(() => {
        if (!useCivoraStore.getState().user) {
          router.replace('/login');
        }
      }, 600);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [user, router]);

  if (!user) {
    return (
      <div className="flex h-dvh max-h-dvh items-center justify-center bg-slate-50 dark:bg-[#020617]">
        <p className="text-sm text-slate-600 dark:text-slate-300">Verificando sessão Civora...</p>
      </div>
    );
  }

  const visibleNav = SIDEBAR_ITEMS.filter((item) => {
    if (!item.requiredPermission) return true;
    return activeMembership?.permissions.includes(item.requiredPermission as never);
  });

  const handleOrgSwitch = async (orgId: string) => {
    const res = await civoraApi.switchOrganization(orgId, null);
    setSession(res.user, res.accessToken);
    await queryClient.invalidateQueries();
  };

  const handleLogout = async () => {
    await civoraApi.logout();
    clearSession();
    router.replace('/login');
  };

  const breadcrumb = pageBreadcrumb ?? resolveDefaultBreadcrumb(pathname);

  return (
    <div className="relative flex h-dvh max-h-dvh w-full overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#020617] dark:text-slate-100">
      <AmbientBackdrop />
      <CommandPalette />

      {/* Mobile backdrop overlay */}
      {mobileMenuOpen ? (
        <div
          role="presentation"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs transition-opacity lg:hidden"
        />
      ) : null}

      <aside
        aria-label="Navegação principal"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200/85 bg-white transition-transform duration-200 ease-in-out dark:border-white/[0.08] dark:bg-[#0F172A] lg:static lg:z-30 lg:w-60 lg:h-full',
          collapsed ? 'lg:hidden' : 'lg:flex',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200/80 px-3 dark:border-white/[0.08]">
          <Link
            href="/tickets"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 overflow-hidden"
          >
            <CivoraLogo size={32} />
            <div className="leading-tight">
              <span className="block text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Civora
              </span>
              <span className="block text-[10px] text-slate-600 dark:text-sky-300/80">
                Enterprise ITSM
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Recolher menu lateral"
              title="Fechar barra lateral"
              className="hidden rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 lg:inline-flex"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Fechar menu no celular"
              className="inline-flex rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 lg:hidden"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Mobile quick organization/unit selector inside drawer */}
        <div className="border-b border-slate-200/70 p-2 lg:hidden dark:border-slate-800/80 space-y-1.5">
          {user.memberships.length > 1 ? (
            <select
              aria-label="Selecionar organização"
              value={activeOrganizationId ?? ''}
              onChange={(e) => void handleOrgSwitch(e.target.value)}
              className="w-full h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
            >
              {user.memberships.map((m) => (
                <option key={m.organizationId} value={m.organizationId}>
                  {m.organizationName}
                </option>
              ))}
            </select>
          ) : (
            <div className="px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              {activeMembership?.organizationName}
            </div>
          )}

          <select
            aria-label="Selecionar unidade operacional"
            value={activeUnitId ?? ''}
            onChange={(e) => {
              setActiveUnitId(e.target.value || null);
              void queryClient.invalidateQueries({ queryKey: ['tickets'] });
              void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            }}
            className="w-full h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="">Todas as unidades</option>
            {(units ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.name}
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-200 p-2 dark:border-slate-800 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]">
          <div className="mb-1.5 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs dark:bg-slate-800">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="truncate text-[11px] text-slate-600 dark:text-slate-400">
              {activeMembership?.roleCode ?? 'Membro'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="h-9 w-full justify-start text-slate-700 dark:text-slate-300"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Sair</span>
          </Button>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 min-h-0 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200/85 bg-white px-4 dark:border-white/[0.08] dark:bg-[#0F172A]">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Abrir menu lateral"
              className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            {collapsed ? (
              <div className="hidden items-center gap-2 pr-1.5 lg:flex">
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label="Expandir menu lateral"
                  title="Abrir barra lateral"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50 text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50/70 hover:text-blue-700 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-500/50 dark:hover:text-sky-300"
                >
                  <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                </button>
                <Link
                  href="/tickets"
                  className="flex items-center gap-2 rounded-lg pr-2 transition-opacity hover:opacity-85"
                >
                  <CivoraLogo size={28} />
                </Link>
                <span
                  aria-hidden="true"
                  className="h-4 w-px bg-slate-200 dark:bg-slate-700/80"
                />
              </div>
            ) : null}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
              <span className="hidden text-slate-500 dark:text-slate-400 sm:inline">Civora</span>
              <ChevronRight className="hidden h-3.5 w-3.5 text-slate-400 sm:inline" aria-hidden="true" />
              <span className="truncate font-semibold">{breadcrumb}</span>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Abrir busca global (Ctrl+K)"
              className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden md:inline">Busca global...</span>
              <kbd className="hidden rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium dark:border-slate-700 dark:bg-slate-900 sm:inline">
                Ctrl+K
              </kbd>
            </button>

            {user.memberships.length > 1 ? (
              <select
                aria-label="Selecionar organização"
                value={activeOrganizationId ?? ''}
                onChange={(e) => void handleOrgSwitch(e.target.value)}
                className="h-9 max-w-[170px] rounded-md border border-slate-300 bg-white px-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
              >
                {user.memberships.map((m) => (
                  <option key={m.organizationId} value={m.organizationId}>
                    {m.organizationName}
                  </option>
                ))}
              </select>
            ) : (
              <span className="hidden rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 xl:inline">
                {activeMembership?.organizationName}
              </span>
            )}

            <select
              aria-label="Selecionar unidade"
              value={activeUnitId ?? ''}
              onChange={(e) => {
                setActiveUnitId(e.target.value || null);
                void queryClient.invalidateQueries({ queryKey: ['tickets'] });
                void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
              }}
              className="hidden h-9 max-w-[200px] rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:block"
            >
              <option value="">Todas as unidades</option>
              {(units ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.name}
                </option>
              ))}
            </select>

            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Notificações (${unreadCount} não lidas)`}
                onClick={() => setNotifOpen(!notifOpen)}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </Button>

              {notifOpen ? (
                <div
                  role="region"
                  aria-label="Central de notificações"
                  className="absolute right-0 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Notificações
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await civoraApi.markAllNotificationsRead();
                        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
                      }}
                      className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Marcar todas
                    </button>
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {(notifications ?? []).length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-500">
                        Sem notificações recentes.
                      </p>
                    ) : (
                      (notifications ?? []).slice(0, 8).map((n) => (
                        <div
                          key={n.id}
                          className={cn(
                            'rounded-md border p-2 text-xs',
                            n.readAt
                              ? 'border-slate-200 opacity-70 dark:border-slate-800'
                              : 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30',
                          )}
                        >
                          <p className="font-semibold">{n.title}</p>
                          <p className="mt-0.5 text-slate-600 dark:text-slate-400">{n.message}</p>
                          {n.ticketId ? (
                            <Link
                              href={`/tickets/${n.ticketId}`}
                              onClick={() => setNotifOpen(false)}
                              className="mt-1 inline-block text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Abrir chamado
                            </Link>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex flex-1 min-h-0 flex-col overflow-hidden p-2 sm:p-3 lg:p-4">
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar (iOS / Android Native Experience) */}
        <nav
          aria-label="Navegação rápida mobile"
          className="relative z-30 flex h-14 shrink-0 items-center justify-around border-t border-slate-200/90 bg-white/95 px-2 pb-[env(safe-area-inset-bottom,0px)] shadow-lg backdrop-blur-md dark:border-white/[0.08] dark:bg-[#0F172A]/95 lg:hidden"
        >
          <Link
            href="/tickets"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 py-1 px-3 text-[11px] font-medium transition-colors',
              pathname === '/tickets' || pathname.startsWith('/tickets/')
                ? 'text-blue-600 dark:text-sky-400 font-semibold'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <Ticket className="h-4 w-4" />
            <span>Chamados</span>
          </Link>

          <Link
            href="/sla"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 py-1 px-3 text-[11px] font-medium transition-colors',
              pathname === '/sla' || pathname.startsWith('/sla/')
                ? 'text-blue-600 dark:text-sky-400 font-semibold'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <Clock className="h-4 w-4" />
            <span>SLA</span>
          </Link>

          <Link
            href="/itsm"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 py-1 px-3 text-[11px] font-medium transition-colors',
              pathname === '/itsm' || pathname.startsWith('/itsm/')
                ? 'text-blue-600 dark:text-sky-400 font-semibold'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <HardDrive className="h-4 w-4" />
            <span>Ativos</span>
          </Link>

          <Link
            href="/audit"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 py-1 px-3 text-[11px] font-medium transition-colors',
              pathname === '/audit' || pathname.startsWith('/audit/')
                ? 'text-blue-600 dark:text-sky-400 font-semibold'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Auditoria</span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 py-1 px-3 text-[11px] font-medium transition-colors',
              mobileMenuOpen
                ? 'text-blue-600 dark:text-sky-400 font-semibold'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <Menu className="h-4 w-4" />
            <span>Menu</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

export function AppShell({
  breadcrumb,
  children,
}: {
  breadcrumb: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const setPageBreadcrumb = useCivoraStore((s) => s.setPageBreadcrumb);

  React.useEffect(() => {
    setPageBreadcrumb(breadcrumb);
    return () => {
      setPageBreadcrumb(null);
    };
  }, [breadcrumb, setPageBreadcrumb]);

  if (isWorkspaceRoute(pathname)) {
    return <>{children}</>;
  }

  return <WorkspaceShellFrame>{children}</WorkspaceShellFrame>;
}
