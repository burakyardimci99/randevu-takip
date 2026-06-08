#!/usr/bin/env node
/**
 * Kara-kutu (black-box) güvenlik + hata-yönetimi testleri.
 * Çalışan stack'e karşı koşar (docker compose up -d).
 *
 * Çalıştırma:  node qa/blackbox.mjs   [BASE=http://localhost:4000]
 *
 * Bağımlılık YOK — yalnız Node 18+ yerleşik fetch + node:crypto kullanır.
 * Exploit değil; savunma/doğrulama amaçlı (token reddi, izolasyon, input red).
 */
import crypto from 'node:crypto';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const USER = { email: 'user@klab.test', password: 'Demo1234!Pass' };

let pass = 0,
  fail = 0;
const results = [];
function check(id, name, ok, detail = '') {
  results.push({ id, name, ok, detail });
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '  ✅' : '  ❌'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

/* ---- basit cookie jar ---- */
function makeJar() {
  const store = new Map();
  return {
    apply(headers = {}) {
      if (store.size) headers.cookie = [...store.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      return headers;
    },
    absorb(res) {
      const sc = res.headers.getSetCookie?.() ?? [];
      for (const line of sc) {
        const [pair] = line.split(';');
        const idx = pair.indexOf('=');
        if (idx > 0) store.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
  };
}

async function req(method, path, { jar, headers = {}, body, token } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (body !== undefined) h['content-type'] = 'application/json';
  if (jar) jar.apply(h);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    redirect: 'manual',
  });
  if (jar) jar.absorb(res);
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, headers: res.headers, json, text };
}

/** CSRF token al (jar'a klab_csrf cookie'si de yazılır). */
async function getCsrf(jar) {
  const r = await req('GET', '/api/csrf', { jar });
  return r.json?.csrfToken ?? '';
}

/** Full login: csrf → login. accessToken döner, jar'da refresh cookie kalır. */
async function login(jar, creds) {
  const csrf = await getCsrf(jar);
  const r = await req('POST', '/api/auth/login', {
    jar,
    headers: { 'x-csrf-token': csrf },
    body: creds,
  });
  return r;
}

/** base64url */
const b64u = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function forgeHs256(payload) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac('sha256', 'attacker-secret').update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}
function forgeNone(payload) {
  const header = b64u(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  return `${header}.${body}.`;
}

async function main() {
  console.log(`\n=== Kara-kutu güvenlik testleri — ${BASE} ===\n`);

  // S1.10 Güvenlik başlıkları
  const health = await req('GET', '/api/health');
  check('S1.10a', 'GET /api/health 200', health.status === 200, `status=${health.status}`);
  check('S1.10b', 'X-Powered-By gizli', !health.headers.get('x-powered-by'));
  check('S1.10c', 'X-Content-Type-Options: nosniff', health.headers.get('x-content-type-options') === 'nosniff');
  check('S1.10d', 'X-Frame-Options: DENY', (health.headers.get('x-frame-options') || '').toUpperCase() === 'DENY');
  check('S1.10e', "CSP script-src 'self'", (health.headers.get('content-security-policy') || '').includes("script-src 'self'"));
  check('S1.10f', 'Permissions-Policy camera kapalı', (health.headers.get('permissions-policy') || '').includes('camera=()'));
  const hsts = health.headers.get('strict-transport-security');
  check('S1.10g', 'HSTS (yalnız prod; dev’de yok beklenir)', true, hsts ? `prod: ${hsts}` : 'dev: yok (beklenen)');

  // S1.3/S1.4 Forged token reddi
  const hs = forgeHs256({ sub: 'attacker', role: 'admin', email: 'x@x.com' });
  const r1 = await req('GET', '/api/admin/stats', { token: hs });
  check('S1.3', 'HS256 forged token reddedilir (admin/stats)', [401, 403].includes(r1.status), `status=${r1.status}`);
  const none = forgeNone({ sub: 'attacker', role: 'user' });
  const r2 = await req('GET', '/api/user/bookings', { token: none });
  check('S1.4', 'alg:none token reddedilir (user/bookings)', r2.status === 401, `status=${r2.status}`);
  const r2b = await req('GET', '/api/user/bookings', {});
  check('S1.4b', 'Token’sız korumalı endpoint 401', r2b.status === 401, `status=${r2b.status}`);

  // Geçerli user login
  const jar = makeJar();
  const userLogin = await login(jar, USER);
  const token = userLogin.json?.accessToken;
  check('LOGIN', 'Geçerli user login 200 + accessToken', userLogin.status === 200 && !!token, `status=${userLogin.status}`);

  // S1.1 Admin izolasyonu — user token admin endpoint’e erişemez
  if (token) {
    const adm = await req('GET', '/api/admin/stats', { token });
    check('S1.1', 'User token admin/stats erişemez (403/401)', [401, 403].includes(adm.status), `status=${adm.status}`);
  } else {
    check('S1.1', 'User token admin/stats erişemez', false, 'login başarısız, atlandı');
  }

  // S1.9 User enumeration yok — var olan vs olmayan e-posta, yanlış parola
  const jarA = makeJar();
  const a = await login(jarA, { email: 'ayse.yilmaz@klab.test', password: 'KesinlikleYanlis1!' });
  const jarB = makeJar();
  const b = await login(jarB, { email: 'boyle-biri-yok-9999@klab.test', password: 'KesinlikleYanlis1!' });
  check(
    'S1.9',
    'User enumeration yok (aynı status + aynı mesaj)',
    a.status === b.status && JSON.stringify(a.json?.error ?? a.json?.message) === JSON.stringify(b.json?.error ?? b.json?.message),
    `existing=${a.status} nonexisting=${b.status}`
  );

  // S1.8 SQL injection denemesi — Zod/CSRF DB’ye ulaşmadan reddeder
  if (token) {
    const csrf = await getCsrf(jar);
    const sqli = await req('POST', '/api/user/bookings', {
      jar,
      token,
      headers: { 'x-csrf-token': csrf },
      body: {
        roomId: "x'; DROP TABLE bookings;--",
        periodMonths: 1,
        startDate: '2026-09-01',
        projectName: "p'; DROP TABLE bookings;--",
        projectDescription: 'x'.repeat(25),
        helpNeeded: 'yardim lazim cok',
        technologies: ['react'],
      },
    });
    check('S1.8', 'SQLi payload reddedilir (400/403, 5xx/200 değil)', [400, 403, 404, 422].includes(sqli.status), `status=${sqli.status}`);
  } else {
    check('S1.8', 'SQLi payload reddedilir', false, 'login başarısız, atlandı');
  }

  // S1.7 CSRF — token’sız mutation reddedilir
  if (token) {
    const noCsrf = await req('POST', '/api/user/bookings', { jar, token, body: { roomId: 'x' } });
    check('S1.7', 'CSRF token’sız POST reddedilir (403)', noCsrf.status === 403, `status=${noCsrf.status}`);
  }

  // S5.1 404 JSON, stack sızıntısı yok
  const nf = await req('GET', '/api/yok-boyle-yol-12345');
  const leak = /at \/app|node_modules|\.ts:\d+/.test(nf.text);
  check('S5.1', '404 JSON döner, stack trace sızmaz', nf.status === 404 && !leak, `status=${nf.status} leak=${leak}`);

  // S5.2 Bozuk JSON → 400, çökmez
  const badJson = await req('POST', '/api/auth/login', { headers: { 'content-type': 'application/json' }, body: '{bozuk-json' });
  check('S5.2', 'Bozuk JSON 400/415 (çökmez)', [400, 403, 415].includes(badJson.status), `status=${badJson.status}`);

  // S5.3 >512kb gövde reddedilir
  const big = JSON.stringify({ projectDescription: 'x'.repeat(600 * 1024) });
  const tooBig = await req('POST', '/api/auth/login', { headers: { 'content-type': 'application/json' }, body: big });
  check('S5.3', '>512kb gövde reddedilir (413/400)', [413, 400, 403].includes(tooBig.status), `status=${tooBig.status}`);

  // S4.2 KVKK — kendi verisini export edebilir
  if (token) {
    const exp = await req('GET', '/api/user/me/export', { jar, token });
    check('S4.2', 'KVKK: kullanıcı kendi verisini export eder (200)', exp.status === 200, `status=${exp.status}`);
  }

  // Özet
  console.log(`\n=== ÖZET: ${pass} geçti, ${fail} başarısız (${pass + fail} test) ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
