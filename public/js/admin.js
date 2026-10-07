// Admin dashboard — loaded on demand by app.js after sign-in.
(()=>{
const {api,esc,ic,$}=NC;
const fmt=d=>d?new Date(d).toLocaleString():'';
const toast=m=>{const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2200)};
const pill=s=>`<span class="pill ${esc(String(s).toLowerCase().split(' ')[0])}">${esc(s)}</span>`;
const errText=e=>e.errors?Object.values(e.errors).join(' '):e.message;
const download=(url)=>{const a=document.createElement('a');a.href=url;a.click()};

const INV={
  hotels:{t:'Hotel Inventory',f:[['name','Hotel name'],['city','City'],['stars','Stars'],['roomType','Room type']]},
  esims:{t:'eSIM Inventory',f:[['name','Plan name'],['provider','Provider'],['data','Data'],['validity','Validity']]}};

let user,onLogout,cur='overview';
const TABS=()=>[['overview','Overview'],['requests','Service Requests'],['bookings','Bookings'],['hotels','Hotel Inventory'],['esims','eSIM Inventory'],
  ...(user.role=='admin'?[['users','Users'],['settings','Settings']]:[])];

NC.mountAdmin=(u,logout)=>{user=u;onLogout=logout;
  $('app').innerHTML=`<div class="adm"><div class="side" id="sd"></div><div class="main" id="mn"><p>Loading…</p></div></div>`;
  $('sd').innerHTML=`<div class="who">${esc(user.name)}<br>${esc(user.role)}</div>`+TABS().map(t=>`<button data-t="${t[0]}">${ic('dash')}${t[1]}</button>`).join('')+`<button data-t="_out">${ic('login')}Sign out</button>`;
  $('sd').onclick=e=>{const b=e.target.closest('button');if(!b)return;b.dataset.t=='_out'?onLogout():show(b.dataset.t)};
  show(cur)};

async function show(tab){
  cur=tab;document.querySelectorAll('#sd button').forEach(b=>b.classList.toggle('on',b.dataset.t==tab));
  const mn=$('mn');mn.innerHTML='<p>Loading…</p>';
  try{await VIEWS[tab](mn)}catch(e){if(e.status==401){onLogout();return}mn.innerHTML=`<p class="err">${esc(e.message)}</p>`}}

// ---- overview
const VIEWS={};
VIEWS.overview=async mn=>{const s=await api('GET','/api/admin/summary');
  mn.innerHTML=`<h2>Overview</h2><div class="cards"><div><b>${s.requests}</b>Service requests</div><div><b>${s.newRequests}</b>New (unanswered)</div><div><b>${s.bookings}</b>Bookings</div><div><b>${s.pendingBookings}</b>Pending bookings</div><div><b>${s.hotels}</b>Hotels</div><div><b>${s.esims}</b>eSIM plans</div></div>
  <h3>Requests by service</h3><div class="tw"><table><tr><th>Service</th><th>Requests</th></tr>${s.byService.map(r=>`<tr><td>${esc(r.service)}</td><td>${r.count}</td></tr>`).join('')}</table></div>`};

// ---- requests & bookings (shared list UI)
function workflow(coll,title,cols,detailRows){
  return async mn=>{
    const {items,statuses}=await api('GET','/api/admin/'+coll);let q='',open=null;
    const draw=()=>{
      const R=items.filter(r=>JSON.stringify(r).toLowerCase().includes(q));
      mn.innerHTML=`<h2>${title}</h2><p class="mu">${items.length} total</p><div class="toolbar"><input id="q" placeholder="Search" value="${esc(q)}" aria-label="Search"><button class="btn sm o" id="csv">Export CSV</button></div>
      <div class="tw"><table><tr>${cols.map(c=>`<th>${c[1]}</th>`).join('')}<th>Status</th><th></th></tr>${R.map(r=>`<tr>${cols.map(c=>`<td>${c[2]?c[2](r):esc(r[c[0]])}</td>`).join('')}<td><select data-s="${r.id}" aria-label="Status">${statuses.map(s=>`<option ${s==r.status?'selected':''}>${s}</option>`).join('')}</select></td><td style="white-space:nowrap"><button class="btn sm o" data-v="${r.id}">View</button> <button class="btn sm o" data-x="${r.id}">Delete</button></td></tr>`).join('')||`<tr><td colspan="${cols.length+2}">Nothing here yet.</td></tr>`}</table></div><div id="dt"></div>`;
      const qi=$('q');qi.oninput=e=>{q=e.target.value.toLowerCase();const p=qi.selectionStart;draw();$('q').focus();$('q').setSelectionRange(p,p)};
      $('csv').onclick=()=>download(`api/admin/${coll}.csv`);
      mn.querySelectorAll('[data-s]').forEach(s=>s.onchange=async()=>{try{Object.assign(items.find(r=>r.id==s.dataset.s),await api('PATCH',`/api/admin/${coll}/${s.dataset.s}`,{status:s.value}));toast('Status updated')}catch(e){toast(errText(e))}draw()});
      mn.querySelectorAll('[data-x]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this record permanently?'))return;try{await api('DELETE',`/api/admin/${coll}/${b.dataset.x}`);items.splice(items.findIndex(r=>r.id==b.dataset.x),1);draw()}catch(e){toast(errText(e))}});
      mn.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{open=items.find(r=>r.id==b.dataset.v);detail()});
      if(open)detail()};
    const detail=()=>{const r=open;
      $('dt').innerHTML=`<div class="box detail"><h3>Details</h3><dl>${detailRows.map(([k,l])=>`<dt>${l}</dt><dd>${esc(Array.isArray(r[k])?r[k].join(', '):k.endsWith('At')?fmt(r[k]):r[k])}</dd>`).join('')}</dl>
      <label>Internal notes<textarea id="nt" rows="3" maxlength="2000">${esc(r.notes||'')}</textarea></label><div class="row"><button class="btn sm" id="sv">Save notes</button><button class="btn sm o" id="cl">Close</button></div></div>`;
      $('sv').onclick=async()=>{try{Object.assign(r,await api('PATCH',`/api/admin/${coll}/${r.id}`,{notes:$('nt').value}));toast('Notes saved')}catch(e){toast(errText(e))}};
      $('cl').onclick=()=>{open=null;$('dt').innerHTML=''};$('dt').scrollIntoView({behavior:'smooth',block:'nearest'})};
    draw()}}

VIEWS.requests=workflow('requests','Service Requests',
  [['createdAt','Submitted',r=>esc(fmt(r.createdAt))],['service','Service'],['mode','Mode',r=>esc((r.mode||[]).join(', '))],['name','Name',r=>esc(r.firstName+' '+r.lastName)],['email','Email',r=>`<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`],['phone','Phone'],['company','Company'],['role','Role']],
  [['createdAt','Submitted'],['service','Service'],['mode','Mode'],['firstName','First name'],['lastName','Last name'],['email','Email'],['phone','Phone'],['company','Company'],['role','Role'],['status','Status']]);
VIEWS.bookings=workflow('bookings','Bookings',
  [['id','Reference',r=>esc(r.id.slice(0,8).toUpperCase())],['createdAt','Submitted',r=>esc(fmt(r.createdAt))],['type','Service'],['name','Name'],['email','Email',r=>`<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`],['phone','Phone']],
  [['id','Reference'],['createdAt','Submitted'],['type','Service'],['name','Name'],['email','Email'],['phone','Phone'],['dateFrom','From'],['dateTo','To'],['details','Details'],['status','Status']]);

// ---- generic CRUD (inventory + users)
function crud({title,base,fields,extra=[],pwd=false}){
  return async mn=>{
    let {items}=await api('GET',base);
    const draw=()=>{
      mn.innerHTML=`<h2>${title}</h2><div class="row" style="margin:0 0 14px"><button class="btn sm" id="add">Add</button></div><div class="tw"><table><tr>${fields.map(f=>`<th>${f[1]}</th>`).join('')}<th></th></tr>${items.map(r=>`<tr>${fields.map(f=>`<td>${esc(r[f[0]])}</td>`).join('')}<td style="white-space:nowrap"><button class="btn sm o" data-m="${r.id}">Modify</button> <button class="btn sm o" data-x="${r.id}">Delete</button></td></tr>`).join('')||`<tr><td colspan="${fields.length+1}">Nothing added yet.</td></tr>`}</table></div><div id="ed"></div>`;
      $('add').onclick=()=>edit(null);
      mn.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>edit(items.find(r=>r.id==b.dataset.m)));
      mn.querySelectorAll('[data-x]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this record?'))return;try{const out=await api('DELETE',`${base}/${b.dataset.x}`);items=out.items||items.filter(r=>r.id!=b.dataset.x);draw()}catch(e){toast(errText(e))}})};
    const edit=r=>{
      const input=f=>f[2]=='select'?`<select name="${f[0]}">${f[3].map(o=>`<option ${r&&r[f[0]]==o?'selected':''}>${o}</option>`).join('')}</select>`:`<input name="${f[0]}" type="${f[2]||'text'}" value="${f[2]=='password'?'':esc(r?r[f[0]]:'')}" ${f[2]=='password'?`autocomplete="new-password" ${r?'placeholder="Leave blank to keep current"':'required'}`:''}>`;
      $('ed').innerHTML=`<div class="box" style="margin-top:16px"><h3>${r?'Modify':'Add'}</h3><form id="ef">${[...fields,...extra].map(f=>`<div><label>${f[1]}${input(f)}</label></div>`).join('')}<div class="err" id="e_ef" role="alert"></div><div class="row" style="margin:0"><button class="btn sm">Save</button><button type="button" class="btn sm o" id="cx">Cancel</button></div></form></div>`;
      $('cx').onclick=()=>$('ed').innerHTML='';
      $('ef').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));
        try{const out=await api(r?'PUT':'POST',r?`${base}/${r.id}`:base,d);
          if(out.items)items=out.items;else if(r)items[items.findIndex(x=>x.id==r.id)]=out;else items.unshift(out);
          toast('Saved');draw()}
        catch(err){$('e_ef').textContent=errText(err)}}};
    draw()}}

for(const k in INV)VIEWS[k]=crud({title:INV[k].t,base:'/api/admin/'+k,fields:INV[k].f});
VIEWS.users=crud({title:'Users',base:'/api/admin/users',fields:[['name','Name'],['email','Email'],['role','Role','select',['staff','admin']]],extra:[['password','Password (min 10 characters)','password']]});

// ---- settings (brochure / video links)
VIEWS.settings=async mn=>{
  const s=await api('GET','/api/admin/settings');
  const row=(g,k,l)=>`<div><label>${l}<input name="${g}.${k}" type="url" placeholder="https://…" value="${esc((s[g]||{})[k]||'')}"></label></div>`;
  mn.innerHTML=`<h2>Settings</h2><p class="mu">Public links shown on the website. Leave blank to keep the button disabled.</p><form id="sf" class="box">
  <h3>Platform FX rate</h3><div><label>Naira (₦) per 1 Saudi Riyal (SAR) — shown in the top bar; leave blank to hide<input name="fxRate" type="number" step="0.01" min="0" inputmode="decimal" placeholder="e.g. 410.50" value="${esc(s.fxRate??'')}"></label></div>
  <h3>Brochures</h3>${[[2,'Company Registration'],[3,'UEA O.1 Capacity Building'],[4,'Operations Masterclass'],[5,'Saudi Partner Contracting'],[6,'Package Development']].map(([k,l])=>row('brochures',k,l)).join('')}
  <h3>Session videos (YouTube)</h3>${[[1,'UEA O.1 — Kano'],[2,'UEA O.1 — Abuja'],[3,'SSP 3rd Edition']].map(([k,l])=>row('youtube',k,l)).join('')}
  <div class="err" id="e_sf" role="alert"></div><div class="row" style="margin:0"><button class="btn sm">Save settings</button></div></form>`;
  $('sf').onsubmit=async e=>{e.preventDefault();const out={brochures:{},youtube:{},fxRate:''};
    for(const [n,v] of new FormData(e.target)){if(n=='fxRate'){out.fxRate=v;continue}const [g,k]=n.split('.');out[g][k]=v}
    const say=m=>{const el=$('e_sf');if(el)el.textContent=m};
    try{await api('PUT','/api/admin/settings',out);say('');toast('Settings saved')}catch(err){say(errText(err))}}};
})();
