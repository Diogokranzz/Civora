import http from 'k6/http';
import ws from 'k6/ws';
import { Counter, Trend } from 'k6/metrics';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const WS_URL = BASE_URL.replace(/^http/, 'ws');
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin.pro@civora.local';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'Civora@2026!';
const BURST_SIZE = Number(__ENV.SLA_BURST_SIZE || 60);
const EMIT_SYNTHETIC_CLIENT_METRICS = __ENV.EMIT_SYNTHETIC_CLIENT_METRICS === 'true';

const wsFramesReceived = new Counter('civora_k6_ws_frames_received');
const topologyHydrationMs = new Trend('civora_k6_topology_hydration_ms');

export const options = {
  scenarios: {
    sla_breach_ws_storm: {
      executor: 'ramping-arrival-rate',
      startRate: 4,
      timeUnit: '1s',
      preAllocatedVUs: 10,
      maxVUs: 30,
      stages: [
        { duration: '10s', target: 8 },
        { duration: '20s', target: 12 },
        { duration: '10s', target: 0 },
      ],
      exec: 'runSlaBreachBurst',
    },
    cmdb_cascade_and_hydration: {
      executor: 'constant-vus',
      vus: 3,
      duration: '40s',
      exec: 'runCmdbCascadeAndHydration',
    },
    ws_backpressure_observer: {
      executor: 'constant-vus',
      vus: 4,
      duration: '40s',
      exec: 'observeSocketBackpressure',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    civora_k6_topology_hydration_ms: ['p(95)<150'],
  },
};

function authHeaders(token, orgId) {
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': orgId,
    'Content-Type': 'application/json',
  };
}

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(loginRes, { 'k6 bootstrap login 200': (r) => r.status === 200 });
  const auth = loginRes.json();
  const token = auth.accessToken;
  const orgId = auth.user.activeOrganizationId;

  const headers = authHeaders(token, orgId);
  let assets = [];
  const assetsRes = http.get(`${BASE_URL}/api/v1/assets`, { headers });
  if (assetsRes.status === 200) {
    assets = assetsRes.json();
  }

  if (assets.length === 0 && __ENV.ALLOW_SEED_STRESS_ASSETS === 'true') {
    const rootRes = http.post(
      `${BASE_URL}/api/v1/assets`,
      JSON.stringify({
        assetTag: `K6-RTR-${Date.now().toString().slice(-4)}`,
        name: 'Stress Core Router',
        assetType: 'ROUTER',
        status: 'ACTIVE',
      }),
      { headers },
    );
    const leafRes = http.post(
      `${BASE_URL}/api/v1/assets`,
      JSON.stringify({
        assetTag: `K6-APP-${Date.now().toString().slice(-4)}`,
        name: 'Stress Dependent Service',
        assetType: 'APPLICATION',
        status: 'ACTIVE',
      }),
      { headers },
    );
    if (rootRes.status === 201 && leafRes.status === 201) {
      const rootAsset = rootRes.json();
      const leafAsset = leafRes.json();
      http.post(
        `${BASE_URL}/api/v1/assets/${leafAsset.id}/relationships`,
        JSON.stringify({ targetId: rootAsset.id, relationType: 'DEPENDS_ON' }),
        { headers },
      );
      assets = [rootAsset, leafAsset];
    }
  }

  return {
    token,
    orgId,
    rootAssetId: assets.length > 0 ? assets[0].id : null,
  };
}

export function runSlaBreachBurst(data) {
  const res = http.post(
    `${BASE_URL}/api/v1/itsm/stress/sla-breach-burst`,
    JSON.stringify({ burstCount: BURST_SIZE, priority: 'CRITICAL' }),
    { headers: authHeaders(data.token, data.orgId) },
  );

  check(res, {
    'sla burst accepted 201': (r) => r.status === 201,
  });
}

export function runCmdbCascadeAndHydration(data) {
  const headers = authHeaders(data.token, data.orgId);

  const topoRes = http.get(`${BASE_URL}/api/v1/assets/topology`, { headers });
  topologyHydrationMs.add(topoRes.timings.duration);
  check(topoRes, {
    'topology hydration 200': (r) => r.status === 200,
  });

  if (data.rootAssetId) {
    const cascadeRes = http.post(
      `${BASE_URL}/api/v1/assets/${data.rootAssetId}/simulate-cascade`,
      JSON.stringify({ burstCount: 60 }),
      { headers },
    );
    check(cascadeRes, {
      'cmdb cascade simulation 201': (r) => r.status === 201,
    });
  }

  sleep(0.9);
}

export function observeSocketBackpressure(data) {
  const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  let receivedInWindow = 0;

  ws.connect(url, {}, (socket) => {
    socket.on('open', () => {
      socket.send(`40/realtime,${JSON.stringify({ token: data.token, organizationId: data.orgId })}`);
    });

    socket.on('message', (msg) => {
      if (msg === '2') {
        socket.send('3');
        return;
      }
      if (msg.startsWith('42/realtime')) {
        receivedInWindow += 1;
        wsFramesReceived.add(1);
      }
    });

    socket.setTimeout(() => {
      socket.close();
    }, 5000);
  });

  if (EMIT_SYNTHETIC_CLIENT_METRICS) {
    const coalescedCount = Math.max(receivedInWindow, 50);
    const droppedCount = Math.max(0, coalescedCount - 500);
    http.post(
      `${BASE_URL}/api/v1/telemetry/client`,
      JSON.stringify({
        backpressure: { coalescedCount, droppedCount },
        vitals: [{ name: 'INP', value: Math.min(480, 45 + coalescedCount * 0.15) }],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  sleep(0.5);
}

