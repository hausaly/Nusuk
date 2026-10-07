const P={about:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',services:'M3 7h18v13H3zM8 7V4h8v3',booking:'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',login:'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',menu:'M3 12h18',dash:'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z'};
const ic=k=>`<svg class="i" viewBox="0 0 24 24"><path d="${P[k]||P.menu}"/></svg>`;
const SI=['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z','M9 2h6v4H9zM9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3M9 12h6M9 16h6','M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5','M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M8 21l4-5 4 5','M11 17l2 2a1 1 0 1 0 3-3M14 14l2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a3 3 0 0 0-4.2 0l-.9.9a1 1 0 0 1-1.4 0l-.9-.9a3 3 0 0 0-4.2 0L2 13M2 11l6 6M22 13l-3-3','M16.5 9.4 7.5 4.2M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7 12 12l8.7-5M12 22V12','M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18'];
const sic=(n,s=34)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${SI[n-1]}"/></svg>`;
const SV=[
['Umrah External Agent Consultation','Get expert, step-by-step guidance to resolve NUSUK MASAR challenges, close compliance gaps, and strengthen your company’s operational performance.','Book a Consultation',1],
['Umrah External Agent Company Registration','Company Registration & NUSUK MASAR Onboarding Service for Umrah External Agents and OTA Companies—done-for-you setup designed to take your business from registration to a structured, compliant, and operationally ready Umrah agency company.','Begin Your Setup',2],
['UEA O.1 Capacity Building','3-Day Executive Programme equipping your team with the knowledge, systems, and strategic readiness to strengthen NUSUK MASAR compliance, KPI performance, and evaluation readiness.','Request Capacity Building',3],
['UOM O.1 — Umrah Operations Masterclass','Expert-led operational training to strengthen your team’s capabilities in visa processing, itinerary and Umrah & tourism package development, service bookings, cost analysis, and NUSUK MASAR program operations.','Reserve Your Team’s Seat',4],
['Saudi Partner Company Contracting','Get the right Saudi Umrah company partner—zero middlemen—for your ground services and NUSUK MASAR operational requirements.','Secure Your Saudi Partner',5],
['Umrah Product & Package Development','Expert service for designing profitable, market-ready Umrah packages—covering hotel selection, transport, flights, itinerary planning, ground services, costing, pricing, and NUSUK MASAR operational requirements.','Develop Your Umrah Packages',6],
['Ground Service Bookings','Hotel reservations, eSIMs and Haramain High-speed Train tickets.','Book Now',7]];
// Interest-form dropdown value for each service (1-6)
const OPT=['Umrah External Agent Consultation','External Agent Company Registration','UEA O.1 Capacity Building','Umrah Operations Masterclass','Saudi Partner Company Contracting','Umrah Product & Package Development'];
// Brochure + YouTube links are managed in Dashboard → Settings and loaded from /api/public-settings
let BROCH={},YT={};
const IMK={1:'S1',2:'S2',3:'S3',4:'S4',5:'S5',6:'S6',7:'S7'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(u,t,cls='btn o')=>u?`<a class="${cls}" href="${u}" target="_blank" rel="noopener">${t}</a>`:`<span class="${cls}" aria-disabled="true" title="Link will be added soon">${t}</span>`;
function cards(){return `<div class="grid">${SV.map((s,i)=>{const n=i+1;const href=n==7?'#/booking':'#/interest/'+n;
return `<article class="card"><div class="b"><div class="ico">${sic(n)}</div><div class="num">SERVICE ${n}</div><h3>${esc(s[0])}</h3><p class="mu" style="margin:0">${esc(s[1])}</p><div class="row"><a class="btn" href="${href}">${esc(s[2])}</a>${n>1&&n<7?link(BROCH[n],'Download Brochure'):'<span class="btn" style="visibility:hidden" aria-hidden="true">&nbsp;</span>'}</div></div></article>`}).join('')}</div>`}
const reqCta=`<section class="s cta"><div class="w"><h2>Interested in a NUSUK Consult Service?</h2><p>Complete the form below to request a NUSUK Consult service Now!</p><a class="btn" href="#/interest">Request a Service</a></div></section>`;
const EV=[['300+ Attendees | UEA O.1','Northern Nigeria’s Largest Umrah Capacity-Building Event — Kano, Nigeria','On 8 May 2026, Engr. Ibrahim Inusa, CEO of NUSUK Consult, delivered a strategic session on External Agent Evaluation & Classification, covering the latest Ministry of Hajj & Umrah guidelines and policies for Umrah 1448AH.','The session brought together 100+ Umrah external agents from across Nigeria, alongside major industry stakeholders including Saudia, EgyptAir, flyadeal, Max Air, Ethiopian Airlines, AHUON, and leading Umrah External Agent Companies including Raudah Travel & Tours, Hamsyl Travel & Tours, and other industry leaders.'],
['200+ Attendees | UEA O.1','Strategic Partnership Event — Abuja','On 3 August 2026, Engr. Ibrahim Inusa, CEO of NUSUK Consult, delivered a strategic session on External Agent Evaluation & Classification, covering the latest Ministry of Hajj & Umrah guidelines and policies for Umrah 1448AH.','The session attracted 200+ attendees, including 60+ Umrah external agents from across Nigeria, alongside key industry stakeholders such as Almamorah International Group, Maysan International Group, Wakanow.com, White Bird Tourism, Raudah Travel & Tours, and other leading Umrah industry players.'],
['SSP 3rd Edition | UEA O.1','Ministry of Hajj and Umrah Initiative – Saudi Arabia','Engr. Ibrahim Inusa, CEO of NUSUK Consult, led Hausaly EduTravels Ltd to international recognition as the only Nigerian Umrah external-agent startup to reach the Semi-Finals of the Sustainable Solutions for Pilgrims Challenge (SSP), 3rd Edition (2025), an initiative of the Saudi Ministry of Hajj and Umrah.','Selected among 14 global semi-finalists and one of only three African qualifiers, Hausaly emerged as the sole Nigerian representative, earning 1st place on the official Semi-Finalist Startup Panel.']];
const events=()=>`<section class="s alt"><div class="w"><div class="eyebrow">UEA O.1</div><h2>Session Highlights</h2><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">${EV.map((e,i)=>`<div class="ev"><div class="k">${e[0]}</div><h3>${e[1]}</h3><p>${e[2]}</p><p class="mu">${e[3]}</p>${link(YT[i+1],'Watch the Session','btn')}</div>`).join('')}</div></div></section>`;
const TS=[['T1','Alhaji Abdulhadi Umar Al-Futi','Chairman, Raudah Travel & Tours Ltd. — Kano, Nigeria','Assalamu Alaikum, Engineer, the session was very well conducted. It felt like we were listening directly to a delegate from the Saudi Ministry of Hajj and Umrah. Alhamdulillah, the session was really impactful and informative.'],['T2','Alhaji Abdullahi Adamu','Asdiqaani Travel and Tours Ltd. — Kano, Nigeria','I learned a lot from your UEA O.1 session in Kano, and it really helped us. We are now preparing to travel with 150 Umrah pilgrims from our company. We always follow your programs and keep learning from you. Thank you so much.'],['T3','Mr. Abdullaah M. Kuranga','CEO, Al-Misk Heritage Ventures — Ilorin, Nigeria','Wallahi, Jazakallahu khairan. May Almighty Allah bless you and reward you for this guidance. I really appreciate it. Thank you, Jazakallahu khairan. If I have anything else, I will get back to you and ask, Insha Allah.']];
const tests=()=>`<section class="s"><div class="w"><div class="eyebrow">Testimonials</div><h2>What Industry Leaders Say</h2><div class="grid">${TS.map(t=>`<figure class="t" style="margin:0"><img loading="lazy" src="img/${t[0].toLowerCase()}.jpg" alt="Portrait of ${t[1]}"><q>“${t[3]}”</q><figcaption><b>${t[1]}</b><br><span class="mu">${t[2]}</span></figcaption></figure>`).join('')}</div></div></section>`;
const POS='NUSUK CONSULT is a pioneering specialist advisory practice for Umrah external-agents and OTA companies, providing professional expertise in NUSUK MASAR ecosystem, covering licensing, contracting, regulatory readiness, visa operations, KPI performance, evaluation and classification, Umrah program development, and operational excellence—supporting operators in strengthening their systems, capabilities, and performance standards within the NUSUK MASAR ecosystem.';
const GZ='Let’s take your company toward Green Zone classification—reducing penalties, suspensions, fines, and visa delays or rejections while staying updated on NUSUK MASAR operational best practices.';
const BT=['Hotel reservation','eSIM','Haramain High-speed Train ticket'];
const V={
home:()=>`<div class="home"><section class="hero2"><div class="w"><div class="eyebrow">NUSUK CONSULT</div><h1>Beyond Compliance</h1><p class="l">${POS}</p><p class="g">${GZ}</p><div class="row"><a class="btn" href="#/services">Explore Our Services</a><a class="btn o" href="#/interest">Request a Service</a></div>
<div class="stats"><div><b>300+</b><span>Attendees · UEA O.1, Kano</span></div><div><b>200+</b><span>Attendees · UEA O.1, Abuja</span></div><div><b>44</b><span>Master-level certifications · our founder</span></div><div><b>#1</b><span>Al Rajhi Educational Platform Leaderboard</span></div></div></div></section>
<section class="hc"><div class="w"><div class="grid">${[1,3,2].map(n=>`<a class="card" href="#/interest/${n}" style="text-decoration:none"><div class="b"><div class="ico">${sic(n)}</div><h3>${esc(SV[n-1][0])}</h3><p class="mu" style="margin:0">${esc(SV[n-1][1])}</p></div></a>`).join('')}</div></div></section>
<section class="s"><div class="w"><h2>NUSUK CONSULT SERVICES</h2>${cards()}</div></section>
<section class="s band"><div class="w"><h2>Interested in a NUSUK Consult Service?</h2><p>Complete the form below to request a NUSUK Consult service Now!</p><a class="btn" href="#/interest">Request a Service</a></div></section>${events()}${tests()}
<section class="s"><div class="w"><div class="fd"><img loading="lazy" src="img/f.jpg" alt="Engr. Ibrahim Inusa"><div><div class="eyebrow">MEET THE FOUNDER/CEO</div><h2 style="margin-bottom:4px">ENGR. IBRAHIM INUSA</h2><p style="color:var(--gd);font-weight:600;margin:0 0 12px">Nusuk Masar Consultant</p><p>Engr. Ibrahim Inusa is a pioneering NUSUK MASAR Consultant for Umrah External Agents and OTA Companies, and the Founder & Managing Director of Hausaly EduTravels Ltd and NUSUK Consult, where he serves as Lead Instructor.</p><a class="btn" href="#/about">About Us</a></div></div></div></section></div>`,
about:()=>`<section class="s"><div class="w"><div class="eyebrow">About</div><h1>NUSUK CONSULT — Beyond Compliance</h1><p>${POS}</p><p class="mu">${GZ}</p></div></section>
<section class="s alt"><div class="w"><h2>MEET THE FOUNDER/CEO</h2><div class="pf"><img src="img/f.jpg" alt="Engr. Ibrahim Inusa, Founder and CEO of NUSUK Consult"><div><h3 style="font-size:1.6rem;margin:0">ENGR. IBRAHIM INUSA</h3><p class="eyebrow">Nusuk Masar Consultant</p><p>Engr. Ibrahim holds a Master’s degree in IT from UNITEN, Malaysia, and a Bachelor’s degree from Marwadi University, India. He Ranked #1 on the Al Rajhi Educational Platform Leaderboard in collaboration with ministry of Hajj & Umrah in Saudi Arabia after completion of 44 Certifications course work at Master Level with 4 Badges in Pilgrim management and Nusuk ecosystem. Engr. Ibrahim has been a keynote speaker and NUSUK MASAR instructor at several international conferences across Europe and Africa, and featured in some leading tech industry magazines.</p><p>Engr. Ibrahim Inusa is a pioneering NUSUK MASAR Consultant for Umrah External Agents and OTA Companies, and the Founder & Managing Director of Hausaly EduTravels Ltd and NUSUK Consult, where he serves as Lead Instructor.</p></div></div></div></section>`,
services:()=>`<section class="s"><div class="w"><div class="eyebrow">Services</div><h1>NUSUK CONSULT SERVICES</h1>${cards()}</div></section>${tests()}${reqCta}`,
booking:()=>`<section class="s"><div class="w" style="max-width:900px"><div class="eyebrow">Service 7</div><h1 style="font-size:clamp(1.6rem,4vw,2.2rem)">Ground Service Bookings</h1><p class="mu">Hotel reservations, eSIMs and Haramain High-speed Train tickets. Tell us what you need and our team will confirm availability and pricing.</p><div id="bm"><form id="bf" novalidate>
<div><label for="bt">Service *</label><select id="bt"><option value="">Select a service</option>${BT.map(o=>`<option>${o}</option>`).join('')}</select><div class="err" id="e_bt"></div></div>
<div class="f2"><div><label for="bn">Full Name *</label><input id="bn" autocomplete="name"><div class="err" id="e_bn"></div></div><div><label for="be">Email *</label><input id="be" type="email" autocomplete="email"><div class="err" id="e_be"></div></div>
<div><label for="bp">Phone Number *</label><input id="bp" type="tel" autocomplete="tel"><div class="err" id="e_bp"></div></div><div></div>
<div><label for="b1">From</label><input id="b1" type="date"></div><div><label for="b2">To</label><input id="b2" type="date"></div></div>
<div><label for="bd">Details *</label><textarea id="bd" rows="5" maxlength="1500" placeholder="City, number of rooms/travellers, preferred dates, any special requirements"></textarea><div class="err" id="e_bd"></div></div>
<div class="hp" aria-hidden="true"><label>Website<input id="bw" tabindex="-1" autocomplete="off"></label></div><div class="err" id="e_ball" role="alert"></div><button class="btn" id="bsb" type="submit">Submit Booking Request</button></form></div></div></section>`,
privacy:()=>`<section class="s"><div class="w" style="max-width:760px"><h1>Privacy Policy</h1><p>This is a placeholder. The final Privacy Policy text has not yet been supplied and should be provided before launch.</p><p>Service requests submitted through the Interest Form (service, mode, name, email, phone, company, role) are visible only to NUSUK CONSULT administrators.</p></div></section>`,
interest:(a)=>{const pre=+a[0]>0&&+a[0]<7?OPT[+a[0]-1]:'';return `<section class="s"><div class="w" style="max-width:900px"><h1 style="font-size:clamp(1.6rem,4vw,2.2rem)">NUSUK CONSULT SERVICE INTEREST FORM</h1><p class="mu">Complete the form below to request a NUSUK Consult service.</p><div id="fm"><form id="f" novalidate>
<div><label for="sv">Service Request *</label><select id="sv"><option value="">Select a service</option>${OPT.map(o=>`<option ${o==pre?'selected':''}>${o}</option>`).join('')}</select><div class="err" id="e_sv"></div></div>
<fieldset><legend>Service Mode *</legend><label><input type="checkbox" name="md" value="Online (Virtual)">Online (Virtual)</label><label><input type="checkbox" name="md" value="Offline (On-site)">Offline (On-site)</label><div class="err" id="e_md"></div></fieldset>
<div class="f2"><div><label for="fn">First Name *</label><input id="fn" autocomplete="given-name"><div class="err" id="e_fn"></div></div><div><label for="ln">Last Name *</label><input id="ln" autocomplete="family-name"><div class="err" id="e_ln"></div></div>
<div><label for="em">Email *</label><input id="em" type="email" autocomplete="email"><div class="err" id="e_em"></div></div><div><label for="ph">Phone Number *</label><input id="ph" type="tel" autocomplete="tel"><div class="err" id="e_ph"></div></div>
<div><label for="co">Company Name *</label><input id="co" autocomplete="organization"><div class="err" id="e_co"></div></div><div><label for="ro">Role/Designation *</label><input id="ro"><div class="err" id="e_ro"></div></div></div>
<div class="hp" aria-hidden="true"><label>Website<input id="website" name="website" tabindex="-1" autocomplete="off"></label></div><div class="err" id="e_all" role="alert"></div><button class="btn" id="sb" type="submit">Submit Service Request</button></form></div>
<div class="two" style="margin-top:36px"><div class="box"><h3>SUPPORT</h3><p><b>Contact:</b><br>+2348131227047<br>WhatsApp / Calls</p><p><b>Email:</b><br>info@nusuk.com.ng</p><p><b>Head Office:</b><br>Bosso Plaza, Along Gombe Road, Biu Borno, Nigeria</p></div>
<div class="box"><h3>PROGRAM ARRANGEMENT</h3><p><b>VIRTUAL (ONLINE)</b><br>Program Venue: Zoom / Google Meet</p><p><b>ON-SITE (OFFLINE)</b><br>Program Venue, Instructor Accommodation & Round-Trip Travel — Client-Provided; Excluded from Program Fee.</p></div></div></div></section>`},
login:()=>`<section class="s"><div class="w" style="max-width:460px"><h1>Admin Login</h1><div class="box" id="lg"><p>Loading…</p></div></div></section>`,
admin:()=>`<div class="adm"><div class="side" id="sd"></div><div class="main" id="mn"><p>Loading…</p></div></div>`};
const TT={home:'NUSUK CONSULT | Beyond Compliance',about:'About NUSUK CONSULT | NUSUK MASAR Consulting',services:'NUSUK CONSULT Services',booking:'Ground Service Bookings | NUSUK CONSULT',interest:'Service Interest Form | NUSUK CONSULT',privacy:'Privacy Policy | NUSUK CONSULT',login:'Admin Login | NUSUK CONSULT',admin:'Admin Dashboard | NUSUK CONSULT'};
// ---------------- runtime ----------------
const $=id=>document.getElementById(id);
async function api(method,url,body){
  const r=await fetch(url.replace(/^\//,''),{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(j.error||'Request failed');e.status=r.status;e.errors=j.errors;throw e}
  return j}
window.NC={api,esc,ic,$};
let me=null;
async function loadMe(){try{me=(await api('GET','/api/auth/me')).user}catch{me=null}}
async function loadSettings(){try{const s=await api('GET','/api/public-settings');BROCH=s.brochures||{};YT=s.youtube||{}}catch{}}
const ready=Promise.all([loadMe(),loadSettings()]);

function route(){
  const h=location.hash.replace(/^#\/?/,'').split('/');const r=V[h[0]||'home']?(h[0]||'home'):'home';
  document.title=TT[r];$('app').innerHTML=V[r](h.slice(1));window.scrollTo(0,0);
  const items=[['about','About','about'],['services','Services','services'],['booking','Booking','booking'],me?['admin','Dashboard','dash']:['login','Admin Login','login']];
  $('nv').innerHTML=items.map(n=>`<a href="#/${n[0]}" class="${n[0]==r?'on ':''}${n[2]=='login'||n[2]=='dash'?'login':''}">${ic(n[2])}${n[1]}</a>`).join('');
  $('nv').classList.remove('o');$('mb').setAttribute('aria-expanded','false');
  if(r=='interest')bindForm();if(r=='booking')bindBooking();if(r=='login')loginView();if(r=='admin')adminView();}
addEventListener('hashchange',route);
$('mb').onclick=()=>{const o=$('nv').classList.toggle('o');$('mb').setAttribute('aria-expanded',o)};

function showErrors(prefix,keys,errors){keys.forEach(k=>{const el=$(prefix+k);if(el)el.textContent=(errors&&errors[k])||''})}
async function submitForm({btn,all,url,payload,keys,prefix,done}){
  $(all).textContent='';showErrors(prefix,keys,{});const b=$(btn);b.disabled=true;
  try{await api('POST',url,payload);done()}
  catch(e){b.disabled=false;
    if(e.errors){showErrors(prefix,keys,e.errors);const first=keys.find(k=>e.errors[k]);if(first)$(prefix+first).scrollIntoView({block:'center',behavior:'smooth'})}
    else $(all).textContent=e.status==429?e.message:'Submission could not be saved right now. Please try again, or contact info@nusuk.com.ng. Your entries have been kept.'}}

function bindForm(){
  $('f').onsubmit=ev=>{ev.preventDefault();const g=i=>$(i).value.trim();
    const mode=[...document.querySelectorAll('[name=md]:checked')].map(x=>x.value);
    submitForm({btn:'sb',all:'e_all',url:'/api/requests',prefix:'e_',keys:['sv','md','fn','ln','em','ph','co','ro'],
      payload:{service:g('sv'),mode,firstName:g('fn'),lastName:g('ln'),email:g('em'),phone:g('ph'),company:g('co'),role:g('ro'),website:g('website')},
      done:()=>{$('fm').innerHTML='<div class="ok" role="status"><h3>Request received</h3><p>Thank you. Your service request has been submitted to NUSUK CONSULT. Our team will contact you shortly.</p><a class="btn" href="#/">Back to Home</a></div>'}})}}

function bindBooking(){
  $('bf').onsubmit=ev=>{ev.preventDefault();const g=i=>$(i).value.trim();
    submitForm({btn:'bsb',all:'e_ball',url:'/api/bookings',prefix:'e_',keys:['bt','bn','be','bp','bd'],
      payload:{type:g('bt'),name:g('bn'),email:g('be'),phone:g('bp'),dateFrom:g('b1'),dateTo:g('b2'),details:g('bd'),website:g('bw')},
      done:()=>{$('bm').innerHTML='<div class="ok" role="status"><h3>Booking request received</h3><p>Thank you. Our team will confirm availability and pricing with you shortly.</p><a class="btn" href="#/">Back to Home</a></div>'}})}}

function loginView(){
  const el=$('lg');
  if(me){el.innerHTML=`<p>Signed in as <b>${esc(me.name)}</b> (${esc(me.role)}).</p><a class="btn" href="#/admin">Open Dashboard</a>`;return}
  el.innerHTML=`<form id="lf"><div><label for="le">Email</label><input id="le" type="email" autocomplete="username" required></div><div><label for="lp">Password</label><input id="lp" type="password" autocomplete="current-password" required></div><div class="err" id="e_l" role="alert"></div><button class="btn" id="lb">Sign in</button></form>`;
  $('lf').onsubmit=async ev=>{ev.preventDefault();$('lb').disabled=true;$('e_l').textContent='';
    try{me=(await api('POST','/api/auth/login',{email:$('le').value,password:$('lp').value})).user;location.hash='#/admin'}
    catch(e){$('lb').disabled=false;$('e_l').textContent=e.message}}}

let adminLoaded=null;
async function adminView(){
  if(!me){$('mn').innerHTML='<h2>Access restricted</h2><p>The dashboard is available to authenticated administrators only. <a href="#/login">Admin Login</a></p>';return}
  adminLoaded??=new Promise((ok,no)=>{const s=document.createElement('script');s.src='js/admin.js';s.onload=ok;s.onerror=()=>{adminLoaded=null;no()};document.head.appendChild(s)});
  try{await adminLoaded;NC.mountAdmin(me,async()=>{try{await api('POST','/api/auth/logout')}catch{}me=null;location.hash='#/';route()})}
  catch{$('mn').innerHTML='<p>Could not load the dashboard.</p>'}}

ready.then(route);
