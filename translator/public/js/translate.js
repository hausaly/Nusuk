import { api, html, mount, $, $$, toast, today, ENGINE_LABEL, ApiError } from './ui.js';
import { S, isAdmin } from './state.js';

const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

/** Phone photos are huge: shrink big images before upload (faster, cheaper, same legibility). */
async function prepare(file) {
  if (!file.type.startsWith('image/') || file.size < 2.5 * 1048576) return file;
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 2800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
const toBase64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(file); });

const engineOption = e => {
  const note = e.state === 'ready' ? '' : e.state === 'nokey' ? ' — not set up' : e.state === 'disabled' ? ' — turned off' : ' — resting (limit reached)';
  return html`<option value="${e.id}" ${e.state === 'nokey' || e.state === 'disabled' ? 'disabled' : ''}>${ENGINE_LABEL[e.id] || e.label}${note}</option>`;
};

export async function newTranslation() {
  const cfg = S.cfg, { engines, anyReady } = await api('GET', 'engines');
  let file = null;
  mount($('#view'), html`<div class="wrap"><div class="narrow">
    <h2>New translation</h2><p class="muted">Upload the original document. The language is detected automatically.</p>
    ${anyReady ? '' : html`<div class="alert bad" role="alert"><b>No AI engine is ready.</b> ${engines.some(e => e.state === 'cooling') ? 'All engines have reached their free limit for now — they reset automatically; try again shortly.' : 'An administrator needs to add an API key.'} ${isAdmin() ? html`<a href="#/admin/engines">Open AI Engines →</a>` : ''}</div>`}
    <form id="tf" novalidate>
      <div class="field"><div class="drop" id="drop" tabindex="0" role="button" aria-label="Choose a file to translate">
        <div class="big">📄</div><p style="margin:8px 0 2px"><b>Drop the document here</b> or click to choose</p>
        <p class="small muted" style="margin:0">PDF, JPG, PNG or WEBP · up to ${cfg.limits.maxUploadMb} MB · up to ${cfg.limits.maxPages} pages</p>
        <input id="file" type="file" accept=".pdf,application/pdf,image/png,image/jpeg,image/webp" class="hide"></div><div class="err" data-e="file"></div></div>

      <div class="grid2">
        <div class="field"><label class="f">Source language</label><div class="src-chip">🔎 <span><b>Detected automatically</b> from the document</span></div></div>
        <div class="field"><label class="f">Translate into</label>
          <div class="seg" role="radiogroup" aria-label="Target language">
            ${cfg.languages.map((l, i) => html`<label><input type="radio" name="target" value="${l.code}" ${i === 0 ? 'checked' : ''}><span>${l.name} <span style="display:inline;padding:0;font-family:Amiri,serif;font-size:1.05em">${l.code === 'ar' ? l.native : ''}</span></span></label>`)}
          </div></div>
      </div>

      <div class="field"><label class="f">Page layout</label>
        <div class="lay-pick">${cfg.layouts.map(l => html`<label><input type="radio" name="layout" value="${l.id}" ${l.id === cfg.branding.defaultLayout ? 'checked' : ''}><div class="opt"><b>${l.name}</b><span>${l.tag}</span></div></label>`)}</div></div>

      <div class="grid3">
        <div class="field"><label class="f" for="tid">Translator ID</label><input id="tid" type="text" value="${S.user.translatorId || ''}" placeholder="HET/T002/26" autocomplete="off"><div class="err" data-e="translatorId"></div></div>
        <div class="field"><label class="f" for="tdate">Translation date</label><input id="tdate" type="text" value="${today()}" placeholder="DD-MM-YYYY" inputmode="numeric"><div class="err" data-e="translationDate"></div></div>
        <div class="field"><label class="f" for="cref">Client / reference <span class="muted">(optional)</span></label><input id="cref" type="text" maxlength="120" placeholder="e.g. client name or file no."></div>
      </div>

      <details class="more"><summary>More options</summary>
        <div class="grid2" style="margin-top:10px">
          <div class="field"><label class="f" for="eng">AI engine</label><select id="eng"><option value="auto">Auto — best available (recommended)</option>${engines.map(engineOption)}</select>
            <div class="hint">Auto tries engines in the order set by the administrator and switches by itself when one runs out.</div></div>
          <div class="field"><label class="check" style="margin-top:28px"><input type="checkbox" id="strict"><span>Do not switch engines automatically<br><span class="hint">Fail instead if the chosen engine is unavailable.</span></span></label></div>
        </div>
        <div class="field"><label class="f" for="notes">Notes for the translator <span class="muted">(optional)</span></label><textarea id="notes" maxlength="800" placeholder="e.g. Spell the name as ‘Muhammad’. The stamp reads …"></textarea></div>
      </details>

      <div id="ferr"></div>
      <button class="btn accent lg" id="go" ${anyReady ? '' : 'disabled'}>Translate document</button>
    </form></div></div>`);

  const drop = $('#drop'), input = $('#file');
  const setFile = async f => {
    if (!f) return; file = f;
    drop.classList.add('has'); mount(drop, html`<div class="big">✅</div><p style="margin:8px 0 2px"><b>${f.name}</b></p><p class="small muted" style="margin:0">${fmtSize(f.size)} · click to replace</p>`);
    $('[data-e=file]').textContent = '';
  };
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => setFile(input.files[0]));
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => setFile(e.dataTransfer.files[0]));

  $('#tf').addEventListener('submit', async e => {
    e.preventDefault(); $$('[data-e]').forEach(x => x.textContent = ''); $('#ferr').innerHTML = '';
    if (!file) { $('[data-e=file]').textContent = 'Please choose a PDF or image file.'; drop.focus(); return; }
    const btn = $('#go'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Uploading…';
    try {
      const up = await prepare(file);
      if (up.size > cfg.limits.maxUploadMb * 1048576) throw new ApiError(`The file is larger than ${cfg.limits.maxUploadMb} MB.`, 422, { file: `The file is larger than ${cfg.limits.maxUploadMb} MB.` });
      const t = await api('POST', 'tasks', {
        fileName: up.name, data: await toBase64(up), target: $('[name=target]:checked').value, layout: $('[name=layout]:checked').value,
        engine: $('#eng').value, strict: $('#strict').checked, translatorId: $('#tid').value.trim(), translationDate: $('#tdate').value.trim(), clientRef: $('#cref').value.trim(), notes: $('#notes').value.trim(),
      });
      location.hash = `#/task/${t.id}`;
    } catch (err) {
      Object.entries(err.errors || {}).forEach(([k, v]) => { const n = $(`[data-e="${k}"]`); if (n) n.textContent = v; });
      if (!Object.keys(err.errors || {}).length) mount($('#ferr'), html`<div class="alert bad" role="alert">${err.message}</div>`);
      btn.disabled = false; btn.textContent = 'Translate document';
    }
  });
}
