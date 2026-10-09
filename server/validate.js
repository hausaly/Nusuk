export const SERVICES = [
  'Umrah External Agent Consultation',
  'External Agent Company Registration',
  'UEA O.1 Capacity Building',
  'Umrah Operations Masterclass',
  'Saudi Partner Company Contracting',
  'Umrah Product & Package Development',
];
export const MODES = ['Online (Virtual)', 'Offline (On-site)'];
export const REQUEST_STATUSES = ['New', 'Contacted', 'In progress', 'Closed'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9\s\-()]{7,18}$/;
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Returns { value } or { errors: {field: msg} }. */
export function serviceRequest(b = {}) {
  const v = {
    service: str(b.service), mode: Array.isArray(b.mode) ? [...new Set(b.mode.map(m => str(m)))] : [],
    firstName: str(b.firstName, 80), lastName: str(b.lastName, 80), email: str(b.email, 120).toLowerCase(),
    phone: str(b.phone, 30), company: str(b.company, 150), role: str(b.role, 100),
  };
  const errors = {};
  if (!SERVICES.includes(v.service)) errors.sv = 'Please select a service.';
  if (!v.mode.length || v.mode.some(m => !MODES.includes(m))) errors.md = 'Select at least one service mode.';
  if (!v.firstName) errors.fn = 'First name is required.';
  if (!v.lastName) errors.ln = 'Last name is required.';
  if (!EMAIL.test(v.email)) errors.em = 'Enter a valid email address.';
  if (!PHONE.test(v.phone)) errors.ph = 'Enter a valid phone number.';
  if (!v.company) errors.co = 'Company name is required.';
  if (!v.role) errors.ro = 'Role/Designation is required.';
  return Object.keys(errors).length ? { errors } : { value: { ...v, status: 'New', notes: '' } };
}

export function userInput(b = {}, { requirePassword }) {
  const v = { name: str(b.name, 100), email: str(b.email, 120).toLowerCase(), role: str(b.role, 10) || 'staff', password: typeof b.password === 'string' ? b.password : '' };
  const errors = {};
  if (!v.name) errors.name = 'Name is required.';
  if (!EMAIL.test(v.email)) errors.email = 'Valid email required.';
  if (!['admin', 'staff'].includes(v.role)) errors.role = 'Role must be admin or staff.';
  if ((requirePassword || v.password) && v.password.length < 10) errors.password = 'Password must be at least 10 characters.';
  return Object.keys(errors).length ? { errors } : { value: v };
}

const url = v => { const s = str(v, 500); return !s || /^https?:\/\/\S+$/i.test(s) ? s : null; };
export function settingsInput(b = {}) {
  const out = { brochures: {}, youtube: {}, fxRate: '' }, errors = {};
  const mk = (key, max, label) => { const r = String(b?.[key] ?? '').trim(); if (!r) return 0; const n = Number(r); if (!Number.isFinite(n) || n < 0 || n > max) { errors[key] = label; return 0; } return Math.round(n * 100) / 100; };
  out.markupPct = mk('markupPct', 500, 'Default mark-up % must be 0–500.');
  out.markupFixed = mk('markupFixed', 1e7, 'Default fixed mark-up must be ₦0–10,000,000.');
  const raw = String(b?.fxRate ?? '').trim();
  if (raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 1e6) errors.fxRate = 'FX rate must be a positive number (Naira per 1 Saudi Riyal).';
    else out.fxRate = Math.round(n * 100) / 100;
  }
  for (const [group, keys] of [['brochures', [2, 3, 4, 5, 6, 7]], ['youtube', [1, 2, 3]]]) {
    for (const k of keys) {
      const u = url(b?.[group]?.[k]);
      if (u === null) errors[`${group}.${k}`] = 'Must be an http(s) URL.'; else out[group][k] = u;
    }
  }
  return Object.keys(errors).length ? { errors } : { value: out };
}
