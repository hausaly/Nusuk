import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMock, state } from './mock-ai.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hz-'));
const mockPort = 41980, appPort = 41981;
Object.assign(process.env, {
  DATA_DIR: dir, ADMIN_PASSWORD: 'TestPass123', LOGIN_RATE_LIMIT: '1000',
  GEMINI_BASE_URL: `http://localhost:${mockPort}/gemini`, OPENAI_BASE_URL: `http://localhost:${mockPort}/openai/v1`, ANTHROPIC_BASE_URL: `http://localhost:${mockPort}/claude/v1`,
  GEMINI_API_KEY: 'k1', OPENAI_API_KEY: 'k2', ANTHROPIC_API_KEY: 'k3',
});
let mock, srv, cookie = '';
const call = async (method, p, body) => {
  const r = await fetch(`http://localhost:${appPort}/api/${p}`, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), headers: r.headers };
};
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString('base64');
const newTask = (extra = {}) => call('POST', 'tasks', { fileName: 'a.png', data: png, target: 'ar', layout: 'official', engine: 'auto', translatorId: 'HET/T002/26', translationDate: '25-09-2026', ...extra });
async function finish(id) { for (let i = 0; i < 80; i++) { const { body } = await call('GET', `tasks/${id}`); if (body.status !== 'processing') return body; await new Promise(r => setTimeout(r, 100)); } throw new Error('timeout'); }
const modes = m => Object.assign(state.modes, { gemini: 'ok', openai: 'ok', claude: 'ok' }, m);

before(async () => {
  mock = await startMock(mockPort);
  const { server } = await import('../server/index.js');
  srv = server; await new Promise(r => srv.listen(appPort, r));
  const r = await fetch(`http://localhost:${appPort}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hausaly.com', password: 'TestPass123' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => { srv.close(); mock.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('API requires sign-in and rejects bad credentials', async () => {
  const saved = cookie; cookie = '';
  assert.equal((await call('GET', 'tasks')).status, 401);
  assert.equal((await call('POST', 'auth/login', { email: 'admin@hausaly.com', password: 'nope' })).status, 401);
  cookie = saved;
});

test('translates, detects language and stores a draft', async () => {
  modes({});
  const t = await newTask(); assert.equal(t.status, 200);
  const done = await finish(t.body.id);
  assert.equal(done.status, 'draft'); assert.equal(done.engine, 'gemini'); assert.equal(done.sourceLang, 'en'); assert.ok(done.doc.pages.length === 2);
  assert.match(done.ref, /^HET-TR-\d{4}-\d{5}$/);
});

test('fails over to the next engine when one runs out of quota, then rests it', async () => {
  modes({ gemini: 'quota' });
  const before = state.calls.gemini;
  const done = await finish((await newTask()).body.id);
  assert.equal(done.status, 'draft'); assert.equal(done.engine, 'openai');
  assert.match(done.job.notice, /switched to ChatGPT/);
  const again = await finish((await newTask()).body.id);                     // Gemini now resting: not called again
  assert.equal(again.engine, 'openai'); assert.equal(state.calls.gemini, before + 1);
  const st = (await call('GET', 'admin/engines')).body.engines.find(e => e.id === 'gemini');
  assert.equal(st.state, 'cooling');
  await call('POST', 'admin/engines/gemini/reset', {});
});

test('falls through all engines (quota, bad key, garbage output) and reports clearly', async () => {
  modes({ gemini: 'garbage', openai: 'badkey', claude: 'quota' });
  const done = await finish((await newTask()).body.id);
  assert.equal(done.status, 'failed'); assert.match(done.error, /No AI engine could complete/);
  for (const e of ['gemini', 'openai', 'claude']) await call('POST', `admin/engines/${e}/reset`, {});
});

test('strict mode does not switch engines', async () => {
  modes({ gemini: 'quota' });
  const done = await finish((await newTask({ engine: 'gemini', strict: true })).body.id);
  assert.equal(done.status, 'failed');
  await call('POST', 'admin/engines/gemini/reset', {}); modes({});
});

test('validates uploads', async () => {
  assert.equal((await newTask({ data: Buffer.from('hello').toString('base64') })).status, 422);
  assert.equal((await newTask({ target: 'fr' })).status, 422);
  assert.equal((await newTask({ translationDate: '2026-09-25' })).status, 422);
});

test('correction command, undo, approval gate, Word export, records', async () => {
  modes({});
  const id = (await newTask()).body.id; await finish(id);
  assert.equal((await call('GET', `tasks/${id}/docx`)).status, 409);          // not approved yet
  await call('POST', `tasks/${id}/revise`, { instruction: 'NAME=عمر خالد', useOriginal: true });
  const rev = await finish(id);
  assert.ok(JSON.stringify(rev.doc).includes('عمر خالد')); assert.equal(rev.canUndo, true); assert.match(rev.job.summary, /full name/);
  assert.equal(state.last.gemini.hasFile, true);                              // original was attached for comparison
  // truncated answer is rejected and the document is untouched
  await call('POST', `tasks/${id}/revise`, { instruction: 'TRUNCATE please' });
  const bad = await finish(id); assert.ok(JSON.stringify(bad.doc).includes('عمر خالد'));
  assert.equal((await call('POST', `tasks/${id}/undo`, {})).body.doc.pages[0].blocks.length > 2, true);
  const ok = await call('POST', `tasks/${id}/complete`, {}); assert.equal(ok.body.status, 'completed'); assert.equal(ok.body.hasSource, false);
  const w = await call('GET', `tasks/${id}/docx`);
  assert.equal(w.status, 200); assert.equal(w.body.subarray(0, 2).toString(), 'PK');
  const list = (await call('GET', 'tasks')).body.items; assert.ok(list.some(t => t.id === id && t.status === 'completed'));
  assert.ok((await call('GET', 'tasks.csv')).body.toString().includes('HET-TR-'));
});

test('inline edits are saved and can be undone', async () => {
  const id = (await newTask()).body.id; const t = await finish(id);
  const doc = structuredClone(t.doc); doc.pages[0].blocks[0].text = 'عنوان جديد';
  const saved = await call('PUT', `tasks/${id}/doc`, { doc });
  assert.equal(saved.body.doc.pages[0].blocks[0].text, 'عنوان جديد'); assert.equal(saved.body.canUndo, true);
});

test('admin settings: keys are never returned, users, branding', async () => {
  await call('PUT', 'admin/engines/claude', { key: 'sk-secret-123456', model: 'claude-sonnet-5-5' });
  const eng = await call('GET', 'admin/engines'); assert.ok(!JSON.stringify(eng.body).includes('sk-secret'));
  assert.equal(eng.body.engines.find(e => e.id === 'claude').keyHint.slice(-4), '3456');
  assert.equal((await call('POST', 'admin/users', { name: 'T', email: 't@x.com', password: 'longenough', translatorId: 'HET/T009/26' })).status, 200);
  assert.equal((await call('POST', 'admin/users', { name: 'T', email: 't@x.com', password: 'longenough' })).status, 422);
  const b = await call('PUT', 'admin/branding', { digitStyle: 'eastern', idPrefix: 'HZ' }); assert.equal(b.body.branding.digitStyle, 'eastern');
  await call('PUT', 'admin/branding', { digitStyle: 'western', idPrefix: 'HET' });
  // translator accounts cannot reach admin APIs or other users' records
  const l = await fetch(`http://localhost:${appPort}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 't@x.com', password: 'longenough' }) });
  const adminCookie = cookie; cookie = l.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('GET', 'admin/engines')).status, 403);
  assert.equal((await call('GET', 'tasks')).body.items.length, 0);
  cookie = adminCookie;
});
