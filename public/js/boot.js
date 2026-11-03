// Runs first (in <head>): when the site is opened as an installed app, show the branded boot animation until the page has loaded.
(function () {
  var d = document.documentElement, standalone = false, app = false;
  try { standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) {}
  try { app = /[?&]app=1\b/.test(location.search) || sessionStorage.getItem('app') === '1' || !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); } catch (e) {}
  if (!(standalone || app)) return;
  d.classList.add('boot');
  var t0 = Date.now(), MIN = 1900;
  var ran = false;
  function done() {
    var s = document.getElementById('splash'); if (!s || ran) return; ran = true;
    setTimeout(function () { s.classList.add('out'); setTimeout(function () { d.classList.remove('boot'); s.remove(); }, 550); }, Math.max(0, MIN - (Date.now() - t0)));
  }
  if (document.readyState === 'complete') done(); else addEventListener('load', done);
  setTimeout(done, 9000);   // never leave the splash up if a resource hangs
})();
