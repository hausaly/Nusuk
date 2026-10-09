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
process.env.PAYMENT_SIMULATION = '1';
delete process.env.PAYSTACK_SECRET_KEY;

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
  for (const u of ['/api/admin/requests', '/api/admin/summary', '/api/admin/users', '/api/admin/requests.csv', '/api/admin/orders', '/api/admin/hotels', '/api/admin/hotels-template.xlsx'])
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

test('settings and public links', async () => {
  assert.equal((await call('PUT', '/api/admin/settings', { brochures: { 2: 'javascript:alert(1)' } }, cookie)).status, 422);
  await call('PUT', '/api/admin/settings', { brochures: { 2: 'https://example.com/b.pdf' }, youtube: { 1: 'https://youtu.be/x' } }, cookie);
  assert.equal((await call('PUT', '/api/admin/settings', { fxRate: 'abc' }, cookie)).status, 422);
  assert.equal((await call('PUT', '/api/admin/settings', { fxRate: '-5' }, cookie)).status, 422);
  await call('PUT', '/api/admin/settings', { brochures: { 2: 'https://example.com/b.pdf' }, youtube: { 1: 'https://youtu.be/x' }, fxRate: '412.456' }, cookie);
  assert.equal((await call('GET', '/api/public-settings')).body.fxRate, 412.46);
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
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);   // prefix already stripped by host
    const l = await fetch(b + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'boss@example.com', password: 'correct-horse-battery' }) });
    assert.equal(l.status, 200);
    assert.match(l.headers.get('set-cookie'), /Path=\/nusuk;/);
  } finally { child.kill(); fs.rmSync(d2, { recursive: true, force: true }); }
});

// ================= DIY booking =================
const dayStr = n => { const d = new Date(Date.now() + n * 86400000); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(d); };
const hotelRow = (o = {}) => ({ name: 'Test Hotel', city: 'Makkah', address: 'Ajyad Rd', distanceM: 300, stars: 4, roomType: 'Double Room', capacity: 3, facilities: 'Wi-Fi, Breakfast', cost: 100, currency: 'SAR', markupPct: 10, markupFixed: 1000, ...o });
let hotelId;

test('hotel inventory: CRUD, validation and pricing', async () => {
  assert.equal((await call('POST', '/api/admin/hotels', hotelRow({ city: 'Lagos' }), cookie)).status, 422);
  assert.equal((await call('POST', '/api/admin/hotels', hotelRow({ cost: 0 }), cookie)).status, 422);
  const c = await call('POST', '/api/admin/hotels', hotelRow(), cookie);
  assert.equal(c.status, 200); hotelId = c.body.id; assert.deepEqual(c.body.facilities, ['Wi-Fi', 'Breakfast']);
  await call('POST', '/api/admin/hotels', hotelRow({ name: 'Cheap Inn', cost: 50, markupPct: 0, markupFixed: 0, distanceM: 900 }), cookie);
  await call('POST', '/api/admin/hotels', hotelRow({ name: 'Naira Hotel', cost: 20000, currency: 'NGN', markupPct: 5, markupFixed: 0 }), cookie);
  await call('POST', '/api/admin/hotels', hotelRow({ name: 'Madinah Stay', city: 'Madinah' }), cookie);
  await call('POST', '/api/admin/hotels', hotelRow({ name: 'Inactive', active: false, cost: 1 }), cookie);
  await call('POST', '/api/admin/hotels', hotelRow({ name: 'Seasonal', cost: 10, validFrom: dayStr(100), validTo: dayStr(120) }), cookie);
  const u = await call('PUT', `/api/admin/hotels/${hotelId}`, { distanceM: 250 }, cookie);
  assert.equal(u.body.distanceM, 250); assert.equal(u.body.name, 'Test Hotel');
});

test('hotel search: restricted cities, sorted by lowest price, FX-aware, validity & capacity', async () => {
  const q = (o = {}) => new URLSearchParams({ city: 'Makkah', checkIn: dayStr(10), checkOut: dayStr(13), adults: 2, children: 0, rooms: 1, ...o });
  assert.equal((await call('GET', '/api/hotels/search?' + q({ city: 'Dubai' }))).status, 422);
  assert.equal((await call('GET', '/api/hotels/search?' + q({ checkIn: dayStr(-3), checkOut: dayStr(2) }))).status, 422);
  assert.equal((await call('GET', '/api/hotels/search?' + q({ checkOut: dayStr(10) }))).status, 422);
  // No FX rate → SAR rates are hidden, NGN rate shows
  await call('PUT', '/api/admin/settings', { fxRate: '', markupPct: '0', markupFixed: '0' }, cookie);
  let r = await call('GET', '/api/hotels/search?' + q());
  assert.deepEqual(r.body.results.map(h => h.name), ['Naira Hotel']);
  assert.equal(r.body.results[0].total, 21000 * 3);
  await call('PUT', '/api/admin/settings', { fxRate: '400', markupPct: '10', markupFixed: '0' }, cookie);
  r = await call('GET', '/api/hotels/search?' + q());
  const names = r.body.results.map(h => h.name);
  assert.deepEqual(names, ['Cheap Inn', 'Naira Hotel', 'Test Hotel']);      // ₦20,000 < ₦21,000 < ₦45,000 per night
  assert.ok(r.body.results.every((h, i, a) => i === 0 || a[i - 1].total <= h.total), 'ascending by total');
  const test = r.body.results.find(h => h.name === 'Test Hotel');
  assert.equal(test.perNight, Math.round(100 * 400 * 1.1 + 1000)); assert.equal(test.nights, 3); assert.equal(test.total, test.perNight * 3);
  assert.match(test.distance, /250 m to Masjid Al-Haram/);
  r = await call('GET', '/api/hotels/search?' + q({ city: 'Madinah' }));
  assert.deepEqual(r.body.results.map(h => h.name), ['Madinah Stay']); assert.match(r.body.results[0].distance, /Al-Masjid An-Nabawi/);
  r = await call('GET', '/api/hotels/search?' + q({ rooms: 2, adults: 2 }));
  assert.equal(r.body.results.find(h => h.name === 'Test Hotel').total, test.perNight * 3 * 2);
  r = await call('GET', '/api/hotels/search?' + q({ adults: 4, children: 0 }));        // capacity 3 per room → needs 2 rooms
  assert.ok(!r.body.results.some(h => h.name === 'Test Hotel'));
  r = await call('GET', '/api/hotels/search?' + q({ checkIn: dayStr(101), checkOut: dayStr(103) }));
  assert.ok(r.body.results.some(h => h.name === 'Seasonal')); 
});

test('hotel order → simulated payment → slip', async () => {
  const stay = { city: 'Makkah', checkIn: dayStr(10), checkOut: dayStr(12), adults: 2, children: 1, rooms: 1 };
  const customer = { fullName: 'Aisha Bello', phone: '+2348131227047', email: 'aisha@example.com', address: '12 Kano Road' };
  assert.equal((await call('POST', '/api/orders/hotel', { ...stay, hotelId, customer: { ...customer, email: 'bad' } })).status, 422);
  assert.equal((await call('POST', '/api/orders/hotel', { ...stay, hotelId: 'nope', customer })).status, 409);
  const o = await call('POST', '/api/orders/hotel', { ...stay, hotelId, customer, amount: 1 /* client price must be ignored */ });
  assert.equal(o.status, 200); assert.match(o.body.bookingId, /^NC-H-[A-Z0-9]{6}$/);
  const quote = (await call('GET', '/api/hotels/search?' + new URLSearchParams(stay))).body.results.find(h => h.id === hotelId);
  const slip0 = await call('GET', `/api/orders/${o.body.bookingId}/slip?t=${o.body.token}`);
  assert.equal(slip0.body.order.amount, quote.total); assert.equal(slip0.body.order.paymentStatus, 'unpaid');
  assert.equal((await call('GET', `/api/orders/${o.body.bookingId}/slip?t=wrong`)).status, 404);
  // unpaid → simulated Paystack page → callback
  const ref = new URL(o.body.authorizationUrl).searchParams.get('reference');
  const page = await fetch(o.body.authorizationUrl); assert.equal(page.status, 200); assert.match(await page.text(), /TEST MODE/);
  let cb = await fetch(`${base}/pay/callback?reference=${ref}`, { redirect: 'manual' });          // cancelled
  assert.equal(cb.status, 302); assert.equal((await call('GET', `/api/orders/${o.body.bookingId}/slip?t=${o.body.token}`)).body.order.paymentStatus, 'unpaid');
  const retry = await call('POST', `/api/orders/${o.body.bookingId}/pay?t=${o.body.token}`, {});
  assert.match(retry.body.authorizationUrl, /reference=NC-H-[A-Z0-9]{6}-2/);
  const ref2 = new URL(retry.body.authorizationUrl).searchParams.get('reference');
  cb = await fetch(`${base}/pay/callback?reference=${ref2}&sim=ok`, { redirect: 'manual' });
  assert.match(cb.headers.get('location'), new RegExp(`#/slip/${o.body.bookingId}/${o.body.token}$`));
  const slip = (await call('GET', `/api/orders/${o.body.bookingId}/slip?t=${o.body.token}`)).body.order;
  assert.equal(slip.paymentStatus, 'paid'); assert.equal(slip.status, 'Pending'); assert.equal(slip.details.hotelName, 'Test Hotel'); assert.ok(!('token' in slip));
  const list = await call('GET', '/api/admin/orders', null, cookie);
  assert.equal(list.body.items.find(x => x.bookingId === o.body.bookingId).paymentStatus, 'paid');
  assert.equal((await call('PATCH', `/api/admin/orders/${list.body.items[0].id}`, { status: 'Fulfilled', notes: 'voucher sent' }, cookie)).body.status, 'Fulfilled');
  assert.equal((await call('PATCH', `/api/admin/orders/${list.body.items[0].id}`, { status: 'Bogus' }, cookie)).status, 422);
  assert.ok((await call('GET', '/api/admin/summary', null, cookie)).body.revenue >= quote.total);
});

test('payment connection check is admin-only and explains a missing key', async () => {
  assert.equal((await call('GET', '/api/admin/payments/check')).status, 401);
  const r = await call('GET', '/api/admin/payments/check', null, cookie);
  assert.equal(r.status, 200); assert.equal(r.body.ok, false); assert.match(r.body.message, /Test mode|PAYSTACK_SECRET_KEY/);
});

test('payment webhook requires a valid Paystack signature and a matching amount', async () => {
  const stay = { city: 'Makkah', checkIn: dayStr(20), checkOut: dayStr(21), adults: 1, children: 0, rooms: 1 };
  const o = await call('POST', '/api/orders/hotel', { ...stay, hotelId, customer: { fullName: 'Musa Ibrahim', phone: '08131227047', email: 'm@example.com', address: 'Biu' } });
  const ref = new URL(o.body.authorizationUrl).searchParams.get('reference');
  const amount = (await call('GET', `/api/orders/${o.body.bookingId}/slip?t=${o.body.token}`)).body.order.amount;
  const crypto = await import('node:crypto');
  const send = (body, key) => fetch(base + '/api/paystack/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': crypto.createHmac('sha512', key).update(body).digest('hex') }, body });
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_x';
  try {
    assert.equal((await send(JSON.stringify({ event: 'charge.success', data: { reference: ref, amount, currency: 'NGN' } }), 'wrong-key')).status, 401);
    await send(JSON.stringify({ event: 'charge.success', data: { reference: ref, amount: 1, currency: 'NGN' } }), 'sk_test_x');            // wrong amount (kobo)
    assert.equal((await call('GET', `/api/orders/${o.body.bookingId}/slip?t=${o.body.token}`)).body.order.paymentStatus, 'unpaid');
    assert.equal((await send(JSON.stringify({ event: 'charge.success', data: { reference: ref, amount: amount * 100, currency: 'NGN', channel: 'card' } }), 'sk_test_x')).status, 200);
    assert.equal((await call('GET', `/api/orders/${o.body.bookingId}/slip?t=${o.body.token}`)).body.order.paymentStatus, 'paid');
  } finally { delete process.env.PAYSTACK_SECRET_KEY; }
});

test('HHR train and transfer requests', async () => {
  const cust = { fullName: 'Hauwa Musa', phone: '+2348131227047', email: 'h@example.com' };
  assert.equal((await call('POST', '/api/orders/train', { from: 'Makkah', to: 'Makkah', date: dayStr(5), adults: 1, children: 0, ...cust })).status, 422);
  assert.equal((await call('POST', '/api/orders/train', { from: 'Madinah', to: 'KAEC', date: dayStr(5), adults: 1, ...cust })).status, 422);
  const t = await call('POST', '/api/orders/train', { from: 'Makkah', to: 'Airport - Jeddah', date: dayStr(5), time: '09:30', adults: 2, children: 1, ...cust });
  assert.equal(t.status, 200); assert.match(t.body.bookingId, /^NC-T-/);
  assert.equal((await call('POST', '/api/orders/transfer', { pickup: 'Jeddah Airport', dropoff: 'Makkah', date: dayStr(5), time: '25:00', vehicle: 'sedan', quantity: 1, ...cust })).status, 422);
  assert.equal((await call('POST', '/api/orders/transfer', { pickup: 'Jeddah Airport', dropoff: 'Makkah', date: dayStr(5), time: '10:00', vehicle: 'rocket', quantity: 1, ...cust })).status, 422);
  const r = await call('POST', '/api/orders/transfer', { pickup: 'Jeddah Airport (JED)', dropoff: 'Makkah hotel', date: dayStr(5), time: '10:00', vehicle: 'coaster', quantity: 2, notes: 'EK123', ...cust });
  assert.equal(r.status, 200); assert.match(r.body.bookingId, /^NC-R-/);
  const slip = (await call('GET', `/api/orders/${r.body.bookingId}/slip?t=${r.body.token}`)).body.order;
  assert.equal(slip.details.vehicle, 'Coaster'); assert.equal(slip.details.capacity, '18 Pax + 25 Luggage'); assert.equal(slip.status, 'Pending');
  const cfg = (await call('GET', '/api/booking-config')).body;
  assert.deepEqual(cfg.stations, ['Makkah', 'Al-Sulimaniyah - Jeddah', 'Airport - Jeddah', 'KAEC']);
  assert.deepEqual(cfg.vehicles.map(v => v.name), ['Sedan', 'SUV', 'GMC', 'HiAce', 'Coaster', 'Bus']);
  const csv = await call('GET', '/api/admin/orders.csv', null, cookie); assert.match(csv.body, /NC-T-/);
});

test('bulk upload: xlsx + csv, mark-up applied, upsert, bad rows reported', async () => {
  const { writeXlsx } = await import('../server/xlsx.js');
  const rows = [['hotel_name', 'city', 'address', 'distance_m', 'stars', 'facilities', 'room_type', 'rate_per_night', 'currency', 'capacity', 'valid_from', 'markup_pct'],
    ['Bulk One', 'Makkah', 'Addr 1', 150, 5, 'Wi-Fi; Pool', 'Suite', 800, 'SAR', 2, '', ''],
    ['Bulk Two', 'Madinah', '', 400, 3, '', 'Quad', 250, 'SAR', 4, '', 20],
    ['Bad City', 'Dubai', '', '', '', '', 'Room', 100, 'SAR', '', '', ''],
    ['No Rate', 'Makkah', '', '', '', '', 'Room', '', 'SAR', '', '', '']];
  const post = (buf, extra = {}) => call('POST', '/api/admin/hotels/import', { filename: 'f', data: buf.toString('base64'), markupPct: '15', markupFixed: '0', ...extra }, cookie);
  const r = await post(writeXlsx(rows));
  assert.equal(r.status, 200); assert.equal(r.body.created, 2); assert.equal(r.body.skipped, 2); assert.equal(r.body.errors[0].row, 4);
  const inv = (await call('GET', '/api/admin/hotels', null, cookie)).body.items;
  assert.equal(inv.find(h => h.name === 'Bulk One').markupPct, 15);      // upload mark-up applied
  assert.equal(inv.find(h => h.name === 'Bulk Two').markupPct, 20);      // row's own mark-up wins
  assert.deepEqual(inv.find(h => h.name === 'Bulk One').facilities, ['Wi-Fi', 'Pool']);
  const again = await post(writeXlsx(rows), { markupPct: '30' });
  assert.equal(again.body.created, 0); assert.equal(again.body.updated, 2);                 // upsert, no duplicates
  const csv = await post(Buffer.from('hotel_name,city,room_type,rate_per_night,currency\nCsv Hotel,Makkah,Single,300,NGN\n'));
  assert.equal(csv.body.created, 1);
  assert.equal((await post(Buffer.from('a,b\n1,2\n'))).status, 422);                       // missing columns
  assert.equal((await call('POST', '/api/admin/hotels/import', { data: 'AAAA' }, cookie)).status, 422);   // not a spreadsheet
  const tpl = await fetch(base + '/api/admin/hotels-template.xlsx', { headers: { Cookie: cookie } });
  assert.equal(tpl.status, 200); assert.match(tpl.headers.get('content-type'), /spreadsheetml/);
});

test('hotel image and original-offer PDF uploads are validated and stored', async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  assert.equal((await call('POST', `/api/admin/hotels/${hotelId}/image`, { data: Buffer.from('not an image').toString('base64') }, cookie)).status, 422);
  const im = await call('POST', `/api/admin/hotels/${hotelId}/image`, { data: png.toString('base64') }, cookie);
  assert.match(im.body.imageUrl, /^api\/media\/[a-f0-9]{16}\.png$/);
  assert.equal((await fetch(base + '/' + im.body.imageUrl)).status, 200);
  assert.equal((await fetch(base + '/api/media/..%2f..%2fnusuk.db')).status, 404);
  assert.equal((await call('POST', `/api/admin/hotels/${hotelId}/offer`, { data: Buffer.from('nope').toString('base64') }, cookie)).status, 422);
  const pdf = await call('POST', `/api/admin/hotels/${hotelId}/offer`, { filename: 'offer.pdf', data: Buffer.from('%PDF-1.4\n%test').toString('base64') }, cookie);
  assert.match(pdf.body.offerPdf, /^[a-f0-9]{16}\.pdf$/);
  assert.equal((await fetch(base + '/api/admin/offers/' + pdf.body.offerPdf)).status, 401);          // offers are private
  assert.equal((await fetch(base + '/api/admin/offers/' + pdf.body.offerPdf, { headers: { Cookie: cookie } })).status, 200);
});

test('manual payment mode (no Paystack): reservation → pending slip → admin marks paid', async () => {
  process.env.PAYMENT_SIMULATION = '0';
  try {
    assert.equal((await call('GET', '/api/booking-config')).body.payment, 'off');
    const stay = { city: 'Makkah', checkIn: dayStr(30), checkOut: dayStr(32), adults: 2, children: 0, rooms: 1 };
    const customer = { fullName: 'Zainab Yusuf', phone: '+2348131227047', email: 'z@example.com', address: 'Maiduguri' };
    const o = await call('POST', '/api/orders/hotel', { ...stay, hotelId, customer });
    assert.equal(o.status, 200); assert.equal(o.body.manual, true); assert.ok(!o.body.authorizationUrl);
    const slip = (await call('GET', `/api/orders/${o.body.bookingId}/slip?t=${o.body.token}`)).body.order;
    assert.equal(slip.paymentStatus, 'unpaid'); assert.equal(slip.status, 'Awaiting payment'); assert.equal(slip.payment.mode, 'manual');
    assert.equal((await call('POST', `/api/orders/${o.body.bookingId}/pay?t=${o.body.token}`, {})).status, 409);   // no online payment in manual mode
    const row = (await call('GET', '/api/admin/orders', null, cookie)).body.items.find(x => x.bookingId === o.body.bookingId);
    assert.equal((await call('PATCH', `/api/admin/orders/${row.id}`, { paymentStatus: 'refunded' }, cookie)).status, 422);
    const paid = await call('PATCH', `/api/admin/orders/${row.id}`, { paymentStatus: 'paid' }, cookie);
    assert.equal(paid.body.paymentStatus, 'paid'); assert.equal(paid.body.status, 'Pending'); assert.ok(paid.body.payment.paidAt);
    assert.equal((await call('GET', `/api/orders/${o.body.bookingId}/slip?t=${o.body.token}`)).body.order.paymentStatus, 'paid');
    const train = (await call('GET', '/api/admin/orders', null, cookie)).body.items.find(x => x.type === 'train');
    assert.equal((await call('PATCH', `/api/admin/orders/${train.id}`, { paymentStatus: 'paid' }, cookie)).status, 422);   // only hotel orders carry payment
    assert.equal((await call('PATCH', `/api/admin/orders/${row.id}`, { paymentStatus: 'unpaid' }, cookie)).body.paymentStatus, 'unpaid');
  } finally { process.env.PAYMENT_SIMULATION = '1'; }
});

test('featured offers: flagged hotels first, max 3, one card per hotel', async () => {
  const list = (await call('GET', '/api/admin/hotels', null, cookie)).body.items;
  const target = list.find(h => h.name === 'Madinah Stay');
  assert.equal((await call('PUT', `/api/admin/hotels/${target.id}`, { featured: true }, cookie)).body.featured, true);
  const r = await call('GET', '/api/hotels/featured');
  assert.equal(r.status, 200); assert.ok(r.body.items.length >= 1 && r.body.items.length <= 3);
  assert.equal(r.body.items[0].name, 'Madinah Stay'); assert.equal(r.body.items[0].featured, true);
  assert.equal(new Set(r.body.items.map(i => i.name)).size, r.body.items.length);
  assert.ok(r.body.items.every(i => i.perNight > 0 && !('cost' in i)));          // price only, never the supplier cost
});

test('eSIM inventory is gone', async () => {
  assert.equal((await call('GET', '/api/admin/esims', null, cookie)).status, 404);
  assert.ok(!('esims' in (await call('GET', '/api/admin/summary', null, cookie)).body));
});

test('build number is consistent (cache-busting): config, index.html, app.js, /api/health', async () => {
  const { BUILD } = await import('../server/config.js');
  const idx = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.match(idx, new RegExp(`css/style\\.css\\?v=${BUILD}`)); assert.match(idx, new RegExp(`js/app\\.js\\?v=${BUILD}`)); assert.match(idx, new RegExp(`Build ${BUILD}`));
  assert.match(app, new RegExp(`const BUILD='${BUILD}'`));
  assert.equal((await call('GET', '/api/health')).body.build, BUILD);
});

test('brochure link for service 7 (Umrah Agent Bootcamp) is configurable and public', async () => {
  const put = (b) => call('PUT', '/api/admin/settings', { fxRate: '400', markupPct: '10', markupFixed: '0', ...b }, cookie);
  assert.equal((await put({ brochures: { 7: 'javascript:alert(1)' } })).status, 422);
  assert.equal((await put({ brochures: { 7: 'https://example.com/bootcamp.pdf' } })).status, 200);
  assert.equal((await call('GET', '/api/public-settings')).body.brochures[7], 'https://example.com/bootcamp.pdf');
});
