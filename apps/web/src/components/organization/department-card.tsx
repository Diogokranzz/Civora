'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Layers3, MapPin, Plus, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
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
  TableSkeleton,
} from '@civora/ui';
import {
  EnterpriseEmptyState,
  MagneticButton,
  SectorEmblem,
  StaggerArticle,
  StaggerDiv,
  StaggerLi,
  StaggerUl,
} from '../spatial';
import {
  createDepartmentSchema,
  type CreateDepartmentFormValues,
  createUnitSchema,
  type CreateUnitFormValues,
  type DepartmentRecord,
  extractApiErrorMessage,
  SELECT_CONTROL_CLASS,
  TIMEZONE_OPTIONS,
  type UnitRecord,
} from './organization-types';

export function DepartmentCard({
  department,
  onDelete,
  isDeleting,
}: {
  department: DepartmentRecord;
  onDelete?: (department: DepartmentRecord) => void;
  isDeleting?: boolean;
}) {
  return (
    <StaggerArticle
      hoverLift
      aria-label={`Departamento ${department.name}, sigla ${department.code}`}
      className="group relative flex flex-col justify-between gap-2.5 overflow-hidden rounded-xl border border-slate-200/85 bg-white p-3.5 transition-colors duration-200 hover:border-sky-400/70 hover:bg-slate-50 hover:shadow-[0_12px_28px_-12px_rgba(37,99,235,0.28)] dark:border-white/[0.08] dark:bg-slate-950/95 dark:hover:border-sky-500/60 dark:hover:bg-slate-900"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/0 to-transparent transition-opacity duration-200 group-hover:via-sky-400/70"
      />
      <div className="flex min-w-0 items-start gap-2.5">
        <SectorEmblem code={department.code} name={department.name} size={34} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <h4 className="truncate text-sm font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100">
            {department.name}
          </h4>
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {department.unit ? `${department.unit.code} — ${department.unit.name}` : 'Escopo global da organização'}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-white/[0.06]">
        <span className="shrink-0 rounded-md border border-slate-200/90 bg-white/90 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-slate-700 dark:border-sky-500/30 dark:bg-slate-900/90 dark:text-sky-300">
          {department.code}
        </span>
        {onDelete ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isDeleting}
            onClick={() => onDelete(department)}
            aria-label={`Apagar departamento ${department.name}`}
            className="h-6 gap-1 border-red-200 px-2 text-[11px] text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/60 dark:hover:text-red-200"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            <span>{isDeleting ? 'Apagando...' : 'Apagar'}</span>
          </Button>
        ) : null}
      </div>
    </StaggerArticle>
  );
}

interface UnitsDepartmentsSectionProps {
  units: UnitRecord[];
  departments: DepartmentRecord[];
  isLoading: boolean;
  canManage: boolean;
  unitNameInputRef?: React.RefObject<HTMLInputElement | null>;
  onCreateUnit: (values: CreateUnitFormValues) => Promise<void>;
  onToggleUnitStatus: (unit: UnitRecord) => Promise<void>;
  onDeleteUnit?: (unit: UnitRecord) => Promise<void>;
  onCreateDepartment: (values: CreateDepartmentFormValues) => Promise<void>;
  onDeleteDepartment?: (department: DepartmentRecord) => Promise<void>;
}

export function UnitsDepartmentsSection({
  units,
  departments,
  isLoading,
  canManage,
  onCreateUnit,
  onToggleUnitStatus,
  onDeleteUnit,
  onCreateDepartment,
  onDeleteDepartment,
}: UnitsDepartmentsSectionProps) {
  const [deptSearch, setDeptSearch] = React.useState('');
  const [showUnitForm, setShowUnitForm] = React.useState(false);
  const [unitError, setUnitError] = React.useState<string | null>(null);
  const [deptError, setDeptError] = React.useState<string | null>(null);
  const [togglingUnitId, setTogglingUnitId] = React.useState<string | null>(null);
  const [deletingUnitId, setDeletingUnitId] = React.useState<string | null>(null);
  const [deletingDeptId, setDeletingDeptId] = React.useState<string | null>(null);
  const deptNameInputRef = React.useRef<HTMLInputElement | null>(null);

  const unitForm = useForm<CreateUnitFormValues>({
    resolver: zodResolver(createUnitSchema),
    defaultValues: {
      name: '',
      code: '',
      timezone: 'America/Sao_Paulo',
      address: '',
    },
  });

  const deptForm = useForm<CreateDepartmentFormValues>({
    resolver: zodResolver(createDepartmentSchema),
    defaultValues: {
      name: '',
      code: '',
      unitId: '',
    },
  });

  const filteredDepartments = React.useMemo(() => {
    const q = deptSearch.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.unit?.name.toLowerCase().includes(q) ?? false),
    );
  }, [departments, deptSearch]);

  const handleUnitSubmit = unitForm.handleSubmit(async (values) => {
    setUnitError(null);
    try {
      await onCreateUnit({
        ...values,
        code: values.code.toUpperCase(),
      });
      unitForm.reset({
        name: '',
        code: '',
        timezone: 'America/Sao_Paulo',
        address: '',
      });
      setShowUnitForm(false);
    } catch (err) {
      setUnitError(extractApiErrorMessage(err, 'Não foi possível cadastrar a unidade.'));
    }
  });

  const handleDeptSubmit = deptForm.handleSubmit(async (values) => {
    setDeptError(null);
    try {
      await onCreateDepartment({
        name: values.name,
        code: values.code.toUpperCase(),
        unitId: values.unitId || undefined,
      });
      deptForm.reset({ name: '', code: '', unitId: '' });
    } catch (err) {
      setDeptError(extractApiErrorMessage(err, 'Não foi possível adicionar o departamento.'));
    }
  });

  const handleToggleUnit = async (unit: UnitRecord) => {
    setUnitError(null);
    setTogglingUnitId(unit.id);
    try {
      await onToggleUnitStatus(unit);
    } catch (err) {
      setUnitError(extractApiErrorMessage(err, 'Falha ao atualizar status da unidade.'));
    } finally {
      setTogglingUnitId(null);
    }
  };

  const handleDeleteUnit = async (unit: UnitRecord) => {
    if (!onDeleteUnit) return;
    setUnitError(null);
    setDeletingUnitId(unit.id);
    try {
      await onDeleteUnit(unit);
    } catch (err) {
      setUnitError(extractApiErrorMessage(err, 'Não foi possível apagar a unidade.'));
    } finally {
      setDeletingUnitId(null);
    }
  };

  const handleDeleteDepartment = async (department: DepartmentRecord) => {
    if (!onDeleteDepartment) return;
    setDeptError(null);
    setDeletingDeptId(department.id);
    try {
      await onDeleteDepartment(department);
    } catch (err) {
      setDeptError(extractApiErrorMessage(err, 'Não foi possível apagar o departamento.'));
    } finally {
      setDeletingDeptId(null);
    }
  };

  const deptNameRegister = deptForm.register('name');

  return (
    <Card className="flex h-full flex-col overflow-hidden border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#0F172A] lg:min-h-0">
      <CardHeader className="border-b border-slate-200/80 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200/80 bg-blue-50 text-blue-700 dark:border-sky-500/30 dark:bg-blue-500/15 dark:text-sky-300">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </span>
              Unidades & Departamentos
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Estruture filiais, sedes operacionais e áreas internas para segmentação de chamados e SLAs.
            </CardDescription>
          </div>
          {canManage ? (
            <Button
              size="sm"
              variant={showUnitForm ? 'secondary' : 'outline'}
              onClick={() => setShowUnitForm((prev) => !prev)}
              aria-expanded={showUnitForm}
              aria-controls="unit-creation-form"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {showUnitForm ? 'Fechar Unidade' : 'Nova Unidade'}
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 overflow-y-auto pt-4 lg:min-h-0">
        {isLoading ? (
          <TableSkeleton rows={4} />
        ) : (
          <>
            <section aria-labelledby="units-section-heading" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <h3
                    id="units-section-heading"
                    className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200"
                  >
                    Unidades Operacionais
                  </h3>
                </div>
                <Badge variant="neutral">{units.length}</Badge>
              </div>

              {unitError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-900 dark:border-red-900/80 dark:bg-red-950/40 dark:text-red-200"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{unitError}</span>
                </div>
              ) : null}

              {showUnitForm && canManage ? (
                <form
                  id="unit-creation-form"
                  onSubmit={handleUnitSubmit}
                  className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors duration-200 ease-in-out dark:border-slate-700/80 dark:bg-slate-950"
                  noValidate
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="unit-name">Nome da unidade</Label>
                      <Input
                        id="unit-name"
                        placeholder="Ex: Matriz São Paulo"
                        aria-invalid={Boolean(unitForm.formState.errors.name)}
                        {...unitForm.register('name')}
                      />
                      {unitForm.formState.errors.name ? (
                        <p className="text-xs text-red-600 dark:text-red-300">
                          {unitForm.formState.errors.name.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-code">Sigla</Label>
                      <Input
                        id="unit-code"
                        placeholder="SP-HQ"
                        aria-invalid={Boolean(unitForm.formState.errors.code)}
                        {...unitForm.register('code')}
                        onChange={(e) => unitForm.setValue('code', e.target.value.toUpperCase())}
                      />
                      {unitForm.formState.errors.code ? (
                        <p className="text-xs text-red-600 dark:text-red-300">
                          {unitForm.formState.errors.code.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-timezone">Fuso horário</Label>
                      <select
                        id="unit-timezone"
                        className={SELECT_CONTROL_CLASS}
                        {...unitForm.register('timezone')}
                      >
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-address">Endereço (opcional)</Label>
                      <Input
                        id="unit-address"
                        placeholder="Av. Paulista, 1000"
                        {...unitForm.register('address')}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowUnitForm(false)}
                    >
                      Cancelar
                    </Button>
                    <MagneticButton
                      type="submit"
                      size="sm"
                      disabled={unitForm.formState.isSubmitting}
                    >
                      {unitForm.formState.isSubmitting ? 'Salvando...' : 'Cadastrar Unidade'}
                    </MagneticButton>
                  </div>
                </form>
              ) : null}

              {units.length === 0 ? (
                <EnterpriseEmptyState
                  mode="compact"
                  eyebrow="Unidades"
                  title="Nenhuma unidade cadastrada"
                  description="Cadastre sua sede ou filial para vincular departamentos e calendários de SLA."
                  action={
                    canManage && !showUnitForm ? (
                      <MagneticButton size="sm" variant="outline" onClick={() => setShowUnitForm(true)}>
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Cadastrar primeira unidade
                      </MagneticButton>
                    ) : undefined
                  }
                />
              ) : (
                <StaggerUl
                  className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
                  aria-label="Lista de unidades"
                >
                  {units.map((u) => (
                    <StaggerLi
                      key={u.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/85 bg-white px-3 py-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-400/60 dark:border-white/[0.08] dark:bg-slate-950 dark:hover:border-sky-500/50"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 whitespace-nowrap font-mono text-xs font-semibold text-sky-700 dark:text-sky-300">
                            {u.code}
                          </span>
                          <span className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                            {u.name}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-600 dark:text-slate-400">
                          {u.timezone}
                        </p>
                      </div>
                      {canManage ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            disabled={togglingUnitId === u.id || deletingUnitId === u.id}
                            onClick={() => void handleToggleUnit(u)}
                            aria-label={`Alternar status da unidade ${u.name} para ${u.isActive ? 'Inativa' : 'Ativa'}`}
                            className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            <Badge variant={u.isActive ? 'success' : 'neutral'}>
                              {u.isActive ? 'Ativa' : 'Inativa'}
                            </Badge>
                          </button>
                          {onDeleteUnit ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={deletingUnitId === u.id}
                              onClick={() => void handleDeleteUnit(u)}
                              aria-label={`Apagar unidade ${u.name}`}
                              className="h-6 gap-1 border-red-200 px-2 text-[11px] text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/60 dark:hover:text-red-200"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              <span>{deletingUnitId === u.id ? 'Apagando...' : 'Apagar'}</span>
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <Badge variant={u.isActive ? 'success' : 'neutral'}>
                          {u.isActive ? 'Ativa' : 'Inativa'}
                        </Badge>
                      )}
                    </StaggerLi>
                  ))}
                </StaggerUl>
              )}
            </section>

            <section
              aria-labelledby="departments-section-heading"
              className="flex flex-1 flex-col space-y-3 border-t border-slate-200/80 pt-5 dark:border-white/[0.08]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <h3
                    id="departments-section-heading"
                    className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200"
                  >
                    Departamentos
                  </h3>
                  <Badge variant="info">{departments.length}</Badge>
                </div>

                {departments.length > 0 ? (
                  <div className="relative w-full sm:w-56">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400"
                      aria-hidden="true"
                    />
                    <Input
                      value={deptSearch}
                      onChange={(e) => setDeptSearch(e.target.value)}
                      placeholder="Filtrar departamentos..."
                      aria-label="Filtrar departamentos por nome, sigla ou unidade"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                ) : null}
              </div>

              {departments.length === 0 ? (
                <EnterpriseEmptyState
                  mode="compact"
                  eyebrow="Departamentos"
                  title="Nenhum departamento cadastrado"
                  description="Crie seus departamentos internos (ex: TI, Facilities, Operações) pelo formulário abaixo."
                  hint="Administrador PRO: vincule cada departamento a uma unidade operacional quando necessário."
                  action={
                    canManage ? (
                      <MagneticButton
                        size="sm"
                        variant="outline"
                        onClick={() => deptNameInputRef.current?.focus()}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Iniciar primeiro departamento
                      </MagneticButton>
                    ) : undefined
                  }
                />
              ) : filteredDepartments.length === 0 ? (
                <EnterpriseEmptyState
                  mode="compact"
                  eyebrow="Filtro"
                  title="Nenhum departamento corresponde ao filtro"
                  description="Ajuste o termo pesquisado para visualizar todos os departamentos."
                  action={
                    <MagneticButton size="sm" variant="outline" onClick={() => setDeptSearch('')}>
                      Limpar filtro
                    </MagneticButton>
                  }
                />
              ) : (
                <StaggerDiv
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                  role="list"
                  aria-label="Grade de departamentos"
                >
                  {filteredDepartments.map((dept) => (
                    <div key={dept.id} role="listitem">
                      <DepartmentCard
                        department={dept}
                        onDelete={
                          canManage && onDeleteDepartment
                            ? (target) => void handleDeleteDepartment(target)
                            : undefined
                        }
                        isDeleting={deletingDeptId === dept.id}
                      />
                    </div>
                  ))}
                </StaggerDiv>
              )}

              {canManage ? (
                <form
                  id="department-creation-form"
                  onSubmit={handleDeptSubmit}
                  className="mt-auto space-y-3 rounded-xl border border-slate-200/85 bg-slate-50 p-4 dark:border-white/[0.08] dark:bg-slate-950"
                  noValidate
                >
                  <p className="text-xs font-semibold tracking-wide text-slate-800 dark:text-slate-200">
                    Adicionar Departamento
                  </p>

                  {deptError ? (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900/80 dark:bg-red-950/40 dark:text-red-200"
                    >
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{deptError}</span>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="space-y-1 sm:col-span-5">
                      <Label htmlFor="dept-name">Nome do departamento</Label>
                      <Input
                        id="dept-name"
                        placeholder="Ex: Tecnologia da Informação"
                        aria-invalid={Boolean(deptForm.formState.errors.name)}
                        {...deptNameRegister}
                        ref={(el) => {
                          deptNameRegister.ref(el);
                          deptNameInputRef.current = el;
                        }}
                      />
                      {deptForm.formState.errors.name ? (
                        <p className="text-xs text-red-600 dark:text-red-300">
                          {deptForm.formState.errors.name.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1 sm:col-span-3">
                      <Label htmlFor="dept-code">Sigla</Label>
                      <Input
                        id="dept-code"
                        placeholder="TI-OPS"
                        aria-invalid={Boolean(deptForm.formState.errors.code)}
                        {...deptForm.register('code')}
                        onChange={(e) => deptForm.setValue('code', e.target.value.toUpperCase())}
                      />
                      {deptForm.formState.errors.code ? (
                        <p className="text-xs text-red-600 dark:text-red-300">
                          {deptForm.formState.errors.code.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1 sm:col-span-4">
                      <Label htmlFor="dept-unit">Unidade</Label>
                      <select
                        id="dept-unit"
                        aria-label="Selecionar unidade do departamento"
                        className={SELECT_CONTROL_CLASS}
                        {...deptForm.register('unitId')}
                      >
                        <option value="">Global (todas)</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code} — {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <MagneticButton
                      type="submit"
                      size="sm"
                      disabled={deptForm.formState.isSubmitting}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      {deptForm.formState.isSubmitting ? 'Adicionando...' : 'Adicionar'}
                    </MagneticButton>
                  </div>
                </form>
              ) : null}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
