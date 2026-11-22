// Tiny UI helpers: auto-escaping html`` templates, DOM shortcuts, toasts, API wrapper.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(s);
const val = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : (v == null || v === false) ? '' : esc(v);
export const html = (strings, ...vals) => new Raw(strings.reduce((a, s, i) => a + s + (i < vals.length ? val(vals[i]) : ''), ''));
export const mount = (el, tpl) => { el.innerHTML = String(tpl); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, kind = '') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.classList.add('out'), kind === 'error' ? 7000 : 3800); setTimeout(() => t.remove(), kind === 'error' ? 7400 : 4200);
}

export class ApiError extends Error { constructor(msg, status, errors, data) { super(msg); this.status = status; this.errors = errors || {}; this.data = data || {}; } }
export async function api(method, path, body) {
  let r;
  try {
    r = await fetch('api/' + path, { method, credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch { throw new ApiError('Cannot reach the server. Check your connection and try again.', 0); }
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) { if (r.ok) return r; throw new ApiError(`Server error (${r.status}).`, r.status); }
  const data = await r.json();
  if (!r.ok) throw new ApiError(data.error || 'Something went wrong.', r.status, data.errors, data);
  return data;
}
export const fmtDate = iso => iso ? new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
export const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const ENGINE_LABEL = { gemini: 'Gemini', openai: 'ChatGPT', claude: 'Claude' };
