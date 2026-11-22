import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { settings } from './db.js';
import { LANGS } from './doc.js';

export const LAYOUTS = [
  { id: 'official', name: 'Certified Translation', tag: 'Official template',
    description: 'Your branded certified-translation page: letterhead band, orange title, framed body, translator ID and regulator logos.',
    frame: true, title: true, headerBand: true, footerBand: true, footerLine: true, paper: 'tint' },
  { id: 'letterhead', name: 'Executive Letterhead', tag: 'Formal',
    description: 'Branded header and partner footer with an open, unframed body — ideal for letters, statements and long documents.',
    frame: false, title: false, headerBand: true, footerBand: true, footerLine: true, paper: 'white' },
  { id: 'minimal', name: 'Clean Minimal', tag: 'Simple',
    description: 'Compact logo header and a one-line certification footer. Light on ink, great for everyday printing.',
    frame: false, title: false, headerBand: false, footerBand: false, footerLine: false, paper: 'white' },
];
export const layoutById = id => LAYOUTS.find(l => l.id === id) || LAYOUTS[0];

export const BRANDING_DEFAULTS = {
  companyName: 'Hausaly EduTravels Ltd',
  badgeLine: 'CERTIFIED DOCUMENT TRANSLATOR',
  registeredLine: 'Registered With Relevant National and International Regulatory and Professional Bodies.',
  contactLine: 'www.hausaly.com | Hausaly EduTravels Ltd | contact@hausaly.com | +2348131227047 | Borno, Nigeria',
  idPrefix: 'HET',
  defaultLayout: 'official',
  digitStyle: 'western',
  tintedPaper: true,
};
export const brandingGet = () => ({ ...BRANDING_DEFAULTS, ...(settings.get('branding', {}) || {}) });
export function brandingSave(patch) {
  const cur = brandingGet(), next = { ...cur };
  for (const k of ['companyName', 'badgeLine', 'registeredLine', 'contactLine', 'idPrefix']) if (patch[k] !== undefined) next[k] = String(patch[k]).trim().slice(0, 240);
  if (patch.defaultLayout !== undefined && LAYOUTS.some(l => l.id === patch.defaultLayout)) next.defaultLayout = patch.defaultLayout;
  if (patch.digitStyle !== undefined && ['western', 'eastern'].includes(patch.digitStyle)) next.digitStyle = patch.digitStyle;
  if (patch.tintedPaper !== undefined) next.tintedPaper = !!patch.tintedPaper;
  settings.set('branding', next);
  return next;
}

// ---- replaceable artwork: the admin can upload their own logo / header / footer band ----
export const ASSETS = {
  'header-left': { file: 'header-left.png', label: 'Header artwork (logo + company statement)', hint: 'Wide strip, about 14:1 — e.g. 1680×116 px PNG with transparent background.' },
  'footer-band': { file: 'footer-band.png', label: 'Footer band (partner logos + official stamp)', hint: 'Wide strip, about 11:1 — e.g. 1650×150 px PNG with transparent background.' },
  'logo': { file: 'logo.png', label: 'Square/compact logo (home page, login, minimal layout)', hint: 'PNG with transparent background, at least 400 px wide.' },
};
const dataFile = name => path.join(config.dataDir, 'assets', name);
export function assetPath(name) {
  if (!ASSETS[name]) return null;
  for (const ext of ['png', 'jpg']) { const f = dataFile(`${name}.${ext}`); if (fs.existsSync(f)) return f; }
  return path.join(config.publicDir, 'img', ASSETS[name].file);
}
export function assetInfo(name) { const p = assetPath(name); return { name, ...ASSETS[name], custom: p.startsWith(config.dataDir), version: Math.floor(fs.statSync(p).mtimeMs / 1000) }; }
export function assetSave(name, buf) {
  if (!ASSETS[name]) throw new Error('Unknown artwork slot.');
  const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), jpg = buf[0] === 0xff && buf[1] === 0xd8;
  if (!png && !jpg) throw new Error('Please upload a PNG or JPG image.');
  assetReset(name);
  fs.writeFileSync(dataFile(`${name}.${png ? 'png' : 'jpg'}`), buf);
}
export function assetReset(name) { for (const ext of ['png', 'jpg']) fs.rmSync(dataFile(`${name}.${ext}`), { force: true }); }

export function imageSize(buf) {
  if (buf[0] === 0x89) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), ext: 'png' };
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), ext: 'jpg' };
    i += 2 + len;
  }
  throw new Error('Unreadable image.');
}

export const titleFor = (task, doc) => {
  const src = (doc?.meta?.sourceLanguage?.name || 'Unknown').toUpperCase(), tgt = (LANGS[task.target_lang]?.name || task.target_lang).toUpperCase();
  return `CERTIFIED TRANSLATION FROM ${src} TO ${tgt}`;
};
export const footerLineFor = task => `TRANSLATION DATE: ${task.translation_date}, TRANSLATOR ID: ${task.translator_id}`;
