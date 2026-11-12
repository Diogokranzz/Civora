import { describe, expect, it } from 'vitest';
import {
  staggerContainerVariants,
  staggerItemVariants,
  tableRowVariants,
} from './motion-primitives';
import { resolveSectorKey } from './service-emblems';

describe('Motion and layout primitives', () => {
  it('defines deterministic stagger animation variants', () => {
    expect(staggerContainerVariants.visible).toBeDefined();
    expect(staggerItemVariants.hidden).toEqual({ opacity: 0, y: 8 });
    expect(tableRowVariants.hidden).toEqual({ opacity: 0, y: 5 });
  });

  it('resolves sector keys cleanly from department codes and localized names', () => {
    expect(resolveSectorKey('INFRA', null)).toBe('INFRA');
    expect(resolveSectorKey(null, 'Segurança da Informação (InfoSec / SOC)')).toBe('SEC');
    expect(resolveSectorKey(null, 'Financeiro, Fiscal & Controladoria')).toBe('FIN');
    expect(resolveSectorKey(null, 'Recursos Humanos & Gestão de Pessoas')).toBe('RH');
    expect(resolveSectorKey(null, 'Jurídico, Risco & Compliance (LGPD)')).toBe('JUR');
    expect(resolveSectorKey(null, 'Área Desconhecida')).toBe('DEFAULT');
  });
});
