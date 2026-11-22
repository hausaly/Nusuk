// Translation tasks: storage, background AI jobs (translate / revise), records.
import fs from 'node:fs';
import path from 'node:path';
import { db, uid, nowIso, settings } from './db.js';
import { config } from './config.js';
import * as ai from './ai.js';
import { LANGS, normalizeDoc, countBlocks, translateSystem, translateUser, reviseSystem, reviseUser } from './doc.js';
import { brandingGet } from './branding.js';

const uploadPath = id => path.join(config.dataDir, 'uploads', `${id}.bin`);
const parseJ = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const row = id => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

export function nextRef() {
  const y = new Date().getFullYear(), key = `seq:${y}`, n = (settings.get(key, 0) || 0) + 1;
  settings.set(key, n);
  return `${brandingGet().idPrefix || 'HET'}-TR-${y}-${String(n).padStart(5, '0')}`;
}

export function view(r, { withDoc = false } = {}) {
  if (!r) return null;
  const job = parseJ(r.job, {}), doc = r.doc ? parseJ(r.doc, null) : null;
  return {
    id: r.id, ref: r.ref, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
    userId: r.user_id, userName: r.user_name, fileName: r.file_name, fileMime: r.file_mime, clientRef: r.client_ref,
    sourceLang: r.source_lang, sourceLangName: doc?.meta?.sourceLanguage?.name || r.source_lang, targetLang: r.target_lang,
    layout: r.layout, translatorId: r.translator_id, translationDate: r.translation_date, engine: r.engine,
    pages: r.pages, revisions: r.revisions, downloads: r.downloads, error: r.error, preferred: r.preferred,
    canUndo: parseJ(r.history, []).length > 0, job: { stage: job.stage || '', notice: job.notice || '', attempts: job.attempts || [], summary: job.summary || '', kind: job.kind || '' },
    documentType: doc?.meta?.documentType || '', hasSource: fs.existsSync(uploadPath(r.id)),
    ...(withDoc ? { doc } : {}),
  };
}

export function create({ user, fileName, mime, buffer, target, layout, preferred, strict, clientRef, translatorId, translationDate, notes }) {
  const id = uid(), t = nowIso();
  db.prepare(`INSERT INTO tasks (id,ref,created_at,updated_at,user_id,user_name,status,file_name,file_mime,client_ref,target_lang,layout,translator_id,translation_date,preferred,strict,job)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, nextRef(), t, t, user.id, user.name, 'processing', fileName.slice(0, 200), mime, clientRef.slice(0, 120), target, layout, translatorId, translationDate, preferred, strict ? 1 : 0, JSON.stringify({ kind: 'translate', stage: 'Queued…', notes: notes || '' }));
  fs.writeFileSync(uploadPath(id), buffer);
  runTranslate(id).catch(e => console.error('translate job crashed', e));
  return id;
}

const setJob = (id, patch) => { const r = row(id); db.prepare('UPDATE tasks SET job = ?, updated_at = ? WHERE id = ?').run(JSON.stringify({ ...parseJ(r.job, {}), ...patch }), nowIso(), id); };

function failureText(e) { return String(e.message || e).slice(0, 700); }
const switchNotice = (attempts, engine) => {
  const failed = attempts.filter(a => !a.skipped).map(a => ai.ENGINES[a.engine].short), skipped = attempts.filter(a => a.skipped).map(a => ai.ENGINES[a.engine].short);
  const parts = [];
  if (failed.length) parts.push(`${failed.join(' and ')} could not complete the request (quota, limit or error)`);
  if (skipped.length) parts.push(`${skipped.join(' and ')} is resting after hitting its limit`);
  return parts.length ? `${parts.join('; ')} — automatically switched to ${ai.ENGINES[engine].short}.` : '';
};

async function runTranslate(id) {
  const r = row(id), job = parseJ(r.job, {});
  try {
    const buffer = fs.readFileSync(uploadPath(id)), target = LANGS[r.target_lang].name;
    const result = await ai.run({
      kind: 'translate', preferred: r.preferred, strict: !!r.strict, maxTokens: 32000,
      system: translateSystem(target, { digitStyle: brandingGet().digitStyle }),
      user: translateUser(target, job.notes),
      file: { mime: r.file_mime, data: buffer.toString('base64'), name: r.file_name },
      parse: t => normalizeDoc(ai.parseModelJson(t)),
      onAttempt: eng => setJob(id, { stage: `Reading and translating with ${ai.ENGINES[eng].short}…` }),
    });
    const doc = result.value, src = doc.meta.sourceLanguage.code;
    let notice = switchNotice(result.attempts, result.engine);
    if (src && src === r.target_lang) notice = `This document already appears to be in ${target}. Choose the other target language if you wanted a translation. ${notice}`.trim();
    db.prepare("UPDATE tasks SET status='draft', doc=?, engine=?, source_lang=?, pages=?, error='', updated_at=?, job=? WHERE id=?")
      .run(JSON.stringify(doc), result.engine, src, doc.pages.length, nowIso(), JSON.stringify({ kind: 'translate', stage: 'Done', notice, attempts: result.attempts }), id);
  } catch (e) {
    db.prepare("UPDATE tasks SET status='failed', error=?, updated_at=?, job=? WHERE id=?").run(failureText(e), nowIso(), JSON.stringify({ kind: 'translate', stage: 'Failed', attempts: e.attempts || [] }), id);
  }
}

export function startRevise(id, { instruction, preferred, strict, useOriginal }) {
  const r = row(id);
  db.prepare("UPDATE tasks SET status='processing', error='', updated_at=?, job=? WHERE id=?").run(nowIso(), JSON.stringify({ kind: 'revise', stage: 'Applying your correction…' }), id);
  runRevise(id, r, { instruction, preferred, strict, useOriginal }).catch(e => console.error('revise job crashed', e));
}

async function runRevise(id, r, { instruction, preferred, strict, useOriginal }) {
  const prevStatus = r.status === 'completed' ? 'draft' : r.status === 'processing' ? 'draft' : r.status;
  try {
    const oldDoc = parseJ(r.doc, null), target = LANGS[r.target_lang].name;
    const hasSrc = useOriginal && fs.existsSync(uploadPath(id));
    const file = hasSrc ? { mime: r.file_mime, data: fs.readFileSync(uploadPath(id)).toString('base64'), name: r.file_name } : undefined;
    const result = await ai.run({
      kind: 'revise', preferred: preferred || r.preferred, strict: !!strict, maxTokens: 32000,
      system: reviseSystem(target, { digitStyle: brandingGet().digitStyle, withOriginal: !!file }),
      user: reviseUser(JSON.stringify(oldDoc), instruction), file,
      parse: t => {
        const j = ai.parseModelJson(t), doc = normalizeDoc(j.document || j);
        if (countBlocks(doc) < countBlocks(oldDoc) * 0.5) throw Object.assign(new Error('The engine returned an incomplete document.'), { kind: 'badjson' });
        doc.meta.sourceLanguage = doc.meta.sourceLanguage.code ? doc.meta.sourceLanguage : oldDoc.meta.sourceLanguage;
        doc.meta.documentType = doc.meta.documentType || oldDoc.meta.documentType;
        return { doc, summary: String(j.summary || '').slice(0, 300) };
      },
      onAttempt: eng => setJob(id, { stage: `Applying your correction with ${ai.ENGINES[eng].short}…` }),
    });
    const hist = parseJ(r.history, []); hist.push({ at: nowIso(), doc: oldDoc }); while (hist.length > 8) hist.shift();
    db.prepare("UPDATE tasks SET status=?, doc=?, history=?, engine=?, revisions=revisions+1, pages=?, completed_at=NULL, error='', updated_at=?, job=? WHERE id=?")
      .run(prevStatus === 'failed' ? 'draft' : prevStatus, JSON.stringify(result.value.doc), JSON.stringify(hist), result.engine, result.value.doc.pages.length, nowIso(),
        JSON.stringify({ kind: 'revise', stage: 'Done', summary: result.value.summary || 'Correction applied.', notice: switchNotice(result.attempts, result.engine), attempts: result.attempts }), id);
  } catch (e) {
    db.prepare("UPDATE tasks SET status=?, error=?, updated_at=?, job=? WHERE id=?").run(prevStatus === 'failed' ? 'draft' : prevStatus, failureText(e), nowIso(), JSON.stringify({ kind: 'revise', stage: 'Failed', attempts: e.attempts || [] }), id);
  }
}

export function saveDoc(id, doc, label = 'Manual edit') {
  const r = row(id), old = parseJ(r.doc, null);
  if (JSON.stringify(old) === JSON.stringify(doc)) return;
  const hist = parseJ(r.history, []); hist.push({ at: nowIso(), doc: old, label }); while (hist.length > 8) hist.shift();
  db.prepare("UPDATE tasks SET doc=?, history=?, status='draft', completed_at=NULL, revisions=revisions+1, pages=?, updated_at=? WHERE id=?")
    .run(JSON.stringify(doc), JSON.stringify(hist), doc.pages.length, nowIso(), id);
}
export function undo(id) {
  const r = row(id), hist = parseJ(r.history, []), prev = hist.pop();
  if (!prev) return false;
  db.prepare("UPDATE tasks SET doc=?, history=?, status='draft', completed_at=NULL, pages=?, updated_at=?, job=? WHERE id=?")
    .run(JSON.stringify(prev.doc), JSON.stringify(hist), prev.doc.pages.length, nowIso(), JSON.stringify({ kind: 'undo', summary: 'Last change undone.' }), id);
  return true;
}
export function complete(id) {
  db.prepare("UPDATE tasks SET status='completed', completed_at=?, updated_at=? WHERE id=?").run(nowIso(), nowIso(), id);
  fs.rmSync(uploadPath(id), { force: true });          // the original is no longer needed once approved
}
export function remove(id) { fs.rmSync(uploadPath(id), { force: true }); return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0; }
export const get = row;

/** Housekeeping: tasks left "processing" by a restart, and stale uploads of unfinished drafts (7 days). */
export function markStale() {
  db.prepare("UPDATE tasks SET status='failed', error='The server restarted while this task was running. Please upload the file again.' WHERE status='processing'").run();
}
export function purgeUploads() {
  const cutoff = Date.now() - 7 * 86400e3;
  for (const f of fs.readdirSync(path.join(config.dataDir, 'uploads'))) {
    const p = path.join(config.dataDir, 'uploads', f);
    try { if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p); } catch {}
  }
}

export function list(user, { q = '', status = '', limit = 200 } = {}) {
  const where = [], args = [];
  if (user.role !== 'admin') { where.push('user_id = ?'); args.push(user.id); }
  if (status) { where.push('status = ?'); args.push(status); }
  if (q) { where.push('(ref LIKE ? OR file_name LIKE ? OR client_ref LIKE ? OR user_name LIKE ?)'); args.push(...Array(4).fill(`%${q.replace(/[%_]/g, '')}%`)); }
  const sql = `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ${Math.min(+limit || 200, 1000)}`;
  return db.prepare(sql).all(...args).map(r => view(r));
}

export function summary(user) {
  const own = user.role === 'admin' ? '' : 'AND user_id = ?', a = user.role === 'admin' ? [] : [user.id];
  const q = (sql, ...x) => db.prepare(sql).get(...a, ...x);
  const day = new Date().toISOString().slice(0, 10), month = day.slice(0, 7);
  const out = {
    total: q(`SELECT COUNT(*) n FROM tasks WHERE 1=1 ${own}`).n,
    completed: q(`SELECT COUNT(*) n FROM tasks WHERE status='completed' ${own}`).n,
    drafts: q(`SELECT COUNT(*) n FROM tasks WHERE status IN ('draft','processing') ${own}`).n,
    failed: q(`SELECT COUNT(*) n FROM tasks WHERE status='failed' ${own}`).n,
    today: q(`SELECT COUNT(*) n FROM tasks WHERE 1=1 ${own} AND substr(created_at,1,10)=?`, day).n,
    month: q(`SELECT COUNT(*) n FROM tasks WHERE 1=1 ${own} AND substr(created_at,1,7)=?`, month).n,
    pages: q(`SELECT COALESCE(SUM(pages),0) n FROM tasks WHERE status='completed' ${own}`).n,
  };
  out.byPair = db.prepare(`SELECT source_lang s, target_lang t, COUNT(*) n FROM tasks WHERE status='completed' ${own} GROUP BY s,t ORDER BY n DESC LIMIT 8`).all(...a);
  out.byEngine = db.prepare(`SELECT engine e, COUNT(*) n FROM tasks WHERE engine <> '' ${own} GROUP BY e ORDER BY n DESC`).all(...a);
  if (user.role === 'admin') out.byUser = db.prepare("SELECT user_name u, COUNT(*) n FROM tasks WHERE status='completed' GROUP BY user_id ORDER BY n DESC LIMIT 8").all();
  return out;
}
