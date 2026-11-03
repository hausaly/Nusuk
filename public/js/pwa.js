// Installable web app: registers the service worker, shows an install pop-up while scrolling the home page,
// and powers the "Download App" button in the footer.
(function () {
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  const root = document.documentElement;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (root.classList.contains('boot') || standalone) return;
  const KEY = 'pwa-dismissed', QUIET = 7 * 864e5;                      // after Close, the pop-up rests for 7 days
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  let deferred = null;
  const onHome = () => /^#?\/?(home)?$/.test(location.hash);
  const rested = () => Date.now() - Number(ls.get(KEY) || 0) < QUIET;
  function toast(t) { const x = document.createElement('div'); x.id = 'pwa-toast'; x.setAttribute('role', 'status'); x.textContent = t; document.body.appendChild(x); setTimeout(() => x.remove(), 3500); }
  function sheet() {
    if (document.getElementById('pwa-sheet')) return;
    const steps = ios ? '<li>Tap the <b>Share</b> button in Safari</li><li>Choose <b>Add to Home Screen</b></li><li>Tap <b>Add</b></li>' : '<li>Open your browser menu</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b></li><li>Confirm</li>';
    const s = document.createElement('div'); s.id = 'pwa-sheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', 'Install the app');
    s.innerHTML = '<div class="ps-box"><img src="img/icon-192.png" alt="" width="64" height="64"><h3>Install NUSUK CONSULT</h3><ol>' + steps + '</ol><button type="button" class="btn">Got it</button></div>';
    document.body.appendChild(s); s.onclick = e => { if (e.target === s || e.target.closest('button')) s.remove(); };
  }
  async function install() {                                            // Android / Chrome: straight to the browser's install prompt
    const pop = document.getElementById('pwa-pop'); if (pop) pop.remove();
    if (!deferred) return sheet();
    deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null;
    if (r && r.outcome === 'dismissed') ls.set(KEY, String(Date.now())); else if (r && r.outcome === 'accepted') toast('Installing NUSUK CONSULT…');
  }
  function pop() {
    if (document.getElementById('pwa-pop')) return;
    const b = document.createElement('div'); b.id = 'pwa-pop'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Install the app');
    b.innerHTML = '<img src="img/icon-192.png" alt="" width="48" height="48"><div class="pp-t"><b>NUSUK CONSULT</b><span>You can install the app on your device</span></div><div class="pp-b"><button type="button" class="pp-i">Install</button><button type="button" class="pp-c">Close</button></div><button type="button" class="pp-x" aria-label="Close">&times;</button>';
    document.body.appendChild(b); requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('on')));
    const close = () => { ls.set(KEY, String(Date.now())); b.classList.remove('on'); setTimeout(() => b.remove(), 350); };
    b.querySelector('.pp-c').onclick = close; b.querySelector('.pp-x').onclick = close; b.querySelector('.pp-i').onclick = install;
  }
  const eligible = () => (deferred || ios) && matchMedia('(max-width: 900px)').matches && !rested();
  function check() {
    const p = document.getElementById('pwa-pop');
    if (!onHome()) { if (p) { p.classList.remove('on'); setTimeout(() => p.remove(), 350); } return; }
    const y = window.scrollY || document.documentElement.scrollTop, nearEnd = y + innerHeight > document.documentElement.scrollHeight - 900;   // keep clear of the footer (and its Download App button)
    if (p) { p.classList.toggle('on', !nearEnd); return; }
    if (eligible() && y > 380 && !nearEnd) pop();
  }
  addEventListener('scroll', check, { passive: true }); addEventListener('hashchange', check);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; check(); });
  window.addEventListener('appinstalled', () => { const b = document.getElementById('pwa-pop'); if (b) b.remove(); toast('NUSUK CONSULT is installed. Open it from your home screen.'); });
  document.addEventListener('click', e => { if (e.target.closest('#dl-app')) { e.preventDefault(); install(); } });
})();
