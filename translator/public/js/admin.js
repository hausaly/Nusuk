import { api, html, mount, $, $$, toast, fmtDate, ENGINE_LABEL, ApiError } from './ui.js';
import { S } from './state.js';

const TABS = [['overview', 'Overview'], ['engines', 'AI Engines'], ['branding', 'Branding & layouts'], ['users', 'Users']];
const view = () => $('#view');

export async function admin(tab) {
  if (!TABS.some(t => t[0] === tab)) tab = 'overview';
  mount(view(), html`<div class="wrap"><h2>Administration</h2>
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => html`<a href="#/admin/${k}" class="${k === tab ? 'on' : ''}" role="tab" aria-selected="${k === tab}">${l}</a>`)}</div><div id="tab"></div></div>`);
  await ({ overview, engines, branding, users }[tab])($('#tab'));
}

const fieldErrs = (root, err) => { Object.entries(err.errors || {}).forEach(([k, v]) => { const n = $(`[data-e="${k}"]`, root); if (n) n.textContent = v; }); if (!Object.keys(err.errors || {}).length) toast(err.message, 'error'); };
const bar = (rows, key, label) => { const max = Math.max(1, ...rows.map(r => r.n)); return html`<div class="bars">${rows.map(r => html`<div class="bar-row"><span>${label(r)}</span><div class="t"><i style="width:${Math.round(r.n / max * 100)}%"></i></div><b>${r.n}</b></div>`)}</div>`; };

// ---------- overview ----------
async function overview(el) {
  const [s, { engines }] = await Promise.all([api('GET', 'tasks/summary'), api('GET', 'admin/engines')]);
  mount(el, html`<div class="stats">
      <div class="stat"><b>${s.total}</b><span>All translations</span></div><div class="stat"><b>${s.completed}</b><span>Completed</span></div>
      <div class="stat"><b>${s.pages}</b><span>Pages completed</span></div><div class="stat"><b>${s.today}</b><span>Started today</span></div></div>
    <div class="grid2">
      <div class="card"><h3>AI engines today</h3>${engines.map(e => html`<p style="display:flex;gap:8px;align-items:center;margin:0 0 10px"><span class="dot ${e.state === 'ready' ? 'ok' : e.state === 'cooling' ? 'warn' : 'bad'}"></span><b>${e.label}</b>
        <span class="muted small">${e.state === 'ready' ? 'ready' : e.state === 'cooling' ? 'resting until ' + new Date(e.coolingUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : e.state === 'nokey' ? 'no key' : 'off'} · ${e.todayOk} ok / ${e.todayFailed} failed today</span></p>`)}
        <a href="#/admin/engines" class="small">Manage engines →</a></div>
      <div class="card"><h3>Completed by language pair</h3>${s.byPair.length ? bar(s.byPair, 'n', r => `${(r.s || '?').toUpperCase()} → ${(r.t || '').toUpperCase()}`) : html`<p class="muted">Nothing yet.</p>`}
        <h3 style="margin-top:22px">Completed by translator</h3>${s.byUser?.length ? bar(s.byUser, 'n', r => r.u) : html`<p class="muted">Nothing yet.</p>`}</div>
    </div>`);
}

// ---------- engines ----------
const stateChip = e => e.state === 'ready' ? html`<span class="chip ok">● Ready</span>` : e.state === 'cooling' ? html`<span class="chip warn">⏸ Resting until ${new Date(e.coolingUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${e.coolingReason}</span>` : e.state === 'nokey' ? html`<span class="chip">No API key</span>` : html`<span class="chip">Turned off</span>`;

async function engines(el) {
  let { engines: list } = await api('GET', 'admin/engines');
  const draw = () => {
    mount(el, html`<div class="alert info"><b>How switching works.</b> Requests go to the first ready engine in the order below. If an engine hits its free limit, is rate-limited, busy, or its key stops working, it is set aside and the next engine takes over automatically — users are told when this happens. Gemini offers a free API tier; OpenAI and Anthropic API keys are billed separately from ChatGPT / Claude.ai subscriptions.</div>
      ${list.map((e, i) => html`<div class="card eng" data-id="${e.id}">
        <div class="pri" title="Priority">${i + 1}</div>
        <div><h3 style="margin:0 0 4px">${e.label} ${stateChip(e)}</h3>
          <p class="muted small" style="margin:0 0 8px">${e.help}</p>
          <p class="small" style="margin:0">Today: <b>${e.todayOk}</b> ok · <b>${e.todayFailed}</b> failed · all time <b>${e.totalOk}</b> ${e.lastError ? html`<br><span class="muted">Last error: ${e.lastError}</span>` : ''}</p>
          <div class="eng-grid">
            <div class="field" style="margin:0"><label class="f" for="k-${e.id}">API key ${e.hasKey ? html`<span class="muted">(saved ${e.keyHint} · from ${e.keySource === 'env' ? 'server setting' : 'this page'})</span>` : ''}</label>
              <input id="k-${e.id}" type="password" autocomplete="off" placeholder="${e.hasKey ? 'Leave blank to keep the saved key' : 'Paste API key'}"></div>
            <div class="field" style="margin:0"><label class="f" for="m-${e.id}">Model</label><input id="m-${e.id}" type="text" list="ml-${e.id}" value="${e.model}"><datalist id="ml-${e.id}">${e.models.map(m => html`<option value="${m}">`)}</datalist></div>
            ${e.id === 'openai' ? html`<div class="field" style="margin:0;grid-column:1/-1"><label class="f" for="u-${e.id}">Base URL <span class="muted">(optional — for OpenAI-compatible providers)</span></label><input id="u-${e.id}" type="text" value="${e.baseUrl}" placeholder="https://api.openai.com/v1"><div class="err" data-e="baseUrl"></div></div>` : ''}
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center">
            <label class="check" style="align-items:center"><input type="checkbox" id="en-${e.id}" ${e.enabled ? 'checked' : ''} style="margin:0"> Enabled</label>
            <button class="btn sm" data-save="${e.id}">Save</button><button class="btn ghost sm" data-test="${e.id}" ${e.hasKey ? '' : 'disabled'}>Test connection</button>
            ${e.state === 'cooling' ? html`<button class="btn ghost sm" data-reset="${e.id}">Try again now</button>` : ''}
            ${e.hasKey && e.keySource === 'admin' ? html`<button class="btn danger sm" data-clear="${e.id}">Remove key</button>` : ''}</div>
          <div class="small" id="t-${e.id}" style="margin-top:8px" aria-live="polite"></div></div>
        <div style="display:flex;flex-direction:column;gap:6px"><button class="btn ghost sm" data-up="${e.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${e.label} up">▲</button><button class="btn ghost sm" data-down="${e.id}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move ${e.label} down">▼</button></div>
      </div>`)}`);
    $$('[data-save]').forEach(b => b.onclick = () => save(b.dataset.save));
    $$('[data-clear]').forEach(b => b.onclick = async () => { if (confirm('Remove the saved API key for this engine?')) { await put(b.dataset.clear, { key: '' }); toast('Key removed.'); } });
    $$('[data-test]').forEach(b => b.onclick = () => test(b.dataset.test, b));
    $$('[data-reset]').forEach(b => b.onclick = async () => { ({ engines: list } = await api('POST', `admin/engines/${b.dataset.reset}/reset`, {})); draw(); });
    $$('[data-up]').forEach(b => b.onclick = () => move(b.dataset.up, -1)); $$('[data-down]').forEach(b => b.onclick = () => move(b.dataset.down, 1));
  };
  const put = async (id, body) => { try { ({ engines: list } = await api('PUT', `admin/engines/${id}`, body)); draw(); } catch (e) { fieldErrs(el, e); throw e; } };
  const save = async id => {
    const body = { enabled: $(`#en-${id}`).checked, model: $(`#m-${id}`).value };
    const k = $(`#k-${id}`).value.trim(); if (k) body.key = k;
    if (id === 'openai') body.baseUrl = $('#u-openai').value;
    try { await put(id, body); toast('Saved.', 'ok'); } catch {}
  };
  const test = async (id, btn) => {
    const out = $(`#t-${id}`); btn.disabled = true; out.innerHTML = '<span class="spin"></span> Testing…';
    try { const r = await api('POST', `admin/engines/${id}/test`, {}); list = r.engines; out.innerHTML = `<span style="color:var(--ok)">✔ Connected in ${r.ms} ms.</span>`; setTimeout(draw, 1800); }
    catch (e) { if (e.data?.engines) list = e.data.engines; out.innerHTML = ''; out.textContent = `✖ ${e.message}`; out.style.color = 'var(--bad)'; btn.disabled = false; }
  };
  const move = async (id, d) => {
    const order = list.map(e => e.id), i = order.indexOf(id), j = i + d; if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]]; ({ engines: list } = await api('PUT', 'admin/engine-order', { order })); draw();
  };
  draw();
}

// ---------- branding ----------
async function branding(el) {
  let { branding: b, assets, layouts } = await api('GET', 'admin/branding');
  const draw = () => mount(el, html`
    <form class="card" id="bf" novalidate><h3>Page text &amp; defaults</h3>
      <div class="grid2">
        <div class="field"><label class="f" for="b1">Company name</label><input id="b1" type="text" value="${b.companyName}"></div>
        <div class="field"><label class="f" for="b2">Header badge text</label><input id="b2" type="text" value="${b.badgeLine}"></div>
      </div>
      <div class="field"><label class="f" for="b3">Footer “registered with” line</label><input id="b3" type="text" value="${b.registeredLine}"></div>
      <div class="field"><label class="f" for="b4">Footer contact line</label><input id="b4" type="text" value="${b.contactLine}"><div class="hint">The company name above is shown in bold wherever it appears in this line.</div></div>
      <div class="grid3">
        <div class="field"><label class="f" for="b5">Reference prefix</label><input id="b5" type="text" value="${b.idPrefix}" maxlength="8"><div class="hint">Records read ${b.idPrefix}-TR-2026-00001</div></div>
        <div class="field"><label class="f" for="b6">Default layout</label><select id="b6">${layouts.map(l => html`<option value="${l.id}" ${l.id === b.defaultLayout ? 'selected' : ''}>${l.name}</option>`)}</select></div>
        <div class="field"><label class="f" for="b7">Digits in Arabic output</label><select id="b7"><option value="western" ${b.digitStyle === 'western' ? 'selected' : ''}>Western (0 1 2 3)</option><option value="eastern" ${b.digitStyle === 'eastern' ? 'selected' : ''}>Eastern Arabic (٠ ١ ٢ ٣)</option></select></div>
      </div>
      <label class="check" style="margin-bottom:16px"><input type="checkbox" id="b8" ${b.tintedPaper ? 'checked' : ''}> Cream paper tint on the Certified Translation layout (as in your template)</label>
      <button class="btn">Save changes</button></form>
    <div class="card"><h3>Artwork</h3><p class="muted small">Replace the logo and header/footer strips with your final artwork. Use PNG with a transparent background. “Reset” returns to the built-in version taken from your template.</p>
      ${assets.map(a => html`<div class="asset"><div class="pv"><img src="api/asset/${a.name}?v=${a.version}" alt="${a.label}"></div>
        <div><b>${a.label}</b> ${a.custom ? html`<span class="chip accent">Custom</span>` : html`<span class="chip">Built-in</span>`}<p class="hint" style="margin:2px 0 8px">${a.hint}</p>
          <input type="file" id="af-${a.name}" accept="image/png,image/jpeg" class="hide"><button class="btn ghost sm" data-up="${a.name}">Upload new…</button>
          ${a.custom ? html` <button class="btn danger sm" data-reset="${a.name}">Reset</button>` : ''}<div class="err" data-e="file-${a.name}"></div></div></div>`)}</div>`);
  const wire = () => {
    $('#bf').onsubmit = async e => {
      e.preventDefault();
      try { ({ branding: b } = await api('PUT', 'admin/branding', { companyName: $('#b1').value, badgeLine: $('#b2').value, registeredLine: $('#b3').value, contactLine: $('#b4').value, idPrefix: $('#b5').value, defaultLayout: $('#b6').value, digitStyle: $('#b7').value, tintedPaper: $('#b8').checked })); S.cfg = await api('GET', 'config'); toast('Branding saved.', 'ok'); }
      catch (err) { toast(err.message, 'error'); }
    };
    $$('[data-up]').forEach(btn => btn.onclick = () => $(`#af-${btn.dataset.up}`).click());
    $$('input[type=file]').forEach(inp => inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return; const name = inp.id.slice(3);
      if (f.size > 3 * 1048576) { $(`[data-e="file-${name}"]`).textContent = 'Image is larger than 3 MB.'; return; }
      const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(f); });
      try { ({ assets } = await api('PUT', `admin/assets/${name}`, { data })); S.cfg = await api('GET', 'config'); draw(); wire(); toast('Artwork updated.', 'ok'); }
      catch (err) { $(`[data-e="file-${name}"]`).textContent = err.errors?.file || err.message; }
    });
    $$('[data-reset]').forEach(btn => btn.onclick = async () => { ({ assets } = await api('DELETE', `admin/assets/${btn.dataset.reset}`)); S.cfg = await api('GET', 'config'); draw(); wire(); toast('Reset to built-in artwork.'); });
  };
  draw(); wire();
}

// ---------- users ----------
async function users(el) {
  const load = async () => {
    const { items } = await api('GET', 'admin/users');
    mount(el, html`<div class="card"><h3>Add a user</h3><form id="uf" novalidate><div class="grid3">
        <div class="field"><label class="f" for="u1">Full name</label><input id="u1" type="text"><div class="err" data-e="name"></div></div>
        <div class="field"><label class="f" for="u2">E-mail</label><input id="u2" type="email" autocomplete="off"><div class="err" data-e="email"></div></div>
        <div class="field"><label class="f" for="u3">Temporary password</label><input id="u3" type="password" autocomplete="new-password"><div class="err" data-e="password"></div></div>
        <div class="field"><label class="f" for="u4">Translator ID</label><input id="u4" type="text" placeholder="HET/T003/26"><div class="err" data-e="translatorId"></div></div>
        <div class="field"><label class="f" for="u5">Role</label><select id="u5"><option value="translator">Translator</option><option value="admin">Administrator</option></select></div>
        <div class="field" style="align-self:end"><button class="btn">Create account</button></div></div></form></div>
      <div class="card scroll-x"><h3>Accounts</h3><table class="tbl"><thead><tr><th>Name</th><th>E-mail</th><th>Role</th><th>Translator ID</th><th>Status</th><th></th></tr></thead><tbody>
        ${items.map(u => html`<tr><td><b>${u.name}</b></td><td>${u.email}</td><td><span class="chip ${u.role === 'admin' ? 'dark' : ''}">${u.role}</span></td><td>${u.translatorId || '—'}</td>
          <td><span class="chip ${u.active ? 'ok' : 'bad'}">${u.active ? 'Active' : 'Disabled'}</span></td>
          <td><div class="acts"><button class="btn ghost sm" data-edit="${u.id}">Edit</button>${u.id !== S.user.id ? html`<button class="btn ${u.active ? 'danger' : 'ghost'} sm" data-toggle="${u.id}" data-active="${u.active ? 1 : 0}">${u.active ? 'Disable' : 'Enable'}</button>` : ''}</div></td></tr>`)}</tbody></table></div><dialog id="dlg"></dialog>`);
    $('#uf').onsubmit = async e => {
      e.preventDefault(); $$('[data-e]', el).forEach(x => x.textContent = '');
      try { await api('POST', 'admin/users', { name: $('#u1').value, email: $('#u2').value, password: $('#u3').value, translatorId: $('#u4').value, role: $('#u5').value }); toast('Account created.', 'ok'); load(); }
      catch (err) { fieldErrs(el, err); }
    };
    $$('[data-toggle]').forEach(b => b.onclick = async () => { try { await api('PATCH', `admin/users/${b.dataset.toggle}`, { active: b.dataset.active !== '1' }); load(); } catch (e) { toast(e.message, 'error'); } });
    $$('[data-edit]').forEach(b => b.onclick = () => edit(items.find(u => u.id === b.dataset.edit)));
  };
  const edit = u => {
    const dlg = $('#dlg');
    mount(dlg, html`<form id="ef" method="dialog" style="min-width:min(92vw,400px)"><h3>Edit ${u.name}</h3>
      <div class="field"><label class="f" for="e1">Full name</label><input id="e1" type="text" value="${u.name}"><div class="err" data-e="name"></div></div>
      <div class="field"><label class="f" for="e2">Translator ID</label><input id="e2" type="text" value="${u.translatorId}"><div class="err" data-e="translatorId"></div></div>
      <div class="field"><label class="f" for="e3">Role</label><select id="e3" ${u.id === S.user.id ? 'disabled' : ''}><option value="translator" ${u.role === 'translator' ? 'selected' : ''}>Translator</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option></select></div>
      <div class="field"><label class="f" for="e4">New password <span class="muted">(leave blank to keep)</span></label><input id="e4" type="password" autocomplete="new-password"><div class="err" data-e="password"></div></div>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn ghost" id="ec">Cancel</button><button class="btn">Save</button></div></form>`);
    dlg.showModal(); $('#ec').onclick = () => dlg.close();
    $('#ef').onsubmit = async e => {
      e.preventDefault(); const body = { name: $('#e1').value, translatorId: $('#e2').value }; if (u.id !== S.user.id) body.role = $('#e3').value; if ($('#e4').value) body.password = $('#e4').value;
      try { await api('PATCH', `admin/users/${u.id}`, body); dlg.close(); toast('Saved.', 'ok'); load(); } catch (err) { fieldErrs(dlg, err); }
    };
  };
  await load();
}
