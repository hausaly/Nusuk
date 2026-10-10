import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { records, settings, db } from './db.js';
import { config } from './config.js';
import { parseStay, quoteHotel, searchHotels, featuredHotels, normalizeHotel, parseRatesFile, upsertHotels, templateXlsx, validDate, today, CITIES } from './hotels.js';

export const STATIONS = ['Makkah', 'Madinah', 'Al-Sulimaniyah - Jeddah', 'Airport - Jeddah', 'KAEC'];
export const VEHICLES = [
  { id: 'sedan', name: 'Sedan', cap: '3 Pax + 2 Luggage + 1 Hand carry' },
  { id: 'suv', name: 'SUV', cap: '5 Pax + 4 Luggage + 2 Hand carry' },
  { id: 'gmc', name: 'GMC', cap: '7 Pax + 6 Luggage + 3 Hand carry' },
  { id: 'hiace', name: 'HiAce', cap: '10 Pax + 15 Luggage' },
  { id: 'coaster', name: 'Coaster', cap: '18 Pax + 25 Luggage' },
  { id: 'bus', name: 'Bus', cap: '45 Pax + 40 Luggage' },
];
export const ORDER_STATUSES = ['Awaiting payment', 'Pending', 'Fulfilled', 'Cancelled'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, PHONE = /^\+?[0-9\s\-()]{7,18}$/;
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const intIn = (v, lo, hi, d) => { const n = Math.round(Number(v ?? d)); return Number.isFinite(n) && n >= lo && n <= hi ? n : NaN; };
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rand = n => Array.from(crypto.randomBytes(n), b => ALPHA[b % ALPHA.length]).join('');
const bookingId = t => { for (;;) { const id = `NC-${t}-${rand(6)}`; if (!db.prepare("SELECT 1 FROM records WHERE collection='orders' AND json_extract(data,'$.bookingId')=?").get(id)) return id; } };
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Umrah visa fees (₦) set in Dashboard → Settings. Blank child/infant fee = same as the adult fee. */
export const visaFees = () => {
  const v = settings.all().visa || {}, n = x => (Number(x) > 0 ? Number(x) : 0), opt = x => (x === '' || x == null ? null : n(x));
  const adult = n(v.adult);
  return { adult, child: opt(v.child) ?? adult, infant: opt(v.infant) ?? adult, service: n(v.service) };
};
export const visaQuote = (adults, children, infants) => {
  const f = visaFees(), visa = adults * f.adult + children * f.child + infants * f.infant;
  return { fees: f, priced: f.adult > 0, visaTotal: visa, total: f.adult > 0 ? visa + f.service : 0 };
};

export const paymentMode = () => (process.env.PAYSTACK_SECRET_KEY ? 'paystack' : process.env.PAYMENT_SIMULATION === '1' ? 'simulation' : 'off');

function customerOf(b = {}) {
  const c = { fullName: str(b.fullName, 120), phone: str(b.phone, 30), email: str(b.email, 120).toLowerCase(), address: str(b.address, 250) };
  const e = {};
  if (c.fullName.length < 2) e.fullName = 'Full name is required.';
  if (!PHONE.test(c.phone)) e.phone = 'Enter a valid WhatsApp / mobile number.';
  if (!EMAIL.test(c.email)) e.email = 'Enter a valid email address.';
  return { c, e };
}

export function registerBooking(k) {
  const { route, HttpError, must, fail, A, ADMIN, limit, notify, publicUrl } = k;
  const publicOrder = o => ({ bookingId: o.bookingId, type: o.type, status: o.status, paymentStatus: o.paymentStatus, amount: o.amount, currency: o.currency, customer: o.customer, details: o.details, payment: { reference: o.payment?.reference, paidAt: o.payment?.paidAt, channel: o.payment?.channel, mode: o.payment?.provider }, createdAt: o.createdAt });
  const byId = id => { const r = db.prepare("SELECT id FROM records WHERE collection='orders' AND json_extract(data,'$.bookingId')=?").get(String(id)); return r && records.get('orders', r.id); };
  const byRef = ref => { const r = db.prepare("SELECT id FROM records WHERE collection='orders' AND json_extract(data,'$.payment.reference')=?").get(String(ref)); return r && records.get('orders', r.id); };

  // ---------- public: config + search ----------
  route('GET', '/api/booking-config', () => ({ stations: STATIONS, vehicles: VEHICLES, cities: CITIES, visa: visaFees(), payment: paymentMode(), today: today() }));
  route('GET', '/api/hotels/search', ({ req }) => {
    limit(req, 'search', 120, 10 * 60e3);
    const u = new URL(req.url, 'http://x'); const q = Object.fromEntries(u.searchParams);
    const s = must(parseStay(q));
    return { stay: s, results: searchHotels(s) };
  });
  route('GET', '/api/hotels/featured', ({ req }) => { limit(req, 'search', 120, 10 * 60e3); return { items: featuredHotels(3) }; });
  route('GET', '/api/media/:file', ({ params }) => {
    if (!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(params.file)) throw new HttpError(404, 'Not found');
    const p = path.join(config.dataDir, 'media', params.file);
    if (!fs.existsSync(p)) throw new HttpError(404, 'Not found');
    return { file: fs.readFileSync(p), type: { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[params.file.split('.')[1]], cache: 'public, max-age=86400', inline: true };
  });

  // ---------- public: create orders ----------
  async function initPayment(o, req) {
    const mode = paymentMode();
    if (mode === 'off') throw new HttpError(503, 'Online payment is not available yet. Please contact us to complete your booking.');
    const attempts = (o.payment?.attempts || 0) + 1;
    const reference = attempts === 1 ? o.bookingId : `${o.bookingId}-${attempts}`;
    const base = publicUrl(req);
    let url;
    if (mode === 'simulation') url = `${base}/pay/simulate?reference=${encodeURIComponent(reference)}`;
    else {
      let r, j;
      try {
        r = await fetch('https://api.paystack.co/transaction/initialize', {
          method: 'POST', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: o.customer.email, amount: Math.round(o.amount * 100), currency: 'NGN', reference, callback_url: `${base}/pay/callback`, metadata: { bookingId: o.bookingId, customer: o.customer.fullName, custom_fields: [{ display_name: 'Booking ID', variable_name: 'booking_id', value: o.bookingId }] } }),
        });
        j = await r.json();
      } catch { throw new HttpError(502, 'Could not reach the payment provider. Please try again.'); }
      if (!r.ok || !j.status) throw new HttpError(502, 'The payment provider rejected the request. Please try again.');
      url = j.data.authorization_url;
    }
    records.update('orders', o.id, { payment: { ...(o.payment || {}), provider: mode, reference, attempts } });
    return url;
  }

  route('POST', '/api/orders/hotel', async ({ req, body }) => {
    limit(req, 'order', 20, 60 * 60e3);
    const stay = must(parseStay(body));
    const q = quoteHotel(String(body.hotelId || ''), stay);
    if (!q) throw new HttpError(409, 'Sorry, this room is no longer available for your dates. Please search again.');
    const { c, e } = customerOf(body.customer); if (c.address.length < 3) e.address = 'Address is required.';
    if (Object.keys(e).length) fail(e);
    const o = records.create('orders', {
      type: 'hotel', bookingId: bookingId('H'), token: crypto.randomBytes(18).toString('base64url'), status: 'Awaiting payment', paymentStatus: 'unpaid',
      amount: q.total, currency: 'NGN', customer: c, notes: '', payment: { provider: paymentMode() === 'off' ? 'manual' : paymentMode(), reference: null, attempts: 0 },
      details: { hotelId: q.id, hotelName: q.name, city: q.city, address: q.address, distance: q.distance, stars: q.stars, facilities: q.facilities, roomType: q.roomType, checkIn: stay.checkIn, checkOut: stay.checkOut, nights: stay.nights, rooms: stay.rooms, adults: stay.adults, children: stay.children, perNight: q.perNight },
    });
    if (paymentMode() === 'off') {      // manual payment: reservation first, our team collects payment
      notify('hotel reservation (payment pending)', { service: `${o.details.hotelName} · ${o.details.checkIn} → ${o.details.checkOut} · ₦${o.amount.toLocaleString('en-NG')}`, name: o.customer.fullName, email: o.customer.email, phone: o.customer.phone });
      return { bookingId: o.bookingId, token: o.token, manual: true };
    }
    const authorizationUrl = await initPayment(o, req);
    return { bookingId: o.bookingId, token: o.token, authorizationUrl };
  });

  route('POST', '/api/orders/:id/pay', async ({ req, params }) => {
    limit(req, 'order', 20, 60 * 60e3);
    const t = new URL(req.url, 'http://x').searchParams.get('t') || '';
    const o = byId(params.id);
    if (!o || !safeEq(o.token, t)) throw new HttpError(404, 'Booking not found');
    if (o.type !== 'hotel' || o.paymentStatus === 'paid' || o.status === 'Cancelled' || o.payment?.provider === 'manual') throw new HttpError(409, 'Online payment is not available for this booking. Our team will contact you.');
    return { authorizationUrl: await initPayment(o, req) };
  });

  route('POST', '/api/orders/train', async ({ req, body }) => {
    limit(req, 'order', 20, 60 * 60e3);
    if (body.website) return { ok: true };
    const e = {}, from = str(body.from), to = str(body.to), date = str(body.date, 10), time = str(body.time, 5);
    const adults = intIn(body.adults, 1, 50, 1), children = intIn(body.children, 0, 50, 0);
    if (!STATIONS.includes(from)) e.from = 'Choose the departure station.';
    if (!STATIONS.includes(to)) e.to = 'Choose the arrival station.';
    if (STATIONS.includes(from) && from === to) e.to = 'Departure and arrival must be different.';
    if (!validDate(date) || date < today()) e.date = 'Choose a travel date (today or later).';
    if (Number.isNaN(adults)) e.adults = 'Adults must be 1–50.'; if (Number.isNaN(children)) e.children = 'Children must be 0–50.';
    const { c, e: ce } = customerOf(body); Object.assign(e, ce);
    if (Object.keys(e).length) fail(e);
    const o = records.create('orders', { type: 'train', bookingId: bookingId('T'), token: crypto.randomBytes(18).toString('base64url'), status: 'Pending', paymentStatus: 'n/a', amount: 0, currency: 'NGN', customer: { fullName: c.fullName, phone: c.phone, email: c.email, address: '' }, notes: '', payment: {}, details: { service: 'HHR Train (one-way)', from, to, date, time, adults, children } });
    notify('HHR Train request', { service: `${from} → ${to} · ${date}`, name: c.fullName, email: c.email, phone: c.phone });
    return { bookingId: o.bookingId, token: o.token };
  });

  route('POST', '/api/orders/transfer', async ({ req, body }) => {
    limit(req, 'order', 20, 60 * 60e3);
    if (body.website) return { ok: true };
    const e = {}, pickup = str(body.pickup, 150), dropoff = str(body.dropoff, 150), date = str(body.date, 10), time = str(body.time, 5), notes = str(body.notes, 500);
    const vehicle = VEHICLES.find(v => v.id === body.vehicle), qty = intIn(body.quantity, 1, 50, 1);
    if (pickup.length < 2) e.pickup = 'Enter the pick-up location.'; if (dropoff.length < 2) e.dropoff = 'Enter the drop-off location.';
    if (!validDate(date) || date < today()) e.date = 'Choose a date (today or later).';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) e.time = 'Choose a pick-up time.';
    if (!vehicle) e.vehicle = 'Choose a vehicle.'; if (Number.isNaN(qty)) e.quantity = 'Vehicles must be 1–50.';
    const { c, e: ce } = customerOf(body); Object.assign(e, ce);
    if (Object.keys(e).length) fail(e);
    const o = records.create('orders', { type: 'transfer', bookingId: bookingId('R'), token: crypto.randomBytes(18).toString('base64url'), status: 'Pending', paymentStatus: 'n/a', amount: 0, currency: 'NGN', customer: { fullName: c.fullName, phone: c.phone, email: c.email, address: '' }, notes: '', payment: {}, details: { service: 'Transfer (one-way)', pickup, dropoff, date, time, vehicle: vehicle.name, capacity: vehicle.cap, quantity: qty, notes } });
    notify('transfer request', { service: `${vehicle.name} · ${pickup} → ${dropoff} · ${date}`, name: c.fullName, email: c.email, phone: c.phone });
    return { bookingId: o.bookingId, token: o.token };
  });

  route('POST', '/api/orders/visa', async ({ req, body }) => {
    limit(req, 'order', 20, 60 * 60e3);
    if (body.website) return { ok: true };
    const e = {}, adults = intIn(body.adults, 1, 50, 1), children = intIn(body.children, 0, 50, 0), infants = intIn(body.infants, 0, 50, 0);
    if (Number.isNaN(adults)) e.adults = 'Adults must be 1–50.'; if (Number.isNaN(children)) e.children = 'Children must be 0–50.'; if (Number.isNaN(infants)) e.infants = 'Infants must be 0–50.';
    if (body.acceptTerms !== true) e.terms = 'Please read and accept the Terms and Conditions to continue.';
    const { c, e: ce } = customerOf(body); Object.assign(e, ce);
    if (Object.keys(e).length) fail(e);
    const q = visaQuote(adults, children, infants);
    const o = records.create('orders', { type: 'visa', bookingId: bookingId('V'), token: crypto.randomBytes(18).toString('base64url'), status: 'Awaiting payment', paymentStatus: 'unpaid', amount: q.total, currency: 'NGN', customer: { fullName: c.fullName, phone: c.phone, email: c.email, address: '' }, notes: '', payment: { provider: 'manual', reference: null, attempts: 0 },
      details: { service: 'Umrah Visa', adults, children, infants, priced: q.priced, adultFee: q.fees.adult, childFee: q.fees.child, infantFee: q.fees.infant, serviceFee: q.fees.service, visaTotal: q.visaTotal, termsAcceptedAt: new Date().toISOString() } });
    notify('Umrah visa request', { service: `${adults} adult(s)${children ? `, ${children} child(ren)` : ''}${infants ? `, ${infants} infant(s)` : ''}${q.priced ? ` · ₦${q.total.toLocaleString('en-NG')}` : ''}`, name: c.fullName, email: c.email, phone: c.phone });
    return { bookingId: o.bookingId, token: o.token };
  });

  // ---------- public: slip ----------
  route('GET', '/api/orders/:id/slip', ({ req, params }) => {
    limit(req, 'slip', 120, 10 * 60e3);
    const o = byId(params.id), t = new URL(req.url, 'http://x').searchParams.get('t') || '';
    if (!o || !safeEq(o.token, t)) throw new HttpError(404, 'Booking not found');
    return { order: publicOrder(o) };
  });

  // ---------- payment callbacks ----------
  function markPaid(o, info = {}) {
    if (o.paymentStatus === 'paid') return o;
    const upd = records.update('orders', o.id, { paymentStatus: 'paid', status: o.status === 'Awaiting payment' ? 'Pending' : o.status, payment: { ...(o.payment || {}), paidAt: new Date().toISOString(), channel: info.channel || '' } });
    notify('paid hotel booking', { service: `${o.details.hotelName} · ${o.details.checkIn} → ${o.details.checkOut} · ₦${o.amount.toLocaleString('en-NG')}`, name: o.customer.fullName, email: o.customer.email, phone: o.customer.phone });
    return upd;
  }
  async function verifyPaystack(ref, o) {
    try {
      const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }, signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      return r.ok && j.status && j.data?.status === 'success' && j.data.amount === Math.round(o.amount * 100) && j.data.currency === 'NGN' ? j.data : null;
    } catch { return null; }
  }
  k.payRoutes = async (req, res, url) => {
    const back = o => { res.writeHead(302, { Location: `${publicUrl(req)}/#/slip/${o.bookingId}/${o.token}` }); res.end(); };
    const ref = url.searchParams.get('reference') || url.searchParams.get('trxref') || '';
    const o = ref && byRef(ref);
    if (url.pathname === '/pay/callback') {
      if (!o) { res.writeHead(302, { Location: `${publicUrl(req)}/#/booking` }); return res.end(); }
      if (o.payment?.provider === 'simulation') { if (paymentMode() === 'simulation' && url.searchParams.get('sim') === 'ok') markPaid(o, { channel: 'test-mode' }); return back(o); }
      const d = await verifyPaystack(ref, o); if (d) markPaid(o, { channel: d.channel });
      return back(o);
    }
    if (url.pathname === '/pay/simulate' && paymentMode() === 'simulation' && o) {
      const cb = `${publicUrl(req)}/pay/callback?reference=${encodeURIComponent(ref)}`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Test payment</title><style>body{font:16px/1.6 system-ui;background:#faf7f2;margin:0;display:grid;place-items:center;min-height:100vh}.c{background:#fff;border:1px solid #e7e0d4;border-radius:14px;padding:28px;max-width:420px;box-shadow:0 8px 30px rgba(0,0,0,.08)}.t{background:#fdeeed;color:#b3261e;font-weight:700;border-radius:6px;padding:4px 10px;display:inline-block;font-size:12px}h2{margin:10px 0 4px}a{display:block;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:12px}.p{background:#09a5db;color:#fff}.x{border:1px solid #ccc;color:#333}</style><div class=c><span class=t>TEST MODE — no real money moves</span><h2>Paystack (simulated)</h2><p>Booking <b>${o.bookingId}</b><br>Amount <b>₦${o.amount.toLocaleString('en-NG')}</b></p><a class=p href="${cb}&sim=ok">Pay ₦${o.amount.toLocaleString('en-NG')}</a><a class=x href="${cb}">Cancel</a></div>`);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
  };
  // Admin "Check Paystack connection": validates the secret key and that this server can reach Paystack (no money moves).
  route('GET', '/api/admin/payments/check', ADMIN, async () => {
    const key = process.env.PAYSTACK_SECRET_KEY, mode = paymentMode();
    if (!key) return { ok: false, mode, message: mode === 'simulation' ? 'Test mode (simulated payments). Set PAYSTACK_SECRET_KEY to use Paystack.' : 'PAYSTACK_SECRET_KEY is not set on this server.' };
    const keyMode = key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : 'unknown';
    try {
      const r = await fetch('https://api.paystack.co/transaction?perPage=1', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(12000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.status) return { ok: true, mode, keyMode, message: `Connected to Paystack using ${keyMode.toUpperCase()} keys.${keyMode === 'test' ? ' Payments are test-only — no real money.' : ''}` };
      return { ok: false, mode, keyMode, message: r.status === 401 ? 'Paystack rejected the secret key. Check PAYSTACK_SECRET_KEY.' : `Paystack replied with an error (${r.status}): ${j.message || 'unknown'}` };
    } catch { return { ok: false, mode, keyMode, message: 'This server could not reach Paystack (network blocked or timed out).' }; }
  });
  route('POST', '/api/paystack/webhook', { raw: true }, ({ req, rawBody }) => {
    const key = process.env.PAYSTACK_SECRET_KEY; if (!key) throw new HttpError(404, 'Not found');
    const sig = crypto.createHmac('sha512', key).update(rawBody).digest('hex');
    if (!safeEq(sig, req.headers['x-paystack-signature'] || '')) throw new HttpError(401, 'Bad signature');
    const ev = JSON.parse(rawBody.toString('utf8') || '{}');
    if (ev.event === 'charge.success') { const o = byRef(ev.data?.reference); if (o && ev.data.amount === Math.round(o.amount * 100) && ev.data.currency === 'NGN') markPaid(o, { channel: ev.data.channel }); }
    return { ok: true };
  });

  // ---------- admin: orders ----------
  const csvCols = [['bookingId', 'Booking ID'], ['createdAt', 'Created'], ['type', 'Type'], ['status', 'Status'], ['paymentStatus', 'Payment'], ['amount', 'Amount (NGN)'], ['fullName', 'Client'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address'], ['summary', 'Details']];
  const summary = o => o.type === 'hotel' ? `${o.details.hotelName} (${o.details.city}) · ${o.details.roomType} · ${o.details.checkIn} → ${o.details.checkOut} · ${o.details.nights} night(s) · ${o.details.rooms} room(s)`
    : o.type === 'visa' ? `Umrah Visa · ${o.details.adults} adult(s), ${o.details.children} child(ren), ${o.details.infants} infant(s)`
    : o.type === 'train' ? `${o.details.from} → ${o.details.to} · ${o.details.date} · ${o.details.adults}A/${o.details.children}C` : `${o.details.vehicle} x${o.details.quantity} · ${o.details.pickup} → ${o.details.dropoff} · ${o.details.date} ${o.details.time}`;
  route('GET', '/api/admin/orders', A, () => ({ items: records.list('orders'), statuses: ORDER_STATUSES }));
  route('GET', '/api/admin/orders.csv', A, () => ({
    csv: [csvCols.map(c => `"${c[1]}"`).join(','), ...records.list('orders').map(o => csvCols.map(([key]) => { let v = key === 'summary' ? summary(o) : ['fullName', 'phone', 'email', 'address'].includes(key) ? o.customer[key] : o[key]; v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; }).join(','))].join('\r\n'),
    name: `nusuk-orders-${today()}.csv` }));
  route('PATCH', '/api/admin/orders/:id', A, ({ params, body }) => {
    const patch = {};
    if (body.status !== undefined) { if (!ORDER_STATUSES.includes(body.status)) fail({ status: 'Invalid status.' }); patch.status = body.status; }
    if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 2000);
    if (body.paymentStatus !== undefined) {
      const cur = records.get('orders', params.id); if (!cur) throw new HttpError(404, 'Not found');
      if (!['hotel', 'visa'].includes(cur.type) || !['paid', 'unpaid'].includes(body.paymentStatus)) fail({ paymentStatus: 'Payment status can only be paid or unpaid on hotel and visa orders.' });
      patch.paymentStatus = body.paymentStatus;
      patch.payment = { ...(cur.payment || {}), paidAt: body.paymentStatus === 'paid' ? new Date().toISOString() : null, channel: body.paymentStatus === 'paid' ? (cur.payment?.channel || 'manual') : '' };
      if (body.paymentStatus === 'paid' && cur.status === 'Awaiting payment' && body.status === undefined) patch.status = 'Pending';
    }
    return records.update('orders', params.id, patch) ?? (() => { throw new HttpError(404, 'Not found'); })();
  });
  route('DELETE', '/api/admin/orders/:id', ADMIN, ({ params }) => { if (!records.remove('orders', params.id)) throw new HttpError(404, 'Not found'); return { ok: true }; });

  // ---------- admin: hotel inventory ----------
  const defaults = () => { const s = settings.all(); return { markupPct: Number(s.markupPct) || 0, markupFixed: Number(s.markupFixed) || 0 }; };
  route('GET', '/api/admin/hotels', A, () => ({ items: records.list('hotels'), defaults: defaults(), fxRate: settings.all().fxRate ?? '' }));
  route('POST', '/api/admin/hotels', A, ({ body }) => records.create('hotels', must(normalizeHotel(body, defaults()))));
  route('PUT', '/api/admin/hotels/:id', A, ({ params, body }) => {
    const cur = records.get('hotels', params.id); if (!cur) throw new HttpError(404, 'Not found');
    const v = must(normalizeHotel({ ...cur, ...body }, defaults()));
    return records.update('hotels', params.id, v);
  });
  route('DELETE', '/api/admin/hotels/:id', A, ({ params }) => { if (!records.remove('hotels', params.id)) throw new HttpError(404, 'Not found'); return { ok: true }; });
  route('GET', '/api/admin/hotels-template.xlsx', A, () => ({ file: templateXlsx(), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: 'nusuk-hotel-rates-template.xlsx' }));
  route('POST', '/api/admin/hotels/import', { auth: true, maxBody: 6 * 1024 * 1024 }, ({ body }) => {
    let buf; try { buf = Buffer.from(String(body.data || ''), 'base64'); } catch { fail({ file: 'Could not read the file.' }); }
    if (!buf.length || buf.length > 4 * 1024 * 1024) fail({ file: 'Choose a file smaller than 4 MB.' });
    const d = defaults();
    if (body.markupPct !== undefined && body.markupPct !== '') { const n = Number(body.markupPct); if (!(n >= 0 && n <= 500)) fail({ markupPct: 'Mark-up % must be 0–500.' }); d.markupPct = n; }
    if (body.markupFixed !== undefined && body.markupFixed !== '') { const n = Number(body.markupFixed); if (!(n >= 0 && n <= 1e7)) fail({ markupFixed: 'Fixed mark-up must be 0–10,000,000.' }); d.markupFixed = n; }
    let parsed; try { parsed = parseRatesFile(buf, str(body.filename), d); } catch (e) { fail({ file: e.message }); }
    const res = parsed.rows.length ? upsertHotels(parsed.rows) : { created: 0, updated: 0 };
    return { ...res, skipped: parsed.errors.length, errors: parsed.errors.slice(0, 50), markupPct: d.markupPct, markupFixed: d.markupFixed };
  });
  const saveBlob = (dir, buf, exts) => { fs.mkdirSync(path.join(config.dataDir, dir), { recursive: true }); const name = `${crypto.randomBytes(8).toString('hex')}.${exts}`; fs.writeFileSync(path.join(config.dataDir, dir, name), buf); return name; };
  route('POST', '/api/admin/hotels/:id/image', { auth: true, maxBody: 3 * 1024 * 1024 }, ({ params, body }) => {
    const cur = records.get('hotels', params.id); if (!cur) throw new HttpError(404, 'Not found');
    const buf = Buffer.from(String(body.data || ''), 'base64');
    const ext = buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'jpg' : buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? 'png' : buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP' ? 'webp' : null;
    if (!ext || buf.length > 2 * 1024 * 1024) fail({ image: 'Upload a JPG, PNG or WebP image under 2 MB.' });
    return records.update('hotels', params.id, { imageUrl: `api/media/${saveBlob('media', buf, ext)}` });
  });
  route('POST', '/api/admin/hotels/:id/offer', { auth: true, maxBody: 11 * 1024 * 1024 }, ({ params, body }) => {
    const cur = records.get('hotels', params.id); if (!cur) throw new HttpError(404, 'Not found');
    const buf = Buffer.from(String(body.data || ''), 'base64');
    if (buf.subarray(0, 5).toString() !== '%PDF-' || buf.length > 8 * 1024 * 1024) fail({ offer: 'Upload a PDF under 8 MB.' });
    return records.update('hotels', params.id, { offerPdf: saveBlob('offers', buf, 'pdf'), offerName: str(body.filename, 120) || 'offer.pdf' });
  });
  route('GET', '/api/admin/offers/:file', A, ({ params }) => {
    if (!/^[a-f0-9]{16}\.pdf$/.test(params.file)) throw new HttpError(404, 'Not found');
    const p = path.join(config.dataDir, 'offers', params.file); if (!fs.existsSync(p)) throw new HttpError(404, 'Not found');
    return { file: fs.readFileSync(p), type: 'application/pdf', name: 'hotel-offer.pdf', inline: true };
  });
}
