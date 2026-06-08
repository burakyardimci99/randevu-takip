// k6 yük testi — iç pilot profili (~50 VU).
// Çalıştırma (k6 kuruluysa):  k6 run qa/load.js
// Docker ile:                 docker run --rm --network host -e BASE=http://localhost:4000 \
//                               -v "$PWD/qa:/qa" grafana/k6 run /qa/load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://localhost:4000';

export const options = {
  scenarios: {
    pilot: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },
        { duration: '60s', target: 50 },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // Auth gerektirmeyen okuma yolları (yük profili için yeterli; login rate-limit'e takılır)
  const health = http.get(`${BASE}/api/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  const showcase = http.get(`${BASE}/api/public/showcase`);
  check(showcase, { 'showcase 2xx': (r) => r.status >= 200 && r.status < 300 });

  sleep(1);
}
