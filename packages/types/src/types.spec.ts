import { describe, expect, it } from 'vitest';
import { ROLE_CODES, TICKET_STATUSES } from './enums';

describe('@civora/types', () => {
  it('exports all required RBAC roles and ticket statuses', () => {
    expect(ROLE_CODES).toContain('PlatformAdmin');
    expect(ROLE_CODES).toContain('Requester');
    expect(TICKET_STATUSES).toHaveLength(11);
  });
});

