'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Settings, Shield } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@civora/ui';
import { AppShell } from '../../components/app-shell';
import { civoraApi } from '../../lib/api';
import { useCivoraStore } from '../../lib/store';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const user = useCivoraStore((s) => s.user);
  const activeOrganizationId = useCivoraStore((s) => s.activeOrganizationId);

  const [mfaSecret, setMfaSecret] = React.useState<{ otpauthUrl: string; secretBase32: string } | null>(
    null,
  );
  const [mfaCode, setMfaCode] = React.useState('');
  const [mfaMsg, setMfaMsg] = React.useState<string | null>(null);

  const orgQuery = useQuery({
    queryKey: ['org-current', activeOrganizationId],
    queryFn: () => civoraApi.getCurrentOrg(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const adaptersQuery = useQuery({
    queryKey: ['adapters-status', activeOrganizationId],
    queryFn: () => civoraApi.getAdaptersStatus(),
    enabled: Boolean(user && activeOrganizationId),
  });

  const toggleAiMutation = useMutation({
    mutationFn: (aiEnabled: boolean) => civoraApi.updateCurrentOrg({ aiEnabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['org-current'] }),
  });

  return (
    <AppShell breadcrumb="Configurações">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:h-full lg:min-h-0">
        <div className="shrink-0">
          <h1 className="text-xl font-bold tracking-tight">Configurações da Organização & Segurança</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Governança de tenant, política de retenção LGPD, camada opcional de IA, MFA e integrações.
          </p>
        </div>

        <div className="grid shrink-0 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Settings className="h-4 w-4 text-blue-600" aria-hidden="true" />
                Organização Ativa & Política de IA
              </CardTitle>
              <CardDescription className="text-xs">
                O Civora permanece 100% operacional quando recursos de IA estão desabilitados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {orgQuery.data ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nome</span>
                    <span className="font-semibold">{orgQuery.data.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Plano</span>
                    <Badge variant="info">{orgQuery.data.subscription?.plan ?? 'ENTERPRISE'}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Retenção LGPD</span>
                    <span className="font-mono">{orgQuery.data.dataRetentionDays} dias</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
                    <div>
                      <p className="font-semibold">Camada Assistiva de IA</p>
                      <p className="text-slate-500">
                        Habilita sugestões auditáveis com mascaramento de PII.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={orgQuery.data.aiEnabled ? 'default' : 'outline'}
                      onClick={() => toggleAiMutation.mutate(!orgQuery.data.aiEnabled)}
                    >
                      {orgQuery.data.aiEnabled ? 'Ativa' : 'Desativada'}
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4 text-blue-600" aria-hidden="true" />
                Autenticação Multifator (MFA TOTP)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span>Status atual na sua conta:</span>
                <Badge variant={user?.mfaEnabled ? 'success' : 'warning'}>
                  {user?.mfaEnabled ? 'MFA Habilitado' : 'MFA Não Configurado'}
                </Badge>
              </div>
              {!user?.mfaEnabled ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const res = await civoraApi.setupMfa();
                      setMfaSecret(res);
                    }}
                  >
                    Gerar Chave TOTP
                  </Button>
                  {mfaSecret ? (
                    <div className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-800">
                      <p>
                        Adicione a chave no seu aplicativo autenticador:{' '}
                        <code className="font-mono font-bold">{mfaSecret.secretBase32}</code>
                      </p>
                      <div className="flex gap-2">
                        <Label htmlFor="mfa-verify" className="sr-only">
                          Código MFA
                        </Label>
                        <Input
                          id="mfa-verify"
                          placeholder="Código de 6 dígitos"
                          maxLength={6}
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value)}
                        />
                        <Button
                          size="sm"
                          onClick={async () => {
                            await civoraApi.enableMfa(mfaCode);
                            setMfaMsg('MFA ativado com sucesso para próximos logins.');
                          }}
                        >
                          Ativar MFA
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
              {mfaMsg ? <p className="text-emerald-700 dark:text-emerald-400">{mfaMsg}</p> : null}
            </CardContent>
          </Card>
        </div>

        <Card className="flex flex-1 flex-col lg:min-h-0">
          <CardHeader className="shrink-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-blue-600" aria-hidden="true" />
              Status dos Adaptadores de Integração
            </CardTitle>
          </CardHeader>
          <CardContent className="grid flex-1 gap-3 overflow-y-auto text-xs sm:grid-cols-3 lg:min-h-0">
            {adaptersQuery.data
              ? Object.entries(adaptersQuery.data).map(([name, cfg]) => (
                  <div
                    key={name}
                    className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <p className="font-semibold uppercase">{name}</p>
                    <p className="mt-1 font-mono text-slate-500">{JSON.stringify(cfg)}</p>
                  </div>
                ))
              : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

