'use client';

import * as React from 'react';
import Link from 'next/link';
import { Home, LifeBuoy, Ticket } from 'lucide-react';
import { Button } from '@civora/ui';
import { AmbientBackdrop, CivoraLogo } from '../components/spatial';

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 px-4 text-center dark:bg-[#020617]">
      <AmbientBackdrop />
      <div className="relative z-10 flex max-w-md flex-col items-center gap-4">
        <CivoraLogo size={56} />
        <span className="rounded-full border border-blue-300/80 bg-blue-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
          404 • Página não encontrada
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-50">
          Ambiente Operacional Civora
        </h1>
        <p className="text-xs text-slate-600 sm:text-sm dark:text-slate-300">
          A rota solicitada não foi localizada ou foi movida. Utilize os links abaixo para retornar à operação.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Link href="/tickets">
            <Button size="sm" className="gap-2">
              <Ticket className="h-4 w-4" aria-hidden="true" />
              Central de Chamados
            </Button>
          </Link>
          <Link href="/portal">
            <Button size="sm" variant="outline" className="gap-2">
              <LifeBuoy className="h-4 w-4" aria-hidden="true" />
              Portal do Solicitante
            </Button>
          </Link>
          <Link href="/login">
            <Button size="sm" variant="ghost" className="gap-2">
              <Home className="h-4 w-4" aria-hidden="true" />
              Login
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

