import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { records, settings, db } from './db.js';
import * as auth from './auth.js';
import * as v from './validate.js';
import { registerBooking, paymentMode } from './booking.js';

auth.bootstrapAdmin();
let payHandler = (req, res) => { res.writeHead(404); res.end(); };   // set by registerBooking()

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

// ---------- helpers ----------
const send = (res, status, body, headers = {}) => {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
};
class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }

async function readBody(req, max = 64 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > max) throw new HttpError(413, 'Payload too large'); chunks.push(c); }
  return Buffer.concat(chunks);
}
const parseJson = buf => { if (!buf.length) return {}; try { return JSON.parse(buf.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON'); } };

/** Public base URL of the site (used for payment return links). Set PUBLIC_URL in production. */
function publicUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || (config.https ? 'https' : 'http')).split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  return `${proto}://${host}${config.basePath}`;
}

const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split(/=(.*)/s).slice(0, 2)).filter(c => c[0]));
const COOKIE = 'nc_session';
const setCookie = (token, maxAge) =>
  `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=${config.basePath || '/'}; Max-Age=${maxAge}${config.https ? '; Secure' : ''}`;

// Sliding-window rate limiter keyed by ip+bucket
const hits = new Map();
function limit(req, bucket, max, windowMs) {
  const ip = config.https ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
  const key = `${bucket}:${ip}`, t = Date.now();
  const arr = (hits.get(key) || []).filter(x => t - x < windowMs);
  if (arr.length >= max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  arr.push(t); hits.set(key, arr);
}
setInterval(() => { const t = Date.now(); for (const [k, a] of hits) if (!a.some(x => t - x < 3600e3)) hits.delete(k); }, 600e3).unref();

async function notify(kind, rec) {
  if (!config.webhook) return;
  try {
    await fetch(config.webhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ text: `New NUSUK CONSULT ${kind}: ${rec.service || rec.type} — ${rec.firstName ? rec.firstName + ' ' + rec.lastName : rec.name} (${rec.email}, ${rec.phone})`, record: rec }),
    });
  } catch (e) { console.warn('webhook failed:', e.message); }
}

const csvCell = x => { let s = Array.isArray(x) ? x.join('; ') : String(x ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
function toCsv(rows, cols) {
  return [cols.map(c => csvCell(c[1])).join(','), ...rows.map(r => cols.map(c => csvCell(r[c[0]])).join(','))].join('\r\n');
}

// ---------- API ----------
const routes = [];
const route = (method, pattern, opts, handler) => {
  if (typeof opts === 'function') { handler = opts; opts = {}; }
  routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), opts, handler });
};

const fail = (errors) => { throw new HttpError(422, 'Validation failed', { errors }); };
const must = (r) => r.errors ? fail(r.errors) : r.value;

// public
route('GET', '/api/health', () => ({ ok: true }));
route('GET', '/api/public-settings', () => { const s = settings.all(); return { brochures: s.brochures || {}, youtube: s.youtube || {}, fxRate: s.fxRate ?? '' }; });
route('POST', '/api/requests', async ({ req, body }) => {
  limit(req, 'submit', 10, 60 * 60e3);
  if (body.website) return { ok: true };            // honeypot: bots fill hidden field
  const rec = records.create('requests', must(v.serviceRequest(body)));
  notify('service request', rec);
  return { ok: true, id: rec.id };
});
// auth
route('POST', '/api/auth/login', async ({ req, res, body }) => {
  limit(req, 'login', 8, 15 * 60e3);
  const s = auth.login(body.email ?? '', body.password ?? '');
  if (!s) throw new HttpError(401, 'Incorrect email or password.');
  res.setHeader('Set-Cookie', setCookie(s.token, auth.sessionMaxAge));
  return { user: s.user };
});
route('POST', '/api/auth/logout', ({ req, res }) => { auth.logout(cookies(req)[COOKIE]); res.setHeader('Set-Cookie', setCookie('', 0)); return { ok: true }; });
route('GET', '/api/auth/me', ({ user }) => ({ user }));

// admin
const A = { auth: true }, ADMIN = { auth: true, role: 'admin' };
route('GET', '/api/admin/summary', A, () => {
  const reqs = records.list('requests'), ords = records.list('orders');
  const paid = ords.filter(o => o.paymentStatus === 'paid');
  return {
    requests: reqs.length, newRequests: reqs.filter(r => r.status === 'New').length,
    orders: ords.length, pendingOrders: ords.filter(o => o.status === 'Pending').length,
    revenue: paid.reduce((t, o) => t + (o.amount || 0), 0), hotels: records.count('hotels'),
    byService: v.SERVICES.map(s => ({ service: s, count: reqs.filter(r => r.service === s).length })),
    payment: paymentMode(),
  };
});

for (const [coll, label, statuses, cols] of [
  ['requests', 'Service requests', v.REQUEST_STATUSES, [['createdAt', 'Submitted'], ['service', 'Service'], ['mode', 'Mode'], ['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['phone', 'Phone'], ['company', 'Company'], ['role', 'Role'], ['status', 'Status'], ['notes', 'Notes']]],
]) {
  route('GET', `/api/admin/${coll}`, A, () => ({ items: records.list(coll), statuses }));
  route('GET', `/api/admin/${coll}.csv`, A, () => ({ csv: toCsv(records.list(coll), cols), name: `nusuk-${coll}-${new Date().toISOString().slice(0, 10)}.csv` }));
  route('PATCH', `/api/admin/${coll}/:id`, A, ({ params, body }) => {
    const patch = {};
    if (body.status !== undefined) { if (!statuses.includes(body.status)) fail({ status: 'Invalid status.' }); patch.status = body.status; }
    if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 2000);
    return records.update(coll, params.id, patch) ?? (() => { throw new HttpError(404, 'Not found'); })();
  });
  route('DELETE', `/api/admin/${coll}/:id`, A, ({ params }) => { if (!records.remove(coll, params.id)) throw new HttpError(404, 'Not found'); return { ok: true }; });
}

route('GET', '/api/admin/settings', ADMIN, () => { const s = settings.all(); return { brochures: s.brochures || {}, youtube: s.youtube || {}, fxRate: s.fxRate ?? '', markupPct: s.markupPct ?? 0, markupFixed: s.markupFixed ?? 0, payment: paymentMode() }; });
route('PUT', '/api/admin/settings', ADMIN, ({ body }) => {
  const s = must(v.settingsInput(body));
  settings.set('brochures', s.brochures); settings.set('youtube', s.youtube); settings.set('fxRate', s.fxRate); settings.set('markupPct', s.markupPct); settings.set('markupFixed', s.markupFixed);
  return s;
});

const bk = { route, HttpError, must, fail, A, ADMIN, limit, notify, publicUrl };
registerBooking(bk);
payHandler = (req, res, url) => bk.payRoutes(req, res, url);

const userRows = () => db.prepare('SELECT * FROM users ORDER BY created_at').all().map(auth.publicUser);
route('GET', '/api/admin/users', ADMIN, () => ({ items: userRows() }));
route('POST', '/api/admin/users', ADMIN, ({ body }) => {
  const u = must(v.userInput(body, { requirePassword: true }));
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(u.email)) fail({ email: 'That email already has an account.' });
  auth.createUser(u);
  return { items: userRows() };
});
route('PUT', '/api/admin/users/:id', ADMIN, ({ params, body, user }) => {
  const u = must(v.userInput(body, { requirePassword: false }));
  const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(params.id);
  if (!cur) throw new HttpError(404, 'Not found');
  if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').get(u.email, params.id)) fail({ email: 'That email already has an account.' });
  const admins = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin'").get().n;
  if (cur.role === 'admin' && u.role !== 'admin' && admins <= 1) fail({ role: 'There must be at least one administrator.' });
  db.prepare('UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?').run(u.name, u.email, u.role, params.id);
  if (u.password) {
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(auth.hashPassword(u.password), params.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(params.id);   // force re-login everywhere
  }
  return { items: userRows() };
});
route('DELETE', '/api/admin/users/:id', ADMIN, ({ params, user }) => {
  if (params.id === user.id) fail({ id: 'You cannot delete your own account.' });
  const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(params.id);
  if (!cur) throw new HttpError(404, 'Not found');
  db.prepare('DELETE FROM users WHERE id = ?').run(params.id);
  return { items: userRows() };
});

async function handleApi(req, res, url) {
  const secHeaders = { 'Cache-Control': 'no-store' };
  try {
    const hit = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!hit) {
      if (routes.some(r => r.re.test(url.pathname))) throw new HttpError(405, 'Method not allowed');
      throw new HttpError(404, 'Not found');
    }
    const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method) && req.headers['content-length'] !== '0' && (req.headers['content-length'] || req.headers['transfer-encoding']);
    if (hasBody && !(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'JSON required');
    if (req.method !== 'GET') {   // CSRF defence in depth on top of SameSite=Strict
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Cross-origin request blocked');
    }
    const user = auth.userFromToken(cookies(req)[COOKIE]);
    if (hit.opts.auth && !user) throw new HttpError(401, 'Sign in required');
    if (hit.opts.role && user.role !== hit.opts.role) throw new HttpError(403, 'Administrator access required');
    const noBody = req.method === 'GET' || req.method === 'DELETE';
    const rawBody = noBody ? Buffer.alloc(0) : await readBody(req, hit.opts.maxBody || 64 * 1024);
    const body = noBody || hit.opts.raw ? {} : parseJson(rawBody);
    const ctx = { req, res, user, body, rawBody, params: hit.re.exec(url.pathname).groups || {} };
    const out = await hit.handler(ctx);
    if (out && typeof out.csv === 'string') {
      return send(res, 200, '﻿' + out.csv, { ...secHeaders, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${out.name}"` });
    }
    if (out && Buffer.isBuffer(out.file)) {
      return send(res, 200, out.file, { ...secHeaders, 'Cache-Control': out.cache || 'no-store', 'Content-Type': out.type, 'Content-Length': out.file.length,
        ...(out.name ? { 'Content-Disposition': `${out.inline ? 'inline' : 'attachment'}; filename="${out.name}"` } : {}) });
    }
    send(res, 200, out ?? { ok: true }, secHeaders);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...e.extra }, secHeaders);
    console.error(e);
    send(res, 500, { error: 'Internal server error' }, secHeaders);
  }
}

// ---------- static ----------
function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request'); }
  if (p === '/') p = '/index.html';
  const file = path.join(config.publicDir, path.normalize(p));
  if (!file.startsWith(config.publicDir + path.sep) || p.includes('\0')) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file);
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream', ETag: etag, 'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

export const server = http.createServer((req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (config.https) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const url = new URL(req.url, 'http://localhost');
  const bp = config.basePath;
  if (bp) {
    if (url.pathname === bp) { res.writeHead(301, { Location: bp + '/' + url.search }); return res.end(); }
    // Some hosts (cPanel/Passenger) strip the mount prefix before it reaches us; accept both forms.
    if (url.pathname.startsWith(bp + '/')) url.pathname = url.pathname.slice(bp.length);
  }
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (url.pathname.startsWith('/pay/')) return payHandler(req, res, url);
  serveStatic(req, res, url);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(config.port, () => console.log(`NUSUK CONSULT running on http://localhost:${config.port}`));
}
