import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../lib/api';
import {
  createDepartmentSchema,
  createMemberSchema,
  createTeamSchema,
  createUnitSchema,
  extractApiErrorMessage,
  getRoleBadgeProps,
} from './organization-types';

describe('Organization structure validation and helpers', () => {
  it('validates unit, department, team, and member schemas strictly', () => {
    expect(
      createUnitSchema.safeParse({
        name: 'Matriz São Paulo',
        code: 'SP-HQ',
        timezone: 'America/Sao_Paulo',
      }).success,
    ).toBe(true);

    expect(
      createUnitSchema.safeParse({
        name: 'A',
        code: 'inv@lid',
        timezone: 'America/Sao_Paulo',
      }).success,
    ).toBe(false);

    expect(
      createDepartmentSchema.safeParse({
        name: 'Tecnologia da Informação',
        code: 'TI-OPS',
      }).success,
    ).toBe(true);

    expect(
      createTeamSchema.safeParse({
        name: 'Núcleo Cloud & Redes',
      }).success,
    ).toBe(true);

    expect(
      createMemberSchema.safeParse({
        name: 'Ana Paula Costa',
        email: 'ana.costa@civora.local',
        password: 'Password#2026',
        roleCode: 'Agent',
      }).success,
    ).toBe(true);

    expect(
      createMemberSchema.safeParse({
        name: 'Ana',
        email: 'invalid-email',
        password: '123',
        roleCode: 'Agent',
      }).success,
    ).toBe(false);
  });

  it('maps RBAC roles to high-contrast badge variants deterministically', () => {
    expect(getRoleBadgeProps('OrganizationOwner')).toEqual({
      label: 'OrganizationOwner',
      variant: 'purple',
    });
    expect(getRoleBadgeProps('Agent')).toEqual({
      label: 'Agent',
      variant: 'purple',
    });
    expect(getRoleBadgeProps('Auditor')).toEqual({
      label: 'Auditor',
      variant: 'warning',
    });
    expect(getRoleBadgeProps('CustomRole')).toEqual({
      label: 'CustomRole',
      variant: 'neutral',
    });
  });

  it('extracts clean messages from ApiClientError and generic errors', () => {
    const apiErr = new ApiClientError(409, {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'Membro já vinculado à organização.',
      instance: '/api/v1/users',
      correlationId: 'corr-1',
    });

    expect(extractApiErrorMessage(apiErr)).toBe('Membro já vinculado à organização.');
    expect(extractApiErrorMessage(new Error('Timeout na requisição'))).toBe('Timeout na requisição');
    expect(extractApiErrorMessage('unknown', 'Fallback')).toBe('Fallback');
  });
});

