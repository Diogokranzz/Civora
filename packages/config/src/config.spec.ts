import { describe, expect, it } from 'vitest';
import {
  calculatePriorityFromMatrix,
  ROLE_PERMISSION_MATRIX,
  TICKET_ALLOWED_TRANSITIONS,
} from './itsm';
import { parseApiEnv as parseEnv } from './env';

describe('@civora/config', () => {
  it('computes priority matrix and enforces state transition map', () => {
    expect(calculatePriorityFromMatrix('HIGH', 'HIGH')).toBe('CRITICAL');
    expect(TICKET_ALLOWED_TRANSITIONS.NEW).toContain('OPEN');
    expect(TICKET_ALLOWED_TRANSITIONS.CLOSED).toEqual(['REOPENED']);
    expect(ROLE_PERMISSION_MATRIX.Requester).not.toContain('audit:read');
    expect(ROLE_PERMISSION_MATRIX.Auditor).toContain('audit:read');
  });

  it('validates environment config with Zod', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://civora:pass@localhost:5432/civora',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
    });
    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.AI_PROVIDER).toBe('disabled');
  });
});
