// DIY Booking: Hotels (search → order → pay), HHR Train and Transfers (request forms), and the booking-slip page.
(()=>{
const {api,esc,$}=NC;
const NGN=n=>'₦'+Number(n).toLocaleString('en-NG');
const fd=d=>new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
const addDay=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const svg=(p,s=20)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC={
 pin:'<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
 cal:'<path d="M3 5h18v16H3zM3 10h18M8 3v4M16 3v4"/>', user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 hotel:'<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>',
 train:'<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l2-4M15 21l-2-4M9 7h.01M15 7h.01"/>',
 car:'<path d="M5 17H3v-5l2-5h14l2 5v5h-2M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M9 17h6M3 12h18"/>',
 swap:'<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 check:'<path d="M5 12l5 5 9-10"/>', dl:'<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>', shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
 wifi:'<path d="M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01"/>', bus:'<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M7 21v-3M17 21v-3M8 15h.01M16 15h.01"/>'
};
const ic=(n,s)=>svg(IC[n],s);
const stars=n=>n>0?'★'.repeat(n)+'<span class="off">'+'★'.repeat(5-n)+'</span>':'';
let cfg=null, tab='hotels', st={city:'Makkah',checkIn:'',checkOut:'',adults:2,children:0,rooms:1};
const errs=(prefix,e,keys)=>keys.forEach(k=>{const el=$(prefix+k);if(el)el.textContent=(e&&e[k])||''});
const guestLabel=s=>`${s.adults} Adult${s.adults>1?'s':''}${s.children?`, ${s.children} Child${s.children>1?'ren':''}`:''}${s.rooms!=null?`, ${s.rooms} Room${s.rooms>1?'s':''}`:''}`;
const stepper=(id,label,sub,val,min,max)=>`<div class="stp"><div><b>${label}</b><small>${sub}</small></div><div class="stc"><button type="button" data-st="${id}" data-d="-1" aria-label="Fewer ${label}">−</button><span id="v_${id}">${val}</span><button type="button" data-st="${id}" data-d="1" aria-label="More ${label}">+</button></div></div>`;
const custFields=(p)=>`<div class="cust"><div class="fld"><label for="${p}fullName">Full name *</label><div class="ctl">${ic('user',18)}<input id="${p}fullName" autocomplete="name"></div><div class="err" id="e_${p}fullName"></div></div>
<div class="fld"><label for="${p}phone">WhatsApp / mobile number *</label><div class="ctl"><input id="${p}phone" type="tel" autocomplete="tel" placeholder="+234…"></div><div class="err" id="e_${p}phone"></div></div>
<div class="fld"><label for="${p}email">Email *</label><div class="ctl"><input id="${p}email" type="email" autocomplete="email"></div><div class="err" id="e_${p}email"></div></div></div>`;
const custVals=p=>({fullName:$(p+'fullName').value.trim(),phone:$(p+'phone').value.trim(),email:$(p+'email').value.trim()});

// ============ shell ============
NC.mountBooking=async()=>{
  const root=$('bk'); if(!root)return;
  try{cfg??=await api('GET','api/booking-config')}catch{root.innerHTML='<div class="w"><p class="err">Could not load booking options. Please refresh.</p></div>';return}
  st.checkIn||(st.checkIn='');
  root.innerHTML=`<section class="bk-hero"><div class="w"><div class="eyebrow">DIY BOOKING</div><h1>Book your Umrah ground services</h1><p>Hotels in Makkah &amp; Madinah, the Haramain train and airport transfers — choose, pay and get your booking slip instantly. No account needed.</p></div></section>
  <section class="w bk-wrap"><div class="bk-card"><div class="bk-tabs" role="tablist">
  ${[['hotels','Hotels','hotel'],['train','HHR Train','train'],['transfers','Transfers','car']].map(t=>`<button role="tab" data-tab="${t[0]}" class="${tab==t[0]?'on':''}">${ic(t[2],22)}<span>${t[1]}</span></button>`).join('')}</div>
  <div class="bk-panel" id="bkp"></div></div><div id="bkr"></div></section>`;
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;root.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x==b));$('bkr').innerHTML='';panel()});
  panel();
};
const panel=()=>({hotels:hotelsPanel,train:trainPanel,transfers:transferPanel}[tab])();

// ============ HOTELS ============
function hotelsPanel(){
  const p=$('bkp');
  p.innerHTML=`<form id="hf" novalidate class="hgrid">
  <div class="fld"><label for="hc">DESTINATION</label><div class="ctl">${ic('pin',20)}<select id="hc">${cfg.cities.map(c=>`<option ${c==st.city?'selected':''}>${c}</option>`).join('')}</select></div><div class="err" id="e_city"></div></div>
  <div class="fld dual"><div class="half"><label for="hi">CHECK-IN</label><div class="ctl">${ic('cal',18)}<input type="date" id="hi" min="${cfg.today}" value="${st.checkIn}"></div></div><div class="half"><label for="ho">CHECK-OUT</label><div class="ctl">${ic('cal',18)}<input type="date" id="ho" min="${cfg.today}" value="${st.checkOut}"></div></div><div class="err" id="e_dates"></div></div>
  <div class="fld gst"><label>GUESTS &amp; ROOMS</label><button type="button" class="ctl" id="hg" aria-expanded="false">${ic('user',18)}<span id="hgl">${guestLabel(st)}</span></button>
   <div class="pop" id="hp" hidden>${stepper('adults','Adults','12+ years',st.adults,1,40)}${stepper('children','Children','Under 1 – 17 years',st.children,0,40)}${stepper('rooms','Rooms','Bookable units',st.rooms,1,20)}<button type="button" class="btn popdone" id="hd">Done</button></div></div>
  <div class="gorow"><div class="err" id="e_all" role="alert"></div><button class="btn go" id="hs">${ic('search',18)} Search hotels</button></div></form>`;
  const sync=()=>{$('hgl').textContent=guestLabel(st);for(const k of ['adults','children','rooms'])$('v_'+k).textContent=st[k]};
  const lim={adults:[1,40],children:[0,40],rooms:[1,20]};
  p.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{const k=b.dataset.st,[lo,hi]=lim[k];st[k]=Math.min(hi,Math.max(lo,st[k]+ +b.dataset.d));sync()});
  const pop=$('hp'),tog=o=>{pop.hidden=!o;$('hg').setAttribute('aria-expanded',o)};
  $('hg').onclick=e=>{e.stopPropagation();tog(pop.hidden)};$('hd').onclick=()=>tog(false);pop.onclick=e=>e.stopPropagation();
  document.addEventListener('click',()=>{const q=$('hp');if(q)q.hidden=true},{once:false});
  $('hc').onchange=e=>st.city=e.target.value;
  $('hi').onchange=e=>{st.checkIn=e.target.value;const o=$('ho');o.min=addDay(st.checkIn,1);if(!o.value||o.value<=st.checkIn){o.value=addDay(st.checkIn,1);st.checkOut=o.value}};
  $('ho').onchange=e=>st.checkOut=e.target.value;
  $('hf').onsubmit=async e=>{e.preventDefault();st.checkIn=$('hi').value;st.checkOut=$('ho').value;search()};
}
async function search(){
  errs('e_',{},['city','dates','all']);const b=$('hs'),r=$('bkr');
  const q=new URLSearchParams({city:st.city,checkIn:st.checkIn,checkOut:st.checkOut,adults:st.adults,children:st.children,rooms:st.rooms});
  b.disabled=true;r.innerHTML='<div class="bk-load"><i></i><i></i><i></i></div>';
  try{
    const out=await api('GET','api/hotels/search?'+q);b.disabled=false;showResults(out);
  }catch(e){b.disabled=false;r.innerHTML='';const x=e.errors||{};$('e_city').textContent=x.city||'';$('e_dates').textContent=x.checkIn||x.checkOut||'';$('e_all').textContent=x.adults||x.children||x.rooms||(e.errors?'':e.message)}
}
function showResults({stay,results}){
  const r=$('bkr');
  const head=`<div class="rs-head"><div><h2>${esc(stay.city)} <span>· ${fd(stay.checkIn)} – ${fd(stay.checkOut)}</span></h2><p>${stay.nights} night${stay.nights>1?'s':''} · ${guestLabel(stay)} · <b>${results.length}</b> option${results.length==1?'':'s'} · sorted by lowest price</p></div></div>`;
  if(!results.length){r.innerHTML=head+`<div class="empty">${ic('hotel',34)}<h3>No hotels available for these dates</h3><p>Try different dates, fewer rooms, or the other city. You can also <a href="#/interest/6">contact us</a> and we will arrange it for you.</p></div>`;return}
  r.innerHTML=head+`<div class="hlist">${results.map((h,i)=>`<article class="htl"><div class="hc-img ${h.image?'':'ph'}" ${h.image?`style="background-image:url('${esc(h.image)}')"`:''}>${h.image?'':ic('hotel',46)}${i==0?'<span class="best">Lowest price</span>':''}</div>
  <div class="hc-main"><div class="hc-top"><h3>${esc(h.name)}</h3><span class="stars" aria-label="${h.stars} stars">${stars(h.stars)}</span></div>
  <div class="hc-city">${ic('pin',15)} ${esc(h.city)}${h.address?` · ${esc(h.address)}`:''}</div>
  ${h.distance?`<div class="hc-dist">${ic('pin',14)} ${esc(h.distance)}</div>`:''}
  <div class="hc-room"><b>${esc(h.roomType)}</b> · sleeps up to ${h.capacity}</div>
  ${h.facilities.length?`<div class="hc-fac">${h.facilities.slice(0,8).map(f=>`<span>${ic('check',12)} ${esc(f)}</span>`).join('')}</div>`:''}</div>
  <div class="hc-price"><small>${h.nights} night${h.nights>1?'s':''} · ${h.rooms} room${h.rooms>1?'s':''}</small><b>${NGN(h.total)}</b><small>${NGN(h.perNight)} / night</small><button class="btn" data-book="${i}">Book now</button></div></article>`).join('')}</div>`;
  r.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>orderFlow(results[+b.dataset.book],stay));
  r.scrollIntoView({behavior:'smooth',block:'start'});
}

// ---- order modal: review → details → pay ----
function orderFlow(h,stay){
  const m=document.createElement('div');m.className='modal';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');
  document.body.appendChild(m);document.body.style.overflow='hidden';
  const close=()=>{m.remove();document.body.style.overflow=''};
  const shell=(title,step,body)=>{m.innerHTML=`<div class="mbox"><button class="mx" aria-label="Close">×</button><div class="msteps"><span class="${step>=1?'on':''}">1 Review</span><i></i><span class="${step>=2?'on':''}">2 Your details</span><i></i><span>3 Payment</span></div><h2>${title}</h2>${body}</div>`;m.querySelector('.mx').onclick=close};
  m.onclick=e=>{if(e.target==m)close()};
  const summary=`<div class="osum"><div class="oh"><b>${esc(h.name)}</b><span class="stars">${stars(h.stars)}</span></div><div class="oc">${ic('pin',14)} ${esc(h.city)}${h.address?' · '+esc(h.address):''}</div>
  <table><tr><th>Room type</th><td>${esc(h.roomType)}</td></tr><tr><th>Check-in</th><td>${fd(stay.checkIn)}</td></tr><tr><th>Check-out</th><td>${fd(stay.checkOut)}</td></tr><tr><th>Nights</th><td>${stay.nights}</td></tr><tr><th>Rooms</th><td>${stay.rooms}</td></tr><tr><th>Guests</th><td>${stay.adults} adult${stay.adults>1?'s':''}${stay.children?`, ${stay.children} child${stay.children>1?'ren':''}`:''}</td></tr>${h.distance?`<tr><th>Distance</th><td>${esc(h.distance)}</td></tr>`:''}<tr><th>Rate per night</th><td>${NGN(h.perNight)}</td></tr></table>
  <div class="otot"><span>Total to pay</span><b>${NGN(h.total)}</b></div></div>`;
  const review=()=>{shell('Review your order',1,summary+`<div class="mact"><button class="btn o" id="mc">Back to results</button><button class="btn" id="mok">Confirm order</button></div>`);$('mc').onclick=close;$('mok').onclick=details};
  const details=()=>{
    shell('Your details',2,`<div class="osm">${esc(h.name)} · ${esc(h.roomType)} · ${stay.nights} night${stay.nights>1?'s':''} · <b>${NGN(h.total)}</b></div>
    <form id="of" novalidate>${custFields('o_')}<div class="fld"><label for="o_address">Address *</label><div class="ctl"><input id="o_address" autocomplete="street-address"></div><div class="err" id="e_o_address"></div></div>
    ${cfg.payment=='simulation'?'<div class="testbn">TEST MODE — payments are simulated. No real money is charged.</div>':''}
    ${cfg.payment=='off'?'<div class="testbn">Online payment is not available yet. Please contact us to complete this booking.</div>':''}
    <div class="err" id="e_o_all" role="alert"></div><div class="mact"><button type="button" class="btn o" id="mb">Back</button><button class="btn" id="mp" ${cfg.payment=='off'?'disabled':''}>${ic('shield',18)} Continue to payment</button></div>
    <p class="secure">${ic('shield',14)} Secure payment powered by Paystack. Your booking slip is generated right after payment.</p></form>`);
    $('mb').onclick=review;
    $('of').onsubmit=async e=>{e.preventDefault();const b=$('mp');b.disabled=true;errs('e_o_',{},['fullName','phone','email','address','all']);
      const c=custVals('o_');c.address=$('o_address').value.trim();
      try{const out=await api('POST','api/orders/hotel',{hotelId:h.id,city:stay.city,checkIn:stay.checkIn,checkOut:stay.checkOut,adults:stay.adults,children:stay.children,rooms:stay.rooms,customer:c});
        shell('Redirecting to payment…',3,'<div class="bk-load"><i></i><i></i><i></i></div><p class="secure">Please wait — do not close this page.</p>');location.href=out.authorizationUrl}
      catch(err){b.disabled=false;if(err.errors){const x=err.errors;for(const k of ['fullName','phone','email','address'])$('e_o_'+k).textContent=x[k]||'';$('e_o_all').textContent=x.city||x.checkIn||x.checkOut||x.adults||x.rooms||''}else $('e_o_all').textContent=err.message}};
  };
  review();
}

// ============ TRAIN ============
function trainPanel(){
  const S=cfg.stations,p=$('bkp');
  p.innerHTML=`<form id="tf" novalidate><div class="pills"><span class="pill on">One way</span></div>
  <div class="tgrid"><div class="fld"><label for="t_from">FROM</label><div class="ctl">${ic('train',18)}<select id="t_from">${S.map(s=>`<option>${s}</option>`).join('')}</select></div><div class="err" id="e_t_from"></div></div>
  <button type="button" class="swp" id="t_sw" aria-label="Swap stations">${ic('swap',18)}</button>
  <div class="fld"><label for="t_to">TO</label><div class="ctl">${ic('train',18)}<select id="t_to">${S.map((s,i)=>`<option ${i==2?'selected':''}>${s}</option>`).join('')}</select></div><div class="err" id="e_t_to"></div></div>
  <div class="fld"><label for="t_date">DATE</label><div class="ctl">${ic('cal',18)}<input type="date" id="t_date" min="${cfg.today}"></div><div class="err" id="e_t_date"></div></div>
  <div class="fld"><label for="t_time">PREFERRED TIME <small>(optional)</small></label><div class="ctl">${ic('clock',18)}<input type="time" id="t_time"></div></div>
  <div class="fld"><label for="t_ad">ADULTS</label><div class="ctl">${ic('user',18)}<input type="number" id="t_ad" min="1" max="50" value="1"></div><div class="err" id="e_t_adults"></div></div>
  <div class="fld"><label for="t_ch">CHILDREN</label><div class="ctl">${ic('user',18)}<input type="number" id="t_ch" min="0" max="50" value="0"></div><div class="err" id="e_t_children"></div></div></div>
  <h4 class="sub">Your details</h4>${custFields('t_')}
  <div class="hp" aria-hidden="true"><input id="t_web" tabindex="-1" autocomplete="off"></div>
  <div class="gorow"><div class="err" id="e_t_all" role="alert"></div><button class="btn go" id="t_go">Request</button></div></form>`;
  $('t_sw').onclick=()=>{const a=$('t_from'),b=$('t_to'),x=a.value;a.value=b.value;b.value=x};
  $('tf').onsubmit=async e=>{e.preventDefault();const b=$('t_go');b.disabled=true;errs('e_t_',{},['from','to','date','adults','children','fullName','phone','email','all']);
    try{const out=await api('POST','api/orders/train',{from:$('t_from').value,to:$('t_to').value,date:$('t_date').value,time:$('t_time').value,adults:+$('t_ad').value,children:+$('t_ch').value,website:$('t_web').value,...custVals('t_')});
      requestDone(out,'HHR Train');}
    catch(err){b.disabled=false;if(err.errors)errs('e_t_',err.errors,['from','to','date','adults','children','fullName','phone','email']);else $('e_t_all').textContent=err.message}};
}

// ============ TRANSFERS ============
function transferPanel(){
  const p=$('bkp');
  const place=['Jeddah Airport (JED)','Madinah Airport (MED)','Makkah','Madinah','Jeddah','Al-Sulimaniyah Station - Jeddah','KAEC Station'];
  p.innerHTML=`<form id="rf" novalidate><div class="pills"><span class="pill on">One way</span></div>
  <div class="tgrid"><div class="fld"><label for="r_pu">PICK-UP</label><div class="ctl">${ic('pin',18)}<input id="r_pu" list="r_pl" placeholder="e.g. Jeddah Airport (JED)"></div><div class="err" id="e_r_pickup"></div></div>
  <span class="swp ph" aria-hidden="true">${ic('car',18)}</span>
  <div class="fld"><label for="r_do">DROP-OFF</label><div class="ctl">${ic('pin',18)}<input id="r_do" list="r_pl" placeholder="e.g. Makkah hotel"></div><div class="err" id="e_r_dropoff"></div></div>
  <datalist id="r_pl">${place.map(x=>`<option value="${x}">`).join('')}</datalist>
  <div class="fld"><label for="r_date">DATE</label><div class="ctl">${ic('cal',18)}<input type="date" id="r_date" min="${cfg.today}"></div><div class="err" id="e_r_date"></div></div>
  <div class="fld"><label for="r_time">PICK-UP TIME</label><div class="ctl">${ic('clock',18)}<input type="time" id="r_time"></div><div class="err" id="e_r_time"></div></div>
  <div class="fld"><label for="r_qty">NUMBER OF VEHICLES</label><div class="ctl"><input type="number" id="r_qty" min="1" max="50" value="1"></div><div class="err" id="e_r_quantity"></div></div></div>
  <h4 class="sub">Choose a vehicle</h4><div class="veh" role="radiogroup">${cfg.vehicles.map(v=>`<label class="vc"><input type="radio" name="veh" value="${v.id}"><span class="vb">${ic(v.id=='bus'||v.id=='coaster'||v.id=='hiace'?'bus':'car',28)}<b>${v.name}</b><small>${v.cap}</small></span></label>`).join('')}</div><div class="err" id="e_r_vehicle"></div>
  <div class="fld" style="margin-top:12px"><label for="r_notes">NOTES <small>(flight number, extra stops… optional)</small></label><div class="ctl"><input id="r_notes" maxlength="500"></div></div>
  <h4 class="sub">Your details</h4>${custFields('r_')}
  <div class="hp" aria-hidden="true"><input id="r_web" tabindex="-1" autocomplete="off"></div>
  <div class="gorow"><div class="err" id="e_r_all" role="alert"></div><button class="btn go" id="r_go">Request</button></div></form>`;
  $('rf').onsubmit=async e=>{e.preventDefault();const b=$('r_go');b.disabled=true;errs('e_r_',{},['pickup','dropoff','date','time','quantity','vehicle','fullName','phone','email','all']);
    try{const out=await api('POST','api/orders/transfer',{pickup:$('r_pu').value.trim(),dropoff:$('r_do').value.trim(),date:$('r_date').value,time:$('r_time').value,quantity:+$('r_qty').value,vehicle:(document.querySelector('[name=veh]:checked')||{}).value||'',notes:$('r_notes').value,website:$('r_web').value,...custVals('r_')});
      requestDone(out,'Transfer');}
    catch(err){b.disabled=false;if(err.errors)errs('e_r_',err.errors,['pickup','dropoff','date','time','quantity','vehicle','fullName','phone','email']);else $('e_r_all').textContent=err.message}};
}
function requestDone(out,kind){
  $('bkp').innerHTML=`<div class="done">${ic('check',44)}<h2>${kind} request received</h2><p>Our team will contact you shortly with the price and payment details.</p><div class="did"><small>BOOKING ID</small><b>${esc(out.bookingId)}</b></div>
  <div class="mact"><a class="btn" href="#/slip/${out.bookingId}/${out.token}">${ic('dl',18)} View &amp; download slip</a><button class="btn o" id="nr">Make another request</button></div></div>`;
  $('nr').onclick=panel;$('bkp').scrollIntoView({behavior:'smooth',block:'start'});
}

// ============ SLIP PAGE ============
NC.mountSlip=async(id,token)=>{
  const root=$('sl');if(!root)return;
  try{
    const {order:o}=await api('GET',`api/orders/${encodeURIComponent(id)}/slip?t=${encodeURIComponent(token)}`);
    await loadSlipJs();
    const [label,col]=NCSlip.status(o);
    const unpaid=o.type=='hotel'&&o.paymentStatus!='paid'&&o.status!='Cancelled';
    const banner=o.type=='hotel'?(o.paymentStatus=='paid'?`<div class="sb ok">${ic('check',26)}<div><b>Payment successful — your booking is confirmed</b><span>Booking ID <b>${esc(o.bookingId)}</b>. Download your slip below.</span></div></div>`:`<div class="sb wait">${ic('clock',26)}<div><b>Payment not completed yet</b><span>Your room is not confirmed until payment is received.</span></div></div>`)
      :`<div class="sb ok">${ic('check',26)}<div><b>Request received</b><span>Booking ID <b>${esc(o.bookingId)}</b>. Our team will contact you with the price and payment details.</span></div></div>`;
    root.innerHTML=`<div class="w slp">${banner}<div class="slact">${unpaid?`<button class="btn" id="spay">${ic('shield',18)} Complete payment</button><button class="btn o" id="sref">I have paid — refresh</button>`:''}<button class="btn" id="sdl">${ic('dl',18)} Download PDF slip</button><button class="btn o" id="spr">Print</button><a class="btn o" href="#/booking">New booking</a></div>${NCSlip.html(o)}</div>`;
    $('sdl').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{await NCSlip.pdf(o)}finally{b.disabled=false}};
    $('spr').onclick=()=>window.print();
    if($('sref'))$('sref').onclick=()=>NC.mountSlip(id,token);
    if($('spay'))$('spay').onclick=async e=>{e.currentTarget.disabled=true;try{const out=await api('POST',`api/orders/${encodeURIComponent(id)}/pay?t=${encodeURIComponent(token)}`,{});location.href=out.authorizationUrl}catch(err){e.currentTarget.disabled=false;alert(err.message)}};
  }catch(e){root.innerHTML=`<div class="w slp"><div class="sb bad">${ic('shield',26)}<div><b>Booking not found</b><span>Check the link, or <a href="#/booking">make a new booking</a>.</span></div></div></div>`}
};
const loadSlipJs=()=>window.NCSlip?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src='js/slip.js';s.onload=ok;s.onerror=no;document.head.appendChild(s)});
})();
