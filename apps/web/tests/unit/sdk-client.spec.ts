import { describe, expect, it } from 'vitest';
import { calculatePriorityFromMatrix } from '@civora/config';
import { CivoraClient } from '@civora/sdk';

describe('Web SDK & Client Priority Matrix', () => {
  it('computes priority matrix consistently for the ticket form preview', () => {
    expect(calculatePriorityFromMatrix('HIGH', 'HIGH')).toBe('CRITICAL');
    expect(calculatePriorityFromMatrix('HIGH', 'MEDIUM')).toBe('HIGH');
    expect(calculatePriorityFromMatrix('MEDIUM', 'MEDIUM')).toBe('MEDIUM');
    expect(calculatePriorityFromMatrix('LOW', 'LOW')).toBe('LOW');
  });

  it('adds tenant, bearer and idempotency headers in CivoraClient SDK', async () => {
    let capturedHeaders: Headers | undefined;
    const mockFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ id: 't-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new CivoraClient({
      baseUrl: 'http://localhost:4000',
      getOrganizationId: () => 'org-123',
      getAccessToken: () => 'jwt-abc',
      fetchImpl: mockFetch as typeof fetch,
    });

    await client.createTicket({ title: 'Teste SDK' }, 'idem-xyz');
    expect(capturedHeaders?.get('x-organization-id')).toBe('org-123');
    expect(capturedHeaders?.get('authorization')).toBe('Bearer jwt-abc');
    expect(capturedHeaders?.get('idempotency-key')).toBe('idem-xyz');
    expect(capturedHeaders?.get('x-correlation-id')).toBeTruthy();
  });
});

