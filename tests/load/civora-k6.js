import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 15 },
    { duration: '1m', target: 40 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:4000';

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({
      email: __ENV.ADMIN_EMAIL || 'admin.pro@civora.local',
      password: __ENV.ADMIN_PASSWORD || 'Civora@2026!',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(loginRes, { 'login succeeded': (r) => r.status === 200 });
  const body = loginRes.json();
  return {
    token: body.accessToken,
    orgId: body.user.activeOrganizationId,
  };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'x-organization-id': data.orgId,
    'Content-Type': 'application/json',
  };

  const listRes = http.get(`${BASE_URL}/api/v1/tickets?page=1&pageSize=20`, { headers });
  check(listRes, { 'list tickets 200': (r) => r.status === 200 });

  const dashRes = http.get(`${BASE_URL}/api/v1/reports/dashboard`, { headers });
  check(dashRes, { 'dashboard 200': (r) => r.status === 200 });

  sleep(1);
}

