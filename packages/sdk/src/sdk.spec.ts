import { describe, expect, it } from 'vitest';
import { CivoraApiError, CivoraClient } from './index';

describe('@civora/sdk', () => {
  it('constructs CivoraClient and CivoraApiError cleanly', () => {
    const client = new CivoraClient({ baseUrl: 'http://localhost:4000/' });
    expect(client).toBeInstanceOf(CivoraClient);
    const err = new CivoraApiError(403, {
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
      detail: 'Denied',
      instance: '/api/v1/tickets',
      correlationId: 'c-1',
    });
    expect(err.status).toBe(403);
  });
});

