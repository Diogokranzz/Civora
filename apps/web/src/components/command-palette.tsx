'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  FileBarChart2,
  FolderGit2,
  LifeBuoy,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  Timer,
  Workflow,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { civoraApi } from '../lib/api';
import { useCivoraStore } from '../lib/store';

const NAV_COMMANDS = [
  { label: 'Central de Chamados', href: '/tickets', icon: Ticket, hint: 'Lista operacional e SLA' },
  { label: 'Portal do Solicitante', href: '/portal', icon: LifeBuoy, hint: 'Catálogo e minhas solicitações' },
  { label: 'Painel de SLA', href: '/sla', icon: Timer, hint: 'Calendários e políticas' },
  { label: 'Base de Conhecimento', href: '/knowledge', icon: BookOpen, hint: 'Artigos e runbooks' },
  { label: 'Relatórios Gerenciais', href: '/reports', icon: FileBarChart2, hint: 'MTTA, MTTR e tendências' },
  { label: 'Departamentos & Equipes', href: '/organization', icon: FolderGit2, hint: 'Estrutura e RBAC' },
  { label: 'Ativos, Problemas & Mudanças', href: '/itsm', icon: FolderGit2, hint: 'CMDB e ITSM' },
  { label: 'Automações & Webhooks', href: '/automations', icon: Workflow, hint: 'Motor de regras' },
  { label: 'Auditoria & LGPD', href: '/audit', icon: ShieldCheck, hint: 'Logs imutáveis e titular' },
  { label: 'Configurações', href: '/settings', icon: Settings, hint: 'Tenant, IA e MFA' },
];

export function CommandPalette() {
  const router = useRouter();
  const open = useCivoraStore((s) => s.commandPaletteOpen);
  const setOpen = useCivoraStore((s) => s.setCommandPaletteOpen);
  const user = useCivoraStore((s) => s.user);
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useCivoraStore.getState().commandPaletteOpen);
      } else if (e.key === 'Escape' && useCivoraStore.getState().commandPaletteOpen) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  const { data: ticketResults } = useQuery({
    queryKey: ['cmd-tickets', query],
    queryFn: () => civoraApi.listTickets({ search: query, pageSize: 5 }),
    enabled: open && Boolean(user) && query.trim().length >= 2,
  });

  const { data: kbResults } = useQuery({
    queryKey: ['cmd-kb', query],
    queryFn: () => civoraApi.listKnowledge(query),
    enabled: open && Boolean(user) && query.trim().length >= 2,
  });

  if (!open) return null;

  const filteredNav = NAV_COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.hint.toLowerCase().includes(query.toLowerCase()),
  );

  const navigate = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20"
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos e busca global"
    >
      <button
        type="button"
        aria-label="Fechar busca global"
        onClick={() => setOpen(false)}
        className="fixed inset-0 bg-slate-950/50"
        tabIndex={-1}
      />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center border-b border-slate-200 px-3 dark:border-slate-800">
          <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar chamados (ex: CIV-2026), artigos ou navegar..."
            aria-label="Buscar chamados, artigos ou comandos"
            className="h-12 w-full bg-transparent px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar busca global"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {ticketResults && ticketResults.data.length > 0 ? (
            <div className="mb-3">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Chamados
              </p>
              {ticketResults.data.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigate(`/tickets/${t.id}`)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="truncate font-medium">
                    <span className="mr-2 font-mono text-xs text-blue-600 dark:text-blue-400">
                      {t.publicNumber}
                    </span>
                    {t.title}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">{t.status}</span>
                </button>
              ))}
            </div>
          ) : null}

          {kbResults && kbResults.data.length > 0 ? (
            <div className="mb-3">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Base de Conhecimento
              </p>
              {kbResults.data.slice(0, 4).map((art) => (
                <button
                  key={art.id}
                  type="button"
                  onClick={() => navigate(`/knowledge?article=${art.id}`)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="truncate">{art.title}</span>
                  <span className="ml-2 text-xs text-slate-500">{art.visibility}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div>
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Navegação Rápida
            </p>
            {filteredNav.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => navigate(item.href)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  <span className="font-medium">{item.label}</span>
                  <span className="ml-auto text-xs text-slate-500">{item.hint}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
