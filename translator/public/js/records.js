import { api, html, mount, $, $$, toast, fmtDate, ENGINE_LABEL, debounce } from './ui.js';
import { S, isAdmin } from './state.js';
import { downloadDocx } from './export.js';

const LANG = { ar: 'Arabic', en: 'English' };
const chip = s => ({ completed: ['ok', 'Completed'], draft: ['warn', 'In review'], processing: ['accent', 'Translating'], failed: ['bad', 'Failed'] }[s] || ['', s]);

export async function records() {
  const sum = await api('GET', 'tasks/summary');
  mount($('#view'), html`<div class="wrap">
    <div class="toolbar"><h2 style="margin:0">Translation records</h2><div class="sp"></div>
      ${isAdmin() ? html`<a class="btn ghost sm" href="api/tasks.csv">⬇ Export CSV</a>` : ''}<a class="btn accent" href="#/translate">+ New translation</a></div>
    <div class="stats">
      <div class="stat"><b>${sum.completed}</b><span>Completed</span></div><div class="stat"><b>${sum.pages}</b><span>Pages translated</span></div>
      <div class="stat"><b>${sum.month}</b><span>This month</span></div><div class="stat"><b>${sum.drafts}</b><span>In review</span></div></div>
    <div class="toolbar"><input type="text" id="q" placeholder="Search reference, file, client or translator…" aria-label="Search records">
      <select id="st" aria-label="Status"><option value="">All statuses</option><option value="completed">Completed</option><option value="draft">In review</option><option value="failed">Failed</option></select></div>
    <div id="list" class="scroll-x"></div></div>`);
  const load = async () => {
    const q = encodeURIComponent($('#q').value.trim()), st = $('#st').value;
    const { items } = await api('GET', `tasks?q=${q}&status=${st}`);
    mount($('#list'), items.length ? html`<table class="tbl"><thead><tr><th>Reference</th><th>Date</th><th>File</th><th>Languages</th><th>Pages</th><th>Engine</th>${isAdmin() ? html`<th>Translator</th>` : ''}<th>Status</th><th></th></tr></thead><tbody>
      ${items.map(t => { const [c, l] = chip(t.status); return html`<tr><td class="ref">${t.ref}</td><td>${fmtDate(t.completedAt || t.createdAt)}</td>
        <td class="fn" title="${t.fileName}">${t.fileName}${t.clientRef ? html`<br><span class="muted small">${t.clientRef}</span>` : ''}</td>
        <td>${t.sourceLangName || '…'} → ${LANG[t.targetLang]}</td><td>${t.pages || '—'}</td><td>${ENGINE_LABEL[t.engine] || '—'}</td>
        ${isAdmin() ? html`<td>${t.userName}<br><span class="muted small">${t.translatorId}</span></td>` : ''}
        <td><span class="chip ${c}">${l}</span></td>
        <td><div class="acts"><a class="btn sm ${t.status === 'completed' ? '' : 'accent'}" href="#/task/${t.id}">${t.status === 'completed' ? 'Open' : t.status === 'failed' ? 'Details' : 'Continue'}</a>
          ${t.status === 'completed' ? html`<button class="btn ghost sm" data-docx="${t.id}" title="Download Word">Word</button>` : ''}
          ${isAdmin() ? html`<button class="btn danger sm" data-del="${t.id}" data-ref="${t.ref}" aria-label="Delete ${t.ref}">Delete</button>` : ''}</div></td></tr>`; })}
      </tbody></table>` : html`<div class="empty card"><p><b>No translations yet.</b></p><a class="btn accent" href="#/translate">Start your first translation</a></div>`);
    $$('[data-docx]').forEach(b => b.addEventListener('click', async () => { const t = items.find(x => x.id === b.dataset.docx); b.disabled = true; try { await downloadDocx(t); } catch (e) { toast(e.message, 'error'); } b.disabled = false; }));
    $$('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(`Permanently delete record ${b.dataset.ref}? This cannot be undone.`)) return;
      try { await api('DELETE', `tasks/${b.dataset.del}`); toast('Record deleted.'); load(); } catch (e) { toast(e.message, 'error'); }
    }));
  };
  $('#q').addEventListener('input', debounce(load, 250)); $('#st').addEventListener('change', load);
  await load();
  // keep "Translating" rows fresh
  const t = setInterval(() => { if (document.querySelector('.chip.accent')) load(); }, 4000); S.cleanup = () => clearInterval(t);
}
