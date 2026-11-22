import { api, html, mount, $, $$, toast, esc, ApiError } from './ui.js';
import { S, isAdmin, logoUrl } from './state.js';
import { renderDocument, ensureFonts } from './render.js';

const view = $('#view');
const routes = [
  [/^\/?$/, () => import('./home.js').then(m => m.home())],
  [/^\/login$/, () => login(), 'public'],
  [/^\/translate$/, () => import('./translate.js').then(m => m.newTranslation()), 'auth'],
  [/^\/task\/([\w-]+)$/, id => import('./task.js').then(m => m.taskView(id)), 'auth'],
  [/^\/records$/, () => import('./records.js').then(m => m.records()), 'auth'],
  [/^\/account$/, () => account(), 'auth'],
  [/^\/admin(?:\/(\w+))?$/, tab => import('./admin.js').then(m => m.admin(tab || 'overview')), 'admin'],
];

function renderNav() {
  const h = location.hash.replace(/^#/, '') || '/', on = p => (h === p || (p !== '/' && h.startsWith(p)) ? 'on' : '');
  mount($('#nav'), html`
    <a href="#/" class="${on('/') === 'on' && h === '/' ? 'on' : ''}">Home</a>
    ${S.user ? html`<a href="#/translate" class="${on('/translate')}">New translation</a><a href="#/records" class="${on('/records')}">Records</a>
      ${isAdmin() ? html`<a href="#/admin" class="${on('/admin')}">Admin</a>` : ''}
      <a href="#/account" class="${on('/account')}">Account</a><span class="who">${S.user.name}</span><a href="#/logout" id="logoutLink">Sign out</a>`
      : html`<a href="#/login" class="btn sm accent">Sign in</a>`}`);
  $('#logoutLink')?.addEventListener('click', async e => { e.preventDefault(); await api('POST', 'auth/logout', {}); S.user = null; renderNav(); location.hash = '#/'; toast('Signed out.'); });
  $('#nav').classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false');
}

async function route() {
  if (S.cleanup) { try { S.cleanup(); } catch {} S.cleanup = null; }
  const [path] = (location.hash.replace(/^#/, '') || '/').split('?');
  const hit = routes.map(r => [r, r[0].exec(path)]).find(([, m]) => m);
  renderNav();
  window.scrollTo(0, 0);
  if (!hit) { mount(view, html`<div class="wrap empty"><h2>Page not found</h2><a class="btn" href="#/">Go home</a></div>`); return; }
  const [[, fn, guard], m] = hit;
  if ((guard === 'auth' || guard === 'admin') && !S.user) { location.hash = `#/login?next=${encodeURIComponent(path)}`; return; }
  if (guard === 'admin' && !isAdmin()) { mount(view, html`<div class="wrap empty"><h2>Administrators only</h2><p>You do not have access to this area.</p><a class="btn" href="#/translate">Back to translating</a></div>`); return; }
  try { await fn(...m.slice(1)); }
  catch (e) {
    if (e instanceof ApiError && e.status === 401) { S.user = null; renderNav(); location.hash = `#/login?next=${encodeURIComponent(path)}`; return; }
    console.error(e);
    mount(view, html`<div class="wrap empty"><h2>Something went wrong</h2><p>${e.message}</p><a class="btn" href="#/">Go home</a></div>`);
  }
  view.focus({ preventScroll: true });
  renderNav();
}

// ---------- login ----------
function login() {
  if (S.user) { location.hash = '#/translate'; return; }
  mount(view, html`<div class="wrap"><form class="card login" id="lf" novalidate>
    <img class="logo" src="${logoUrl()}" alt="Hausaly EduTravels">
    <h2 class="center">Sign in</h2><p class="muted center small">Staff and administrators only.</p>
    <div id="lerr"></div>
    <div class="field"><label class="f" for="em">E-mail</label><input id="em" type="email" autocomplete="username" required autofocus></div>
    <div class="field"><label class="f" for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>
    <button class="btn lg" style="width:100%" id="lb">Sign in</button>
  </form></div>`);
  $('#lf').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#lb'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Signing in…';
    try {
      const r = await api('POST', 'auth/login', { email: $('#em').value, password: $('#pw').value });
      S.user = r.user; renderNav();
      const next = new URLSearchParams((location.hash.split('?')[1] || '')).get('next');
      location.hash = next && next.startsWith('/') ? '#' + next : '#/translate';
    } catch (err) { mount($('#lerr'), html`<div class="alert bad" role="alert">${err.message}</div>`); btn.disabled = false; btn.textContent = 'Sign in'; }
  });
}

// ---------- account ----------
function account() {
  mount(view, html`<div class="wrap"><div class="narrow"><h2>My account</h2>
    <div class="card"><p><b>${S.user.name}</b> · ${S.user.email}<br><span class="muted small">Role: ${S.user.role} · Translator ID: ${S.user.translatorId || '—'}</span></p></div>
    <form class="card" id="pwf" novalidate><h3>Change password</h3>
      <div class="field"><label class="f" for="cur">Current password</label><input id="cur" type="password" autocomplete="current-password"><div class="err" data-e="current"></div></div>
      <div class="field"><label class="f" for="nxt">New password (min. 8 characters)</label><input id="nxt" type="password" autocomplete="new-password"><div class="err" data-e="next"></div></div>
      <button class="btn">Update password</button></form></div></div>`);
  $('#pwf').addEventListener('submit', async e => {
    e.preventDefault(); $$('[data-e]', e.target).forEach(x => x.textContent = '');
    try { await api('POST', 'auth/password', { current: $('#cur').value, next: $('#nxt').value }); toast('Password updated.', 'ok'); e.target.reset(); }
    catch (err) { Object.entries(err.errors).forEach(([k, v]) => { const n = $(`[data-e="${k}"]`); if (n) n.textContent = v; }); if (!Object.keys(err.errors).length) toast(err.message, 'error'); }
  });
}

// ---------- boot ----------
async function boot() {
  $('#menuBtn').addEventListener('click', () => { const o = $('#nav').classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', o); });
  try {
    const [cfg, me] = await Promise.all([api('GET', 'config'), api('GET', 'auth/me')]);
    S.cfg = cfg; S.user = me.user;
  } catch (e) { mount(view, html`<div class="wrap empty"><h2>Cannot start</h2><p>${e.message}</p></div>`); return; }
  $('#brandLogo').src = logoUrl();
  mount($('#foot'), html`<b>${S.cfg.branding.companyName}</b> · Translation Desk · Registered translator ID on every page<br>${S.cfg.branding.contactLine}<br><span style="opacity:.7">Build ${S.cfg.build}</span>`);
  window.addEventListener('hashchange', route);
  ensureFonts();
  route();
}
boot();
