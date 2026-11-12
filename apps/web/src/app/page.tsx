'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AmbientBackdrop, CivoraLogo } from '../components/spatial';
import { useCivoraStore } from '../lib/store';

export default function HomePage() {
  const router = useRouter();
  const user = useCivoraStore((s) => s.user);

  React.useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    const activeMembership = user.memberships.find(
      (m) => m.organizationId === user.activeOrganizationId,
    );
    if (activeMembership?.roleCode === 'Requester') {
      router.replace('/portal');
    } else {
      router.replace('/tickets');
    }
  }, [user, router]);

  return (
    <main className="relative flex h-dvh items-center justify-center overflow-hidden bg-slate-50 dark:bg-[#020617]">
      <AmbientBackdrop />
      <div className="relative z-10 flex flex-col items-center gap-3.5 text-center">
        <CivoraLogo size={52} />
        <p className="text-sm font-medium tracking-wide text-slate-600 dark:text-slate-300">
          Inicializando ambiente operacional Civora...
        </p>
      </div>
    </main>
  );
}
