import base64
logo=base64.b64encode(open('/home/user/Nusuk/public/img/logo.jpg','rb').read()).decode()
def ico(d,s=22,c='currentColor',sw=1.7):
    return f'<svg viewBox="0 0 24 24" width="{s}" height="{s}" fill="none" stroke="{c}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{d}</svg>'
I={
 'globe':'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
 'server':'<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
 'db':'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
 'user':'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 'dl':'<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
 'up':'<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
 'zip':'<path d="M6 2h9l5 5v15H6zM15 2v5h5M10 11h2M10 14h2M10 17h2"/>',
 'folder':'<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
 'gear':'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
 'edit':'<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
 'check':'<path d="M5 12l5 5 9-10"/>',
 'x':'<path d="M6 6l12 12M18 6 6 18"/>',
 'refresh':'<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
 'shield':'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
 'key':'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
 'alert':'<path d="M12 3 2 20h20zM12 10v5M12 18h.01"/>',
 'cloud':'<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
 'phone':'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
 'monitor':'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
 'arrow':'<path d="M5 12h14M13 6l6 6-6 6"/>',
 'backup':'<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
 'search':'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
}
def i(n,s=22,c='currentColor'): return ico(I[n],s,c)
arrow=f'<div class="arr">{ico("<path d=\"M5 12h14M13 6l6 6-6 6\"/>",26,"#8a6a36",2)}</div>'
def win(url,inner,cls=''):
    return f'<div class="win {cls}"><div class="wbar"><i></i><i></i><i></i><span class="wurl">{url}</span></div><div class="wbody">{inner}</div></div>'
def step(n,title,sub=''):
    return f'<div class="sh"><div class="sn">{n}</div><div><h3>{title}</h3>{f"<p>{sub}</p>" if sub else ""}</div></div>'
def foot(n): return f'<div class="pf2"><span>NUSUK CONSULT · Hosting Manual</span><span>{n}</span></div>'
def mark(n): return f'<b class="mk">{n}</b>'

css=open('style.css').read()
pages=[]

# ---------- 1 COVER ----------
pages.append(f'''<section class="page cover">
<div class="cv-top"><img src="data:image/jpeg;base64,{logo}" alt=""></div>
<div class="cv-mid"><div class="eyebrow">DEPLOYMENT GUIDE</div><h1>Hosting Manual</h1>
<p class="lead">Put the NUSUK CONSULT platform live on your own domain with cPanel — step by step, with pictures.</p>
<div class="chips"><span>{i('globe',16)} www.hausaly.com/nusuk</span><span>{i('server',16)} Truehost cPanel</span><span>{i('gear',16)} Node.js 22</span></div></div>
<div class="cv-bot">
<div class="need"><div class="nc">{i('cloud',26)}<b>cPanel hosting</b><small>with “Setup Node.js App”</small></div>
<div class="nc">{i('gear',26)}<b>Node.js 22.13+</b><small>in the version list</small></div>
<div class="nc">{i('globe',26)}<b>Domain pointed</b><small>DNS → your hosting</small></div>
<div class="nc">{i('zip',26)}<b>Project ZIP</b><small>downloaded from GitHub</small></div></div>
<div class="time">About 20–30 minutes · No coding · No terminal</div></div></section>''')

# ---------- 2 BIG PICTURE ----------
pages.append(f'''<section class="page"><div class="ph"><div class="eyebrow">OVERVIEW</div><h2>The big picture</h2><p class="mu">What happens when someone opens your site — and where everything lives.</p></div>
<div class="flow">
<div class="node"><div class="ni">{i('monitor',30)}</div><b>Visitor</b><small>opens<br>hausaly.com/nusuk</small></div>{arrow}
<div class="node gold"><div class="ni">{i('server',30)}</div><b>cPanel server</b><small>Apache + Passenger<br>reads <code>.htaccess</code></small></div>{arrow}
<div class="node dark"><div class="ni">{i('gear',30)}</div><b>Node.js app</b><small>runs <code>app.cjs</code><br>in <code>~/nusuk</code></small></div>{arrow}
<div class="node"><div class="ni">{i('db',30)}</div><b>Database</b><small>one file<br><code>nusuk.db</code></small></div></div>
<div class="two">
<div class="card"><h4>{i('folder',18)} Where the files live</h4>
<div class="tree">
<div class="tr"><span class="t0">/home/&lt;cpanel-user&gt;/</span></div>
<div class="tr l1"><span class="fd">{i('folder',15)} nusuk/</span><em class="tag g">APP ROOT · code</em></div>
<div class="tr l2"><span class="fl">app.cjs</span><em class="tag">startup file</em></div>
<div class="tr l2"><span class="fl">package.json</span></div>
<div class="tr l2"><span class="fd">{i('folder',15)} server/</span><em class="tag">backend</em></div>
<div class="tr l2"><span class="fd">{i('folder',15)} public/</span><em class="tag">website files</em></div>
<div class="tr l1"><span class="fd">{i('folder',15)} nusuk-data/</span><em class="tag r">DATABASE · never delete</em></div>
<div class="tr l1"><span class="fd">{i('folder',15)} public_html/</span><em class="tag">main site · .htaccess fix</em></div></div></div>
<div class="card"><h4>{i('shield',18)} Why it is built this way</h4>
<ul class="ticks"><li>{i('check',16,'#2f7d4f')}<span><b>No installs.</b> Nothing to download or compile on the server.</span></li>
<li>{i('check',16,'#2f7d4f')}<span><b>Data is safe.</b> The database sits <i>outside</i> the code folder, so updates never erase it.</span></li>
<li>{i('check',16,'#2f7d4f')}<span><b>Sub-path ready.</b> Runs at <code>/nusuk</code> next to your existing website.</span></li>
<li>{i('check',16,'#2f7d4f')}<span><b>Secure login.</b> Admin passwords are hashed; sessions are HTTPS-only.</span></li></ul></div></div>
<div class="callout">{i('alert',20,'#8a6a36')}<div><b>Golden rule.</b> <code>app.cjs</code>, <code>server/</code> and <code>public/</code> must sit <b>directly</b> inside <code>nusuk/</code> — not inside another folder.</div></div>
<div class="two" style="margin-top:12px">
<div class="ok2"><div class="okh">{i('check',18,'#2f7d4f')} Correct</div><div class="mini">nusuk/<br>&nbsp;├ app.cjs<br>&nbsp;├ server/<br>&nbsp;└ public/</div></div>
<div class="bad2"><div class="okh">{i('x',18,'#b3261e')} Wrong (one folder too deep)</div><div class="mini">nusuk/<br>&nbsp;└ Nusuk-claude-…/<br>&nbsp;&nbsp;&nbsp;├ app.cjs<br>&nbsp;&nbsp;&nbsp;└ server/</div></div></div>
{foot(2)}</section>''')

# ---------- 3 UPLOAD ----------
pages.append(f'''<section class="page"><div class="ph"><div class="eyebrow">STEPS 1 – 2</div><h2>Get the code onto the server</h2></div>
{step(1,'Download the project from GitHub','Choose the branch, then Code → Download ZIP.')}
{win('github.com/&lt;owner&gt;/Nusuk', f'<div class="gh"><div class="ghr"><span class="br">{i("folder",14)} branch: claude/functional-platform…</span><span class="gbtn">&lt;&gt; Code ▾</span></div><div class="menu"><div>Clone</div><div>Open with GitHub Desktop</div><div class="hl">{i("zip",15)} Download ZIP {mark(1)}</div></div></div>')}
<p class="cap">You receive <code>Nusuk-&lt;branch&gt;.zip</code> on your computer.</p>
{step(2,'Upload and extract in cPanel File Manager')}
<div class="steps4">
<div class="sc">{mark('a')}{i('folder',26)}<b>Create the folder</b><small>In your home folder make <code>nusuk</code></small></div>
<div class="sc">{mark('b')}{i('up',26)}<b>Upload the ZIP</b><small>Open <code>nusuk</code> → <b>Upload</b></small></div>
<div class="sc">{mark('c')}{i('zip',26)}<b>Extract</b><small>Right-click ZIP → <b>Extract</b></small></div>
<div class="sc">{mark('d')}{i('arrow',26)}<b>Move up</b><small>Select All → <b>Move</b> to <code>/nusuk</code></small></div></div>
<div class="callout">{i('alert',20,'#8a6a36')}<div>Turn on <b>Settings → Show Hidden Files</b> before moving, so no file is missed. Then delete the empty extracted folder and the ZIP.</div></div>
{win('cPanel · File Manager — /home/&lt;cpanel-user&gt;/nusuk', f'''<div class="fm"><div class="fmh"><span>Name</span><span>Type</span></div>
<div class="fmr">{i('folder',15,'#c98f2f')} server<span>folder</span></div><div class="fmr">{i('folder',15,'#c98f2f')} public<span>folder</span></div><div class="fmr">{i('folder',15,'#c98f2f')} test<span>folder</span></div><div class="fmr">{i('folder',15,'#c98f2f')} tmp<span>folder</span></div>
<div class="fmr">{i('edit',15,'#6b645a')} app.cjs<span>file</span></div><div class="fmr">{i('edit',15,'#6b645a')} package.json<span>file</span></div></div>''')}
<p class="cap">✔ What the folder should look like when finished.</p>
{foot(3)}</section>''')

# ---------- 4 CREATE APP ----------
pages.append(f'''<section class="page"><div class="ph"><div class="eyebrow">STEP 3</div><h2>Create the Node.js app</h2><p class="mu">cPanel → <b>Setup Node.js App</b> → <b>Create Application</b></p></div>
{win('cPanel · Setup Node.js App · Create Application', f'''<div class="cp">
<div class="row"><label>Node.js version</label><div class="inp sel">22.23.3 ▾</div>{mark(1)}</div>
<div class="row"><label>Application mode</label><div class="inp sel">Production ▾</div></div>
<div class="row"><label>Application root</label><div class="inp">nusuk</div>{mark(2)}</div>
<div class="row"><label>Application URL</label><div class="inp sel w1">hausaly.com ▾</div><div class="inp w2 hot">nusuk</div>{mark(3)}</div>
<div class="row"><label>Startup file</label><div class="inp">app.cjs</div>{mark(4)}</div>
<div class="envh"><b>Environment variables</b><span class="addv">⊕ ADD VARIABLE</span></div>
<table class="env"><tr><th>Name</th><th>Value</th></tr>
<tr><td>BASE_PATH</td><td>/nusuk</td></tr><tr><td>HTTPS</td><td>1</td></tr><tr><td>ADMIN_EMAIL</td><td>you@example.com</td></tr><tr><td>ADMIN_PASSWORD</td><td>•••••••••••• <small>(strong, 10+ chars)</small></td></tr><tr><td>DATA_DIR</td><td>/home/&lt;cpanel-user&gt;/nusuk-data</td></tr></table>
<div class="btnrow"><span class="b2">CANCEL</span><span class="b1">CREATE {mark(5)}</span></div></div>''')}
<div class="legend">
<div>{mark(1)} Pick <b>22.x</b> — the app needs Node 22.13 or newer.</div>
<div>{mark(2)} The folder from Step 2: <code>nusuk</code>.</div>
<div>{mark(3)} <b>Type <code>nusuk</code> in the path box.</b> If empty, the site shows a black 404.</div>
<div>{mark(4)} Startup file is exactly <code>app.cjs</code>.</div>
<div>{mark(5)} Click <b>Create</b>, then <b>Restart</b>.</div></div>
<div class="two">
<div class="callout w">{i('key',20,'#8a6a36')}<div><b>First start only.</b> <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code> create the first admin the first time the app runs. Change the password later in <b>Dashboard → Users</b>.</div></div>
<div class="callout r">{i('shield',20,'#b3261e')}<div><b>Never share screenshots</b> of this screen — it shows your password.</div></div></div>
{foot(4)}</section>''')

# ---------- 5 HTACCESS ----------
pages.append(f'''<section class="page"><div class="ph"><div class="eyebrow">STEP 4 · REQUIRED ON TRUEHOST</div><h2>Fix the .htaccess file</h2><p class="mu">Truehost adds a WordPress rule that hijacks every web address that is not a real file — including the app’s own API. Remove it.</p></div>
<div class="two">
<div class="card slim"><h4>{i('x',18,'#b3261e')} Without the fix</h4><div class="mini2">hausaly.com/nusuk/ → <b class="g">page loads</b> (static file)<br>hausaly.com/nusuk/api/health → <b class="r">404 black page</b><br>Login button → <b class="r">“Request failed”</b></div></div>
<div class="card slim"><h4>{i('check',18,'#2f7d4f')} With the fix</h4><div class="mini2">hausaly.com/nusuk/ → <b class="g">page loads</b><br>hausaly.com/nusuk/api/health → <b class="g">{{"ok":true}}</b><br>Login button → <b class="g">works</b></div></div></div>
<div class="sh"><div class="sn">1</div><div><h3>Find the right file</h3></div></div>
<div class="steps4 three">
<div class="sc">{mark('a')}{i('gear',24)}<b>Show hidden files</b><small>File Manager → Settings</small></div>
<div class="sc">{mark('b')}{i('search',24)}<b>Open the right .htaccess</b><small>The one containing <code>PassengerAppRoot</code></small></div>
<div class="sc">{mark('c')}{i('backup',24)}<b>Copy it first</b><small>Name it <code>.htaccess.bak</code></small></div></div>
<div class="sh"><div class="sn">2</div><div><h3>Delete only this block</h3></div></div>
<div class="code">
<div class="cl keep"># DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN</div>
<div class="cl keep">PassengerAppRoot "/home/&lt;cpanel-user&gt;/nusuk"</div>
<div class="cl keep">PassengerBaseURI "/nusuk"  …  PassengerStartupFile app.cjs</div>
<div class="cl keep"># … HTTPS redirect, security rules …</div>
<div class="cl del"># BEGIN WordPress</div><div class="cl del">RewriteEngine On</div><div class="cl del">RewriteBase /</div><div class="cl del">RewriteRule ^index\\.php$ - [L]</div><div class="cl del">RewriteCond %{{REQUEST_FILENAME}} !-f</div><div class="cl del">RewriteCond %{{REQUEST_FILENAME}} !-d</div><div class="cl del">RewriteRule . /index.php [L]</div><div class="cl del"># END WordPress</div>
<div class="cl keep"># … rest of the file …</div></div>
<div class="lg"><span><i class="sw keep"></i> Keep</span><span><i class="sw del"></i> Delete these 8 lines</span></div>
<div class="sh"><div class="sn">3</div><div><h3>Save and restart</h3><p>Click <b>Save Changes</b>, then <b>Setup Node.js App → Restart</b>.</p></div></div>
<div class="callout">{i('alert',20,'#8a6a36')}<div>If Truehost ever regenerates this file and the 404 returns, repeat these steps.</div></div>
{foot(5)}</section>''')

# ---------- 6 VERIFY ----------
pages.append(f'''<section class="page"><div class="ph"><div class="eyebrow">STEP 5</div><h2>Check that it works</h2></div>
<div class="three3">
<div><div class="vt">{mark(1)} Health check</div>{win('hausaly.com/nusuk/api/health','<div class="json">{"ok":true}</div>','sm')}<p class="cap">Must show exactly this.</p></div>
<div><div class="vt">{mark(2)} The website</div>{win('hausaly.com/nusuk/','<div class="miniSite"><div class="mb"></div><div class="mh"><i></i><b></b><b class="s"></b></div></div>','sm')}<p class="cap">Keep the trailing <code>/</code>.</p></div>
<div><div class="vt">{mark(3)} Admin login</div>{win('hausaly.com/nusuk/#/login','<div class="miniLogin"><b>Admin Login</b><div class="f"></div><div class="f"></div><div class="bt">Sign in</div></div>','sm')}<p class="cap">Use your <code>ADMIN_EMAIL</code>.</p></div></div>
<div class="sh"><div class="sn">✓</div><div><h3>First things to do after logging in</h3></div></div>
<div class="cards3">
<div class="mc">{i('key',26)}<b>1 · Change your password</b><small>Dashboard → Users → Edit. Use 10+ characters.</small></div>
<div class="mc">{i('edit',26)}<b>2 · Set the FX rate</b><small>Settings → Platform FX rate. Naira per 1 Riyal. Shows in the top bar.</small></div>
<div class="mc">{i('dl',26)}<b>3 · Add links</b><small>Settings → brochures &amp; YouTube. Buttons stay off until filled.</small></div>
<div class="mc">{i('user',26)}<b>4 · Add staff</b><small>Users → Add. Role <b>staff</b> can’t see Users or Settings.</small></div>
<div class="mc">{i('shield',26)}<b>5 · Privacy Policy</b><small>Replace the placeholder text before launch.</small></div>
<div class="mc">{i('check',26)}<b>6 · Send a test</b><small>Submit the Interest Form → see it in Service Requests.</small></div></div>
<div class="sh"><div class="sn">{i('gear',16,'#fff')}</div><div><h3>What the dashboard gives you</h3></div></div>
<div class="tabs">
<span>Overview</span><span>Service Requests</span><span>Bookings</span><span>Hotel Inventory</span><span>eSIM Inventory</span><span>Users</span><span>Settings</span></div>
<p class="cap" style="text-align:left">Requests and bookings: search · status workflow · internal notes · CSV export.</p>
{foot(6)}</section>''')

# ---------- 7 UPDATE ----------
pages.append(f'''<section class="page"><div class="ph"><div class="eyebrow">MAINTENANCE</div><h2>Updating the live site</h2><p class="mu">Use this every time you receive new files.</p></div>
<div class="flow6">
<div class="fs">{mark(1)}{i('backup',26)}<b>Back up</b><small>Download <code>nusuk.db</code></small></div>{arrow}
<div class="fs">{mark(2)}{i('dl',26)}<b>New ZIP</b><small>from GitHub</small></div>{arrow}
<div class="fs">{mark(3)}{i('x',26)}<b>Clear old code</b><small>see list below</small></div>{arrow}
<div class="fs">{mark(4)}{i('up',26)}<b>Upload + move</b><small>extract into <code>nusuk</code></small></div>{arrow}
<div class="fs">{mark(5)}{i('refresh',26)}<b>Restart</b><small>Setup Node.js App</small></div>{arrow}
<div class="fs">{mark(6)}{i('check',26)}<b>Test</b><small>health + Ctrl+Shift+R</small></div></div>
<div class="two">
<div class="card del2"><h4>{i('x',18,'#b3261e')} Delete from <code>nusuk/</code></h4><ul class="plain"><li>folders <code>public</code> · <code>server</code> · <code>test</code></li><li>files <code>app.cjs</code> · <code>package.json</code> · <code>README.md</code> · <code>Dockerfile</code></li><li>the old extracted folder and old ZIP</li></ul></div>
<div class="card keep2"><h4>{i('shield',18,'#2f7d4f')} Never delete</h4><ul class="plain"><li><code>nusuk-data/</code> — <b>your database</b></li><li><code>tmp/</code> — used by cPanel</li><li>the Passenger lines in <code>.htaccess</code></li></ul></div></div>
<div class="sh"><div class="sn">?</div><div><h3>Do I need to restart?</h3></div></div>
<table class="tbl"><tr><th>What changed</th><th>Restart app?</th><th>Hard-refresh?</th></tr>
<tr><td>Only files in <code>public/</code> (design, text, images)</td><td><span class="yn n">No</span></td><td><span class="yn y">Yes</span></td></tr>
<tr><td>Anything in <code>server/</code> or <code>app.cjs</code></td><td><span class="yn y">Yes</span></td><td><span class="yn y">Yes</span></td></tr>
<tr><td>Environment variables</td><td><span class="yn y">Yes</span></td><td><span class="yn n">No</span></td></tr></table>
<div class="sh"><div class="sn">{i('backup',16,'#fff')}</div><div><h3>Backups &amp; recovery</h3></div></div>
<div class="cards3 two3">
<div class="mc">{i('backup',26)}<b>Back up</b><small>Download <code>nusuk-data/nusuk.db</code> weekly and before every update. It holds all requests, bookings, users and settings.</small></div>
<div class="mc">{i('refresh',26)}<b>Restore</b><small>Upload the saved <code>nusuk.db</code> into <code>nusuk-data/</code> and restart the app.</small></div>
<div class="mc">{i('key',26)}<b>Lost admin password</b><small>Rename <code>nusuk.db</code> to <code>nusuk.db.old</code>, set new admin variables, restart. A fresh admin is created.</small></div></div>
{foot(7)}</section>''')

# ---------- 8 TROUBLESHOOTING ----------
pages.append(f'''<section class="page"><div class="ph"><div class="eyebrow">TROUBLESHOOTING</div><h2>Something not working?</h2><p class="mu">Start at the top and follow the arrows.</p></div>
<div class="dt">
<div class="dq start">Open <code>hausaly.com/nusuk/api/health</code></div>
<div class="dsplit">
<div class="dcol"><div class="lab y">Shows {{"ok":true}}</div>
<div class="dq">Can’t log in or forms fail?</div><div class="da">{i('arrow',16)}</div>
<div class="dr">Hard-refresh <b>Ctrl+Shift+R</b><br>Use <b>https://</b> (not http)<br>Check <code>ADMIN_EMAIL</code> spelling</div></div>
<div class="dcol"><div class="lab n">Anything else</div>
<div class="dq">What do you see?</div>
<div class="dbr"><div class="bx"><b>Black 404 page</b><small>① Path box <code>nusuk</code> filled?<br>② Files not one folder too deep?<br>③ WordPress block removed from <code>.htaccess</code>?<br>→ then <b>Restart</b></small></div>
<div class="bx"><b>500 / 503 / “Incomplete response”</b><small>The app crashed. Open <code>nusuk/stderr.log</code> and <code>nusuk/boot.log</code> in File Manager and read the last lines.</small></div>
<div class="bx"><b>No <code>boot.log</code> at all</b><small>cPanel isn’t running the app. Startup file must be <code>app.cjs</code>, root <code>nusuk</code>, app status <b>Started</b>.</small></div></div></div></div></div>
<div class="sh"><div class="sn">{i('alert',16,'#fff')}</div><div><h3>Quick symptom table</h3></div></div>
<table class="tbl sm"><tr><th>Symptom</th><th>Fix</th></tr>
<tr><td>Logged out immediately after login</td><td><code>HTTPS=1</code> is set but you opened <code>http://</code> — use <code>https://</code></td></tr>
<tr><td>Old design still showing</td><td>Browser cache — <b>Ctrl+Shift+R</b></td></tr>
<tr><td>Top bar has no exchange rate</td><td>Set it in <b>Dashboard → Settings</b> (hidden until entered)</td></tr>
<tr><td>Brochure / video buttons greyed out</td><td>Add the links in <b>Dashboard → Settings</b></td></tr>
<tr><td>404 returns after some days</td><td>Host rewrote <code>.htaccess</code> — repeat Step 4</td></tr>
<tr><td>Node version list stops below 22</td><td>Ask Truehost to enable Node 22, or use a VPS</td></tr></table>
<div class="callout">{i('search',20,'#8a6a36')}<div><b>Other places to look:</b> cPanel → <b>Metrics → Errors</b> shows recent server errors. Delete <code>boot.log</code> and <code>stderr.log</code> once everything works.</div></div>
{foot(8)}</section>''')

# ---------- 9 REFERENCE ----------
pages.append(f'''<section class="page"><div class="ph"><div class="eyebrow">REFERENCE</div><h2>Quick reference &amp; security</h2></div>
<div class="qr"><div class="qrh">QUICK REFERENCE CARD</div>
<div class="qrr"><span>Website</span><b>https://www.hausaly.com/nusuk/</b></div>
<div class="qrr"><span>Admin login</span><b>https://www.hausaly.com/nusuk/#/login</b></div>
<div class="qrr"><span>Health check</span><b>https://www.hausaly.com/nusuk/api/health</b></div>
<div class="qrr"><span>App folder</span><b>/home/&lt;cpanel-user&gt;/nusuk</b></div>
<div class="qrr"><span>Startup file</span><b>app.cjs</b></div>
<div class="qrr"><span>Database</span><b>/home/&lt;cpanel-user&gt;/nusuk-data/nusuk.db</b></div>
<div class="qrr"><span>Restart</span><b>cPanel → Setup Node.js App → Restart</b></div></div>
<div class="sh"><div class="sn">{i('gear',16,'#fff')}</div><div><h3>Environment variables</h3></div></div>
<table class="tbl sm"><tr><th>Name</th><th>Example</th><th>Purpose</th></tr>
<tr><td><code>BASE_PATH</code></td><td>/nusuk</td><td>Serve under a sub-path (empty = domain root)</td></tr>
<tr><td><code>HTTPS</code></td><td>1</td><td>Secure cookies; use when the site is on https</td></tr>
<tr><td><code>ADMIN_EMAIL</code></td><td>you@example.com</td><td>First administrator (first start only)</td></tr>
<tr><td><code>ADMIN_PASSWORD</code></td><td>••••••••••</td><td>First password (first start only)</td></tr>
<tr><td><code>DATA_DIR</code></td><td>/home/…/nusuk-data</td><td>Where the database is kept</td></tr>
<tr><td><code>NOTIFY_WEBHOOK_URL</code></td><td>(optional)</td><td>Posts a message for each new request or booking</td></tr></table>
<div class="sh"><div class="sn">{i('shield',16,'#fff')}</div><div><h3>Security checklist</h3></div></div>
<div class="chk">
<div>☐ Admin password changed after first login</div><div>☐ Screenshots never show environment values</div>
<div>☐ <code>DATA_DIR</code> is outside <code>public_html</code></div><div>☐ Site is on https and <code>HTTPS=1</code> is set</div>
<div>☐ Staff use the <b>staff</b> role, not admin</div><div>☐ Database backups stored away from the server</div></div>
<div class="endcard"><img src="data:image/jpeg;base64,{logo}" alt=""><div><b>NUSUK CONSULT</b><br><span>Beyond Compliance</span></div></div>
{foot(9)}</section>''')

open('manual.html','w',encoding='utf8').write(f'<!doctype html><meta charset="utf-8"><title>NUSUK CONSULT — Hosting Manual</title><style>{css}</style>'+''.join(pages))
print('pages',len(pages))
