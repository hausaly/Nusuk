// Quick Tour: a short guided walkthrough for first-time visitors.
// A welcome card offers "Take a Quick Tour" or "Skip" once; the tour can be replayed from the footer.
(function () {
  const KEY = 'nc-tour', root = document.documentElement;
  const mem = {};
  const store = {
    get: () => { try { return localStorage.getItem(KEY); } catch { return mem.v || null; } },
    set: () => { try { localStorage.setItem(KEY, 'seen'); } catch { mem.v = 'seen'; } },
  };
  const $ = s => document.querySelector(s);
  const small = () => matchMedia('(max-width: 700px)').matches;
  const ICON = { compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15.5 8.5l-2 5-5 2 2-5z', close: 'M6 6l12 12M18 6L6 18' };
  const svg = (p, s = 20, w = 1.9) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p}"/></svg>`;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const isHome = () => /^#?\/?(home)?$/.test(location.hash);

  // ---- steps: where to point, and what to say
  const STEPS = [
    { sel: '#nv a[href="#/services"]', nav: true, title: 'Services', text: 'Specialist consulting and training for Umrah agents and OTA companies. Open it to see every service and request one.' },
    { sel: '#nv a[href="#/booking"]', nav: true, title: 'Book &amp; Manage', text: 'Book hotels, the Haramain train, airport transfers, Umrah visas and special offers yourself. No account needed.' },
    { sel: '.hc .grid', title: 'Our three service categories', text: 'Everything on the platform falls into one of these.', list: [
      ['Umrah DIY Bookings', 'DIY means Do It Yourself: you search, choose and book Umrah services yourself, right here, and get your booking slip instantly.'],
      ['B2B Consulting Services', 'Professional consultation for Umrah agents and business partners.'],
      ['Training Programs', 'Professional training and learning resources for the Umrah industry.'] ] },
    { sel: '#tour-again', footer: true, title: 'Replay it any time', text: 'That is the tour. You can open it again whenever you like from "Take a Quick Tour" in the footer.' },
  ];

  let welcome = null, layer = null, ring = null, tip = null, idx = 0, active = false, raf = 0, token = 0;

  function lockOthers(on) { root.classList.toggle('tour-on', on); }

  // ---------------- welcome card
  function showWelcome() {
    if (welcome || active) return;
    welcome = document.createElement('div');
    welcome.id = 'tour-welcome'; welcome.setAttribute('role', 'dialog'); welcome.setAttribute('aria-label', 'Quick tour invitation');
    welcome.innerHTML = `<div class="tw-ic">${svg(ICON.compass, 28, 1.7)}</div><div class="tw-t"><b>NUSUK CONSULT</b><span>New here? Take a one-minute tour of what you can do on the platform.</span></div>
      <button type="button" class="tw-x" aria-label="Skip the tour">&times;</button>
      <div class="tw-b"><button type="button" class="tw-go">Take a Quick Tour</button><button type="button" class="tw-skip">Skip</button></div>`;
    document.body.appendChild(welcome); lockOthers(true);
    requestAnimationFrame(() => requestAnimationFrame(() => welcome && welcome.classList.add('on')));
    welcome.querySelector('.tw-go').onclick = () => { closeWelcome(); start(); };
    welcome.querySelector('.tw-skip').onclick = welcome.querySelector('.tw-x').onclick = () => { store.set(); closeWelcome(); };
  }
  function closeWelcome() {
    store.set();
    if (!welcome) return; const w = welcome; welcome = null; w.classList.remove('on'); setTimeout(() => w.remove(), 350);
    if (!active) lockOthers(false);
  }

  // ---------------- tour
  function build() {
    layer = document.createElement('div'); layer.id = 'tour-layer';
    ring = document.createElement('div'); ring.id = 'tour-ring';
    tip = document.createElement('div'); tip.id = 'tour-tip'; tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-label', 'Quick tour');
    document.body.append(layer, ring, tip);
  }
  function render() {
    const s = STEPS[idx], last = idx === STEPS.length - 1;
    tip.innerHTML = `<div class="tt-top"><span class="tt-n">Step ${idx + 1} of ${STEPS.length}</span><button type="button" class="tt-x" aria-label="Skip the tour">${svg(ICON.close, 18, 2.2)}</button></div>
      <h3>${s.title}</h3><p>${s.text}</p>${s.list ? `<ul class="tt-l">${s.list.map(x => `<li><b>${x[0]}</b><span>${x[1]}</span></li>`).join('')}</ul>` : ''}${s.cta ? `<a class="tt-cta" href="${s.cta[1]}">${s.cta[0]} <span aria-hidden="true">&rarr;</span></a>` : ''}
      <div class="tt-dots" aria-hidden="true">${STEPS.map((_, i) => `<i class="${i === idx ? 'on' : i < idx ? 'dn' : ''}"></i>`).join('')}</div>
      <div class="tt-b"><button type="button" class="tt-skip">Skip tour</button><span class="tt-sp"></span>${idx ? '<button type="button" class="tt-back">Back</button>' : ''}<button type="button" class="tt-next">${last ? 'Done' : 'Next'}</button></div>`;
    tip.querySelector('.tt-x').onclick = tip.querySelector('.tt-skip').onclick = () => end();
    const b = tip.querySelector('.tt-back'); if (b) b.onclick = () => go(idx - 1);
    tip.querySelector('.tt-next').onclick = () => last ? end() : go(idx + 1);
    const cta = tip.querySelector('.tt-cta'); if (cta) cta.onclick = () => end();     // following a link ends the tour and goes there
    tip.classList.remove('in'); void tip.offsetWidth; tip.classList.add('in');
    tip.querySelector('.tt-next').focus({ preventScroll: true });
  }
  const menu = open => { const nv = $('#nv'), mb = $('#mb'); if (!nv || !mb || getComputedStyle(mb).display === 'none') return; nv.classList.toggle('o', open); mb.setAttribute('aria-expanded', String(open)); };

  async function go(i) {
    const my = ++token; idx = Math.max(0, Math.min(STEPS.length - 1, i)); const s = STEPS[idx];
    if (!s.nav && !isHome()) { location.hash = '#/'; }
    else if (s.nav) menu(true);
    if (!s.nav) menu(false);
    render();
    // wait for the target, then bring it into view
    let el = null;
    for (let k = 0; k < 40 && my === token; k++) { el = $(s.sel); if (el && el.getBoundingClientRect().width) break; await wait(100); }
    if (my !== token || !active) return;
    if (!el) { if (idx < STEPS.length - 1) return go(idx + 1); return end(); }
    if (!s.nav) {
      const r = el.getBoundingClientRect(), vh = innerHeight;
      const top = scrollY + r.top - (small() ? 96 : 100);   // card near the top, so the step card has room below it
      scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    track(my);
  }
  // follow the target every frame so the highlight stays put while the page scrolls
  function track(my) {
    cancelAnimationFrame(raf);
    const s = STEPS[idx];
    const frame = () => {
      if (!active || my !== token) return;
      const el = $(s.sel);
      if (el) place(el.getBoundingClientRect());
      raf = requestAnimationFrame(frame);
    };
    frame();
  }
  function place(r) {
    const pad = 8, vw = innerWidth, vh = innerHeight;
    const lst = !!STEPS[idx].list;
    tip.classList.toggle('wide', lst && !small());
    let rh = r.height + 2 * pad;
    if (small()) {                                                   // phone: step card is a bottom sheet; keep the outline above it
      const tt = tip.getBoundingClientRect().top; if (tt > 0 && r.top - pad + rh > tt - 8) rh = Math.max(60, tt - 8 - (r.top - pad));
    }
    Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: rh + 'px', opacity: 1 });
    if (small()) { tip.style.cssText = ''; tip.classList.add('sheet'); return; }
    tip.classList.remove('sheet');
    const tw = Math.min(lst ? 600 : 380, vw - 24), th = tip.offsetHeight || 220;
    let top = r.bottom + pad + 16;
    if (top + th > vh - 12) top = r.top - pad - 16 - th;           // no room below: go above
    let left = Math.max(12, Math.min(vw - tw - 12, r.left + r.width / 2 - tw / 2));
    if (top < 12) {                                                  // neither above nor below fits: beside the target, else pinned low
      if (vw - (r.right + pad + 16) >= tw + 12) { left = r.right + pad + 16; top = Math.max(12, Math.min(vh - th - 12, r.top)); }
      else if (r.left - pad - 16 >= tw + 12) { left = r.left - pad - 16 - tw; top = Math.max(12, Math.min(vh - th - 12, r.top)); }
      else top = Math.max(12, vh - th - 24);
    }
    tip.style.cssText = `left:${left}px;top:${top}px;width:${tw}px`;
  }

  function start() {
    if (active) return; closeWelcome(); store.set();
    active = true; idx = 0; build(); lockOthers(true);
    layer.onclick = e => e.stopPropagation();
    go(0);
  }
  function end() {
    if (!active) return; active = false; token++; cancelAnimationFrame(raf);
    menu(false); [layer, ring, tip].forEach(x => x && x.remove()); layer = ring = tip = null;
    lockOthers(false);
  }
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (active) end(); else if (welcome) closeWelcome(); }
    else if (active && e.key === 'ArrowRight') { idx < STEPS.length - 1 ? go(idx + 1) : end(); }
    else if (active && e.key === 'ArrowLeft' && idx > 0) go(idx - 1);
  });
  addEventListener('hashchange', () => { if (active && !/^#?\/?(home)?$/.test(location.hash) && STEPS[idx] && !STEPS[idx].nav) end(); });
  document.addEventListener('click', e => { if (e.target.closest('#tour-again')) { e.preventDefault(); start(); } });
  window.NCTour = { start, end };

  // ---- first visit: offer the tour on the public pages, once the page has settled
  const PUBLIC = /^#?\/?(home|about|services|booking)?$/;
  async function maybeOffer() {
    if (store.get()) return;
    for (let k = 0; k < 40 && root.classList.contains('boot'); k++) await wait(250);   // let the boot animation finish
    await wait(1400);
    if (store.get() || active || welcome || !PUBLIC.test(location.hash)) return;
    showWelcome();
  }
  if (document.readyState === 'complete') maybeOffer(); else addEventListener('load', maybeOffer);
})();
