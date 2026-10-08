// Admin dashboard — loaded on demand by app.js after sign-in.
(()=>{
const {api,esc,ic,$}=NC;
const fmt=d=>d?new Date(d).toLocaleString():'';
const toast=m=>{const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2200)};
const pill=s=>`<span class="pill ${esc(String(s).toLowerCase().split(' ')[0])}">${esc(s)}</span>`;
const errText=e=>e.errors?Object.values(e.errors).join(' '):e.message;
const download=(url)=>{const a=document.createElement('a');a.href=url;a.click()};


let user,onLogout,cur='overview';
const TABS=()=>[['overview','Overview'],['requests','Service Requests'],['orders','DIY Orders'],['hotels','Hotel Inventory'],
  ...(user.role=='admin'?[['users','Users'],['settings','Settings']]:[])];

NC.mountAdmin=(u,logout)=>{user=u;onLogout=logout;
  $('app').innerHTML=`<div class="adm"><div class="side" id="sd"></div><div class="main" id="mn"><p>Loading…</p></div></div>`;
  $('sd').innerHTML=`<div class="who">${esc(user.name)}<br>${esc(user.role)}</div>`+TABS().map(t=>`<button data-t="${t[0]}">${ic('dash')}${t[1]}</button>`).join('')+`<button data-t="_out">${ic('logout')}Sign out</button>`;
  $('sd').onclick=e=>{const b=e.target.closest('button');if(!b)return;b.dataset.t=='_out'?onLogout():show(b.dataset.t)};
  show(cur)};

async function show(tab){
  cur=tab;document.querySelectorAll('#sd button').forEach(b=>b.classList.toggle('on',b.dataset.t==tab));
  const mn=$('mn');mn.innerHTML='<p>Loading…</p>';
  try{await VIEWS[tab](mn)}catch(e){if(e.status==401){onLogout();return}mn.innerHTML=`<p class="err">${esc(e.message)}</p>`}}

// ---- overview
const VIEWS={};
VIEWS.overview=async mn=>{const s=await api('GET','/api/admin/summary');
  const pay={paystack:'Paystack (online)',simulation:'Test mode (simulated)',off:'Manual — you mark orders as paid'}[s.payment]||s.payment;
  mn.innerHTML=`<h2>Overview</h2><div class="cards"><div><b>${s.requests}</b>Service requests</div><div><b>${s.newRequests}</b>New (unanswered)</div><div><b>${s.orders}</b>DIY orders</div><div><b>${s.pendingOrders}</b>Orders to fulfil</div><div><b>₦${Number(s.revenue).toLocaleString('en-NG')}</b>Paid hotel revenue</div><div><b>${s.hotels}</b>Hotel rates</div></div>
  <p class="mu">Online payments: <b>${esc(pay)}</b>${s.payment=='off'?' Hotel bookings are reservations; open an order and click <b>Mark as PAID</b> once the client has paid.':''}</p>
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

VIEWS.users=crud({title:'Users',base:'/api/admin/users',fields:[['name','Name'],['email','Email'],['role','Role','select',['staff','admin']]],extra:[['password','Password (min 10 characters)','password']]});

// ---- DIY orders (hotels, HHR train, transfers)
const loadSlip=()=>window.NCSlip?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src='js/slip.js';s.onload=ok;s.onerror=no;document.head.appendChild(s)});
const TYPE={hotel:'Hotel',train:'HHR Train',transfer:'Transfer'};
const oSum=o=>o.type=='hotel'?`${o.details.hotelName} · ${o.details.roomType} · ${o.details.checkIn} → ${o.details.checkOut} (${o.details.nights}n, ${o.details.rooms}r)`:o.type=='train'?`${o.details.from} → ${o.details.to} · ${o.details.date}`:`${o.details.vehicle} ×${o.details.quantity} · ${o.details.pickup} → ${o.details.dropoff} · ${o.details.date} ${o.details.time}`;
const payPill=o=>o.paymentStatus=='paid'?'<span class="pill closed">Paid</span>':o.paymentStatus=='unpaid'?'<span class="pill new">Unpaid</span>':'<span class="pill">Request</span>';
VIEWS.orders=async mn=>{
  const {items,statuses}=await api('GET','/api/admin/orders'); await loadSlip().catch(()=>{});
  let q='',ft='',fs='',open=null;
  const draw=()=>{
    const R=items.filter(o=>(!ft||o.type==ft)&&(!fs||o.status==fs)&&JSON.stringify(o).toLowerCase().includes(q));
    mn.innerHTML=`<h2>DIY Orders</h2><p class="mu">${items.length} total · hotel bookings, HHR train and transfer requests</p>
    <div class="toolbar"><input id="q" placeholder="Search ID, name, phone, hotel…" value="${esc(q)}" aria-label="Search"><select id="ft" aria-label="Type"><option value="">All types</option>${Object.entries(TYPE).map(([k,v])=>`<option value="${k}" ${ft==k?'selected':''}>${v}</option>`).join('')}</select><select id="fs" aria-label="Status"><option value="">All statuses</option>${statuses.map(s=>`<option ${fs==s?'selected':''}>${s}</option>`).join('')}</select><a class="btn sm o" href="api/admin/orders.csv">Export CSV</a></div>
    <div class="tw"><table><tr><th>Booking ID</th><th>Created</th><th>Type</th><th>Client</th><th>Details</th><th>Amount</th><th>Payment</th><th>Status</th><th></th></tr>${R.map(o=>`<tr><td><b>${esc(o.bookingId)}</b></td><td>${esc(fmt(o.createdAt))}</td><td>${TYPE[o.type]}</td><td>${esc(o.customer.fullName)}<br><small>${esc(o.customer.phone)}</small></td><td style="min-width:230px">${esc(oSum(o))}</td><td>${o.type=='hotel'?'₦'+Number(o.amount).toLocaleString('en-NG'):'—'}</td><td>${payPill(o)}</td>
      <td><select data-s="${o.id}" aria-label="Status">${statuses.map(s=>`<option ${s==o.status?'selected':''}>${s}</option>`).join('')}</select></td>
      <td style="white-space:nowrap"><button class="btn sm o" data-v="${o.id}">View</button> <button class="btn sm o" data-p="${o.id}">Slip PDF</button>${user.role=='admin'?` <button class="btn sm o" data-x="${o.id}">Delete</button>`:''}</td></tr>`).join('')||'<tr><td colspan="9">No orders yet.</td></tr>'}</table></div><div id="dt"></div>`;
    const qi=$('q');qi.oninput=e=>{q=e.target.value.toLowerCase();const p=qi.selectionStart;draw();$('q').focus();$('q').setSelectionRange(p,p)};
    $('ft').onchange=e=>{ft=e.target.value;draw()};$('fs').onchange=e=>{fs=e.target.value;draw()};
    mn.querySelectorAll('[data-s]').forEach(s=>s.onchange=async()=>{try{Object.assign(items.find(o=>o.id==s.dataset.s),await api('PATCH','/api/admin/orders/'+s.dataset.s,{status:s.value}));toast('Status updated')}catch(e){toast(errText(e))}draw()});
    mn.querySelectorAll('[data-p]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await loadSlip();await NCSlip.pdf(items.find(o=>o.id==b.dataset.p))}catch(e){toast('Could not create the slip')}b.disabled=false});
    mn.querySelectorAll('[data-x]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this order permanently?'))return;try{await api('DELETE','/api/admin/orders/'+b.dataset.x);items.splice(items.findIndex(o=>o.id==b.dataset.x),1);draw()}catch(e){toast(errText(e))}});
    mn.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{open=items.find(o=>o.id==b.dataset.v);detail()});
    if(open)detail()};
  const detail=()=>{const o=open;
    $('dt').innerHTML=`<div class="box detail"><h3>Order ${esc(o.bookingId)}</h3><div class="slipwrap">${window.NCSlip?NCSlip.html(o):''}</div>
    <label style="margin-top:14px;display:block">Internal notes<textarea id="nt" rows="3" maxlength="2000">${esc(o.notes||'')}</textarea></label><div class="row"><button class="btn sm" id="sv">Save notes</button><button class="btn sm" id="dp">Download slip (PDF)</button>${o.type=='hotel'?`<button class="btn sm ${o.paymentStatus=='paid'?'o':''}" id="mp">${o.paymentStatus=='paid'?'Mark as unpaid':'Mark as PAID'}</button>`:''}<button class="btn sm o" id="cl">Close</button></div></div>`;
    if($('mp'))$('mp').onclick=async()=>{try{Object.assign(o,await api('PATCH','/api/admin/orders/'+o.id,{paymentStatus:o.paymentStatus=='paid'?'unpaid':'paid'}));toast(o.paymentStatus=='paid'?'Marked as paid':'Marked as unpaid');draw()}catch(e){toast(errText(e))}};
    $('sv').onclick=async()=>{try{Object.assign(o,await api('PATCH','/api/admin/orders/'+o.id,{notes:$('nt').value}));toast('Notes saved')}catch(e){toast(errText(e))}};
    $('dp').onclick=()=>NCSlip.pdf(o);$('cl').onclick=()=>{open=null;$('dt').innerHTML=''};$('dt').scrollIntoView({behavior:'smooth',block:'nearest'})};
  draw()};

// ---- Hotel inventory (rates, mark-up, bulk upload, offers)
const b64=buf=>{let s='';const u=new Uint8Array(buf);for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
const resizeImg=(file,max=1200)=>new Promise((ok,no)=>{const fr=new FileReader();fr.onerror=no;fr.onload=()=>{const img=new Image();img.onerror=no;img.onload=()=>{const r=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*r);c.height=Math.round(img.height*r);c.getContext('2d').drawImage(img,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',.82).split(',')[1])};img.src=fr.result};fr.readAsDataURL(file)});
const NG=n=>'₦'+Number(n).toLocaleString('en-NG');
VIEWS.hotels=async mn=>{
  let {items,defaults,fxRate}=await api('GET','/api/admin/hotels'); fxRate=Number(fxRate)||0; let q='';
  const nightly=h=>{const base=h.currency=='SAR'?(fxRate>0?h.cost*fxRate:null):h.cost;return base==null?null:Math.round(base*(1+(h.markupPct||0)/100)+(+h.markupFixed||0))};
  const reload=async()=>{items=(await api('GET','/api/admin/hotels')).items;draw()};
  const draw=()=>{
    const R=items.filter(h=>JSON.stringify(h).toLowerCase().includes(q));
    mn.innerHTML=`<h2>Hotel Inventory</h2><p class="mu">${items.length} rate${items.length==1?'':'s'} · Makkah &amp; Madinah · shown to clients on the DIY Booking page, cheapest first.</p>
    ${fxRate>0?'':'<div class="callout" style="margin:0 0 12px"><div><b>Platform FX rate not set.</b> Hotels priced in SAR are hidden from clients until you set it in <b>Settings</b>.</div></div>'}
    <div class="toolbar"><input id="q" placeholder="Search hotels…" value="${esc(q)}" aria-label="Search"><button class="btn sm" id="add">Add hotel</button><button class="btn sm" id="bulk">Bulk upload (Excel / CSV)</button><a class="btn sm o" href="api/admin/hotels-template.xlsx">Download template</a></div>
    <div id="hu"></div><div id="hf"></div>
    <div class="tw"><table><tr><th>Hotel</th><th>Room type</th><th>Distance</th><th>Rate / night</th><th>Mark-up</th><th>Selling / night</th><th>Valid</th><th>Offer</th><th>Live</th><th></th></tr>${R.map(h=>`<tr${h.active?'':' style="opacity:.55"'}><td><b>${esc(h.name)}</b>${h.featured?' <span class="pill new">Featured</span>':''}<br><small>${esc(h.city)}${h.stars?` · ${h.stars}★`:''}</small></td><td>${esc(h.roomType)}<br><small>sleeps ${h.capacity}</small></td><td>${h.distanceM!=null?h.distanceM+' m':'—'}</td><td>${esc(h.currency)} ${Number(h.cost).toLocaleString('en-NG')}</td><td>${h.markupPct||0}%${h.markupFixed?` + ${NG(h.markupFixed)}`:''}</td><td><b>${nightly(h)!=null?NG(nightly(h)):'<span class="err">needs FX</span>'}</b></td><td><small>${h.validFrom||h.validTo?`${esc(h.validFrom||'…')} → ${esc(h.validTo||'…')}`:'always'}</small></td><td>${h.offerPdf?`<a href="api/admin/offers/${esc(h.offerPdf)}" target="_blank" rel="noopener">PDF</a>`:'—'}</td><td><input type="checkbox" data-a="${h.id}" ${h.active?'checked':''} aria-label="Live" style="width:18px;min-height:18px;margin:0"></td><td style="white-space:nowrap"><button class="btn sm o" data-m="${h.id}">Edit</button> <button class="btn sm o" data-x="${h.id}">Delete</button></td></tr>`).join('')||'<tr><td colspan="10">No hotels yet — add one or upload an Excel file.</td></tr>'}</table></div>`;
    const qi=$('q');qi.oninput=e=>{q=e.target.value.toLowerCase();const p=qi.selectionStart;draw();$('q').focus();$('q').setSelectionRange(p,p)};
    $('add').onclick=()=>form(null);$('bulk').onclick=upload;
    mn.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>form(items.find(h=>h.id==b.dataset.m)));
    mn.querySelectorAll('[data-a]').forEach(c=>c.onchange=async()=>{try{await api('PUT','/api/admin/hotels/'+c.dataset.a,{active:c.checked});toast(c.checked?'Hotel is live':'Hotel hidden from clients');await reload()}catch(e){toast(errText(e));await reload()}});
    mn.querySelectorAll('[data-x]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this hotel rate?'))return;try{await api('DELETE','/api/admin/hotels/'+b.dataset.x);await reload()}catch(e){toast(errText(e))}});
  };
  const upload=()=>{
    $('hf').innerHTML='';
    $('hu').innerHTML=`<div class="box" style="margin-bottom:14px"><h3>Bulk upload hotel rates</h3><p class="mu">Upload an <b>.xlsx</b> or <b>.csv</b> file (use the template). Rows are matched on hotel + city + room type + validity dates, so re-uploading updates existing rates. The mark-up below is added automatically to every row that has no <code>markup_pct</code> of its own.</p>
    <form id="uf"><div><label>Rates file<input type="file" id="uff" accept=".xlsx,.csv" required></label></div>
    <div class="f2"><div><label>Mark-up % for this upload<input id="um" type="number" step="0.01" min="0" max="500" value="${defaults.markupPct}"></label></div><div><label>Fixed mark-up / night (₦)<input id="uf2" type="number" step="1" min="0" value="${defaults.markupFixed}"></label></div></div>
    <div class="err" id="eu" role="alert"></div><div class="row" style="margin:0"><button class="btn sm" id="ub">Upload</button><button type="button" class="btn sm o" id="uc">Cancel</button></div><div id="ur"></div></form></div>`;
    $('uc').onclick=()=>$('hu').innerHTML='';
    $('uf').onsubmit=async e=>{e.preventDefault();const f=$('uff').files[0];if(!f)return;$('ub').disabled=true;$('eu').textContent='';
      try{const out=await api('POST','/api/admin/hotels/import',{filename:f.name,data:b64(await f.arrayBuffer()),markupPct:$('um').value,markupFixed:$('uf2').value});
        $('ur').innerHTML=`<div class="callout" style="margin-top:12px"><div><b>Upload complete.</b> ${out.created} added · ${out.updated} updated · ${out.skipped} skipped. Mark-up applied: ${out.markupPct}%${out.markupFixed?` + ${NG(out.markupFixed)}`:''}.${out.errors.length?`<ul style="margin:6px 0 0 18px">${out.errors.map(x=>`<li>Row ${x.row}: ${esc(x.errors)}</li>`).join('')}</ul>`:''}</div></div>`;
        await reload2();}
      catch(err){$('eu').textContent=errText(err)}finally{$('ub').disabled=false}};
  };
  const reload2=async()=>{items=(await api('GET','/api/admin/hotels')).items;const keep=$('hu').innerHTML;draw();$('hu').innerHTML=keep;$('uc')&&($('uc').onclick=()=>$('hu').innerHTML='')};
  const form=h=>{
    $('hu').innerHTML='';const v=h||{city:'Makkah',currency:'SAR',capacity:4,stars:4,markupPct:defaults.markupPct,markupFixed:defaults.markupFixed,active:true,facilities:[]};
    $('hf').innerHTML=`<div class="box" style="margin-bottom:14px"><h3>${h?'Edit hotel rate':'Add hotel rate'}</h3><form id="ef">
    <div class="f2"><div><label>Hotel name *<input name="name" value="${esc(v.name||'')}" required></label></div><div><label>City *<select name="city">${['Makkah','Madinah'].map(c=>`<option ${v.city==c?'selected':''}>${c}</option>`).join('')}</select></label></div></div>
    <div class="f2"><div><label>Address<input name="address" value="${esc(v.address||'')}"></label></div><div><label>Distance to Haram / Nabawi (metres)<input name="distanceM" type="number" min="0" value="${esc(v.distanceM??'')}"></label></div></div>
    <div class="f2"><div><label>Room type *<input name="roomType" value="${esc(v.roomType||'')}" placeholder="e.g. Double Room" required></label></div><div><label>Sleeps (guests per room)<input name="capacity" type="number" min="1" max="12" value="${esc(v.capacity)}"></label></div></div>
    <div class="f2"><div><label>Stars<select name="stars">${[0,1,2,3,4,5].map(n=>`<option ${v.stars==n?'selected':''} value="${n}">${n?n+' ★':'Unrated'}</option>`).join('')}</select></label></div><div><label>Facilities (comma-separated)<input name="facilities" value="${esc((v.facilities||[]).join(', '))}" placeholder="Wi-Fi, Breakfast, Shuttle"></label></div></div>
    <h4 style="margin:14px 0 4px">Rate &amp; mark-up</h4>
    <div class="f2"><div><label>Hotel rate per night *<input name="cost" id="hc_cost" type="number" step="0.01" min="0" value="${esc(v.cost??'')}" required></label></div><div><label>Currency<select name="currency" id="hc_cur">${['SAR','NGN'].map(c=>`<option ${v.currency==c?'selected':''}>${c}</option>`).join('')}</select></label></div></div>
    <div class="f2"><div><label>Mark-up % (profit)<input name="markupPct" id="hc_pct" type="number" step="0.01" min="0" max="500" value="${esc(v.markupPct)}"></label></div><div><label>Fixed mark-up per night (₦)<input name="markupFixed" id="hc_fix" type="number" step="1" min="0" value="${esc(v.markupFixed)}"></label></div></div>
    <div class="callout" style="margin:6px 0 10px"><div>Selling price per night shown to clients: <b id="hc_prev">—</b></div></div>
    <div class="f2"><div><label>Valid from<input name="validFrom" type="date" value="${esc(v.validFrom||'')}"></label></div><div><label>Valid to<input name="validTo" type="date" value="${esc(v.validTo||'')}"></label></div></div>
    <div class="f2"><div><label>Cover image ${v.imageUrl?`<small>(current: <a href="${esc(v.imageUrl)}" target="_blank" rel="noopener">view</a>)</small>`:''}<input type="file" id="hc_img" accept="image/jpeg,image/png,image/webp"></label></div><div><label>Original offer (PDF) ${v.offerPdf?`<small>(<a href="api/admin/offers/${esc(v.offerPdf)}" target="_blank" rel="noopener">current</a>)</small>`:''}<input type="file" id="hc_pdf" accept="application/pdf"></label></div></div>
    <label style="display:flex;gap:10px;align-items:center;font-weight:500"><input type="checkbox" name="active" ${v.active?'checked':''} style="width:20px;min-height:20px;margin:0"> Live (visible to clients)</label>
    <label style="display:flex;gap:10px;align-items:center;font-weight:500"><input type="checkbox" name="featured" ${v.featured?'checked':''} style="width:20px;min-height:20px;margin:0"> Featured offer (shown on the DIY Booking page — the 3 best are displayed)</label>
    <div class="err" id="e_ef" role="alert"></div><div class="row" style="margin:0"><button class="btn sm" id="hs">Save</button><button type="button" class="btn sm o" id="hx">Cancel</button></div></form></div>`;
    const prev=()=>{const c=+$('hc_cost').value||0,cur=$('hc_cur').value,p=+$('hc_pct').value||0,f=+$('hc_fix').value||0;const base=cur=='SAR'?(fxRate>0?c*fxRate:null):c;$('hc_prev').textContent=base==null?'Set the FX rate in Settings to see the SAR price':c?NG(Math.round(base*(1+p/100)+f)):'—'};
    ['hc_cost','hc_cur','hc_pct','hc_fix'].forEach(i=>$(i).oninput=prev);prev();$('hx').onclick=()=>$('hf').innerHTML='';$('hf').scrollIntoView({behavior:'smooth',block:'start'});
    $('ef').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),d=Object.fromEntries(fd);d.active=fd.has('active');d.featured=fd.has('featured');$('hs').disabled=true;$('e_ef').textContent='';
      try{const saved=await api(h?'PUT':'POST',h?'/api/admin/hotels/'+h.id:'/api/admin/hotels',d);
        const img=$('hc_img').files[0],pdf=$('hc_pdf').files[0];
        if(img)await api('POST',`/api/admin/hotels/${saved.id}/image`,{data:await resizeImg(img)});
        if(pdf)await api('POST',`/api/admin/hotels/${saved.id}/offer`,{filename:pdf.name,data:b64(await pdf.arrayBuffer())});
        toast('Hotel saved');$('hf').innerHTML='';await reload()}
      catch(err){$('e_ef').textContent=errText(err);$('hs').disabled=false}};
  };
  draw()};

// ---- settings (brochure / video links)
VIEWS.settings=async mn=>{
  const s=await api('GET','/api/admin/settings');
  const row=(g,k,l)=>`<div><label>${l}<input name="${g}.${k}" type="url" placeholder="https://…" value="${esc((s[g]||{})[k]||'')}"></label></div>`;
  mn.innerHTML=`<h2>Settings</h2><p class="mu">Public links shown on the website. Leave blank to keep the button disabled.</p><form id="sf" class="box">
  <h3>Hotel mark-up (profit) defaults</h3><p class="mu">Applied automatically to every hotel rate you upload or add (you can override it per upload or per hotel). Selling price = rate × FX rate × (1 + %) + fixed ₦.</p>
  <div class="f2"><div><label>Default mark-up %<input name="markupPct" type="number" step="0.01" min="0" max="500" value="${esc(s.markupPct??0)}"></label></div><div><label>Default fixed mark-up per night (₦)<input name="markupFixed" type="number" step="1" min="0" value="${esc(s.markupFixed??0)}"></label></div></div>
  <p class="mu">Payments: <b>${esc({paystack:'Paystack (online)',simulation:'Test mode (simulated)',off:'Manual — clients reserve, your team collects payment'}[s.payment]||'')}</b> ${s.payment=='paystack'?'<button type="button" class="btn sm o" id="pchk" style="margin-left:8px">Check Paystack connection</button>':''}</p><div id="pchkr" role="status"></div>
  <h3>Platform FX rate</h3><div><label>Naira (₦) per 1 Saudi Riyal (SAR) — shown in the top bar; leave blank to hide<input name="fxRate" type="number" step="0.01" min="0" inputmode="decimal" placeholder="e.g. 410.50" value="${esc(s.fxRate??'')}"></label></div>
  <h3>Brochures</h3>${[[2,'Company Registration'],[3,'UEA O.1 Capacity Building'],[4,'Operations Masterclass'],[5,'Saudi Partner Contracting'],[6,'Package Development']].map(([k,l])=>row('brochures',k,l)).join('')}
  <h3>Session videos (YouTube)</h3>${[[1,'UEA O.1 — Kano'],[2,'UEA O.1 — Abuja'],[3,'SSP 3rd Edition']].map(([k,l])=>row('youtube',k,l)).join('')}
  <div class="err" id="e_sf" role="alert"></div><div class="row" style="margin:0"><button class="btn sm">Save settings</button></div></form>`;
  if($('pchk'))$('pchk').onclick=async e=>{const b=e.currentTarget;b.disabled=true;$('pchkr').innerHTML='<p class="mu">Checking…</p>';
    try{const r=await api('GET','/api/admin/payments/check');$('pchkr').innerHTML=`<div class="callout ${r.ok?'':'r'}" style="margin:8px 0"><div><b>${r.ok?'✔ Working':'✖ Problem'}</b> — ${esc(r.message)}</div></div>`}
    catch(err){$('pchkr').innerHTML=`<p class="err">${esc(errText(err))}</p>`}finally{b.disabled=false}};
  $('sf').onsubmit=async e=>{e.preventDefault();const out={brochures:{},youtube:{},fxRate:'',markupPct:'',markupFixed:''};
    for(const [n,v] of new FormData(e.target)){if(n=='fxRate'||n=='markupPct'||n=='markupFixed'){out[n]=v;continue}const [g,k]=n.split('.');out[g][k]=v}
    const say=m=>{const el=$('e_sf');if(el)el.textContent=m};
    try{await api('PUT','/api/admin/settings',out);say('');toast('Settings saved')}catch(err){say(errText(err))}}};
})();
