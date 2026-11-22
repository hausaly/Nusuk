import { api, html, mount, $, $$, toast, esc, debounce, ENGINE_LABEL, ApiError } from './ui.js';
import { S, isAdmin } from './state.js';
import { renderDocument, applyEdit, PAGE_W } from './render.js';
import { downloadPdf, downloadDocx, printDoc, countDownload } from './export.js';

const view = () => $('#view');
const LANG = { ar: 'Arabic', en: 'English' };

export async function taskView(id) {
  let task = await api('GET', `tasks/${id}`), poll = null, ro = null, saveTimer = null;
  S.cleanup = () => { clearInterval(poll); ro?.disconnect(); clearTimeout(saveTimer); window.removeEventListener('resize', fit); window.removeEventListener('beforeunload', warn); };

  // ---------- processing / failed ----------
  const stage = t => t.job?.stage || 'Working…';
  async function watch() {
    clearInterval(poll);
    poll = setInterval(async () => {
      try {
        const t = await api('GET', `tasks/${id}`);
        const el = $('#stage'); if (el) el.textContent = stage(t);
        if (t.status !== 'processing') { clearInterval(poll); if (busy) afterRevise(); else { task = t; show(); } }
      } catch (e) { if (e.status === 404 || e.status === 401) { clearInterval(poll); throw e; } }
    }, 1800);
  }
  function showProcessing() {
    mount(view(), html`<div class="wrap"><div class="card narrow proc"><div class="ring"></div><h2>Translating ${task.fileName}</h2>
      <p class="muted" id="stage">${stage(task)}</p><div class="bar"><i></i></div>
      <p class="small muted" style="margin-top:22px">Reading the text, detecting the language and rebuilding the layout — usually 20–60 seconds. You can leave this page; the job continues and appears under <a href="#/records">Records</a>.</p></div></div>`);
    watch();
  }
  function showFailed() {
    mount(view(), html`<div class="wrap"><div class="card narrow"><h2>We could not translate this file</h2>
      <div class="alert bad" role="alert">${task.error || 'Unknown error.'}</div>
      <p class="muted small">${task.ref} · ${task.fileName}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn accent" href="#/translate">Try again</a><a class="btn ghost" href="#/records">Back to records</a>
      ${isAdmin() ? html`<a class="btn ghost" href="#/admin/engines">Check AI engines</a>` : ''}</div></div></div>`);
  }

  // ---------- review ----------
  let pagesEl, stageEl, dirty = new Set(), saving = false, busy = false;
  const cfgOpts = () => ({ task, doc: task.doc, cfg: S.cfg });
  const warn = e => { if (dirty.size || saving) { e.preventDefault(); e.returnValue = ''; } };

  function fit() {
    if (!pagesEl) return;
    const s = Math.min(1, (stageEl.clientWidth - 8) / PAGE_W), host = $('#scale');
    host.style.transform = `scale(${s})`; $('#scaleBox').style.width = `${PAGE_W * s}px`; $('#scaleBox').style.height = `${pagesEl.offsetHeight * s}px`;
  }
  async function paint() {
    await renderDocument(pagesEl, { ...cfgOpts(), editable: true });
    fit();
  }
  const langLine = () => `${task.sourceLangName || 'Auto'} → ${LANG[task.targetLang]}`;
  const noticeHtml = () => {
    const parts = [];
    if (task.error) parts.push(html`<div class="alert bad" role="alert"><b>Last action failed:</b> ${task.error}</div>`);
    if (task.job?.notice) parts.push(html`<div class="alert info">ℹ️ ${task.job.notice}</div>`);
    if (task.job?.summary && task.job.kind !== 'translate') parts.push(html`<div class="alert ok">✔ ${task.job.summary}</div>`);
    return parts;
  };

  function dockHtml() {
    const eng = (S.engines || []).map(e => html`<option value="${e.id}" ${e.state === 'nokey' || e.state === 'disabled' ? 'disabled' : ''}>${ENGINE_LABEL[e.id]}${e.state === 'cooling' ? ' (resting)' : ''}</option>`);
    const cmd = html`<h3>Correction command <span class="muted" style="font-weight:400">— or click any text on the page to edit it directly</span></h3>
      <div class="row"><textarea id="cmd" maxlength="3000" placeholder="Type what to fix, e.g. “Change the father’s name to Musa Ibrahim”, “The date of birth is 14-03-1988”, “Remove the last line”, “Translate ‘Borno’ as ‘برنو’”…" aria-label="Correction command"></textarea>
        <div class="side"><button class="btn accent" id="apply">Apply correction</button>${task.status === 'draft' ? html`<button class="btn ok" id="approve">✔ Approve &amp; finish</button>` : ''}</div></div>
      <div class="opts"><label class="check" style="align-items:center"><input type="checkbox" id="useOrig" checked ${task.hasSource ? '' : 'disabled'} style="margin:0;width:15px;height:15px"> <span>Compare with the original file${task.hasSource ? '' : ' (no longer stored)'}</span></label>
        <label>Engine <select id="reng"><option value="auto">Auto</option>${eng}</select></label><span id="savestat" class="muted" aria-live="polite"></span></div>`;
    if (task.status === 'completed' && !S.showCmd) return html`<div class="dock"><div class="in"><div class="done">
      <span class="chip ok">✔ Approved ${task.ref}</span>
      <button class="btn dark" id="dlPdf">⬇ Download PDF</button><button class="btn" id="dlDocx">⬇ Download Word</button>
      <button class="btn ghost" id="printBtn" title="Vector PDF with selectable text via your browser's print dialog">🖨 Print / Save as vector PDF</button>
      <button class="btn ghost sm" id="reopen">Make a correction</button><a class="btn ghost sm" href="#/translate">New translation</a></div><div class="status-line center muted" id="dlstat"></div></div></div>`;
    return html`<div class="dock"><div class="in">${cmd}${task.status === 'completed' ? html`<div class="status-line muted">Any change will require approval again before downloading.</div>` : ''}</div></div>`;
  }

  function topHtml() {
    return html`<div class="review-top"><div class="in">
      <div class="ttl"><b>${task.ref} <span class="chip ${task.status === 'completed' ? 'ok' : 'warn'}" style="margin-left:6px">${task.status === 'completed' ? 'Approved' : 'Draft — review'}</span></b>
        <span>${task.fileName} · ${langLine()} · ${task.pages} page${task.pages === 1 ? '' : 's'} · engine: ${ENGINE_LABEL[task.engine] || '—'}${task.documentType ? ' · ' + task.documentType : ''}</span></div>
      <div class="sp"></div>
      <label class="small muted" for="layoutSel" style="margin:0">Layout</label>
      <select id="layoutSel" style="width:auto;min-height:36px;padding:4px 10px">${S.cfg.layouts.map(l => html`<option value="${l.id}" ${l.id === task.layout ? 'selected' : ''}>${l.name}</option>`)}</select>
      <button class="btn ghost sm" id="detailsBtn">Page details</button>
      <button class="btn ghost sm" id="undoBtn" ${task.canUndo ? '' : 'disabled'}>↶ Undo</button>
      ${task.hasSource ? html`<a class="btn ghost sm" href="api/tasks/${task.id}/source" target="_blank" rel="noopener">View original</a>` : ''}
    </div></div>
    <div class="notice-bar" id="notices">${noticeHtml()}</div>`;
  }

  async function show() {
    if (task.status === 'processing') return showProcessing();
    if (task.status === 'failed') return showFailed();
    S.engines = (await api('GET', 'engines').catch(() => ({ engines: [] }))).engines;
    mount(view(), html`${topHtml()}<div class="stage" id="stageEl"><div id="scaleBox"><div id="scale" class="pages-scale"><div class="pages" id="pagesEl"></div></div></div></div><div id="dockHost"></div>
      <dialog id="dlg"></dialog>`);
    pagesEl = $('#pagesEl'); stageEl = $('#stageEl');
    wireTop(); drawDock();
    await paint();
    ro?.disconnect(); ro = new ResizeObserver(debounce(fit, 60)); ro.observe(stageEl);
    window.addEventListener('resize', fit); window.addEventListener('beforeunload', warn);
    pagesEl.addEventListener('input', e => { if (e.target.dataset?.e) { dirty.add(e.target); $('#savestat') && ($('#savestat').textContent = 'Editing…'); queueSave(); } });
    pagesEl.addEventListener('paste', e => { if (e.target.dataset?.e) { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); } });
    pagesEl.addEventListener('focusout', () => { setTimeout(async () => { if (!pagesEl.contains(document.activeElement) && needRepaint) { needRepaint = false; await paint(); } }, 120); });
  }

  let needRepaint = false, lastCmd = '';
  const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 900); };
  async function save() {
    if (!dirty.size || saving) { if (dirty.size) queueSave(); return; }
    saving = true;
    const els = [...dirty]; dirty = new Set();
    const next = structuredClone(task.doc); els.forEach(el => applyEdit(next, el));
    try {
      const t = await api('PUT', `tasks/${id}/doc`, { doc: next });
      const wasDone = task.status === 'completed'; task = t; needRepaint = true;
      $('#savestat') && ($('#savestat').textContent = '✔ All changes saved');
      if (wasDone) { drawDock(); $('#undoBtn')?.removeAttribute('disabled'); topRefresh(); } else $('#undoBtn')?.removeAttribute('disabled');
    } catch (e) { els.forEach(x => dirty.add(x)); $('#savestat') && ($('#savestat').textContent = ''); toast(e.message, 'error'); }
    saving = false;
    if (dirty.size) queueSave();
  }
  function topRefresh() { const n = $('.review-top'); if (!n) return; const tmp = document.createElement('div'); tmp.innerHTML = topHtml(); n.replaceWith(tmp.children[0]); $('#notices').replaceWith(tmp.children[0]); wireTop(); }

  function wireTop() {
    $('#layoutSel')?.addEventListener('change', async e => { try { task = await api('PATCH', `tasks/${id}`, { layout: e.target.value }); await paint(); } catch (err) { toast(err.message, 'error'); } });
    $('#undoBtn')?.addEventListener('click', async () => { if (busy) return; try { await flush(); task = await api('POST', `tasks/${id}/undo`, {}); await paint(); topRefresh(); drawDock(); toast('Last change undone.'); } catch (err) { toast(err.message, 'error'); } });
    $('#detailsBtn')?.addEventListener('click', openDetails);
  }
  async function flush() { clearTimeout(saveTimer); if (dirty.size) await save(); }

  function openDetails() {
    const dlg = $('#dlg');
    mount(dlg, html`<form method="dialog" id="df" style="min-width:min(92vw,420px)"><h3>Page details</h3>
      <div class="field"><label class="f" for="d1">Translator ID</label><input id="d1" type="text" value="${task.translatorId}"><div class="err" data-e="translatorId"></div></div>
      <div class="field"><label class="f" for="d2">Translation date (DD-MM-YYYY)</label><input id="d2" type="text" value="${task.translationDate}"><div class="err" data-e="translationDate"></div></div>
      <div class="field"><label class="f" for="d3">Client / reference</label><input id="d3" type="text" value="${task.clientRef}" maxlength="120"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn ghost" id="dc">Cancel</button><button class="btn" id="ds" value="ok">Save</button></div></form>`);
    dlg.showModal();
    $('#dc').onclick = () => dlg.close();
    $('#df').onsubmit = async e => {
      e.preventDefault(); $$('[data-e]', dlg).forEach(x => x.textContent = '');
      try { task = await api('PATCH', `tasks/${id}`, { translatorId: $('#d1').value, translationDate: $('#d2').value, clientRef: $('#d3').value }); dlg.close(); await paint(); topRefresh(); toast('Details saved.', 'ok'); }
      catch (err) { Object.entries(err.errors || {}).forEach(([k, v]) => { const n = $(`[data-e="${k}"]`, dlg); if (n) n.textContent = v; }); if (!Object.keys(err.errors || {}).length) toast(err.message, 'error'); }
    };
  }

  function drawDock() {
    mount($('#dockHost'), dockHtml());
    $('#apply')?.addEventListener('click', applyCorrection);
    $('#cmd')?.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') applyCorrection(); });
    $('#approve')?.addEventListener('click', approve);
    $('#reopen')?.addEventListener('click', () => { S.showCmd = true; drawDock(); $('#cmd')?.focus(); });
    $('#dlPdf')?.addEventListener('click', e => doPdf(e.currentTarget));
    $('#dlDocx')?.addEventListener('click', e => doDocx(e.currentTarget));
    $('#printBtn')?.addEventListener('click', async e => { e.currentTarget.disabled = true; try { await printDoc(cfgOpts()); countDownload(id); } finally { e.currentTarget.disabled = false; } });
    const h = $('.dock')?.offsetHeight || 200; stageEl && (stageEl.style.paddingBottom = `${h + 24}px`);
  }

  async function applyCorrection() {
    if (busy) return;
    const text = $('#cmd').value.trim();
    if (text.length < 3) { $('#cmd').focus(); toast('Type what should be corrected first.', 'error'); return; }
    busy = true; const btn = $('#apply'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Working…';
    $('#approve')?.setAttribute('disabled', ''); $('#cmd').disabled = true;
    try {
      await flush();
      lastCmd = text;
      await api('POST', `tasks/${id}/revise`, { instruction: text, engine: $('#reng').value, useOriginal: $('#useOrig').checked });
      $('#savestat').textContent = 'Applying your correction…';
      watch();
    } catch (e) { busy = false; toast(e.message, 'error'); drawDock(); }
  }
  async function afterRevise() {
    busy = false; S.showCmd = false;
    task = await api('GET', `tasks/${id}`);
    await paint(); topRefresh(); drawDock();
    if (task.error && $('#cmd')) $('#cmd').value = lastCmd;
    task.error ? toast('The correction could not be applied.', 'error') : toast('Correction applied — please check the page.', 'ok');
  }

  async function approve() {
    if (busy) return; await flush();
    if (!confirm('Approve this translation as reviewed and correct? You can still make corrections afterwards, but it must be approved again before downloading.')) return;
    const b = $('#approve'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    try { task = await api('POST', `tasks/${id}/complete`, {}); S.showCmd = false; topRefresh(); drawDock(); toast('Approved and saved to your records.', 'ok'); }
    catch (e) { toast(e.message, 'error'); b.disabled = false; b.textContent = '✔ Approve & finish'; }
  }
  async function doPdf(btn) {
    const label = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Preparing PDF…';
    try { await downloadPdf(cfgOpts(), `${task.ref}.pdf`, S.cfg.build, (i, n) => { btn.innerHTML = `<span class="spin"></span> Page ${i} of ${n}…`; }); countDownload(id); $('#dlstat').textContent = 'PDF downloaded.'; }
    catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; btn.textContent = label; }
  }
  async function doDocx(btn) {
    const label = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Preparing Word file…';
    try { await downloadDocx(task); $('#dlstat').textContent = 'Word file downloaded.'; } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; btn.textContent = label; }
  }

  S.showCmd = false;
  await show();
}
