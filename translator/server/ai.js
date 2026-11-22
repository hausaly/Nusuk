// AI engine layer: Gemini, ChatGPT (OpenAI-compatible) and Claude, with automatic fail-over.
// An engine that runs out of (free) quota, is rate-limited or overloaded is put on a short "cooldown"
// and the request moves on to the next engine in the admin's priority order.
import { db, settings, seal, unseal } from './db.js';
import { config } from './config.js';

export const ENGINES = {
  gemini: { label: 'Google Gemini', short: 'Gemini', defaultModel: 'gemini-2.5-flash', env: 'GEMINI_API_KEY',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
    help: 'Free tier available — create a key at aistudio.google.com/apikey' },
  openai: { label: 'ChatGPT (OpenAI)', short: 'ChatGPT', defaultModel: 'gpt-4o-mini', env: 'OPENAI_API_KEY',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    help: 'platform.openai.com/api-keys — API keys are billed separately from ChatGPT accounts. Any OpenAI-compatible provider works via the Base URL field.' },
  claude: { label: 'Claude (Anthropic)', short: 'Claude', defaultModel: 'claude-haiku-5-5', env: 'ANTHROPIC_API_KEY',
    models: ['claude-haiku-5-5', 'claude-sonnet-5-5'],
    help: 'console.anthropic.com/settings/keys — API keys are billed separately from Claude.ai accounts.' },
};
export const ENGINE_IDS = Object.keys(ENGINES);
const DEFAULT_ORDER = ['gemini', 'openai', 'claude'];

// ---------- configuration (database, with environment-variable fallback for keys) ----------
function stored() { return settings.get('engines', {}) || {}; }
export function engineOrder() {
  const o = (settings.get('engineOrder', DEFAULT_ORDER) || []).filter(e => ENGINES[e]);
  return [...new Set([...o, ...DEFAULT_ORDER])];
}
export function engineConfig(id) {
  const s = stored()[id] || {}, meta = ENGINES[id];
  const dbKey = unseal(s.key), envKey = process.env[meta.env] || '';
  return {
    id, enabled: s.enabled !== false, model: (s.model || meta.defaultModel).trim(),
    baseUrl: (id === 'openai' ? (s.baseUrl || '').trim() : '') || config.endpoints[id],
    key: dbKey || envKey, keySource: dbKey ? 'admin' : envKey ? 'env' : '',
  };
}
export function saveEngineSettings(id, patch) {
  const all = stored(), cur = all[id] || {};
  if (patch.enabled !== undefined) cur.enabled = !!patch.enabled;
  if (patch.model !== undefined) cur.model = String(patch.model).trim().slice(0, 80);
  if (patch.baseUrl !== undefined && id === 'openai') {
    const u = String(patch.baseUrl).trim().replace(/\/+$/, '');
    if (u && !/^https:\/\/[^\s]+$/i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(u)) throw new Error('Base URL must start with https://');
    cur.baseUrl = u;
  }
  if (patch.key !== undefined) { cur.key = patch.key ? seal(String(patch.key).trim()) : ''; cooldowns.delete(id); }
  all[id] = cur; settings.set('engines', all);
}
export function saveEngineOrder(order) {
  const o = (Array.isArray(order) ? order : []).filter(e => ENGINES[e]);
  settings.set('engineOrder', [...new Set([...o, ...DEFAULT_ORDER])]);
}
const mask = k => (k ? '•'.repeat(8) + k.slice(-4) : '');

// ---------- cooldown + usage ----------
const cooldowns = new Map();   // engine -> { until, reason, kind }
const lastError = new Map();

function logUsage(engine, kind, ok, ms, error = '') {
  db.prepare('INSERT INTO usage (ts,engine,kind,ok,ms,error) VALUES (?,?,?,?,?,?)').run(Date.now(), engine, kind, ok ? 1 : 0, ms, String(error).slice(0, 300));
  db.prepare('DELETE FROM usage WHERE ts < ?').run(Date.now() - 90 * 86400e3);
}
export function engineStatuses() {
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  return engineOrder().map((id, i) => {
    const c = engineConfig(id), cd = cooldowns.get(id), active = cd && cd.until > Date.now();
    const rows = db.prepare('SELECT ok, COUNT(*) n FROM usage WHERE engine = ? AND ts >= ? GROUP BY ok').all(id, startOfDay.getTime());
    const ok = rows.find(r => r.ok === 1)?.n || 0, bad = rows.find(r => r.ok === 0)?.n || 0;
    const total = db.prepare('SELECT COUNT(*) n FROM usage WHERE engine = ? AND ok = 1').get(id).n;
    return {
      id, label: ENGINES[id].label, help: ENGINES[id].help, models: ENGINES[id].models, priority: i + 1,
      enabled: c.enabled, model: c.model, baseUrl: id === 'openai' ? (stored().openai?.baseUrl || '') : '',
      hasKey: !!c.key, keyHint: mask(c.key), keySource: c.keySource,
      state: !c.key ? 'nokey' : !c.enabled ? 'disabled' : active ? 'cooling' : 'ready',
      coolingUntil: active ? cd.until : null, coolingReason: active ? cd.reason : '',
      todayOk: ok, todayFailed: bad, totalOk: total, lastError: lastError.get(id) || '',
    };
  });
}
export function clearCooldown(id) { cooldowns.delete(id); }
function isAvailable(id) {
  const c = engineConfig(id), cd = cooldowns.get(id);
  return c.enabled && !!c.key && !(cd && cd.until > Date.now());
}
export function availableEngines() { return engineOrder().filter(isAvailable); }

// ---------- errors ----------
class EngineError extends Error {
  constructor(kind, message, { status = 0, cooldownMs = 0 } = {}) { super(message); this.kind = kind; this.status = status; this.cooldownMs = cooldownMs; }
}
function nextDailyReset() { const d = new Date(); d.setUTCHours(8, 0, 0, 0); if (d.getTime() < Date.now() + 15 * 60e3) d.setUTCDate(d.getUTCDate() + 1); return d.getTime() - Date.now(); }
function classify(status, text, headers) {
  const body = String(text || '');
  let msg = body.slice(0, 400);
  try { const j = JSON.parse(body); msg = j.error?.message || j.message || msg; } catch {}
  msg = String(msg).replace(/\s+/g, ' ').slice(0, 300);
  const retryHdr = Number(headers?.get?.('retry-after')) * 1000 || 0;
  const retryBody = (body.match(/"retryDelay":\s*"(\d+)/) || [])[1] * 1000 || 0;
  const retry = Math.min(Math.max(retryHdr || retryBody || 0, 0), 30 * 60e3);
  const daily = /PerDay|per day|daily/i.test(body);
  const billing = /insufficient_quota|credit balance|billing|exceeded your current quota/i.test(body);
  if (status === 401 || /API key not valid|invalid x-api-key|incorrect api key|invalid api key|API_KEY_INVALID|authentication/i.test(body))
    return new EngineError('auth', `Key rejected: ${msg}`, { status, cooldownMs: 15 * 60e3 });
  if (status === 403) return new EngineError('auth', `Access denied: ${msg}`, { status, cooldownMs: 15 * 60e3 });
  if (status === 402 || billing) return new EngineError('quota', `Out of credit/quota: ${msg}`, { status, cooldownMs: daily ? nextDailyReset() : 6 * 3600e3 });
  if (status === 429 || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(body))
    return new EngineError('quota', `Quota / rate limit reached: ${msg}`, { status, cooldownMs: daily ? nextDailyReset() : (retry || 5 * 60e3) });
  if (status === 529 || status === 503 || status === 502 || status === 504 || status === 500 || /overloaded|unavailable/i.test(body))
    return new EngineError('overload', `Engine busy: ${msg}`, { status, cooldownMs: Math.max(retry, 90e3) });
  if (status === 404) return new EngineError('model', `Model or endpoint not found: ${msg}`, { status, cooldownMs: 5 * 60e3 });
  return new EngineError('bad', `Request rejected (${status}): ${msg}`, { status });
}

async function http(url, init, timeoutMs) {
  let r;
  try { r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (e) {
    if (e.name === 'TimeoutError') throw new EngineError('overload', 'The engine took too long to answer.', { cooldownMs: 60e3 });
    throw new EngineError('overload', `Network error: ${e.cause?.code || e.message}`, { cooldownMs: 60e3 });
  }
  const text = await r.text();
  if (!r.ok) throw classify(r.status, text, r.headers);
  try { return JSON.parse(text); } catch { throw new EngineError('bad', 'The engine returned a non-JSON response.'); }
}

// ---------- providers ----------
// req: { system, user, file?: {mime, data(base64), name}, maxTokens, json }
const providers = {
  async gemini(c, req) {
    const parts = [{ text: req.user }];
    if (req.file) parts.push({ inlineData: { mimeType: req.file.mime, data: req.file.data } });
    const j = await http(`${c.baseUrl}/models/${encodeURIComponent(c.model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: req.maxTokens, ...(req.json ? { responseMimeType: 'application/json' } : {}) },
      }),
    }, req.timeout);
    const cand = j.candidates?.[0];
    if (!cand) throw new EngineError('bad', j.promptFeedback?.blockReason ? `Blocked by the engine (${j.promptFeedback.blockReason}).` : 'The engine returned no answer.');
    const text = (cand.content?.parts || []).map(p => p.text || '').join('');
    if (!text) throw new EngineError('bad', `The engine returned an empty answer (${cand.finishReason || 'unknown'}).`);
    if (cand.finishReason === 'MAX_TOKENS' && req.json) throw new EngineError('badjson', 'The document is too long for one pass — try fewer pages.');
    return text;
  },
  async openai(c, req) {
    const content = [{ type: 'text', text: req.user }];
    if (req.file) {
      const uri = `data:${req.file.mime};base64,${req.file.data}`;
      content.push(req.file.mime === 'application/pdf'
        ? { type: 'file', file: { filename: req.file.name || 'document.pdf', file_data: uri } }
        : { type: 'image_url', image_url: { url: uri, detail: 'high' } });
    }
    const j = await http(`${c.baseUrl}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
      body: JSON.stringify({
        model: c.model, max_tokens: Math.min(req.maxTokens, 16000),
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [{ role: 'system', content: req.system }, { role: 'user', content }],
      }),
    }, req.timeout);
    const ch = j.choices?.[0];
    if (ch?.finish_reason === 'length') throw new EngineError('badjson', 'The document is too long for one pass — try fewer pages.');
    const text = ch?.message?.content;
    if (!text) throw new EngineError('bad', ch?.message?.refusal ? `Declined by the engine: ${ch.message.refusal}` : 'The engine returned no answer.');
    return text;
  },
  async claude(c, req) {
    const content = [];
    if (req.file) content.push(req.file.mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: req.file.data } }
      : { type: 'image', source: { type: 'base64', media_type: req.file.mime, data: req.file.data } });
    content.push({ type: 'text', text: req.user });
    const j = await http(`${c.baseUrl}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: c.model, max_tokens: Math.min(req.maxTokens, 16000), temperature: 0.1, system: req.system, messages: [{ role: 'user', content }] }),
    }, req.timeout);
    if (j.stop_reason === 'max_tokens') throw new EngineError('badjson', 'The document is too long for one pass — try fewer pages.');
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!text) throw new EngineError('bad', 'The engine returned no answer.');
    return text;
  },
};

/** Lenient JSON extraction (code fences, leading prose). */
export function parseModelJson(text) {
  let t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new EngineError('badjson', 'The engine did not return a valid document.');
  try { return JSON.parse(t.slice(a, b + 1)); }
  catch { throw new EngineError('badjson', 'The engine returned a malformed document (likely cut off).'); }
}

/**
 * Run a request through the engines.
 * preferred: 'auto' | engine id — tried first; strict=true means "never switch".
 * parse(text) -> value; throwing counts as that engine failing, so the next engine gets a go.
 * Returns { value, engine, attempts:[{engine,error}] }.
 */
export async function run({ kind, system, user, file, preferred = 'auto', strict = false, parse, maxTokens = 32000, timeout = 170000, json = true, onAttempt }) {
  let order = engineOrder();
  if (preferred !== 'auto' && ENGINES[preferred]) order = strict ? [preferred] : [preferred, ...order.filter(e => e !== preferred)];
  const attempts = [], skipped = [];
  for (const id of order) {
    const c = engineConfig(id);
    if (!c.enabled) { skipped.push(`${ENGINES[id].short}: turned off`); continue; }
    if (!c.key) { skipped.push(`${ENGINES[id].short}: no API key`); continue; }
    const cd = cooldowns.get(id);
    if (cd && cd.until > Date.now()) { skipped.push(`${ENGINES[id].short}: ${cd.reason}`); attempts.push({ engine: id, error: cd.reason, skipped: true }); continue; }
    const t0 = Date.now();
    try {
      onAttempt?.(id);
      const text = await providers[id](c, { system, user, file, maxTokens, timeout, json });
      const value = parse ? parse(text) : text;
      logUsage(id, kind, true, Date.now() - t0);
      lastError.delete(id);
      return { value, engine: id, attempts };
    } catch (e) {
      const err = e instanceof EngineError ? e : new EngineError('bad', e.message || String(e));
      logUsage(id, kind, false, Date.now() - t0, err.message);
      lastError.set(id, err.message);
      if (err.cooldownMs) cooldowns.set(id, { until: Date.now() + err.cooldownMs, reason: err.kind === 'quota' ? 'out of quota' : err.kind === 'auth' ? 'key rejected' : err.kind === 'model' ? 'model not found' : 'busy', kind: err.kind });
      attempts.push({ engine: id, error: err.message, kind: err.kind });
    }
  }
  const detail = [...attempts.filter(a => !a.skipped).map(a => `${ENGINES[a.engine].short}: ${a.error}`), ...skipped.filter(s => !attempts.some(a => a.skipped && s.startsWith(ENGINES[a.engine].short)))].join(' | ');
  const err = new Error(attempts.length || skipped.length
    ? `No AI engine could complete this request. ${detail}`
    : 'No AI engine is configured. An administrator must add at least one API key under Admin → AI Engines.');
  err.attempts = attempts; err.code = 'NO_ENGINE';
  throw err;
}

/** Cheap connectivity check used by the admin "Test" button. */
export async function testEngine(id) {
  const c = engineConfig(id);
  if (!c.key) throw new Error('No API key saved for this engine.');
  const t0 = Date.now();
  try {
    const text = await providers[id](c, { system: 'You are a connectivity test.', user: 'Reply with the single word OK.', maxTokens: 512, timeout: 30000, json: false });
    logUsage(id, 'test', true, Date.now() - t0); cooldowns.delete(id); lastError.delete(id);
    return { ok: true, ms: Date.now() - t0, reply: String(text).trim().slice(0, 40) };
  } catch (e) {
    logUsage(id, 'test', false, Date.now() - t0, e.message); lastError.set(id, e.message);
    throw new Error(e.message);
  }
}
