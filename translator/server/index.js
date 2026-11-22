import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, BUILD } from './config.js';
import { db } from './db.js';
import * as auth from './auth.js';
import * as ai from './ai.js';
import * as tasks from './tasks.js';
import { LANGS, TARGETS, normalizeDoc } from './doc.js';
import { LAYOUTS, layoutById, brandingGet, brandingSave, ASSETS, assetPath, assetInfo, assetSave, assetReset } from './branding.js';
import { buildDocx } from './docx.js';

auth.bootstrapAdmin();
tasks.markStale();
tasks.purgeUploads();
setInterval(tasks.purgeUploads, 6 * 3600e3).unref();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

// ---------- helpers ----------
const send = (res, status, body, headers = {}) => {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
};
class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
async function readBody(req, max) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > max) throw new HttpError(413, 'That file is too large.'); chunks.push(c); }
  return Buffer.concat(chunks);
}
const parseJson = buf => { if (!buf.length) return {}; try { return JSON.parse(buf.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON'); } };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split(/=(.*)/s).slice(0, 2)).filter(c => c[0]));
const COOKIE = 'hz_session';
const setCookie = (token, maxAge) => `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=${config.basePath || '/'}; Max-Age=${maxAge}${config.https ? '; Secure' : ''}`;

const hits = new Map();
function limit(req, bucket, max, windowMs, key) {
  const ip = config.https ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
  const k = `${bucket}:${key || ip}`, t = Date.now(), arr = (hits.get(k) || []).filter(x => t - x < windowMs);
  if (arr.length >= max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  arr.push(t); hits.set(k, arr);
}
setInterval(() => { const t = Date.now(); for (const [k, a] of hits) if (!a.some(x => t - x < 3600e3)) hits.delete(k); }, 600e3).unref();

const routes = [];
const route = (method, pattern, opts, handler) => {
  if (typeof opts === 'function') { handler = opts; opts = {}; }
  routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), opts, handler });
};
const fail = errors => { throw new HttpError(422, 'Please check the highlighted fields.', { errors }); };
const A = { auth: true }, ADMIN = { auth: true, role: 'admin' };

// ---------- public ----------
route('GET', '/api/health', () => ({ ok: true, build: BUILD }));
route('GET', '/api/config', () => {
  const b = brandingGet();
  return {
    build: BUILD, layouts: LAYOUTS, languages: TARGETS.map(c => ({ code: c, ...LANGS[c] })),
    branding: { companyName: b.companyName, badgeLine: b.badgeLine, registeredLine: b.registeredLine, contactLine: b.contactLine, defaultLayout: b.defaultLayout, tintedPaper: b.tintedPaper },
    assets: Object.fromEntries(Object.keys(ASSETS).map(n => [n, assetInfo(n).version])),
    limits: { maxUploadMb: config.maxUploadMb, maxPages: config.maxPages },
  };
});
route('GET', '/api/asset/:name', ({ params }) => {
  const p = assetPath(params.name);
  if (!p) throw new HttpError(404, 'Not found');
  return { file: fs.readFileSync(p), type: p.endsWith('.png') ? 'image/png' : 'image/jpeg', cache: 'public, max-age=300' };
});

// ---------- auth ----------
route('POST', '/api/auth/login', ({ req, res, body }) => {
  limit(req, 'login', Number(process.env.LOGIN_RATE_LIMIT) || 8, 15 * 60e3);
  const s = auth.login(body.email ?? '', body.password ?? '');
  if (!s) throw new HttpError(401, 'Incorrect email or password.');
  res.setHeader('Set-Cookie', setCookie(s.token, auth.sessionMaxAge));
  return { user: s.user };
});
route('POST', '/api/auth/logout', ({ req, res }) => { auth.logout(cookies(req)[COOKIE]); res.setHeader('Set-Cookie', setCookie('', 0)); return { ok: true }; });
route('GET', '/api/auth/me', ({ user }) => ({ user }));
route('POST', '/api/auth/password', A, ({ req, user, body }) => {
  limit(req, 'pw', 10, 15 * 60e3, user.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  if (!auth.verifyPassword(String(body.current ?? ''), u.pass_hash)) fail({ current: 'Current password is incorrect.' });
  if (String(body.next ?? '').length < 8) fail({ next: 'Use at least 8 characters.' });
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(auth.hashPassword(body.next), user.id);
  return { ok: true };
});

// ---------- translation tasks ----------
const taskFor = (user, id) => {
  const r = tasks.get(id);
  if (!r || (user.role !== 'admin' && r.user_id !== user.id)) throw new HttpError(404, 'Translation not found.');
  return r;
};
const sniff = buf => buf.subarray(0, 4).toString('latin1') === '%PDF' ? 'application/pdf'
  : buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg'
  : buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP' ? 'image/webp' : '';
const validDate = s => /^\d{2}-\d{2}-\d{4}$/.test(s);
const validTid = s => /^[A-Za-z0-9][A-Za-z0-9/._-]{1,39}$/.test(s);

route('GET', '/api/engines', A, () => {
  const st = ai.engineStatuses();
  return { engines: st.map(e => ({ id: e.id, label: e.label, state: e.state, coolingUntil: e.coolingUntil })), anyReady: st.some(e => e.state === 'ready') };
});

route('POST', '/api/tasks', { auth: true, maxBody: (config.maxUploadMb * 1.4 + 1) * 1024 * 1024 }, ({ req, user, body }) => {
  limit(req, 'task', 20, 10 * 60e3, user.id);
  const errors = {};
  const buffer = Buffer.from(String(body.data || ''), 'base64');
  if (!buffer.length) errors.file = 'Please choose a PDF or image file.';
  else if (buffer.length > config.maxUploadMb * 1024 * 1024) errors.file = `The file is larger than ${config.maxUploadMb} MB.`;
  const mime = sniff(buffer);
  if (buffer.length && !mime) errors.file = 'Only PDF, JPG, PNG or WEBP files are supported.';
  if (mime === 'application/pdf') {
    const pages = (buffer.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
    if (pages > config.maxPages) errors.file = `This PDF has ${pages} pages; the limit is ${config.maxPages} per translation. Please split it.`;
  }
  if (!TARGETS.includes(body.target)) errors.target = 'Choose a target language.';
  const preferred = body.engine === 'auto' || ai.ENGINES[body.engine] ? body.engine : 'auto';
  const layout = layoutById(body.layout).id;
  const translatorId = String(body.translatorId || user.translatorId || '').trim(), date = String(body.translationDate || '').trim();
  if (!validTid(translatorId)) errors.translatorId = 'Enter the translator ID, e.g. HET/T002/26.';
  if (!validDate(date)) errors.translationDate = 'Use the format DD-MM-YYYY.';
  if (Object.keys(errors).length) fail(errors);
  if (!ai.engineStatuses().some(e => e.hasKey && e.enabled)) throw new HttpError(503, 'No AI engine is set up yet. An administrator must add an API key under Admin → AI Engines.');
  const id = tasks.create({ user, fileName: String(body.fileName || 'document').replace(/[\r\n"\\/]/g, '_'), mime, buffer, target: body.target, layout, preferred, strict: !!body.strict, clientRef: String(body.clientRef || '').trim(), translatorId, translationDate: date, notes: String(body.notes || '').slice(0, 800) });
  return tasks.view(tasks.get(id));
});

route('GET', '/api/tasks', A, ({ user, url }) => ({ items: tasks.list(user, { q: url.searchParams.get('q') || '', status: url.searchParams.get('status') || '' }) }));
route('GET', '/api/tasks.csv', ADMIN, ({ user }) => {
  const cell = x => { let s = String(x ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const cols = [['ref', 'Reference'], ['createdAt', 'Created'], ['completedAt', 'Completed'], ['userName', 'Translator'], ['translatorId', 'Translator ID'], ['clientRef', 'Client / reference'], ['fileName', 'File'], ['sourceLangName', 'From'], ['targetLang', 'To'], ['pages', 'Pages'], ['layout', 'Layout'], ['engine', 'AI engine'], ['revisions', 'Corrections'], ['downloads', 'Downloads'], ['status', 'Status']];
  const rows = tasks.list(user, { limit: 1000 });
  return { csv: [cols.map(c => cell(c[1])).join(','), ...rows.map(r => cols.map(c => cell(r[c[0]])).join(','))].join('\r\n'), name: `hausaly-translations-${new Date().toISOString().slice(0, 10)}.csv` };
});
route('GET', '/api/tasks/summary', A, ({ user }) => tasks.summary(user));
route('GET', '/api/tasks/:id', A, ({ user, params }) => tasks.view(taskFor(user, params.id), { withDoc: true }));
route('PATCH', '/api/tasks/:id', A, ({ user, params, body }) => {
  const r = taskFor(user, params.id), errors = {}, set = [], args = [];
  if (body.layout !== undefined) { set.push('layout = ?'); args.push(layoutById(body.layout).id); }
  if (body.translatorId !== undefined) { if (!validTid(String(body.translatorId).trim())) errors.translatorId = 'Enter the translator ID, e.g. HET/T002/26.'; set.push('translator_id = ?'); args.push(String(body.translatorId).trim()); }
  if (body.translationDate !== undefined) { if (!validDate(String(body.translationDate))) errors.translationDate = 'Use the format DD-MM-YYYY.'; set.push('translation_date = ?'); args.push(String(body.translationDate)); }
  if (body.clientRef !== undefined) { set.push('client_ref = ?'); args.push(String(body.clientRef).slice(0, 120)); }
  if (Object.keys(errors).length) fail(errors);
  if (set.length) db.prepare(`UPDATE tasks SET ${set.join(', ')}, updated_at = ? WHERE id = ?`).run(...args, new Date().toISOString(), r.id);
  return tasks.view(tasks.get(r.id), { withDoc: true });
});
route('PUT', '/api/tasks/:id/doc', { auth: true, maxBody: 4 * 1024 * 1024 }, ({ user, params, body }) => {
  const r = taskFor(user, params.id);
  if (r.status === 'processing') throw new HttpError(409, 'The AI is still working on this document.');
  let doc; try { doc = normalizeDoc(body.doc); } catch (e) { throw new HttpError(422, e.message); }
  const old = JSON.parse(r.doc || 'null'); if (old?.meta) doc.meta = old.meta;
  tasks.saveDoc(r.id, doc);
  return tasks.view(tasks.get(r.id), { withDoc: true });
});
route('POST', '/api/tasks/:id/revise', A, ({ req, user, params, body }) => {
  limit(req, 'revise', 40, 10 * 60e3, user.id);
  const r = taskFor(user, params.id), instruction = String(body.instruction || '').trim();
  if (r.status === 'processing') throw new HttpError(409, 'The AI is still working on this document.');
  if (!r.doc) throw new HttpError(409, 'There is nothing to correct yet.');
  if (instruction.length < 3) fail({ instruction: 'Type what should be corrected.' });
  if (instruction.length > 3000) fail({ instruction: 'Please keep the instruction under 3000 characters.' });
  tasks.startRevise(r.id, { instruction, preferred: ai.ENGINES[body.engine] ? body.engine : 'auto', strict: !!body.strict, useOriginal: body.useOriginal !== false });
  return tasks.view(tasks.get(r.id));
});
route('POST', '/api/tasks/:id/undo', A, ({ user, params }) => {
  const r = taskFor(user, params.id);
  if (r.status === 'processing') throw new HttpError(409, 'The AI is still working on this document.');
  if (!tasks.undo(r.id)) throw new HttpError(409, 'Nothing to undo.');
  return tasks.view(tasks.get(r.id), { withDoc: true });
});
route('POST', '/api/tasks/:id/complete', A, ({ user, params }) => {
  const r = taskFor(user, params.id);
  if (!r.doc || r.status === 'processing' || r.status === 'failed') throw new HttpError(409, 'This translation is not ready to be approved.');
  tasks.complete(r.id);
  return tasks.view(tasks.get(r.id), { withDoc: true });
});
route('POST', '/api/tasks/:id/downloaded', A, ({ user, params }) => {
  const r = taskFor(user, params.id);
  if (r.status !== 'completed') throw new HttpError(409, 'Approve the translation before downloading.');
  db.prepare('UPDATE tasks SET downloads = downloads + 1 WHERE id = ?').run(r.id);
  return { ok: true };
});
route('GET', '/api/tasks/:id/docx', A, ({ user, params }) => {
  const r = taskFor(user, params.id);
  if (r.status !== 'completed') throw new HttpError(409, 'Approve the translation before downloading.');
  const task = tasks.get(r.id), file = buildDocx({ task, doc: JSON.parse(task.doc) });
  db.prepare('UPDATE tasks SET downloads = downloads + 1 WHERE id = ?').run(r.id);
  return { file, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: `${r.ref}.docx` };
});
route('GET', '/api/tasks/:id/source', A, ({ user, params }) => {
  const r = taskFor(user, params.id), p = path.join(config.dataDir, 'uploads', `${r.id}.bin`);
  if (!fs.existsSync(p)) throw new HttpError(404, 'The original file is no longer stored.');
  return { file: fs.readFileSync(p), type: r.file_mime, inline: true, name: r.file_name.replace(/[^\w.\- ]/g, '_') };
});
route('DELETE', '/api/tasks/:id', ADMIN, ({ params }) => { if (!tasks.remove(params.id)) throw new HttpError(404, 'Not found'); return { ok: true }; });

// ---------- admin: engines ----------
route('GET', '/api/admin/engines', ADMIN, () => ({ engines: ai.engineStatuses() }));
route('PUT', '/api/admin/engines/:id', ADMIN, ({ params, body }) => {
  if (!ai.ENGINES[params.id]) throw new HttpError(404, 'Unknown engine');
  try { ai.saveEngineSettings(params.id, body); } catch (e) { fail({ baseUrl: e.message }); }
  return { engines: ai.engineStatuses() };
});
route('PUT', '/api/admin/engine-order', ADMIN, ({ body }) => { ai.saveEngineOrder(body.order); return { engines: ai.engineStatuses() }; });
route('POST', '/api/admin/engines/:id/test', ADMIN, async ({ req, params }) => {
  limit(req, 'enginetest', 20, 10 * 60e3);
  if (!ai.ENGINES[params.id]) throw new HttpError(404, 'Unknown engine');
  try { return { ...(await ai.testEngine(params.id)), engines: ai.engineStatuses() }; }
  catch (e) { throw new HttpError(422, e.message, { engines: ai.engineStatuses() }); }
});
route('POST', '/api/admin/engines/:id/reset', ADMIN, ({ params }) => { ai.clearCooldown(params.id); return { engines: ai.engineStatuses() }; });

// ---------- admin: branding + artwork ----------
route('GET', '/api/admin/branding', ADMIN, () => ({ branding: brandingGet(), assets: Object.keys(ASSETS).map(assetInfo), layouts: LAYOUTS }));
route('PUT', '/api/admin/branding', ADMIN, ({ body }) => ({ branding: brandingSave(body) }));
route('PUT', '/api/admin/assets/:name', { auth: true, role: 'admin', maxBody: 5 * 1024 * 1024 }, ({ params, body }) => {
  if (!ASSETS[params.name]) throw new HttpError(404, 'Unknown artwork slot');
  const buf = Buffer.from(String(body.data || ''), 'base64');
  if (buf.length > 3 * 1024 * 1024) fail({ file: 'Image is larger than 3 MB.' });
  try { assetSave(params.name, buf); } catch (e) { fail({ file: e.message }); }
  return { assets: Object.keys(ASSETS).map(assetInfo) };
});
route('DELETE', '/api/admin/assets/:name', ADMIN, ({ params }) => { assetReset(params.name); return { assets: Object.keys(ASSETS).map(assetInfo) }; });

// ---------- admin: users ----------
route('GET', '/api/admin/users', ADMIN, () => ({ items: db.prepare('SELECT * FROM users ORDER BY created_at').all().map(auth.publicUser) }));
route('POST', '/api/admin/users', ADMIN, ({ body }) => {
  const errors = {}, email = String(body.email || '').trim().toLowerCase(), name = String(body.name || '').trim();
  if (!name) errors.name = 'Enter a name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid e-mail address.';
  else if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) errors.email = 'This e-mail already has an account.';
  if (String(body.password || '').length < 8) errors.password = 'Use at least 8 characters.';
  const role = body.role === 'admin' ? 'admin' : 'translator', tid = String(body.translatorId || '').trim();
  if (tid && !validTid(tid)) errors.translatorId = 'Letters, numbers and / . _ - only.';
  if (Object.keys(errors).length) fail(errors);
  auth.createUser({ name, email, role, password: body.password, translatorId: tid });
  return { ok: true };
});
route('PATCH', '/api/admin/users/:id', ADMIN, ({ user, params, body }) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(params.id);
  if (!u) throw new HttpError(404, 'User not found');
  const errors = {}, set = [], args = [];
  if (body.name !== undefined) { if (!String(body.name).trim()) errors.name = 'Enter a name.'; set.push('name = ?'); args.push(String(body.name).trim()); }
  if (body.translatorId !== undefined) { const t = String(body.translatorId).trim(); if (t && !validTid(t)) errors.translatorId = 'Letters, numbers and / . _ - only.'; set.push('translator_id = ?'); args.push(t); }
  if (body.password) { if (String(body.password).length < 8) errors.password = 'Use at least 8 characters.'; set.push('pass_hash = ?'); args.push(auth.hashPassword(String(body.password))); }
  if (body.active !== undefined) { if (u.id === user.id && !body.active) errors.active = 'You cannot deactivate your own account.'; set.push('active = ?'); args.push(body.active ? 1 : 0); }
  if (body.role !== undefined) { if (u.id === user.id && body.role !== 'admin') errors.role = 'You cannot remove your own admin role.'; set.push('role = ?'); args.push(body.role === 'admin' ? 'admin' : 'translator'); }
  if (Object.keys(errors).length) fail(errors);
  if (set.length) db.prepare(`UPDATE users SET ${set.join(', ')} WHERE id = ?`).run(...args, u.id);
  if (body.password || body.active === false) auth.dropSessions(u.id);
  return { ok: true };
});

// ---------- dispatch ----------
async function handleApi(req, res, url) {
  const secHeaders = { 'Cache-Control': 'no-store' };
  try {
    const hit = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!hit) throw new HttpError(routes.some(r => r.re.test(url.pathname)) ? 405 : 404, routes.some(r => r.re.test(url.pathname)) ? 'Method not allowed' : 'Not found');
    const noBody = req.method === 'GET' || req.method === 'DELETE' || req.method === 'HEAD';
    if (!noBody && req.headers['content-length'] !== '0' && (req.headers['content-length'] || req.headers['transfer-encoding']) && !(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'JSON required');
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new HttpError(403, 'Cross-origin request blocked');
    const user = auth.userFromToken(cookies(req)[COOKIE]);
    if (hit.opts.auth && !user) throw new HttpError(401, 'Please sign in.');
    if (hit.opts.role && user.role !== hit.opts.role) throw new HttpError(403, 'Administrator access required.');
    const rawBody = noBody ? Buffer.alloc(0) : await readBody(req, hit.opts.maxBody || 64 * 1024);
    const out = await hit.handler({ req, res, url, user, body: noBody ? {} : parseJson(rawBody), params: hit.re.exec(url.pathname).groups || {} });
    if (out && typeof out.csv === 'string') return send(res, 200, '﻿' + out.csv, { ...secHeaders, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${out.name}"` });
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
const indexHtml = () => fs.readFileSync(path.join(config.publicDir, 'index.html'), 'utf8').replaceAll('__BUILD__', BUILD);
function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request'); }
  if (p === '/' || p === '/index.html') { const html = indexHtml(); return send(res, 200, html, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' }); }
  const file = path.join(config.publicDir, path.normalize(p));
  if (!file.startsWith(config.publicDir + path.sep) || p.includes('\0')) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file), etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: etag, 'Content-Length': st.size, 'Cache-Control': ext === '.woff2' ? 'public, max-age=2592000' : 'public, max-age=3600' };
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
  const url = new URL(req.url, 'http://localhost'), bp = config.basePath;
  if (bp) {
    if (url.pathname === bp) { res.writeHead(301, { Location: bp + '/' + url.search }); return res.end(); }
    // Some hosts (cPanel/Passenger) strip the mount prefix before it reaches us; accept both forms.
    if (url.pathname.startsWith(bp + '/')) url.pathname = url.pathname.slice(bp.length);
  }
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  serveStatic(req, res, url);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(config.port, () => console.log(`Hausaly Translation Desk running on http://localhost:${config.port}${config.basePath}/`));
}
