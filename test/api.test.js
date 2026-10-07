import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nusuk-test-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_EMAIL = 'boss@example.com';
process.env.ADMIN_PASSWORD = 'correct-horse-battery';
process.env.PORT = '0';

let base, server;
before(async () => {
  ({ server } = await import('../server/index.js'));
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const call = async (method, url, body, cookie) => {
  const r = await fetch(base + url, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : await r.text() };
};
const good = { service: 'UEA O.1 Capacity Building', mode: ['Online (Virtual)'], firstName: 'Aisha', lastName: 'Bello', email: 'a@b.ng', phone: '+2348131227047', company: 'Raudah', role: 'CEO' };
let cookie;
const login = async (email = 'boss@example.com', password = 'correct-horse-battery') => {
  const r = await call('POST', '/api/auth/login', { email, password });
  return { r, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
};

test('static site and security headers', async () => {
  const r = await call('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.body, /Beyond Compliance/);
  assert.ok(r.headers.get('content-security-policy'));
  assert.equal((await call('GET', '/img/logo.jpg')).status, 200);
  for (const p of ['/../server/config.js', '/%2e%2e/server/config.js', '/..%2fserver/config.js', '/css/..%2f..%2fpackage.json']) {
    const { status, body } = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: server.address().port, path: p }, res => {
        let b = ''; res.on('data', d => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b }));
      }).on('error', reject);
    });
    assert.ok([403, 404].includes(status), `${p} -> ${status}`);
    assert.doesNotMatch(body, /ADMIN_PASSWORD|"name": "nusuk-consult"/);
  }
});

test('request validation', async () => {
  const r = await call('POST', '/api/requests', { ...good, email: 'nope', mode: [], service: 'x' });
  assert.equal(r.status, 422);
  assert.deepEqual(Object.keys(r.body.errors).sort(), ['em', 'md', 'sv']);
});

test('admin endpoints require auth', async () => {
  for (const u of ['/api/admin/requests', '/api/admin/summary', '/api/admin/users', '/api/admin/requests.csv'])
    assert.equal((await call('GET', u)).status, 401, u);
});

test('login rejects bad credentials, accepts good ones', async () => {
  assert.equal((await login('boss@example.com', 'wrong')).r.status, 401);
  const ok = await login();
  assert.equal(ok.r.status, 200);
  assert.match(ok.r.headers.get('set-cookie'), /HttpOnly.*SameSite=Strict/);
  cookie = ok.cookie;
  assert.equal((await call('GET', '/api/auth/me', null, cookie)).body.user.email, 'boss@example.com');
});

test('service request lifecycle', async () => {
  const sub = await call('POST', '/api/requests', good);
  assert.equal(sub.status, 200);
  const list = await call('GET', '/api/admin/requests', null, cookie);
  assert.equal(list.body.items.length, 1);
  const id = list.body.items[0].id;
  assert.equal(list.body.items[0].status, 'New');
  assert.equal((await call('PATCH', `/api/admin/requests/${id}`, { status: 'Bogus' }, cookie)).status, 422);
  const p = await call('PATCH', `/api/admin/requests/${id}`, { status: 'Contacted', notes: 'called' }, cookie);
  assert.equal(p.body.status, 'Contacted'); assert.equal(p.body.notes, 'called');
  assert.equal((await call('GET', '/api/admin/summary', null, cookie)).body.requests, 1);
  const csv = await call('GET', '/api/admin/requests.csv', null, cookie);
  assert.match(csv.headers.get('content-disposition'), /attachment/);
  assert.match(csv.body, /Aisha/);
  assert.equal((await call('DELETE', `/api/admin/requests/${id}`, null, cookie)).status, 200);
  assert.equal((await call('GET', '/api/admin/requests', null, cookie)).body.items.length, 0);
});

test('CSV neutralises formula injection', async () => {
  await call('POST', '/api/requests', { ...good, company: '=HYPERLINK("http://evil")' });
  const csv = await call('GET', '/api/admin/requests.csv', null, cookie);
  assert.match(csv.body, /"'=HYPERLINK/);
});

test('honeypot silently drops bots', async () => {
  const before = (await call('GET', '/api/admin/requests', null, cookie)).body.items.length;
  assert.equal((await call('POST', '/api/requests', { ...good, website: 'spam.com' })).status, 200);
  assert.equal((await call('GET', '/api/admin/requests', null, cookie)).body.items.length, before);
});

test('bookings, inventory and settings', async () => {
  const b = await call('POST', '/api/bookings', { type: 'eSIM', name: 'Musa', email: 'm@x.ng', phone: '08131227047', details: '5 eSIMs for Umrah group' });
  assert.equal(b.status, 200); assert.match(b.body.reference, /^[0-9A-F]{8}$/);
  const bl = await call('GET', '/api/admin/bookings', null, cookie);
  assert.equal(bl.body.items[0].status, 'Pending');
  assert.equal((await call('PATCH', `/api/admin/bookings/${bl.body.items[0].id}`, { status: 'Ongoing' }, cookie)).body.status, 'Ongoing');

  const h = await call('POST', '/api/admin/hotels', { name: 'Hilton Makkah', city: 'Makkah', stars: '5', roomType: 'Double' }, cookie);
  assert.equal(h.body.name, 'Hilton Makkah');
  const u = await call('PUT', `/api/admin/hotels/${h.body.id}`, { name: 'Hilton Makkah', city: 'Makkah', stars: '5', roomType: 'Suite' }, cookie);
  assert.equal(u.body.roomType, 'Suite');
  assert.equal((await call('POST', '/api/admin/hotels', { city: 'x' }, cookie)).status, 422);
  assert.equal((await call('DELETE', `/api/admin/hotels/${h.body.id}`, null, cookie)).status, 200);

  assert.equal((await call('PUT', '/api/admin/settings', { brochures: { 2: 'javascript:alert(1)' } }, cookie)).status, 422);
  await call('PUT', '/api/admin/settings', { brochures: { 2: 'https://example.com/b.pdf' }, youtube: { 1: 'https://youtu.be/x' } }, cookie);
  const pub = await call('GET', '/api/public-settings');
  assert.equal(pub.body.brochures[2], 'https://example.com/b.pdf');
});

test('users: staff role is restricted, last admin protected, password change revokes sessions', async () => {
  const created = await call('POST', '/api/admin/users', { name: 'Staffer', email: 'staff@example.com', role: 'staff', password: 'a-long-password' }, cookie);
  assert.equal(created.status, 200);
  assert.equal((await call('POST', '/api/admin/users', { name: 'x', email: 'staff@example.com', role: 'staff', password: 'a-long-password' }, cookie)).status, 422);
  assert.equal((await call('POST', '/api/admin/users', { name: 'x', email: 'y@example.com', role: 'staff', password: 'short' }, cookie)).status, 422);

  const s = await login('staff@example.com', 'a-long-password');
  assert.equal(s.r.status, 200);
  assert.equal((await call('GET', '/api/admin/requests', null, s.cookie)).status, 200);
  assert.equal((await call('GET', '/api/admin/users', null, s.cookie)).status, 403);
  assert.equal((await call('PUT', '/api/admin/settings', {}, s.cookie)).status, 403);

  const staffId = created.body.items.find(u => u.email === 'staff@example.com').id;
  const adminId = created.body.items.find(u => u.email === 'boss@example.com').id;
  assert.equal((await call('PUT', `/api/admin/users/${adminId}`, { name: 'A', email: 'boss@example.com', role: 'staff' }, cookie)).status, 422);
  assert.equal((await call('DELETE', `/api/admin/users/${adminId}`, null, cookie)).status, 422);
  await call('PUT', `/api/admin/users/${staffId}`, { name: 'Staffer', email: 'staff@example.com', role: 'staff', password: 'another-long-one' }, cookie);
  assert.equal((await call('GET', '/api/auth/me', null, s.cookie)).body.user, null);
  assert.equal((await call('DELETE', `/api/admin/users/${staffId}`, null, cookie)).status, 200);
});

test('logout invalidates the session; cross-origin writes are blocked', async () => {
  const x = await fetch(base + '/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(good) });
  assert.equal(x.status, 403);
  const { cookie: c } = await login();
  await call('POST', '/api/auth/logout', null, c);
  assert.equal((await call('GET', '/api/admin/summary', null, c)).status, 401);
});

test('login is rate limited', async () => {
  let last;
  for (let i = 0; i < 10; i++) last = (await login('boss@example.com', 'bad' + i)).r.status;
  assert.equal(last, 429);
});

test('works when mounted under BASE_PATH', async () => {
  const { spawn } = await import('node:child_process');
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nusuk-bp-'));
  const port = 3900 + Math.floor(Math.random() * 90);
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: d2, BASE_PATH: '/nusuk', ADMIN_PASSWORD: 'correct-horse-battery' }, stdio: 'ignore' });
  try {
    const b = `http://127.0.0.1:${port}/nusuk`;
    for (let i = 0; i < 30; i++) { try { await fetch(b + '/api/health'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    const redirect = await fetch(b, { redirect: 'manual' });
    assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('location'), '/nusuk/');
    assert.equal((await fetch(b + '/')).status, 200);
    assert.equal((await fetch(b + '/css/style.css')).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 404);
    const l = await fetch(b + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'boss@example.com', password: 'correct-horse-battery' }) });
    assert.equal(l.status, 200);
    assert.match(l.headers.get('set-cookie'), /Path=\/nusuk;/);
  } finally { child.kill(); fs.rmSync(d2, { recursive: true, force: true }); }
});
