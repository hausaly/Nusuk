// Document renderer: builds branded, paginated pages (Letter, 816×1056 px) from the document model.
// Used for the live preview (editable), the layout gallery, the PDF export and printing.
import { esc } from './ui.js';

export const PAGE_W = 816, PAGE_H = 1056;
const GEOM = {
  official:   { x: 88, y: 133, w: 640, h: 787, pad: [24, 30, 20, 30] },
  letterhead: { x: 88, y: 108, w: 640, h: 818, pad: [6, 4, 6, 4] },
  minimal:    { x: 88, y: 104, w: 640, h: 850, pad: [6, 4, 6, 4] },
};
const DIRS = { ar: 'rtl', en: 'ltr' }, LANG_NAMES = { ar: 'ARABIC', en: 'ENGLISH' };

let fontsReady;
export function ensureFonts() {
  if (!fontsReady) fontsReady = Promise.all([
    document.fonts.load('18px Amiri', 'ابتثجح abc 123'), document.fonts.load('bold 18px Amiri', 'ابتثجح abc 123'),
    document.fonts.load('14px "Bebas Neue"', 'ABC'), document.fonts.load('600 9px Montserrat', 'ABC'), document.fonts.load('700 9px Montserrat', 'ABC'),
  ]).then(() => document.fonts.ready).catch(() => {});
  return fontsReady;
}

export const titleText = (task, doc) => `CERTIFIED TRANSLATION FROM ${(doc?.meta?.sourceLanguage?.name || 'UNKNOWN').toUpperCase()} TO ${LANG_NAMES[task.targetLang] || String(task.targetLang).toUpperCase()}`;
export const footText = task => `TRANSLATION DATE: ${task.translationDate}, TRANSLATOR ID: ${task.translatorId}`;
const asset = (cfg, n) => `api/asset/${n}?v=${cfg.assets?.[n] || 0}`;

// ---------- blocks ----------
const editAttr = (o, extra = '') => o.editable ? ` contenteditable="true" spellcheck="false" data-e="1" data-sp="${o.sp}" data-bi="${o.bi}" ${extra}` : '';
function blockHtml(b, o) {
  switch (b.type) {
    case 'heading': return `<div class="blk"><div class="b-h h${b.level} al-${b.align}"${editAttr(o, 'data-k="text"')}>${esc(b.text)}</div></div>`;
    case 'paragraph': return `<div class="blk"><div class="b-p al-${b.align}${b.bold ? ' bold' : ''}"${editAttr(o, 'data-k="text"')}>${esc(b.text)}</div></div>`;
    case 'note': return `<div class="blk"><div class="b-note"${editAttr(o, 'data-k="text"')}>${esc(b.text)}</div></div>`;
    case 'divider': return `<div class="blk"><hr class="b-hr"></div>`;
    case 'list': {
      return `<div class="blk"><ul class="b-list">${b.items.map((it, i) => `<li><span class="mk">${b.ordered ? i + 1 + '.' : '•'}</span><span class="lt"${editAttr(o, `data-k="item" data-i="${i}"`)}>${esc(it)}</span></li>`).join('')}</ul></div>`;
    }
    case 'table': {
      const rows = o.rowRange ? b.rows.map((r, i) => [r, i]).slice(o.rowRange[0], o.rowRange[1]) : b.rows.map((r, i) => [r, i]);
      if (o.rowRange && b.header && o.rowRange[0] > 0) rows.unshift([b.rows[0], 0, true]);
      return `<div class="blk"><table class="b-tbl${b.borders ? ' bordered' : ''}"><tbody>${rows.map(([r, ri, rep]) =>
        `<tr class="${b.header && ri === 0 ? 'thead' : ''}">${r.map((c, ci) => `<td${rep ? '' : editAttr(o, `data-k="cell" data-r="${ri}" data-c="${ci}"`)}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    default: return '';
  }
}

// ---------- pagination ----------
function paginate(doc, geom, dir, cfgLayout) {
  const probe = document.createElement('div');
  probe.className = `page-probe pg-body ${dir}`;
  probe.setAttribute('dir', dir);
  probe.style.cssText = `position:absolute;left:-99999px;top:0;width:${geom.w - geom.pad[1] - geom.pad[3]}px;visibility:hidden`;
  document.body.appendChild(probe);
  const cap = geom.h - geom.pad[0] - geom.pad[2] - (cfgLayout.frame ? 2 : 0);
  const measure = (b, o) => { probe.innerHTML = blockHtml(b, o); return probe.firstElementChild.offsetHeight; };
  const pages = [];
  doc.pages.forEach((sp, spi) => {
    let cur = [], used = 0;
    const flush = () => { pages.push(cur); cur = []; used = 0; };
    sp.blocks.forEach((b, bi) => {
      const o = { sp: spi, bi };
      const h = measure(b, o);
      if (used + h <= cap) { cur.push({ b, o }); used += h; return; }
      if (b.type === 'table' && b.rows.length > 1) {                        // split long tables by rows
        let start = 0;
        while (start < b.rows.length) {
          let end = start + 1;
          while (end < b.rows.length && used + measure(b, { ...o, rowRange: [start, end + 1] }) <= cap) end++;
          if (used + measure(b, { ...o, rowRange: [start, end] }) > cap && cur.length) { flush(); continue; }
          cur.push({ b, o: { ...o, rowRange: [start, end] } }); used += measure(b, { ...o, rowRange: [start, end] }); start = end;
          if (start < b.rows.length) flush();
        }
        return;
      }
      if (cur.length) flush();
      cur.push({ b, o }); used = h;
    });
    if (cur.length || !sp.blocks.length) pages.push(cur);
  });
  probe.remove();
  return pages.length ? pages : [[]];
}

// ---------- page chrome ----------
function chrome(layout, task, doc, cfg, n, total) {
  const B = cfg.branding || {}, contact = esc(B.contactLine || '').replace(esc(B.companyName || '§'), `<b>${esc(B.companyName || '')}</b>`);
  const num = total > 1 ? `<div class="pg-num">PAGE ${n} / ${total}</div>` : '';
  const foot = `<div class="pg-foot">${esc(footText(task))}</div>`;
  const band = layout.headerBand ? `
    <div class="pg-header"><img class="hdr-left" src="${asset(cfg, 'header-left')}" alt="${esc(B.companyName || '')}">
      <div class="hdr-right"><svg class="hdr-ico" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="#8c8c8c" stroke-width="1.6"/><circle cx="20" cy="20" r="14" fill="none" stroke="#a5a5a5" stroke-width=".8" stroke-dasharray="3 2"/><path d="M13 12h12l3 3v13H13z" fill="#7d7d7d"/><path d="M16 17h8M16 20h8M16 23h5" stroke="#d6d6d6" stroke-width="1.2"/></svg>
        <div class="hdr-txt"><b>${esc(B.badgeLine || '')}</b><b>TRANSLATOR ID: ${esc(task.translatorId)}</b></div></div></div>
    <div class="pg-rule top"></div>` : `
    <div class="pg-minihead"><img src="${asset(cfg, 'logo')}" alt="${esc(B.companyName || '')}"><div class="mh-txt"><b>${esc(B.companyName || '')}</b><span>${esc(titleText(task, doc))}</span></div></div>
    <div class="pg-rule mini"></div>`;
  const title = layout.title ? `<div class="pg-title">${esc(titleText(task, doc))}</div>` : '';
  const bottom = layout.footerLine ? `<div class="pg-rule bottom"></div><div class="pg-reg">${esc(B.registeredLine || '')}</div>` : '';
  const fband = layout.footerBand ? `<img class="pg-band" src="${asset(cfg, 'footer-band')}" alt="">` : '';
  return `${band}${title}${foot}${num}${bottom}${fband}<div class="pg-contact">${contact}</div>`;
}

function pageEl(layout, task, doc, cfg, units, dir, n, total, geom, editable) {
  const el = document.createElement('div');
  el.className = `page lay-${layout.id}${layout.paper === 'tint' && cfg.branding?.tintedPaper !== false ? ' tinted' : ''}`;
  el.dataset.page = n;
  const bodyStyle = `left:${geom.x}px;top:${geom.y}px;width:${geom.w}px;height:${geom.h}px;padding:${geom.pad[0]}px ${geom.pad[1]}px ${geom.pad[2]}px ${geom.pad[3]}px`;
  el.innerHTML = chrome(layout, task, doc, cfg, n, total) +
    `<div class="pg-frame${layout.frame ? ' framed' : ''} ${dir}" dir="${dir}" style="${bodyStyle}"><div class="pg-body ${dir}">${units.map(u => blockHtml(u.b, { ...u.o, editable })).join('')}</div></div>`;
  return el;
}

/** Render the whole document into `container`. Returns the page elements. */
export async function renderDocument(container, { task, doc, cfg, editable = false }) {
  await ensureFonts();
  const layout = cfg.layouts.find(l => l.id === task.layout) || cfg.layouts[0], geom = GEOM[layout.id] || GEOM.official, dir = DIRS[task.targetLang] || 'ltr';
  const pages = paginate(doc, geom, dir, layout);
  container.replaceChildren(...pages.map((units, i) => pageEl(layout, task, doc, cfg, units, dir, i + 1, pages.length, geom, editable)));
  return [...container.children];
}

/** Rendered once at full size, off-screen and non-editable: the source for PDF/print. */
export async function renderClean(opts) {
  const host = document.createElement('div');
  host.className = 'export-host';
  document.body.appendChild(host);
  const pages = await renderDocument(host, { ...opts, editable: false });
  return { host, pages };
}

// ---------- applying inline edits back to the model ----------
export function applyEdit(doc, el) {
  const d = el.dataset, b = doc.pages[+d.sp]?.blocks[+d.bi];
  if (!b) return false;
  const text = el.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').replace(/\n$/, '');
  if (d.k === 'text') b.text = text;
  else if (d.k === 'item') b.items[+d.i] = text;
  else if (d.k === 'cell') b.rows[+d.r][+d.c] = text;
  return true;
}
